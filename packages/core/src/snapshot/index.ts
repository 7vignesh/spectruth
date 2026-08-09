/**
 * Snapshot module facade.
 *
 * Provides the pre-task capture and post-task inference entry points that the
 * paired Kiro hooks will call.
 */

import type { KiroSpec, SpecSnapshot, TransitionInference } from '../types.js';
import { loadKiroSpec } from '../parser/kiro-spec.js';
import { captureSnapshot } from './capture.js';
import { readSnapshot, snapshotPathFor, writeSnapshot } from './store.js';
import { inferCompletedTask } from './transition.js';

export {
  captureSnapshot,
  captureFingerprints,
  captureGitState,
  captureTaskStates,
  parseDirtyFiles,
  normalizePath,
} from './capture.js';
export {
  SNAPSHOT_DIR,
  readSnapshot,
  snapshotExists,
  snapshotPathFor,
  writeSnapshot,
} from './store.js';
export { diffChangedFiles, inferCompletedTask } from './transition.js';

export interface SpecSnapshotOptions {
  /** Kiro spec directory, e.g. .kiro/specs/authentication */
  specDir: string;
  /** Codebase root used for fingerprints and Git state */
  codePath: string;
  /** Where snapshots are stored; defaults to the codebase root */
  projectRoot?: string;
  now?: () => Date;
}

export interface CapturedSnapshot {
  spec: KiroSpec;
  snapshot: SpecSnapshot;
  path: string;
}

/** Capture and persist a pre-task snapshot. */
export function captureSpecSnapshot(options: SpecSnapshotOptions): CapturedSnapshot {
  const spec = loadKiroSpec(options.specDir, { requireTasks: true });
  const snapshot = captureSnapshot({
    spec,
    codePath: options.codePath,
    ...(options.now ? { now: options.now } : {}),
  });
  const path = snapshotPathFor(options.projectRoot ?? options.codePath, spec.name);

  writeSnapshot(path, snapshot);
  return { spec, snapshot, path };
}

export interface InferredTransition {
  spec: KiroSpec;
  previous: SpecSnapshot;
  current: SpecSnapshot;
  inference: TransitionInference;
}

/**
 * Compare the stored pre-task snapshot with current state and infer which task
 * transitioned to completed.
 */
export function inferCompletedTaskForSpec(options: SpecSnapshotOptions): InferredTransition {
  const spec = loadKiroSpec(options.specDir, { requireTasks: true });
  const path = snapshotPathFor(options.projectRoot ?? options.codePath, spec.name);
  const previous = readSnapshot(path);
  const current = captureSnapshot({
    spec,
    codePath: options.codePath,
    ...(options.now ? { now: options.now } : {}),
  });

  return { spec, previous, current, inference: inferCompletedTask(previous, current) };
}
