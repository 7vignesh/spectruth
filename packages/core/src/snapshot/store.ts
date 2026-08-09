/**
 * Snapshot persistence.
 *
 * Snapshots are written atomically so that an interrupted PreTaskExec hook
 * cannot leave a half-written snapshot that would corrupt task inference.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type { SpecSnapshot } from '../types.js';
import { SNAPSHOT_SCHEMA_VERSION } from '../types.js';
import { SpecTruthError } from '../errors.js';

export const SNAPSHOT_DIR = join('.spectruth', 'snapshots');

/** Deterministic snapshot location for a spec inside a project root. */
export function snapshotPathFor(projectRoot: string, specName: string): string {
  return join(resolve(projectRoot), SNAPSHOT_DIR, `${sanitizeName(specName)}.json`);
}

export function writeSnapshot(path: string, snapshot: SpecSnapshot): void {
  const target = resolve(path);
  const temporary = `${target}.tmp`;

  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
    renameSync(temporary, target);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // The temporary file may not exist; cleanup failure must not mask the cause.
    }
    throw new SpecTruthError(
      `Could not write snapshot: ${path}`,
      'SNAPSHOT_WRITE_FAILED',
      error instanceof Error ? error.message : 'Check directory permissions.',
    );
  }
}

export function snapshotExists(path: string): boolean {
  return existsSync(resolve(path));
}

export function readSnapshot(path: string): SpecSnapshot {
  const target = resolve(path);

  if (!existsSync(target)) {
    throw new SpecTruthError(
      `Snapshot not found: ${path}`,
      'SNAPSHOT_NOT_FOUND',
      'Capture a pre-task snapshot before auditing a completed task.',
    );
  }

  let raw: string;
  try {
    raw = readFileSync(target, 'utf-8');
  } catch {
    throw new SpecTruthError(
      `Could not read snapshot: ${path}`,
      'SNAPSHOT_UNREADABLE',
      'Check file permissions.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SpecTruthError(
      `Snapshot is not valid JSON: ${path}`,
      'SNAPSHOT_UNREADABLE',
      'Delete the snapshot and capture a new pre-task snapshot.',
    );
  }

  return validateSnapshot(parsed, path);
}

function validateSnapshot(value: unknown, path: string): SpecSnapshot {
  const candidate = value as Partial<SpecSnapshot> | null;
  const valid = candidate
    && typeof candidate.schemaVersion === 'number'
    && typeof candidate.specName === 'string'
    && typeof candidate.specPath === 'string'
    && typeof candidate.createdAt === 'string'
    && Array.isArray(candidate.tasks)
    && Array.isArray(candidate.fingerprints)
    && candidate.git !== undefined;

  if (!valid) {
    throw new SpecTruthError(
      `Snapshot is missing required fields: ${path}`,
      'SNAPSHOT_UNREADABLE',
      'Delete the snapshot and capture a new pre-task snapshot.',
    );
  }

  if (candidate.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SpecTruthError(
      `Unsupported snapshot schema version ${candidate.schemaVersion} in ${path}`,
      'SNAPSHOT_UNREADABLE',
      `This build expects schema version ${SNAPSHOT_SCHEMA_VERSION}. Capture a new snapshot.`,
    );
  }

  return candidate as SpecSnapshot;
}

function sanitizeName(specName: string): string {
  const safe = specName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe.length > 0 ? safe : 'spec';
}
