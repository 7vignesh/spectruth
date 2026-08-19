/**
 * Bounded task-aware evidence adjudication.
 *
 * The adjudicator receives only the scoped evidence bundle and must produce
 * a justified state for each criterion. Citations to evidence not present in
 * the bundle are invalid and downgraded.
 *
 * Decision flow:
 * 1. Run deterministic checks first — if they're conclusive, skip the LLM.
 * 2. If an LLM provider is available, adjudicate within the bounded bundle.
 * 3. If no provider is available, use only deterministic evidence.
 * 4. Security-sensitive absent enforcement is always UNSUPPORTED.
 */

import type {
  AcceptanceCriterion,
  CodeSnippet,
  CriterionAudit,
  EvidenceItem,
  EvidenceState,
  LLMProvider,
} from '../types.js';
import { createCriterionAudit } from '../domain/audit.js';
import { isSecuritySensitiveCriterion } from '../domain/policy.js';
import type { DiffHunk, StaticFinding, TaskEvidenceBundle } from './types.js';
import {
  diffHunksToEvidence,
  sourceSnippetsToEvidence,
  staticFindingsToEvidence,
  transitionToEvidence,
} from './collectors.js';

export interface AdjudicateOptions {
  bundle: TaskEvidenceBundle;
  provider?: LLMProvider;
}

export async function adjudicateBundle(
  options: AdjudicateOptions,
): Promise<CriterionAudit[]> {
  const { bundle, provider } = options;
  const results: CriterionAudit[] = [];

  for (const criterion of bundle.criteria) {
    const audit = provider
      ? await adjudicateWithProvider(criterion, bundle, provider)
      : adjudicateDeterministically(criterion, bundle);
    results.push(audit);
  }

  return results;
}

// ─── LLM-Assisted Adjudication ──────────────────────────────────────────────

async function adjudicateWithProvider(
  criterion: AcceptanceCriterion,
  bundle: TaskEvidenceBundle,
  provider: LLMProvider,
): Promise<CriterionAudit> {
  const prompt = buildAdjudicationPrompt(criterion, bundle);
  let response: string;

  try {
    response = await provider.verify(prompt);
  } catch {
    // Provider failed — fall back to deterministic only
    return adjudicateDeterministically(criterion, bundle);
  }

  return parseAdjudicationResponse(response, criterion, bundle);
}

export function buildAdjudicationPrompt(
  criterion: AcceptanceCriterion,
  bundle: TaskEvidenceBundle,
): string {
  const relevantSnippets = bundle.sourceSnippets
    .slice(0, 5)
    .map(snippet =>
      `### ${snippet.filePath} (lines ${snippet.startLine}-${snippet.endLine})\n\`\`\`${snippet.language}\n${snippet.content}\n\`\`\``,
    ).join('\n\n');

  const relevantDiffs = bundle.diffHunks
    .slice(0, 10)
    .map(hunk => `### ${hunk.file} (${hunk.change}, line ${hunk.startLine})\n\`\`\`diff\n${hunk.content}\n\`\`\``)
    .join('\n\n');

  const staticEvidence = bundle.staticFindings
    .filter(finding => finding.criterionId === criterion.id)
    .map(finding => `  ${finding.found ? '✓' : '✗'} ${finding.detail}${finding.file ? ` (${finding.file})` : ''}`)
    .join('\n');

  const designContext = bundle.designContext
    .map(section => `### ${section.heading}\n${section.content.slice(0, 500)}`)
    .join('\n\n');

  return `You are adjudicating whether available evidence supports a Done Integrity completion claim for one acceptance criterion.

## Task
${bundle.taskId}: ${bundle.taskTitle}
Transition: ${bundle.transition.previousState} → completed
Changed files: ${bundle.changedFiles.map(f => `${f.path} (${f.change})`).join(', ') || 'none'}

## Acceptance Criterion
${criterion.id}: ${criterion.text}

## Design Context
${designContext || 'No design context available.'}

## Static Evidence
${staticEvidence || '  No deterministic evidence found.'}

## Source Code Evidence
${relevantSnippets || 'No relevant source code found.'}

## Git Diff Evidence
${relevantDiffs || 'No diff hunks available.'}

## Evidence States
- SUPPORTED: available evidence clearly demonstrates the complete criterion
- PARTIAL: evidence demonstrates only part of the criterion
- UNSUPPORTED: implementation is absent, contradicted, or demonstrably incomplete
- UNVERIFIED: implementation may exist, but available evidence cannot establish the behavior

## Rules
- A missing authorization, ownership, permission, credential, encryption, or secret-enforcement check is UNSUPPORTED, never UNVERIFIED.
- Every finding must have a specific non-empty justification grounded in the evidence shown above.
- Only cite files and line numbers that appear in the evidence above.
- Do not use confidence values, percentages, or PASS/FAIL verdicts.

Respond with ONLY this JSON:
{
  "state": "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "UNVERIFIED",
  "justification": "<specific reason grounded in the available evidence>",
  "evidence": [
    {
      "source": "source-code" | "git-diff" | "static-check",
      "location": { "file": "<path from evidence above>", "line": <number> },
      "observation": "<what the evidence shows>",
      "supports": true | false
    }
  ],
  "gaps": ["<missing evidence or implementation detail>"]
}`;
}

function parseAdjudicationResponse(
  response: string,
  criterion: AcceptanceCriterion,
  bundle: TaskEvidenceBundle,
): CriterionAudit {
  const allEvidence = gatherAllEvidence(criterion, bundle);

  try {
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const state = validateState(parsed.state, criterion);
    const justification = String(parsed.justification ?? '').trim();
    const gaps = Array.isArray(parsed.gaps)
      ? parsed.gaps.map(String).map(g => g.trim()).filter(Boolean)
      : [];

    // Parse and validate evidence citations
    const citedEvidence = validateCitations(parsed.evidence, bundle);
    const mergedEvidence = mergeEvidence(citedEvidence, allEvidence);

    if (!justification) {
      return createCriterionAudit({
        criterionId: criterion.id,
        criterionText: criterion.text,
        state,
        justification: 'The adjudicator returned a state but provided no justification. Treating as requiring review.',
        evidence: allEvidence,
        gaps: ['Adjudicator response had an empty justification.'],
      });
    }

    return createCriterionAudit({
      criterionId: criterion.id,
      criterionText: criterion.text,
      state,
      justification,
      evidence: mergedEvidence,
      gaps,
    });
  } catch {
    return buildFallbackAudit(criterion, bundle, allEvidence);
  }
}

// ─── Deterministic-Only Adjudication ─────────────────────────────────────────

function adjudicateDeterministically(
  criterion: AcceptanceCriterion,
  bundle: TaskEvidenceBundle,
): CriterionAudit {
  const allEvidence = gatherAllEvidence(criterion, bundle);
  const findings = bundle.staticFindings.filter(finding => finding.criterionId === criterion.id);
  const found = findings.filter(finding => finding.found);
  const missing = findings.filter(finding => !finding.found);
  const hasSource = bundle.sourceSnippets.length > 0;
  const hasChanges = bundle.changedFiles.length > 0;

  // A route definition proves an endpoint exists, not that it does what the
  // criterion requires. Treating that as support once let a criterion demanding
  // bcrypt password hashing pass on the strength of a POST route alone, so
  // support now requires at least one check that tested the behaviour itself.
  const specificFound = found.filter(finding => finding.strength === 'specific');
  const onlyCorroborating = found.length > 0 && specificFound.length === 0;

  let state: EvidenceState;
  let justification: string;

  if (isSecuritySensitiveCriterion(criterion)) {
    // Half an authorization check protects nothing, so partial enforcement of a
    // security requirement is unsupported rather than partial.
    if (found.length === 0) {
      state = 'UNSUPPORTED';
      justification = 'This security-sensitive criterion requires explicit enforcement evidence, and none was found.';
    } else if (missing.length > 0) {
      state = 'UNSUPPORTED';
      justification =
        `This security-sensitive criterion is not fully enforced: ${missing.map(f => f.detail).join('; ')}. `
        + 'Partial enforcement of a security requirement is not enforcement.';
    } else if (onlyCorroborating) {
      state = 'UNSUPPORTED';
      justification =
        `Only the presence of an implementation site could be confirmed (${found.map(f => f.detail).join('; ')}), `
        + 'which does not demonstrate the enforcement this security-sensitive criterion requires.';
    } else {
      state = 'SUPPORTED';
      justification = `Enforcement is present: ${specificFound.map(f => f.detail).join('; ')}.`;
    }
  } else if (specificFound.length > 0 && missing.length === 0) {
    state = 'SUPPORTED';
    justification = `Deterministic checks confirm the criterion: ${specificFound.map(f => f.detail).join('; ')}.`;
  } else if (specificFound.length > 0 && missing.length > 0) {
    // At least one specific check passed (proving part of the criterion) and
    // another check failed — the criterion is genuinely partially met.
    state = 'PARTIAL';
    justification = `Some checks pass (${found.map(f => f.detail).join('; ')}), but others do not (${missing.map(f => f.detail).join('; ')}).`;
  } else if (found.length > 0 && missing.length > 0) {
    // Both findings are corroborating — tangential signals that never tested
    // the criterion's actual requirement. "Found a .env" and "didn't find
    // nodemailer" says nothing about whether idempotency keys are assigned.
    state = 'UNVERIFIED';
    justification =
      `Only corroborating evidence was found (${found.map(f => f.detail).join('; ')}), `
      + `while other corroborating checks did not match (${missing.map(f => f.detail).join('; ')}). `
      + 'Neither tested the behavior the criterion requires. Agent adjudication is needed.';
  } else if (onlyCorroborating) {
    state = 'UNVERIFIED';
    justification =
      `Only corroborating evidence was found (${found.map(f => f.detail).join('; ')}). `
      + 'It establishes where the behavior would live but not that the behavior is implemented.';
  } else if (missing.some(f => f.strength === 'specific')) {
    // A specific check that ran and found nothing is a demonstrated absence
    // only when it tested something the criterion explicitly names — a status
    // code, a named algorithm, a stated limit. These checks fire on exact
    // textual matches in the criterion, not heuristic keyword overlap.
    const specificMissing = missing.filter(f => f.strength === 'specific');
    state = 'UNSUPPORTED';
    justification =
      `The criterion requires behavior that is demonstrably absent: ${specificMissing.map(f => f.detail).join('; ')}.`;
  } else if (hasSource || hasChanges) {
    // Relevant code exists but no check could prove the required behavior.
    // This is the honest "I don't know" state — not absent, just unproven.
    // The agent adjudicates these by reading the source itself.
    state = 'UNVERIFIED';
    justification = 'Relevant source exists, but deterministic checks cannot confirm the required behavior. Agent adjudication is needed.';
  } else {
    state = 'UNSUPPORTED';
    justification = 'No implementation evidence was found for this criterion.';
  }

  const gaps = missing.map(f => f.detail);
  if (onlyCorroborating) {
    gaps.push('No check established the behavior the criterion requires.');
  }

  return createCriterionAudit({
    criterionId: criterion.id,
    criterionText: criterion.text,
    state,
    justification,
    evidence: allEvidence,
    gaps,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gatherAllEvidence(
  criterion: AcceptanceCriterion,
  bundle: TaskEvidenceBundle,
): EvidenceItem[] {
  const transition = transitionToEvidence(bundle.transition);
  const diffs = diffHunksToEvidence(bundle.diffHunks);
  const sources = sourceSnippetsToEvidence(bundle.sourceSnippets);
  const statics = staticFindingsToEvidence(
    bundle.staticFindings.filter(f => f.criterionId === criterion.id),
  );

  return [transition, ...statics, ...diffs, ...sources];
}

function validateState(value: unknown, criterion: AcceptanceCriterion): EvidenceState {
  const normalized = String(value ?? '').toUpperCase().trim();
  if (normalized === 'SUPPORTED') return 'SUPPORTED';
  if (normalized === 'PARTIAL') return 'PARTIAL';
  if (normalized === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (normalized === 'UNVERIFIED') return 'UNVERIFIED';

  // Unknown state — conservative defaults
  if (isSecuritySensitiveCriterion(criterion)) return 'UNSUPPORTED';
  return 'UNVERIFIED';
}

function validateCitations(
  value: unknown,
  bundle: TaskEvidenceBundle,
): EvidenceItem[] {
  if (!Array.isArray(value)) return [];

  const validFiles = new Set([
    ...bundle.sourceSnippets.map(s => s.filePath),
    ...bundle.diffHunks.map(h => h.file),
    ...bundle.changedFiles.map(f => f.path),
    ...(bundle.staticFindings.map(f => f.file).filter(Boolean) as string[]),
  ]);

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const observation = String(candidate.observation ?? '').trim();
    if (!observation) return [];

    // Validate location is from the bundle
    let location: EvidenceItem['location'];
    if (candidate.location && typeof candidate.location === 'object') {
      const loc = candidate.location as Record<string, unknown>;
      const file = String(loc.file ?? '').trim();
      if (file && validFiles.has(file)) {
        const line = Number(loc.line);
        location = { file, ...(Number.isFinite(line) && line > 0 ? { line } : {}) };
      }
      // Invalid file citation — drop the location, keep the observation
    }

    const source = candidate.source === 'git-diff' ? 'git-diff' as const
      : candidate.source === 'static-check' ? 'static-check' as const
      : 'source-code' as const;

    return [{
      source,
      ...(location ? { location } : {}),
      observation,
      supports: candidate.supports === true,
    }];
  });
}

function mergeEvidence(primary: EvidenceItem[], secondary: EvidenceItem[]): EvidenceItem[] {
  const keys = new Set(primary.map(evidenceKey));
  return [...primary, ...secondary.filter(item => !keys.has(evidenceKey(item)))];
}

function evidenceKey(item: EvidenceItem): string {
  return `${item.source}|${item.location?.file ?? ''}|${item.location?.line ?? ''}|${item.observation.slice(0, 50)}`;
}

function buildFallbackAudit(
  criterion: AcceptanceCriterion,
  bundle: TaskEvidenceBundle,
  allEvidence: EvidenceItem[],
): CriterionAudit {
  // Can't parse LLM response — fall back to deterministic
  const deterministic = adjudicateDeterministically(criterion, bundle);
  return createCriterionAudit({
    ...deterministic,
    gaps: [...deterministic.gaps, 'LLM adjudication response was malformed; using deterministic evidence only.'],
  });
}

function extractJSON(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const block = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (block) return block[1].trim();
  const object = trimmed.match(/\{[\s\S]*\}/);
  if (object) return object[0];
  throw new Error('No JSON found');
}
