/**
 * Evidence adjudicator for the existing requirement-oriented pipeline.
 *
 * Increment 1 keeps the current retrieval/static/LLM flow while replacing its
 * public output with Done Integrity findings. Task-scoped evidence bundles are
 * introduced in a later increment.
 */

import type {
  AcceptanceCriterion,
  CodeSnippet,
  CriterionAudit,
  EvidenceItem,
  EvidenceSource,
  EvidenceState,
  LLMProvider,
  Requirement,
  RequirementAudit,
} from '../types.js';
import { createCriterionAudit } from '../domain/audit.js';
import {
  deriveRequirementState,
  isSecuritySensitiveCriterion,
  stateForAbsentImplementation,
} from '../domain/policy.js';
import { findRelevantCode } from '../retriever/index.js';
import { createProvider } from './provider.js';
import { runStaticChecks, type StaticCheckResult } from './static-checks.js';

export async function verifyRequirement(
  requirement: Requirement,
  codebasePath: string,
  provider?: LLMProvider,
): Promise<RequirementAudit> {
  const llm = provider || createProvider();
  const settled = await Promise.allSettled(
    requirement.acceptanceCriteria.map(criterion =>
      verifyCriterion(criterion, codebasePath, llm),
    ),
  );

  const criteria: CriterionAudit[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const criterion = requirement.acceptanceCriteria[index];
    const message = result.reason instanceof Error
      ? result.reason.message
      : String(result.reason ?? 'Unknown error');

    return createCriterionAudit({
      criterionId: criterion.id,
      criterionText: criterion.text,
      state: 'UNVERIFIED',
      justification: `Evidence collection could not complete: ${message}`,
      evidence: [],
      gaps: ['Retry the audit or review this criterion manually.'],
      repairPreviewAvailable: false,
    });
  });

  return {
    requirement,
    state: deriveRequirementState(criteria),
    criteria,
  };
}

export async function verifyCriterion(
  criterion: AcceptanceCriterion,
  codebasePath: string,
  provider: LLMProvider,
): Promise<CriterionAudit> {
  const retrieval = await findRelevantCode(criterion, codebasePath);
  const snippets = retrieval.snippets;
  const staticResults = runStaticChecks(criterion, snippets, codebasePath);

  if (snippets.length === 0 && staticResults.every(result => !result.found)) {
    const securityContext = isSecuritySensitiveCriterion(criterion)
      ? ' This security-sensitive criterion requires explicit enforcement evidence.'
      : '';
    return createCriterionAudit({
      criterionId: criterion.id,
      criterionText: criterion.text,
      state: stateForAbsentImplementation(criterion.text),
      justification: `No implementation evidence was found in the codebase.${securityContext}`,
      evidence: staticEvidenceItems(staticResults),
      gaps: ['Implementation evidence for this criterion is absent.'],
      repairPreviewAvailable: false,
    });
  }

  const prompt = buildVerificationPrompt(criterion, snippets, staticResults);
  let response: string;
  try {
    response = await provider.verify(prompt);
  } catch {
    try {
      await delay(1000);
      response = await provider.verify(prompt);
    } catch {
      return buildStaticOnlyAudit(criterion, staticResults, snippets);
    }
  }

  return parseLLMResponse(response, criterion, staticResults);
}

export function buildVerificationPrompt(
  criterion: AcceptanceCriterion,
  snippets: CodeSnippet[],
  staticResults: StaticCheckResult[],
): string {
  const staticEvidence = staticResults
    .map(result => `  ${result.found ? '✓' : '✗'} ${result.detail}${result.file ? ` (${result.file})` : ''}`)
    .join('\n');
  const codeContext = snippets
    .map(snippet =>
      `### File: ${snippet.filePath} (lines ${snippet.startLine}-${snippet.endLine})\n` +
      `\`\`\`${snippet.language}\n${snippet.content}\n\`\`\``,
    )
    .join('\n\n');

  return `You are adjudicating whether available evidence supports a Done Integrity completion claim.

## Acceptance Criterion
${criterion.text}

## Static Evidence
${staticEvidence || '  No deterministic evidence found.'}

## Relevant Source Evidence
${codeContext || 'No relevant code found.'}

## Evidence states
- SUPPORTED: available evidence clearly demonstrates the complete criterion
- PARTIAL: evidence demonstrates only part of the criterion
- UNSUPPORTED: implementation is absent, contradicted, or demonstrably incomplete
- UNVERIFIED: implementation may exist, but available evidence cannot establish the behavior

A missing authorization, ownership, permission, credential, encryption, or secret-enforcement check is UNSUPPORTED, never UNVERIFIED.
Do not use confidence values, percentages, completion scores, or PASS/FAIL verdicts.
Every result must have a specific non-empty justification. Only cite evidence shown above.

Respond with ONLY this JSON:
{
  "state": "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "UNVERIFIED",
  "justification": "<specific reason grounded in the available evidence>",
  "evidence": [
    {
      "source": "source-code" | "static-check",
      "location": { "file": "<path>", "line": <line number> },
      "observation": "<what the evidence shows>",
      "supports": true | false
    }
  ],
  "gaps": ["<missing evidence or implementation detail>"]
}`;
}

export function parseLLMResponse(
  response: string,
  criterion: AcceptanceCriterion,
  staticResults: StaticCheckResult[],
): CriterionAudit {
  try {
    const parsed = JSON.parse(extractJSON(response)) as Record<string, unknown>;
    const state = validateEvidenceState(parsed.state);
    const justification = String(parsed.justification ?? '').trim();
    const llmEvidence = parseEvidenceItems(parsed.evidence);
    const evidence = mergeEvidence(llmEvidence, staticEvidenceItems(staticResults));
    const gaps = Array.isArray(parsed.gaps)
      ? parsed.gaps.map(String).map(gap => gap.trim()).filter(Boolean)
      : [];

    return createCriterionAudit({
      criterionId: criterion.id,
      criterionText: criterion.text,
      state,
      justification,
      evidence,
      gaps,
      repairPreviewAvailable: false,
    });
  } catch {
    return buildHeuristicAudit(response, criterion, staticResults);
  }
}

function extractJSON(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const block = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (block) return block[1].trim();
  const object = trimmed.match(/\{[\s\S]*\}/);
  if (object) return object[0];
  throw new Error('No JSON found in response');
}

function validateEvidenceState(value: unknown): EvidenceState {
  const state = String(value).toUpperCase().trim();
  if (state === 'SUPPORTED') return 'SUPPORTED';
  if (state === 'PARTIAL') return 'PARTIAL';
  if (state === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (state === 'UNVERIFIED') return 'UNVERIFIED';
  throw new Error(`Unknown evidence state: ${state}`);
}

function parseEvidenceItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const observation = String(candidate.observation ?? '').trim();
    if (!observation) return [];

    const locationValue = candidate.location;
    let location: EvidenceItem['location'];
    if (locationValue && typeof locationValue === 'object') {
      const rawLocation = locationValue as Record<string, unknown>;
      const file = String(rawLocation.file ?? '').trim();
      const line = Number(rawLocation.line);
      if (file) {
        location = {
          file,
          ...(Number.isFinite(line) && line > 0 ? { line } : {}),
        };
      }
    }

    return [{
      source: validateEvidenceSource(candidate.source),
      ...(location ? { location } : {}),
      observation,
      supports: candidate.supports === true,
    }];
  });
}

function validateEvidenceSource(value: unknown): EvidenceSource {
  return value === 'static-check' ? 'static-check' : 'source-code';
}

function staticEvidenceItems(results: StaticCheckResult[]): EvidenceItem[] {
  return results.map(result => ({
    source: 'static-check',
    ...(result.file
      ? { location: { file: result.file, ...(result.line ? { line: result.line } : {}) } }
      : {}),
    observation: result.detail,
    supports: result.found,
  }));
}

function mergeEvidence(primary: EvidenceItem[], secondary: EvidenceItem[]): EvidenceItem[] {
  const keys = new Set(primary.map(evidenceKey));
  return [...primary, ...secondary.filter(item => !keys.has(evidenceKey(item)))];
}

function evidenceKey(item: EvidenceItem): string {
  return `${item.source}|${item.location?.file ?? ''}|${item.location?.line ?? ''}|${item.observation}`;
}

function buildStaticOnlyAudit(
  criterion: AcceptanceCriterion,
  staticResults: StaticCheckResult[],
  snippets: CodeSnippet[],
): CriterionAudit {
  const found = staticResults.filter(result => result.found);
  const missing = staticResults.filter(result => !result.found);
  let state: EvidenceState;
  let justification: string;

  if (found.length > 0 && missing.length === 0) {
    state = 'SUPPORTED';
    justification = `Deterministic checks support the criterion: ${found.map(result => result.detail).join('; ')}`;
  } else if (found.length > 0) {
    state = 'PARTIAL';
    justification = `Some deterministic checks support the criterion, while others do not: ${missing.map(result => result.detail).join('; ')}`;
  } else if (snippets.length > 0) {
    state = 'UNVERIFIED';
    justification = 'Relevant source was found, but deterministic evidence cannot establish the required behavior.';
  } else {
    state = stateForAbsentImplementation(criterion.text);
    justification = 'No implementation evidence was found for the criterion.';
  }

  return createCriterionAudit({
    criterionId: criterion.id,
    criterionText: criterion.text,
    state,
    justification,
    evidence: staticEvidenceItems(staticResults),
    gaps: missing.map(result => result.detail),
    repairPreviewAvailable: false,
  });
}

function buildHeuristicAudit(
  response: string,
  criterion: AcceptanceCriterion,
  staticResults: StaticCheckResult[],
): CriterionAudit {
  const normalized = response.toUpperCase();
  let state: EvidenceState = 'UNVERIFIED';
  if (normalized.includes('UNSUPPORTED')) state = 'UNSUPPORTED';
  else if (normalized.includes('SUPPORTED')) state = 'SUPPORTED';
  else if (normalized.includes('PARTIAL')) state = 'PARTIAL';

  return createCriterionAudit({
    criterionId: criterion.id,
    criterionText: criterion.text,
    state,
    justification: 'The adjudicator response was malformed, so only an explicit evidence-state token could be recovered.',
    evidence: staticEvidenceItems(staticResults),
    gaps: ['A structured evidence adjudication is still required.'],
    repairPreviewAvailable: false,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
