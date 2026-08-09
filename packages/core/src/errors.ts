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
