/**
 * LLM Verifier
 *
 * Sends acceptance criteria + code snippets to an LLM for verification.
 * Combines static check results with LLM judgment for a final verdict.
 *
 * Flow:
 * 1. Run static checks (deterministic)
 * 2. Build structured prompt with criterion + code + static evidence
 * 3. Send to LLM
 * 4. Parse response into CriterionResult
 * 5. Retry once on failure
 */

import type {
  AcceptanceCriterion,
  Requirement,
  CodeSnippet,
  CriterionResult,
  RequirementResult,
  Verdict,
  Evidence,
  LLMProvider,
} from '../types.js';
import { runStaticChecks, type StaticCheckResult } from './static-checks.js';
import { createProvider } from './provider.js';
import { findRelevantCode } from '../retriever/index.js';

// ─── Main Verification Entry Point ──────────────────────────────────────────

/**
 * Verify a single requirement (all its criteria) against the codebase.
 */
export async function verifyRequirement(
  requirement: Requirement,
  codebasePath: string,
  provider?: LLMProvider,
): Promise<RequirementResult> {
  const llm = provider || createProvider();

  // Verify all criteria in parallel
  const criteriaResults = await Promise.allSettled(
    requirement.acceptanceCriteria.map(criterion =>
      verifyCriterion(criterion, codebasePath, llm)
    )
  );

  // Collect results (handle failures gracefully)
  const results: CriterionResult[] = criteriaResults.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // On failure, report as unverified
    return {
      criterion: requirement.acceptanceCriteria[i],
      verdict: 'FAIL' as Verdict,
      confidence: 0,
      reason: `Verification error: ${result.reason?.message || 'Unknown error'}`,
      evidence: { file: '', line: 0, detail: 'Verification could not complete' },
      suggestion: 'Retry verification or check manually',
    };
  });

  // Aggregate verdict
  const passed = results.filter(r => r.verdict === 'PASS').length;
  const failed = results.filter(r => r.verdict === 'FAIL').length;
  const partial = results.filter(r => r.verdict === 'PARTIAL').length;
  const total = results.length;

  let overallVerdict: Verdict;
  if (failed === 0 && partial === 0) {
    overallVerdict = 'PASS';
  } else if (passed === 0 && partial === 0) {
    overallVerdict = 'FAIL';
  } else {
    overallVerdict = 'PARTIAL';
  }

  return {
    requirement,
    criteriaResults: results,
    overallVerdict,
    score: `${passed}/${total} criteria met`,
  };
}

// ─── Single Criterion Verification ──────────────────────────────────────────

/**
 * Verify a single acceptance criterion against the codebase.
 */
export async function verifyCriterion(
  criterion: AcceptanceCriterion,
  codebasePath: string,
  provider: LLMProvider,
): Promise<CriterionResult> {
  // Step 1: Retrieve relevant code
  const retrieval = await findRelevantCode(criterion, codebasePath);
  const snippets = retrieval.snippets;

  // Step 2: Run static checks
  const staticResults = runStaticChecks(criterion, snippets, codebasePath);

  // Step 3: If we have no code at all, it's likely FAIL
  if (snippets.length === 0 && staticResults.every(r => !r.found)) {
    return {
      criterion,
      verdict: 'FAIL',
      confidence: 0.8,
      reason: 'No implementation evidence found in the codebase',
      evidence: { file: '', line: 0, detail: 'No matching code found for this criterion' },
      suggestion: buildRemediationTask(criterion, []),
    };
  }

  // Step 4: Build prompt and call LLM
  const prompt = buildVerificationPrompt(criterion, snippets, staticResults);

  let response: string;
  try {
    response = await provider.verify(prompt);
  } catch (error) {
    // Retry once
    try {
      await delay(1000);
      response = await provider.verify(prompt);
    } catch (retryError) {
      // Fall back to static-only verdict
      return buildStaticOnlyVerdict(criterion, staticResults, snippets);
    }
  }

  // Step 5: Parse LLM response
  return parseLLMResponse(response, criterion, staticResults);
}

// ─── Prompt Construction ─────────────────────────────────────────────────────

/**
 * Build the verification prompt for the LLM.
 */
export function buildVerificationPrompt(
  criterion: AcceptanceCriterion,
  snippets: CodeSnippet[],
  staticResults: StaticCheckResult[],
): string {
  const staticEvidence = staticResults
    .map(r => `  ${r.found ? '✓' : '✗'} ${r.detail}${r.file ? ` (${r.file})` : ''}`)
    .join('\n');

  const codeContext = snippets
    .map(s => `### File: ${s.filePath} (lines ${s.startLine}-${s.endLine})\n\`\`\`${s.language}\n${s.content}\n\`\`\``)
    .join('\n\n');

  return `You are a spec conformance verifier. Determine if the given code satisfies the acceptance criterion.

## Acceptance Criterion
${criterion.text}

## Static Analysis Evidence
${staticEvidence || '  No deterministic evidence found.'}

## Relevant Code From Codebase
${codeContext || 'No relevant code found.'}

## Instructions
Analyze whether the code above satisfies the acceptance criterion. Be strict:
- PASS: The criterion is clearly and completely satisfied
- PARTIAL: Some aspects are implemented but the criterion is not fully met
- FAIL: No evidence the criterion is satisfied, or it's clearly violated

Respond with ONLY this JSON (no markdown, no explanation outside the JSON):
{
  "verdict": "PASS" | "FAIL" | "PARTIAL",
  "confidence": <number between 0.0 and 1.0>,
  "reason": "<one sentence explaining your verdict>",
  "evidence": {
    "file": "<path to most relevant file or empty string>",
    "line": <line number or 0>,
    "detail": "<specific code or absence that supports your verdict>"
  },
  "suggestion": "<if FAIL or PARTIAL: a Kiro-ready task description to fix this. if PASS: null>"
}`;
}

// ─── Response Parsing ────────────────────────────────────────────────────────

/**
 * Parse the LLM's JSON response into a CriterionResult.
 */
export function parseLLMResponse(
  response: string,
  criterion: AcceptanceCriterion,
  staticResults: StaticCheckResult[],
): CriterionResult {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    const verdict = validateVerdict(parsed.verdict);
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));
    const reason = String(parsed.reason || 'No reason provided');
    const evidence: Evidence = {
      file: String(parsed.evidence?.file || ''),
      line: Number(parsed.evidence?.line || 0),
      detail: String(parsed.evidence?.detail || ''),
    };
    const suggestion = parsed.suggestion ? String(parsed.suggestion) : undefined;

    // Boost confidence if static checks agree
    let adjustedConfidence = confidence;
    const staticAgreement = staticResults.some(r =>
      (r.found && verdict === 'PASS') || (!r.found && verdict === 'FAIL')
    );
    if (staticAgreement) {
      adjustedConfidence = Math.min(1, confidence + 0.1);
    }

    return {
      criterion,
      verdict,
      confidence: adjustedConfidence,
      reason,
      evidence,
      suggestion,
    };
  } catch {
    // If parsing fails, attempt a heuristic verdict from the raw text
    return buildHeuristicVerdict(response, criterion, staticResults);
  }
}

/**
 * Extract JSON from a response that might be wrapped in markdown code blocks.
 */
function extractJSON(text: string): string {
  // Try direct parse first
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;

  // Try extracting from code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try finding JSON object in the text
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  throw new Error('No JSON found in response');
}

/**
 * Validate and normalize a verdict string.
 */
function validateVerdict(value: unknown): Verdict {
  const str = String(value).toUpperCase().trim();
  if (str === 'PASS') return 'PASS';
  if (str === 'FAIL') return 'FAIL';
  if (str === 'PARTIAL') return 'PARTIAL';
  return 'PARTIAL'; // Default to PARTIAL if unclear
}

// ─── Fallback Verdicts ───────────────────────────────────────────────────────

/**
 * Build a verdict from static checks only (when LLM is unavailable).
 */
function buildStaticOnlyVerdict(
  criterion: AcceptanceCriterion,
  staticResults: StaticCheckResult[],
  snippets: CodeSnippet[],
): CriterionResult {
  const foundChecks = staticResults.filter(r => r.found);
  const failedChecks = staticResults.filter(r => !r.found);

  let verdict: Verdict;
  let reason: string;

  if (foundChecks.length > 0 && failedChecks.length === 0) {
    verdict = 'PASS';
    reason = `Static analysis confirms: ${foundChecks.map(r => r.detail).join('; ')}`;
  } else if (foundChecks.length > 0) {
    verdict = 'PARTIAL';
    reason = `Partially verified: ${foundChecks.map(r => r.detail).join('; ')}. Missing: ${failedChecks.map(r => r.detail).join('; ')}`;
  } else if (snippets.length > 0) {
    verdict = 'PARTIAL';
    reason = 'Relevant code found but could not verify conformance (LLM unavailable)';
  } else {
    verdict = 'FAIL';
    reason = 'No implementation evidence found';
  }

  const evidence: Evidence = foundChecks[0]
    ? { file: foundChecks[0].file || '', line: foundChecks[0].line || 0, detail: foundChecks[0].detail }
    : { file: '', line: 0, detail: 'No evidence' };

  return {
    criterion,
    verdict,
    confidence: 0.5, // Lower confidence without LLM
    reason,
    evidence,
    suggestion: verdict !== 'PASS' ? buildRemediationTask(criterion, staticResults) : undefined,
  };
}

/**
 * Build a heuristic verdict when JSON parsing fails.
 */
function buildHeuristicVerdict(
  response: string,
  criterion: AcceptanceCriterion,
  staticResults: StaticCheckResult[],
): CriterionResult {
  const lower = response.toLowerCase();

  let verdict: Verdict = 'PARTIAL';
  if (lower.includes('"pass"') || lower.includes('verdict: pass') || lower.includes('is satisfied')) {
    verdict = 'PASS';
  } else if (lower.includes('"fail"') || lower.includes('verdict: fail') || lower.includes('not satisfied') || lower.includes('not implemented')) {
    verdict = 'FAIL';
  }

  return {
    criterion,
    verdict,
    confidence: 0.4,
    reason: 'Could not parse LLM response (heuristic verdict)',
    evidence: { file: '', line: 0, detail: response.substring(0, 200) },
    suggestion: verdict !== 'PASS' ? buildRemediationTask(criterion, staticResults) : undefined,
  };
}

// ─── Remediation Task Generator ──────────────────────────────────────────────

/**
 * Generate a Kiro-ready remediation task description from a failed criterion.
 */
function buildRemediationTask(
  criterion: AcceptanceCriterion,
  staticResults: StaticCheckResult[],
): string {
  const failedChecks = staticResults.filter(r => !r.found);
  const context = failedChecks.length > 0
    ? ` (missing: ${failedChecks.map(r => r.detail).join(', ')})`
    : '';

  return `Implement: ${criterion.text}${context}`;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
