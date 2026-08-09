/**
 * Verification Orchestrator
 *
 * The main entry point that wires together the full pipeline:
 *   parse spec → retrieve code → verify criteria → aggregate → report
 *
 * Handles all error modes gracefully with typed errors.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import type {
  VerificationReport,
  RequirementResult,
  LLMProvider,
  Verdict,
  ParsedSpec,
} from './types.js';
import { parseSpec } from './parser/index.js';
import { verifyRequirement } from './verifier/index.js';
import { createProvider } from './verifier/provider.js';

// ─── Error Types ─────────────────────────────────────────────────────────────

export class SpecTruthError extends Error {
  constructor(
    message: string,
    public readonly code: SpecTruthErrorCode,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'SpecTruthError';
  }
}

export type SpecTruthErrorCode =
  | 'SPEC_NOT_FOUND'
  | 'SPEC_UNREADABLE'
  | 'SPEC_EMPTY'
  | 'SPEC_NO_REQUIREMENTS'
  | 'CODE_PATH_NOT_FOUND'
  | 'CODE_PATH_NOT_DIRECTORY'
  | 'NO_PROVIDER'
  | 'VERIFICATION_FAILED';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface VerifyOptions {
  /** Path to the spec file (requirements.md) */
  specPath: string;
  /** Path to the codebase directory */
  codePath: string;
  /** Preferred LLM provider: auto, anthropic, openai, kiro */
  provider?: string;
  /** Optional pre-constructed provider (for testing) */
  llmProvider?: LLMProvider;
  /** Called after each requirement is verified (for streaming/progress) */
  onProgress?: (result: RequirementResult, index: number, total: number) => void;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Verify a codebase against a spec.
 *
 * @throws {SpecTruthError} On invalid inputs or missing provider
 */
export async function verify(options: VerifyOptions): Promise<VerificationReport> {
  const { specPath, codePath, provider, llmProvider, onProgress } = options;

  // Step 1: Validate and load the spec
  const spec = loadSpec(specPath);

  // Step 2: Validate the codebase path
  const resolvedCodePath = validateCodePath(codePath);

  // Step 3: Resolve the LLM provider
  const llm = llmProvider ?? resolveProvider(provider);

  // Step 4: Verify each requirement (sequential to allow progress reporting,
  //         but criteria within each requirement run in parallel)
  const results: RequirementResult[] = [];
  const total = spec.requirements.length;

  for (let i = 0; i < total; i++) {
    const requirement = spec.requirements[i];
    const result = await verifyRequirement(requirement, resolvedCodePath, llm);
    results.push(result);
    onProgress?.(result, i, total);
  }

  // Step 5: Build the final report
  return buildReport(spec, resolvedCodePath, results);
}

// ─── Input Validation ────────────────────────────────────────────────────────

/**
 * Load and parse a spec file with validation.
 */
export function loadSpec(specPath: string): ParsedSpec {
  const resolved = resolve(specPath);

  if (!existsSync(resolved)) {
    throw new SpecTruthError(
      `Spec file not found: ${specPath}`,
      'SPEC_NOT_FOUND',
      'Check the path. Kiro specs are usually at .kiro/specs/<name>/requirements.md',
    );
  }

  let content: string;
  try {
    content = readFileSync(resolved, 'utf-8');
  } catch (error) {
    throw new SpecTruthError(
      `Could not read spec file: ${specPath}`,
      'SPEC_UNREADABLE',
      'Check file permissions.',
    );
  }

  if (content.trim().length === 0) {
    throw new SpecTruthError(
      `Spec file is empty: ${specPath}`,
      'SPEC_EMPTY',
      'Add requirements with acceptance criteria to the spec.',
    );
  }

  const spec = parseSpec(content);

  if (spec.requirements.length === 0) {
    throw new SpecTruthError(
      `No requirements found in spec: ${specPath}`,
      'SPEC_NO_REQUIREMENTS',
      'Specs need "### Requirement N" sections with "#### Acceptance Criteria" lists, ' +
      'or at minimum a numbered list of requirements.',
    );
  }

  return spec;
}

/**
 * Validate that the code path exists and is a directory.
 */
export function validateCodePath(codePath: string): string {
  const resolved = resolve(codePath);

  if (!existsSync(resolved)) {
    throw new SpecTruthError(
      `Codebase path not found: ${codePath}`,
      'CODE_PATH_NOT_FOUND',
      'Point --code at your source directory (e.g. ./src).',
    );
  }

  const stat = statSync(resolved);
  if (!stat.isDirectory()) {
    throw new SpecTruthError(
      `Codebase path is not a directory: ${codePath}`,
      'CODE_PATH_NOT_DIRECTORY',
      'Point --code at a directory, not a file.',
    );
  }

  return resolved;
}

/**
 * Resolve the LLM provider, wrapping provider errors in SpecTruthError.
 */
function resolveProvider(preferred?: string): LLMProvider {
  try {
    return createProvider(preferred);
  } catch (error) {
    throw new SpecTruthError(
      error instanceof Error ? error.message : 'Could not create LLM provider',
      'NO_PROVIDER',
      'SpecTruth needs an LLM. Run inside Kiro, or set ANTHROPIC_API_KEY / OPENAI_API_KEY.',
    );
  }
}

// ─── Report Aggregation ──────────────────────────────────────────────────────

/**
 * Build the final verification report with summary statistics.
 */
export function buildReport(
  spec: ParsedSpec,
  codebasePath: string,
  results: RequirementResult[],
): VerificationReport {
  const passed = results.filter(r => r.overallVerdict === 'PASS').length;
  const failed = results.filter(r => r.overallVerdict === 'FAIL').length;
  const partial = results.filter(r => r.overallVerdict === 'PARTIAL').length;

  // Criteria-level totals give a more granular score than requirement-level
  let totalCriteria = 0;
  let passedCriteria = 0;
  for (const result of results) {
    totalCriteria += result.criteriaResults.length;
    passedCriteria += result.criteriaResults.filter(cr => cr.verdict === 'PASS').length;
  }

  const overallVerdict = deriveOverallVerdict(passed, partial, failed);

  return {
    specTitle: spec.title,
    timestamp: new Date().toISOString(),
    codebasePath,
    results,
    summary: {
      totalRequirements: results.length,
      passed,
      failed,
      partial,
      overallScore: `${passedCriteria}/${totalCriteria} criteria satisfied`,
      overallVerdict,
    },
  };
}

/**
 * Derive the overall verdict from requirement-level counts.
 *
 * PASS    — every requirement passed
 * FAIL    — nothing passed and nothing is partial
 * PARTIAL — anything in between
 */
function deriveOverallVerdict(passed: number, partial: number, failed: number): Verdict {
  if (failed === 0 && partial === 0) return 'PASS';
  if (passed === 0 && partial === 0) return 'FAIL';
  return 'PARTIAL';
}

// ─── Exit Code Helper ────────────────────────────────────────────────────────

/**
 * Map a report to a process exit code.
 *   0 — all requirements satisfied
 *   1 — one or more requirements failed or are partial
 */
export function reportToExitCode(report: VerificationReport): 0 | 1 {
  return report.summary.overallVerdict === 'PASS' ? 0 : 1;
}
