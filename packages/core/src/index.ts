/**
 * @spectruth/core — evidence-backed Done Integrity engine.
 */

export * from './types.js';

export { SpecTruthError } from './errors.js';
export type { SpecTruthErrorCode } from './errors.js';

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
export { parseTasks, parseRequirementRefs } from './parser/tasks.js';
export { parseDesign } from './parser/design.js';
export { resolveTaskLinks } from './parser/links.js';
export type { ResolveLinksInput, ResolveLinksResult } from './parser/links.js';
export { loadKiroSpec } from './parser/kiro-spec.js';
export type { LoadKiroSpecOptions } from './parser/kiro-spec.js';

export {
  captureSnapshot,
  captureFingerprints,
  captureGitState,
  captureTaskStates,
  captureSpecSnapshot,
  diffChangedFiles,
  inferCompletedTask,
  inferCompletedTaskForSpec,
  normalizePath,
  parseDirtyFiles,
  readSnapshot,
  snapshotExists,
  snapshotPathFor,
  writeSnapshot,
  SNAPSHOT_DIR,
} from './snapshot/index.js';
export type {
  CapturedSnapshot,
  InferredTransition,
  SpecSnapshotOptions,
} from './snapshot/index.js';

export {
  buildTaskAuditReport,
  buildPendingCriteriaAudits,
  PENDING_ADJUDICATION_JUSTIFICATION,
} from './audit/task-report.js';
export type { BuildTaskAuditReportInput } from './audit/task-report.js';
export { computeReportId } from './audit/identity.js';
export { runAudit, auditProject, synthesizeTransition } from './audit/run.js';
export type {
  AuditOptions,
  AuditRunResult,
  ProjectAuditOptions,
  ProjectAuditResult,
  SkippedSpec,
  TaskAuditOutcome,
} from './audit/run.js';

export {
  PREVIEW_DIR,
  APPROVAL_DIR,
  PROTECTED_PATHS,
  approvalDirFor,
  approvalPathFor,
  approveRepair,
  assertApproved,
  buildRepairPreviews,
  checkApproval,
  compareReports,
  computePreviewId,
  computeStateFingerprint,
  findPreview,
  formatReauditSummary,
  isProtectedPath,
  previewDirFor,
  previewPathFor,
  readApproval,
  readPreviews,
  reauditTask,
  savePreviews,
} from './repair/index.js';
export type {
  ApproveOptions,
  ApprovalCheckOptions,
  CriterionDelta,
  ReauditOptions,
  ReauditResult,
} from './repair/index.js';

export {
  LATEST_REPORT_FILE,
  REPORT_DIR,
  latestReportPath,
  readLatestReport,
  readReportForTask,
  reportDirFor,
  reportPathFor,
  saveReport,
} from './report/store.js';
export type { SavedReport } from './report/store.js';

export { runDemo, formatDemo } from './demo/index.js';
export type { DemoOptions, DemoResult, DemoStep } from './demo/index.js';
export { runInit, formatInitResult } from './init/index.js';
export type { InitOptions, InitResult, ScaffoldFile } from './init/index.js';

export { runPreTaskHook, runPostTaskHook } from './hooks/index.js';
export type { HookOptions, HookResult } from './hooks/index.js';

export {
  buildEvidenceBundle,
  adjudicateBundle,
  buildAdjudicationPrompt,
  collectDiffHunks,
  collectSourceSnippets,
  collectStaticFindings,
  diffHunksToEvidence,
  sourceSnippetsToEvidence,
  staticFindingsToEvidence,
  transitionToEvidence,
  DEFAULT_MAX_DIFF_HUNKS,
  DEFAULT_MAX_SNIPPETS_PER_CRITERION,
} from './evidence/index.js';
export type {
  TaskEvidenceBundle,
  DiffHunk,
  StaticFinding,
  BuildBundleOptions,
  AdjudicateOptions,
} from './evidence/index.js';
export { findSpecDirs, resolveSingleSpecDir, SPECS_DIR } from './hooks/spec-discovery.js';
export { HOOK_EVENT_DIR, hookEventDirFor, recordHookEvent } from './hooks/events.js';
export type { RecordedHookEvent } from './hooks/events.js';
export { formatHookSummary, formatNoTransitionSummary } from './reporter/hook.js';
export type { HookSummaryOptions } from './reporter/hook.js';

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
} from './verify.js';
export type { VerifyOptions } from './verify.js';
