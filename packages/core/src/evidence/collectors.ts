/**
 * Evidence collectors for a task-scoped evidence bundle.
 *
 * Each collector produces typed evidence items from a specific source.
 * The bundle builder composes them.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { AcceptanceCriterion, CodeSnippet, CompletedTaskTransition, EvidenceItem, FileChange } from '../types.js';
import { findRelevantCode } from '../retriever/index.js';
import { runStaticChecks } from '../verifier/static-checks.js';
import type { DiffHunk, StaticFinding } from './types.js';

// ─── Git Diff Collector ──────────────────────────────────────────────────────

/**
 * Collect diff hunks for files that changed since the pre-task snapshot.
 * Only includes hunks from files the transition already identified as changed.
 */
export function collectDiffHunks(
  transition: CompletedTaskTransition,
  codebasePath: string,
  maxHunks: number,
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const root = resolve(codebasePath);

  for (const change of transition.changedFiles) {
    if (hunks.length >= maxHunks) break;

    // Documentation and repository metadata are not evidence of behaviour, and
    // their churn should not lift a criterion out of UNSUPPORTED.
    if (!isImplementationFile(change.path)) continue;

    if (change.change === 'deleted') {
      hunks.push({
        file: change.path,
        startLine: 0,
        content: '(file deleted)',
        change: 'deleted',
      });
      continue;
    }

    const filePath = join(root, change.path);
    if (!existsSync(filePath)) continue;

    if (transition.gitHeadChanged) {
      const diff = runGitDiff(root, change.path);
      if (diff) {
        const parsed = parseDiffHunks(diff, change.path, change.change === 'added' ? 'added' : 'modified');
        for (const hunk of parsed) {
          if (hunks.length >= maxHunks) break;
          hunks.push(hunk);
        }
        continue;
      }
    }

    // No Git diff available — include the file content as an "added" hunk
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      hunks.push({
        file: change.path,
        startLine: 1,
        content: lines.slice(0, 50).join('\n'),
        change: change.change === 'added' ? 'added' : 'modified',
      });
    } catch {
      continue;
    }
  }

  return hunks;
}

function runGitDiff(cwd: string, filePath: string): string | null {
  try {
    return execFileSync('git', ['diff', 'HEAD~1', '--', filePath], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

function parseDiffHunks(diff: string, file: string, change: 'added' | 'modified'): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkHeader = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/;
  let currentHunk: DiffHunk | null = null;
  const lines: string[] = [];

  for (const line of diff.split('\n')) {
    const match = hunkHeader.exec(line);
    if (match) {
      if (currentHunk && lines.length > 0) {
        currentHunk.content = lines.join('\n');
        hunks.push(currentHunk);
      }
      currentHunk = { file, startLine: parseInt(match[1], 10), content: '', change };
      lines.length = 0;
      continue;
    }
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      lines.push(line);
    }
  }

  if (currentHunk && lines.length > 0) {
    currentHunk.content = lines.join('\n');
    hunks.push(currentHunk);
  }

  return hunks;
}

// ─── Source Code Collector ───────────────────────────────────────────────────

/**
 * Retrieve source snippets relevant to each linked criterion.
 * Scoped: prefers changed files, but falls back to the full codebase.
 */
export async function collectSourceSnippets(
  criteria: AcceptanceCriterion[],
  codebasePath: string,
  maxPerCriterion: number,
): Promise<CodeSnippet[]> {
  const { all } = await collectSnippetsByCriterion(criteria, codebasePath, maxPerCriterion);
  return all;
}

/**
 * Retrieve snippets and keep track of which criterion each one was found for.
 *
 * Retrieval is per-criterion, but flattening the results discarded that
 * attribution, and the static checks then ran every criterion against the union
 * of every file retrieved for every criterion. A criterion requiring a 403 on
 * `GET /profile/:id` was satisfied by an unrelated 403 in the account-deletion
 * route, which is a false completion claim of exactly the kind this tool exists
 * to refuse.
 */
export async function collectSnippetsByCriterion(
  criteria: AcceptanceCriterion[],
  codebasePath: string,
  maxPerCriterion: number,
): Promise<{ all: CodeSnippet[]; byCriterion: Record<string, CodeSnippet[]> }> {
  const all: CodeSnippet[] = [];
  const byCriterion: Record<string, CodeSnippet[]> = {};
  const seen = new Set<string>();

  for (const criterion of criteria) {
    const result = await findRelevantCode(criterion, codebasePath, maxPerCriterion);
    const scoped: CodeSnippet[] = [];

    for (const snippet of result.snippets) {
      if (!isImplementationFile(snippet.filePath)) continue;
      scoped.push(snippet);

      const key = `${snippet.filePath}:${snippet.startLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(snippet);
    }

    byCriterion[criterion.id] = scoped;
  }

  return { all, byCriterion };
}

/**
 * Documentation states intent; it is not evidence that behavior exists.
 *
 * A README or spec that describes returning 403 must never be cited as proof
 * that the code returns 403 — that is precisely the false support this tool
 * exists to catch.
 *
 * Repository metadata is excluded for a related reason: a criterion about rate
 * limiting was reported UNVERIFIED rather than UNSUPPORTED because `.gitignore`
 * had changed, and a modified `.gitignore` is not an implementation. Dotfiles
 * are also where secrets live, so they should not be quoted back in a report.
 */
export function isImplementationFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const basename = normalized.split('/').pop() ?? normalized;

  if (normalized.endsWith('.md') || normalized.endsWith('.mdx')) return false;
  if (normalized.includes('.kiro/')) return false;
  if (normalized.includes('.spectruth/')) return false;
  if (normalized.startsWith('docs/') || normalized.includes('/docs/')) return false;

  // Dotfiles are configuration or secrets, never the behaviour under audit.
  if (basename.startsWith('.')) return false;

  if (METADATA_FILES.has(basename)) return false;
  if (basename.endsWith('.lock')) return false;

  return true;
}

const METADATA_FILES = new Set([
  'license',
  'licence',
  'notice',
  'codeowners',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
]);

// ─── Static Check Collector ──────────────────────────────────────────────────

/**
 * Run deterministic static checks for each linked criterion.
 */
export function collectStaticFindings(
  criteria: AcceptanceCriterion[],
  snippets: CodeSnippet[] | Record<string, CodeSnippet[]>,
  codebasePath: string,
): StaticFinding[] {
  const findings: StaticFinding[] = [];
  const scoped = !Array.isArray(snippets);

  for (const criterion of criteria) {
    // Only the snippets retrieved for this criterion. Passing the union let a
    // status code from an unrelated route satisfy the criterion.
    const criterionSnippets = scoped
      ? snippets[criterion.id] ?? []
      : snippets.filter(snippet => snippet.content.length > 0);

    const results = runStaticChecks(criterion, criterionSnippets, codebasePath);
    for (const result of results) {
      findings.push({
        criterionId: criterion.id,
        found: result.found,
        detail: result.detail,
        strength: result.strength,
        file: result.file,
        line: result.line,
      });
    }
  }

  return findings;
}

// ─── Evidence Item Builders ──────────────────────────────────────────────────

export function diffHunksToEvidence(hunks: DiffHunk[]): EvidenceItem[] {
  return hunks.map(hunk => ({
    source: 'git-diff' as const,
    location: { file: hunk.file, ...(hunk.startLine > 0 ? { line: hunk.startLine } : {}) },
    observation: hunk.change === 'deleted'
      ? `File ${hunk.file} was deleted`
      : `${hunk.change === 'added' ? 'New' : 'Modified'} code at line ${hunk.startLine}`,
    supports: hunk.change !== 'deleted',
  }));
}

export function sourceSnippetsToEvidence(snippets: CodeSnippet[]): EvidenceItem[] {
  return snippets.map(snippet => ({
    source: 'source-code' as const,
    location: { file: snippet.filePath, line: snippet.startLine },
    observation: `Relevant source found (lines ${snippet.startLine}-${snippet.endLine})`,
    supports: true,
  }));
}

export function staticFindingsToEvidence(findings: StaticFinding[]): EvidenceItem[] {
  return findings.map(finding => ({
    source: 'static-check' as const,
    ...(finding.file ? { location: { file: finding.file, ...(finding.line ? { line: finding.line } : {}) } } : {}),
    observation: finding.detail,
    supports: finding.found,
  }));
}

export function transitionToEvidence(transition: CompletedTaskTransition): EvidenceItem {
  const fileNote = transition.changedFiles.length > 0
    ? ` with ${transition.changedFiles.length} changed file(s)`
    : ' with no file changes';

  // An on-demand audit sees only that the box is ticked; it must not claim to
  // have observed the transition happen.
  const observation = transition.inferredFrom === 'snapshot-pair'
    ? `Task ${transition.taskId} transitioned from ${transition.previousState} to completed${fileNote}`
    : `Task ${transition.taskId} is currently marked complete${fileNote}; no transition was observed`;

  return {
    source: 'task-transition' as const,
    location: transition.location,
    observation,
    supports: false, // Transition alone does not prove criterion satisfaction
  };
}
