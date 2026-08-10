/**
 * Hook event recording.
 *
 * Kiro's IDE task events are not documented to carry a task identifier, so
 * SpecTruth records whatever payload arrives purely for inspection during the
 * integration spike. Task inference never reads these files: recording is
 * best-effort and a failure here must not fail the hook.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

export const HOOK_EVENT_DIR = join('.spectruth', 'hook-events');
const MAX_RETAINED_EVENTS = 20;

export interface RecordedHookEvent {
  recordedAt: string;
  hook: string;
  payload: unknown;
}

export function hookEventDirFor(projectRoot: string): string {
  return join(resolve(projectRoot), HOOK_EVENT_DIR);
}

/**
 * Persist a hook payload for inspection. Returns the path when written, or
 * undefined when recording was skipped or failed.
 */
export function recordHookEvent(
  projectRoot: string,
  hook: string,
  payload: unknown,
  now: () => Date = () => new Date(),
): string | undefined {
  if (payload === undefined) return undefined;

  try {
    const directory = hookEventDirFor(projectRoot);
    mkdirSync(directory, { recursive: true });

    const timestamp = now().toISOString();
    const path = join(directory, `${timestamp.replace(/[:.]/g, '-')}-${sanitize(hook)}.json`);
    const record: RecordedHookEvent = { recordedAt: timestamp, hook, payload };

    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    pruneOldEvents(directory);
    return path;
  } catch {
    return undefined;
  }
}

function pruneOldEvents(directory: string): void {
  try {
    const files = readdirSync(directory).filter(name => name.endsWith('.json')).sort();
    for (const stale of files.slice(0, Math.max(0, files.length - MAX_RETAINED_EVENTS))) {
      rmSync(join(directory, stale), { force: true });
    }
  } catch {
    // Pruning is housekeeping only.
  }
}

function sanitize(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe.length > 0 ? safe : 'event';
}
