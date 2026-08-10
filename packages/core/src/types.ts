/**
 * SpecTruth Core Types
 *
 * Shared interfaces for parsing Kiro specs and producing evidence-backed
 * Done Integrity audit reports.
 */

// ─── Parsed Spec Types ───────────────────────────────────────────────────────

export interface ParsedSpec {
  title: string;
  introduction: string;
  requirements: Requirement[];
}

export interface Requirement {
  id: string;
  title: string;
  userStory: string;
  acceptanceCriteria: AcceptanceCriterion[];
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  keyword: CriterionKeyword;
}

export type CriterionKeyword = 'WHEN/THEN' | 'IF/THEN' | 'WHERE' | 'plain';

// ─── Code Retrieval Types ────────────────────────────────────────────────────

export interface CodeSnippet {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface RetrievalResult {
  criterion: AcceptanceCriterion;
  snippets: CodeSnippet[];
  searchTerms: string[];
}

// ─── Done Integrity Domain Types ─────────────────────────────────────────────

export type EvidenceState =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'UNSUPPORTED'
  | 'UNVERIFIED';

export type ShipStatus =
  | 'READY'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export type EvidenceSource =
  | 'requirement'
  | 'design'
  | 'task'
  | 'task-transition'
  | 'git-diff'
  | 'source-code'
  | 'static-check'
  | 'test-output';

export interface EvidenceLocation {
  file: string;
  line?: number;
}

export interface EvidenceItem {
  source: EvidenceSource;
  location?: EvidenceLocation;
  observation: string;
  supports: boolean;
}

export interface CriterionAudit {
  criterionId: string;
  criterionText: string;
  state: EvidenceState;
  justification: string;
  evidence: EvidenceItem[];
  gaps: string[];
  repairPreviewAvailable: boolean;
}

export interface RequirementAudit {
  requirement: Requirement;
  state: EvidenceState;
  criteria: CriterionAudit[];
}

export interface EvidenceStateCounts {
  supported: number;
  partial: number;
  unsupported: number;
  unverified: number;
}

export interface AuditSummary {
  totalRequirements: number;
  totalCriteria: number;
  states: EvidenceStateCounts;
  shipStatus: ShipStatus;
}

export interface SpecAuditScope {
  kind: 'spec';
}

export interface TaskAuditScope {
  kind: 'task';
  taskId: string;
  taskTitle?: string;
}

export interface SpecAuditReport {
  reportId: string;
  scope: SpecAuditScope;
  specTitle: string;
  timestamp: string;
  codebasePath: string;
  requirements: RequirementAudit[];
  summary: AuditSummary;
}

export interface TaskAuditReport {
  reportId: string;
  scope: TaskAuditScope;
  specTitle: string;
  timestamp: string;
  codebasePath: string;
  requirements: RequirementAudit[];
  summary: AuditSummary;
}

export type AuditReport = SpecAuditReport | TaskAuditReport;

// ─── Repair Preview and Approval Types ───────────────────────────────────────

/**
 * A proposed repair. Producing one never changes a file: a preview is a
 * description of work, not the work itself.
 */
export interface RepairPreview {
  previewId: string;
  reportId: string;
  taskId: string;
  criterionId: string;
  criterionText: string;
  currentState: EvidenceState;
  /** The evidence gap this repair would close. */
  gap: string;
  /** What a repair would need to do. */
  proposedChange: string;
  /** Files the repair is most likely to touch, when known. */
  likelyFiles: string[];
  /** Evidence that should exist once the repair is genuinely done. */
  expectedEvidence: string;
}

/**
 * An explicit approval for exactly one preview.
 *
 * The fingerprint pins the repository state that was approved, so an approval
 * cannot be replayed against a codebase that has since changed.
 */
export interface RepairApproval {
  previewId: string;
  reportId: string;
  taskId: string;
  criterionId: string;
  approvedAt: string;
  stateFingerprint: string;
  /** Exactly what the user authorized, copied so it cannot be widened later. */
  approvedChange: string;
}

export type ApprovalRejectionCode =
  | 'PREVIEW_NOT_FOUND'
  | 'APPROVAL_NOT_FOUND'
  | 'REPORT_SUPERSEDED'
  | 'STATE_CHANGED';

export type ApprovalCheck =
  | { ok: true; approval: RepairApproval }
  | { ok: false; code: ApprovalRejectionCode; message: string };

// ─── Kiro Spec Document Types ────────────────────────────────────────────────

/** Where a parsed element came from, so evidence can cite the spec itself. */
export interface SourceLocation {
  file: string;
  line: number;
}

/** Kiro renders `- [ ]`, `- [-]`, and `- [x]` checkboxes. */
export type TaskState = 'not_started' | 'in_progress' | 'completed';

/** A `_Requirements: 1.1, 2_` reference resolved against requirements.md. */
export interface RequirementReference {
  raw: string;
  requirementId: string;
  criterionId?: string;
}

export interface ParsedTask {
  id: string;
  title: string;
  description: string[];
  state: TaskState;
  depth: number;
  parentId?: string;
  childIds: string[];
  requirementRefs: RequirementReference[];
  location: SourceLocation;
}

export type ParseDiagnosticCode =
  | 'TASK_MALFORMED_CHECKBOX'
  | 'TASK_DUPLICATE_ID'
  | 'TASK_MISSING_TITLE'
  | 'TASK_NO_REQUIREMENT_REFS'
  | 'REQUIREMENT_REF_UNRESOLVED'
  | 'DESIGN_MISSING'
  | 'DESIGN_EMPTY'
  | 'TASKS_MISSING'
  | 'TASKS_EMPTY';

export interface ParseDiagnostic {
  code: ParseDiagnosticCode;
  message: string;
  location?: SourceLocation;
}

export interface ParsedTasks {
  title: string;
  tasks: ParsedTask[];
  diagnostics: ParseDiagnostic[];
}

export interface DesignSection {
  heading: string;
  level: number;
  content: string;
  location: SourceLocation;
}

export interface ParsedDesign {
  title: string;
  sections: DesignSection[];
}

/**
 * Resolved links for one task. Unresolved references are reported rather than
 * guessed, because inventing links would fabricate audit evidence.
 */
export interface TaskLinks {
  taskId: string;
  requirements: Requirement[];
  criteria: AcceptanceCriterion[];
  designSections: DesignSection[];
  unresolvedRefs: string[];
}

export interface KiroSpec {
  name: string;
  specPath: string;
  requirements: ParsedSpec;
  tasks: ParsedTasks;
  design?: ParsedDesign;
  links: TaskLinks[];
  diagnostics: ParseDiagnostic[];
}

// ─── Snapshot and Transition Types ───────────────────────────────────────────

export interface TaskStateEntry {
  id: string;
  title: string;
  state: TaskState;
  location: SourceLocation;
}

export interface FileFingerprint {
  path: string;
  hash: string;
  size: number;
}

export interface GitState {
  available: boolean;
  head?: string;
  branch?: string;
  dirtyFiles: string[];
}

export const SNAPSHOT_SCHEMA_VERSION = 1;

export interface SpecSnapshot {
  schemaVersion: number;
  specName: string;
  specPath: string;
  createdAt: string;
  tasks: TaskStateEntry[];
  git: GitState;
  fingerprints: FileFingerprint[];
}

export type FileChangeKind = 'added' | 'modified' | 'deleted';

export interface FileChange {
  path: string;
  change: FileChangeKind;
}

/**
 * How the completed task was established.
 *
 * `snapshot-pair` means a real incomplete-to-complete transition was observed
 * between two snapshots. `current-state` means the task is simply marked
 * complete right now, which is weaker and must not be reported as observed.
 */
export type TransitionProvenance = 'snapshot-pair' | 'current-state';

export interface CompletedTaskTransition {
  taskId: string;
  title: string;
  previousState: TaskState;
  currentState: 'completed';
  location: SourceLocation;
  renamedFrom?: string;
  changedFiles: FileChange[];
  gitHeadChanged: boolean;
  inferredFrom: TransitionProvenance;
}

export type TransitionFailureCode =
  | 'NO_COMPLETED_TRANSITION'
  | 'MULTIPLE_COMPLETED_TRANSITIONS'
  | 'SNAPSHOT_SPEC_MISMATCH'
  | 'SNAPSHOT_SCHEMA_MISMATCH'
  | 'TASK_REMOVED';

export type TransitionInference =
  | { ok: true; transition: CompletedTaskTransition }
  | {
      ok: false;
      code: TransitionFailureCode;
      message: string;
      candidateTaskIds: string[];
    };

// ─── LLM Provider Types ──────────────────────────────────────────────────────

export interface LLMProvider {
  name: string;
  verify(prompt: string): Promise<string>;
}

export interface LLMProviderConfig {
  provider: 'anthropic' | 'openai' | 'kiro';
  model?: string;
  apiKey?: string;
}

// ─── Configuration Types ─────────────────────────────────────────────────────

export interface SpecTruthConfig {
  specPath: string;
  codePath: string;
  output?: 'terminal' | 'json';
  provider?: 'anthropic' | 'openai' | 'kiro' | 'auto';
}
