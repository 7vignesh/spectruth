/**
 * Task-scoped evidence bundle.
 *
 * Collects only the evidence relevant to one completed task. The adjudicator
 * must cite evidence from this bundle and nothing else, so scoping is the
 * primary control against hallucinated citations.
 */

import type {
  AcceptanceCriterion,
  CodeSnippet,
  CompletedTaskTransition,
  DesignSection,
  EvidenceItem,
  FileChange,
  KiroSpec,
  Requirement,
} from '../types.js';
import type { CheckStrength } from '../verifier/static-checks.js';

/** A single Git diff hunk relevant to the completed task. */
export interface DiffHunk {
  file: string;
  startLine: number;
  content: string;
  change: 'added' | 'modified' | 'deleted';
}

/** Static check result from the existing deterministic checker. */
export interface StaticFinding {
  criterionId: string;
  found: boolean;
  detail: string;
  /**
   * Whether this finding tests the required behaviour (`specific`) or merely
   * that somewhere for it to live exists (`corroborating`). Corroborating
   * evidence alone cannot support a criterion.
   */
  strength: CheckStrength;
  file?: string;
  line?: number;
}

/**
 * The complete evidence scope for one task. Adjudication receives this and
 * nothing else — every citation must point to content present here.
 */
export interface TaskEvidenceBundle {
  /** The task that completed. */
  taskId: string;
  taskTitle: string;
  transition: CompletedTaskTransition;

  /** Linked spec context. */
  requirements: Requirement[];
  criteria: AcceptanceCriterion[];
  designContext: DesignSection[];

  /** Source and change evidence. */
  changedFiles: FileChange[];
  diffHunks: DiffHunk[];
  sourceSnippets: CodeSnippet[];
  staticFindings: StaticFinding[];

  /** Metadata. */
  codebasePath: string;
  specName: string;
}

export interface BuildBundleOptions {
  spec: KiroSpec;
  transition: CompletedTaskTransition;
  codebasePath: string;
  /** Maximum diff hunks to include. Keeps the bundle bounded. */
  maxDiffHunks?: number;
  /** Maximum source snippets per criterion. */
  maxSnippetsPerCriterion?: number;
}

export const DEFAULT_MAX_DIFF_HUNKS = 30;
export const DEFAULT_MAX_SNIPPETS_PER_CRITERION = 3;
