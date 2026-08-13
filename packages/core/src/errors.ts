/**
 * Typed SpecTruth errors.
 *
 * These represent operational failures — unreadable specs, missing snapshots,
 * unavailable providers — and are distinct from domain audit results. A
 * `BLOCKED` ship decision is never an error.
 */

export type SpecTruthErrorCode =
  | 'SPEC_NOT_FOUND'
  | 'SPEC_UNREADABLE'
  | 'SPEC_EMPTY'
  | 'SPEC_NO_REQUIREMENTS'
  | 'SPEC_DIR_NOT_FOUND'
  | 'TASKS_NOT_FOUND'
  | 'CODE_PATH_NOT_FOUND'
  | 'CODE_PATH_NOT_DIRECTORY'
  | 'NO_PROVIDER'
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_UNREADABLE'
  | 'SNAPSHOT_WRITE_FAILED'
  | 'REPORT_NOT_FOUND'
  | 'REPORT_UNREADABLE'
  | 'REPORT_WRITE_FAILED'
  | 'SPEC_AMBIGUOUS'
  | 'TASK_INFERENCE_FAILED'
  | 'TASK_NOT_FOUND'
  | 'NO_COMPLETED_TASKS'
  | 'PREVIEW_NOT_FOUND'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_STALE'
  | 'REPORT_SUPERSEDED'
  | 'VERIFICATION_FAILED';

export class SpecTruthError extends Error {
  constructor(
    message: string,
    public readonly code: SpecTruthErrorCode,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'SpecTruthError';
  }
}
