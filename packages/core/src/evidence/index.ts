/**
 * Evidence module — task-scoped bundle collection and adjudication.
 */

export type { TaskEvidenceBundle, DiffHunk, StaticFinding, BuildBundleOptions } from './types.js';
export { DEFAULT_MAX_DIFF_HUNKS, DEFAULT_MAX_SNIPPETS_PER_CRITERION } from './types.js';
export { buildEvidenceBundle } from './bundle.js';
export { adjudicateBundle, buildAdjudicationPrompt } from './adjudicate.js';
export type { AdjudicateOptions } from './adjudicate.js';
export {
  collectDiffHunks,
  collectSourceSnippets,
  collectStaticFindings,
  diffHunksToEvidence,
  sourceSnippetsToEvidence,
  staticFindingsToEvidence,
  transitionToEvidence,
} from './collectors.js';
