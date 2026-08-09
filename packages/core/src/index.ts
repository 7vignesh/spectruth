/**
 * @spectruth/core
 *
 * Core verification engine for SpecTruth.
 * Parses Kiro specs, retrieves relevant code, verifies conformance via LLM,
 * and produces structured reports.
 */

// Types
export * from './types.js';

// Pipeline stages
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

// Reporting
export {
  generateReport,
  formatTerminalReport,
  formatMatrixReport,
  formatJSONReport,
  formatMatrixJSON,
  formatGitHubAnnotations,
} from './reporter/index.js';
export type { OutputFormat } from './reporter/index.js';

// Orchestration — the main entry point
export {
  verify,
  loadSpec,
  validateCodePath,
  buildReport,
  reportToExitCode,
  SpecTruthError,
} from './verify.js';
export type { VerifyOptions, SpecTruthErrorCode } from './verify.js';
