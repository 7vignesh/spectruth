/**
 * Snapshot capture.
 *
 * Kiro's IDE task events do not carry a usable task identifier, so SpecTruth
 * pairs a pre-task snapshot with post-task state and infers the completed task
 * by comparison. Capture is read-only: it never modifies the repository.
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { relative } from 'path';
import type {
  FileFingerprint,
  GitState,
  KiroSpec,
  SpecSnapshot,
  TaskStateEntry,
} from '../types.js';
import { SNAPSHOT_SCHEMA_VERSION } from '../types.js';
import { walkFileTree } from '../retriever/index.js';

export interface CaptureSnapshotOptions {
  spec: KiroSpec;
  codePath: string;
  /** Injectable for deterministic tests. */
  now?: () => Date;
}

export function captureSnapshot(options: CaptureSnapshotOptions): SpecSnapshot {
  const { spec, codePath } = options;
  const now = options.now ?? (() => new Date());

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    specName: spec.name,
    specPath: normalizePath(spec.specPath),
    createdAt: now().toISOString(),
    tasks: captureTaskStates(spec),
    git: captureGitState(codePath),
    fingerprints: captureFingerprints(codePath),
  };
}

export function captureTaskStates(spec: KiroSpec): TaskStateEntry[] {
  return spec.tasks.tasks.map(task => ({
    id: task.id,
    title: task.title,
    state: task.state,
    location: { file: normalizePath(task.location.file), line: task.location.line },
  }));
}

export function captureFingerprints(codePath: string): FileFingerprint[] {
  const files = walkFileTree(codePath);
  const fingerprints: FileFingerprint[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file);
      fingerprints.push({
        path: toRelativePath(codePath, file),
        hash: createHash('sha256').update(content).digest('hex'),
        size: statSync(file).size,
      });
    } catch {
      continue; // Unreadable files simply produce no fingerprint evidence.
    }
  }

  fingerprints.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return fingerprints;
}

export function captureGitState(codePath: string): GitState {
  const head = runGit(['rev-parse', 'HEAD'], codePath)?.trim();
  if (!head) {
    return { available: false, dirtyFiles: [] };
  }

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], codePath)?.trim();
  const status = runGit(['status', '--porcelain'], codePath);

  return {
    available: true,
    head,
    ...(branch ? { branch } : {}),
    dirtyFiles: parseDirtyFiles(status ?? ''),
  };
}

/**
 * Parse `git status --porcelain`. The leading status columns are significant,
 * so the raw output must not be trimmed before it reaches this function.
 */
export function parseDirtyFiles(status: string): string[] {
  const files = new Set<string>();
  const statusLine = /^[ MADRCU?!]{1,2}\s+(.*)$/;

  for (const line of status.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const match = statusLine.exec(line);
    if (!match) continue;

    const payload = match[1].trim();
    if (payload.length === 0) continue;

    // Renames report `old -> new`; the destination is the current path.
    const renameParts = payload.split(' -> ');
    const target = renameParts[renameParts.length - 1];
    files.add(normalizePath(unquoteGitPath(target)));
  }

  return [...files].sort();
}

function unquoteGitPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Array-based execution keeps user-controlled paths out of a shell string.
 * Output is returned raw because `git status --porcelain` encodes state in its
 * leading columns.
 */
function runGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

function toRelativePath(root: string, file: string): string {
  const rel = relative(root, file);
  return normalizePath(rel.length > 0 ? rel : file);
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
