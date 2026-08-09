/**
 * @spectruth/core
 *
 * Core verification engine for SpecTruth.
 * Parses Kiro specs, retrieves relevant code, verifies conformance via LLM,
 * and produces structured reports.
 */

export * from './types.js';
export { parseSpec } from './parser/index.js';
export { findRelevantCode, extractKeywords, walkFileTree } from './retriever/index.js';
export { verifyRequirement, verifyCriterion, buildVerificationPrompt, parseLLMResponse } from './verifier/index.js';
export { createProvider, isKiroSession, AnthropicProvider, OpenAIProvider, KiroProvider } from './verifier/provider.js';
export { runStaticChecks } from './verifier/static-checks.js';
// export { generateReport } from './reporter/index.js';     // Coming Day 3
// export { verify } from './verify.js';                     // Coming Day 3
