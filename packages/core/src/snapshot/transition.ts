/**
 * Completed-task transition inference.
 *
 * Success requires exactly one task moving from an incomplete state to
 * completed. Ambiguity is reported instead of guessing, because auditing the
 * wrong task would produce confident but fabricated evidence.
 */

import type {
  FileChange,
  FileFingerprint,
  SpecSnapshot,
  TaskStateEntry,
  TransitionInference,
} from '../types.js';

export function inferCompletedTask(
  previous: SpecSnapshot,
  current: SpecSnapshot,
): TransitionInference {
  if (previous.schemaVersion !== current.schemaVersion) {
    return {
      ok: false,
      code: 'SNAPSHOT_SCHEMA_MISMATCH',
      message:
        `Snapshot schema versions differ (${previous.schemaVersion} and ${current.schemaVersion}).`,
      candidateTaskIds: [],
    };
  }

  if (previous.specName !== current.specName || previous.specPath !== current.specPath) {
    return {
      ok: false,
      code: 'SNAPSHOT_SPEC_MISMATCH',
      message:
        `Snapshot belongs to spec "${previous.specName}" but current state is "${current.specName}".`,
      candidateTaskIds: [],
    };
  }

  const previousById = new Map(previous.tasks.map(task => [task.id, task]));
  const currentById = new Map(current.tasks.map(task => [task.id, task]));

  const transitions: TaskStateEntry[] = [];
  const appearedCompleted: string[] = [];

  for (const task of current.tasks) {
    if (task.state !== 'completed') continue;
    const before = previousById.get(task.id);
    if (!before) {
      appearedCompleted.push(task.id);
      continue;
    }
    if (before.state !== 'completed') transitions.push(task);
  }

  if (transitions.length > 1) {
    return {
      ok: false,
      code: 'MULTIPLE_COMPLETED_TRANSITIONS',
      message:
        `${transitions.length} tasks changed to completed; SpecTruth audits exactly one task per transition.`,
      candidateTaskIds: transitions.map(task => task.id),
    };
  }

  if (transitions.length === 0) {
    const removed = previous.tasks
      .filter(task => task.state !== 'completed' && !currentById.has(task.id))
      .map(task => task.id);

    if (removed.length > 0) {
      return {
        ok: false,
        code: 'TASK_REMOVED',
        message:
          'No task changed to completed, and previously incomplete tasks are no longer present in tasks.md.',
        candidateTaskIds: removed,
      };
    }

    return {
      ok: false,
      code: 'NO_COMPLETED_TRANSITION',
      message: appearedCompleted.length > 0
        ? 'No observed task transition; completed tasks appeared without a prior incomplete state.'
        : 'No task changed to completed since the pre-task snapshot.',
      candidateTaskIds: appearedCompleted,
    };
  }

  const completed = transitions[0];
  const before = previousById.get(completed.id)!;

  return {
    ok: true,
    transition: {
      taskId: completed.id,
      title: completed.title,
      previousState: before.state,
      currentState: 'completed',
      location: completed.location,
      ...(before.title !== completed.title ? { renamedFrom: before.title } : {}),
      changedFiles: diffChangedFiles(previous, current),
      gitHeadChanged: Boolean(
        previous.git.available
        && current.git.available
        && previous.git.head !== current.git.head,
      ),
      inferredFrom: 'snapshot-pair',
    },
  };
}

/**
 * Compare fingerprints, then include Git-reported dirty paths that produced no
 * fingerprint so changes outside tracked code extensions are still visible.
 */
export function diffChangedFiles(
  previous: SpecSnapshot,
  current: SpecSnapshot,
): FileChange[] {
  const before = indexFingerprints(previous.fingerprints);
  const after = indexFingerprints(current.fingerprints);
  const changes = new Map<string, FileChange>();

  for (const [path, fingerprint] of after) {
    const previousFingerprint = before.get(path);
    if (!previousFingerprint) {
      changes.set(path, { path, change: 'added' });
    } else if (previousFingerprint.hash !== fingerprint.hash) {
      changes.set(path, { path, change: 'modified' });
    }
  }

  for (const path of before.keys()) {
    if (!after.has(path)) changes.set(path, { path, change: 'deleted' });
  }

  // Git-reported paths without any fingerprint fall outside the walked file
  // types, so surface them as changed rather than dropping the evidence.
  const gitDirty = new Set([...previous.git.dirtyFiles, ...current.git.dirtyFiles]);
  for (const path of gitDirty) {
    if (changes.has(path)) continue;
    if (after.has(path) || before.has(path)) continue;
    changes.set(path, { path, change: 'modified' });
  }

  return [...changes.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function indexFingerprints(fingerprints: FileFingerprint[]): Map<string, FileFingerprint> {
  return new Map(fingerprints.map(fingerprint => [fingerprint.path, fingerprint]));
}
