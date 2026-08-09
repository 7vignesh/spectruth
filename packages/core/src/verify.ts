/**
 * SpecTruth audit orchestrator.
 *
 * Loads requirements, collects source/static evidence through the current
 * pipeline, and aggregates criterion findings under the Done Integrity policy.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import type {
  LLMProvider,
  ParsedSpec,
  RequirementAudit,
  SpecAuditReport,
} from './types.js';
import { countEvidenceStates, deriveShipStatus } from './domain/policy.js';
import { parseSpec } from './parser/index.js';
import { verifyRequirement } from './verifier/index.js';
import { createProvider } from './verifier/provider.js';

export { SpecTruthError } from './errors.js';
export type { SpecTruthErrorCode } from './errors.js';

import { SpecTruthError } from './errors.js';

export interface VerifyOptions {
  specPath: string;
  codePath: string;
  provider?: string;
  llmProvider?: LLMProvider;
  onProgress?: (result: RequirementAudit, index: number, total: number) => void;
}

export async function verify(options: VerifyOptions): Promise<SpecAuditReport> {
  const { specPath, codePath, provider, llmProvider, onProgress } = options;
  const spec = loadSpec(specPath);
  const resolvedCodePath = validateCodePath(codePath);
  const llm = llmProvider ?? resolveProvider(provider);
  const requirements: RequirementAudit[] = [];
  const total = spec.requirements.length;

  for (let index = 0; index < total; index++) {
    const requirement = spec.requirements[index];
    const audit = await verifyRequirement(requirement, resolvedCodePath, llm);
    requirements.push(audit);
    onProgress?.(audit, index, total);
  }

  return buildReport(spec, resolvedCodePath, requirements);
}

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
  } catch {
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
      'Specs need "### Requirement N" sections with acceptance criteria.',
    );
  }
  return spec;
}

export function validateCodePath(codePath: string): string {
  const resolved = resolve(codePath);
  if (!existsSync(resolved)) {
    throw new SpecTruthError(
      `Codebase path not found: ${codePath}`,
      'CODE_PATH_NOT_FOUND',
      'Point --code at your source directory (for example, ./src).',
    );
  }
  if (!statSync(resolved).isDirectory()) {
    throw new SpecTruthError(
      `Codebase path is not a directory: ${codePath}`,
      'CODE_PATH_NOT_DIRECTORY',
      'Point --code at a directory, not a file.',
    );
  }
  return resolved;
}

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

export function buildReport(
  spec: ParsedSpec,
  codebasePath: string,
  requirements: RequirementAudit[],
): SpecAuditReport {
  const states = countEvidenceStates(requirements);
  const totalCriteria = requirements.reduce(
    (total, requirement) => total + requirement.criteria.length,
    0,
  );

  return {
    scope: { kind: 'spec' },
    specTitle: spec.title,
    timestamp: new Date().toISOString(),
    codebasePath,
    requirements,
    summary: {
      totalRequirements: requirements.length,
      totalCriteria,
      states,
      shipStatus: deriveShipStatus(states),
    },
  };
}

/** Manual CLI gate mapping. Hook mode will keep domain BLOCKED separate from hook errors. */
export function reportToExitCode(report: SpecAuditReport): 0 | 1 {
  return report.summary.shipStatus === 'READY' ? 0 : 1;
}
