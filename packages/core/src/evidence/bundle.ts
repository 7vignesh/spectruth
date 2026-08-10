/**
 * Evidence bundle builder.
 *
 * Orchestrates the collectors and produces a bounded, task-scoped bundle
 * that the adjudicator will reason over.
 */

import type { TaskEvidenceBundle, BuildBundleOptions } from './types.js';
import { DEFAULT_MAX_DIFF_HUNKS, DEFAULT_MAX_SNIPPETS_PER_CRITERION } from './types.js';
import {
  collectDiffHunks,
  collectSourceSnippets,
  collectStaticFindings,
} from './collectors.js';

export async function buildEvidenceBundle(
  options: BuildBundleOptions,
): Promise<TaskEvidenceBundle> {
  const {
    spec,
    transition,
    codebasePath,
    maxDiffHunks = DEFAULT_MAX_DIFF_HUNKS,
    maxSnippetsPerCriterion = DEFAULT_MAX_SNIPPETS_PER_CRITERION,
  } = options;

  const links = spec.links.find(link => link.taskId === transition.taskId);
  const requirements = links?.requirements ?? [];
  const criteria = links?.criteria ?? [];
  const designContext = links?.designSections ?? [];

  const diffHunks = collectDiffHunks(transition, codebasePath, maxDiffHunks);
  const sourceSnippets = await collectSourceSnippets(criteria, codebasePath, maxSnippetsPerCriterion);
  const staticFindings = collectStaticFindings(criteria, sourceSnippets, codebasePath);

  return {
    taskId: transition.taskId,
    taskTitle: transition.title,
    transition,
    requirements,
    criteria,
    designContext,
    changedFiles: transition.changedFiles,
    diffHunks,
    sourceSnippets,
    staticFindings,
    codebasePath,
    specName: spec.name,
  };
}
