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
  const allSnippets: CodeSnippet[] = [];
  const seen = new Set<string>();

  for (const criterion of criteria) {
    const result = await findRelevantCode(criterion, codebasePath, maxPerCriterion);
    for (const snippet of result.snippets) {
      const key = `${snippet.filePath}:${snippet.startLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allSnippets.push(snippet);
    }
  }

  return allSnippets;
}

// ─── Static Check Collector ──────────────────────────────────────────────────

/**
 * Run deterministic static checks for each linked criterion.
 */
export function collectStaticFindings(
  criteria: AcceptanceCriterion[],
  snippets: CodeSnippet[],
  codebasePath: string,
): StaticFinding[] {
  const findings: StaticFinding[] = [];

  for (const criterion of criteria) {
    const criterionSnippets = snippets.filter(snippet =>
      snippet.content.length > 0,
    );
    const results = runStaticChecks(criterion, criterionSnippets, codebasePath);
    for (const result of results) {
      findings.push({
        criterionId: criterion.id,
        found: result.found,
        detail: result.detail,
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
  return {
    source: 'task-transition' as const,
    location: transition.location,
    observation:
      `Task ${transition.taskId} transitioned from ${transition.previousState} to completed`
      + (transition.changedFiles.length > 0
        ? ` with ${transition.changedFiles.length} changed file(s)`
        : ' with no file changes'),
    supports: false, // Transition alone does not prove criterion satisfaction
  };
}
