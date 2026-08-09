/**
 * @spectruth/core — evidence-backed Done Integrity engine.
 */

export * from './types.js';

export { createCriterionAudit, EVIDENCE_STATES } from './domain/audit.js';
export type { CreateCriterionAuditInput } from './domain/audit.js';
export {
  countEvidenceStates,
  deriveRequirementState,
  deriveShipStatus,
  isSecuritySensitiveCriterion,
  SHIP_STATUSES,
  stateForAbsentImplementation,
} from './domain/policy.js';

export { parseSpec } from './parser/index.js';
export { findRelevantCode, extractKeywords, walkFileTree } from './retriever/index.js';
export {
  verifyRequirement,
  verifyCriterion,
  buildVerificationPrompt,
  parseLLMResponse,
} from './verifier/index.js';
export {
  createProvider,
  isKiroSession,
  AnthropicProvider,
  OpenAIProvider,
  KiroProvider,
} from './verifier/provider.js';
export { runStaticChecks } from './verifier/static-checks.js';

export {
  generateReport,
  formatTerminalReport,
  formatMatrixReport,
  formatJSONReport,
  formatMatrixJSON,
  formatGitHubAnnotations,
} from './reporter/index.js';
export type { OutputFormat } from './reporter/index.js';

export {
  verify,
  loadSpec,
  validateCodePath,
  buildReport,
  reportToExitCode,
  SpecTruthError,
} from './verify.js';
export type { VerifyOptions, SpecTruthErrorCode } from './verify.js';
