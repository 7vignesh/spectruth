/**
 * @spectruth/core
 *
 * Core verification engine for SpecTruth.
 * Parses Kiro specs, retrieves relevant code, verifies conformance via LLM,
 * and produces structured reports.
 */

export * from './types.js';
export { parseSpec } from './parser/index.js';
// export { findRelevantCode } from './retriever/index.js';  // Coming Day 2
// export { verifyCriterion } from './verifier/index.js';    // Coming Day 2
// export { generateReport } from './reporter/index.js';     // Coming Day 3
// export { verify } from './verify.js';                     // Coming Day 3
