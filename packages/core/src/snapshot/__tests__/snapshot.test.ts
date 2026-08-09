import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadKiroSpec } from '../../parser/kiro-spec.js';
import {
  captureSnapshot,
  captureSpecSnapshot,
  diffChangedFiles,
  inferCompletedTask,
  inferCompletedTaskForSpec,
  parseDirtyFiles,
  readSnapshot,
  snapshotPathFor,
  writeSnapshot,
} from '../index.js';
import { SpecTruthError } from '../../errors.js';
import type { SpecSnapshot } from '../../types.js';

const REQUIREMENTS = `# Records — Requirements

## Requirements

### Requirement 1
**User Story:** As a user, I want to delete my records, so that I control my data.

#### Acceptance Criteria
1. WHEN the caller owns the record THEN the system SHALL delete it
2. WHEN the caller is not the owner THEN the system SHALL return 403
`;

const DESIGN = `# Records — Design

## Authorization service
Requirement 1 requires comparing ownerId with the caller.
`;

function tasksMarkdown(secondState: ' ' | 'x'): string {
  return `# Records — Tasks

- [x] 1. Add the delete route
  - _Requirements: 1.1_

- [${secondState}] 2. Enforce record ownership
  - _Requirements: 1.2_
`;
}

let root: string;
let specDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spectruth day1 '));
  specDir = join(root, '.kiro', 'specs', 'records');
  mkdirSync(specDir, { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(specDir, 'requirements.md'), REQUIREMENTS, 'utf-8');
  writeFileSync(join(specDir, 'design.md'), DESIGN, 'utf-8');
  writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown(' '), 'utf-8');
  writeFileSync(join(root, 'src', 'records.ts'), 'export function remove() {}\n', 'utf-8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function completeSecondTask(): void {
  writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown('x'), 'utf-8');
}

describe('loadKiroSpec', () => {
  it('loads requirements, tasks, design, and links from a spec directory', () => {
    const spec = loadKiroSpec(specDir, { requireTasks: true });
    expect(spec.name).toBe('records');
    expect(spec.requirements.requirements).toHaveLength(1);
    expect(spec.tasks.tasks.map(task => task.id)).toEqual(['1', '2']);
    expect(spec.design?.sections[0].heading).toBe('Authorization service');
    const ownership = spec.links.find(link => link.taskId === '2')!;
    expect(ownership.criteria.map(criterion => criterion.id)).toEqual(['REQ-1-AC-2']);
    expect(ownership.designSections).toHaveLength(1);
  });

  it('reports missing design without failing', () => {
    rmSync(join(specDir, 'design.md'));
    const spec = loadKiroSpec(specDir);
    expect(spec.design).toBeUndefined();
    expect(spec.diagnostics.some(d => d.code === 'DESIGN_MISSING')).toBe(true);
  });

  it('throws when the spec directory is missing', () => {
    expect(() => loadKiroSpec(join(root, 'nope'))).toThrowError(
      expect.objectContaining({ code: 'SPEC_DIR_NOT_FOUND' }),
    );
  });

  it('throws when tasks.md is required but absent', () => {
    rmSync(join(specDir, 'tasks.md'));
    expect(() => loadKiroSpec(specDir, { requireTasks: true })).toThrowError(
      expect.objectContaining({ code: 'TASKS_NOT_FOUND' }),
    );
  });
});

describe('captureSnapshot', () => {
  it('captures task states, fingerprints, and a deterministic timestamp', () => {
    const spec = loadKiroSpec(specDir, { requireTasks: true });
    const snapshot = captureSnapshot({
      spec,
      codePath: root,
      now: () => new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.specName).toBe('records');
    expect(snapshot.createdAt).toBe('2026-08-10T00:00:00.000Z');
    expect(snapshot.tasks).toEqual([
      expect.objectContaining({ id: '1', state: 'completed' }),
      expect.objectContaining({ id: '2', state: 'not_started' }),
    ]);
    expect(snapshot.fingerprints.some(f => f.path === 'src/records.ts')).toBe(true);
  });

  it('normalizes fingerprint paths to forward slashes', () => {
    const spec = loadKiroSpec(specDir, { requireTasks: true });
    const snapshot = captureSnapshot({ spec, codePath: root });
    expect(snapshot.fingerprints.every(f => !f.path.includes('\\'))).toBe(true);
  });

  it('reports git as unavailable outside a repository', () => {
    const spec = loadKiroSpec(specDir, { requireTasks: true });
    const snapshot = captureSnapshot({ spec, codePath: root });
    expect(snapshot.git.available).toBe(false);
    expect(snapshot.git.dirtyFiles).toEqual([]);
  });

  it('captures git HEAD and dirty files inside a repository', () => {
    execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root, windowsHide: true });
    execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: root, windowsHide: true });
    writeFileSync(join(root, 'src', 'records.ts'), 'export function remove() { return 1; }\n');

    const spec = loadKiroSpec(specDir, { requireTasks: true });
    const snapshot = captureSnapshot({ spec, codePath: root });

    expect(snapshot.git.available).toBe(true);
    expect(snapshot.git.head).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.git.dirtyFiles).toContain('src/records.ts');
  });
});

describe('parseDirtyFiles', () => {
  it('parses modified, untracked, renamed, and quoted paths', () => {
    expect(parseDirtyFiles(' M src/a.ts\n?? src/b.ts\nR  old.ts -> src/c.ts\n M "src/with space.ts"\n'))
      .toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/with space.ts']);
  });

  it('returns an empty list for a clean repository', () => {
    expect(parseDirtyFiles('')).toEqual([]);
  });

  it('keeps the full path when the leading status column is a space', () => {
    expect(parseDirtyFiles(' M src/records.ts')).toEqual(['src/records.ts']);
  });

  it('tolerates a status line whose leading space was already stripped', () => {
    expect(parseDirtyFiles('M src/records.ts')).toEqual(['src/records.ts']);
  });
});

describe('snapshot store', () => {
  it('writes and reads a snapshot at a predictable path', () => {
    const captured = captureSpecSnapshot({ specDir, codePath: root });
    expect(captured.path).toBe(snapshotPathFor(root, 'records'));
    expect(existsSync(captured.path)).toBe(true);
    expect(readSnapshot(captured.path).specName).toBe('records');
  });

  it('leaves no temporary file behind after an atomic write', () => {
    const captured = captureSpecSnapshot({ specDir, codePath: root });
    expect(existsSync(`${captured.path}.tmp`)).toBe(false);
  });

  it('replaces an existing snapshot on rewrite', () => {
    const first = captureSpecSnapshot({
      specDir,
      codePath: root,
      now: () => new Date('2026-08-10T00:00:00.000Z'),
    });
    const second = captureSpecSnapshot({
      specDir,
      codePath: root,
      now: () => new Date('2026-08-10T01:00:00.000Z'),
    });
    expect(second.path).toBe(first.path);
    expect(readSnapshot(first.path).createdAt).toBe('2026-08-10T01:00:00.000Z');
  });

  it('throws SNAPSHOT_NOT_FOUND when no snapshot exists', () => {
    expect(() => readSnapshot(snapshotPathFor(root, 'records'))).toThrowError(
      expect.objectContaining({ code: 'SNAPSHOT_NOT_FOUND' }),
    );
  });

  it('throws SNAPSHOT_UNREADABLE for corrupt JSON', () => {
    const path = snapshotPathFor(root, 'records');
    mkdirSync(join(root, '.spectruth', 'snapshots'), { recursive: true });
    writeFileSync(path, '{ not json', 'utf-8');
    expect(() => readSnapshot(path)).toThrowError(
      expect.objectContaining({ code: 'SNAPSHOT_UNREADABLE' }),
    );
  });

  it('rejects a snapshot with an unsupported schema version', () => {
    const captured = captureSpecSnapshot({ specDir, codePath: root });
    writeFileSync(
      captured.path,
      JSON.stringify({ ...captured.snapshot, schemaVersion: 99 }),
      'utf-8',
    );
    expect(() => readSnapshot(captured.path)).toThrow(SpecTruthError);
  });

  it('rejects a snapshot missing required fields', () => {
    const path = snapshotPathFor(root, 'records');
    mkdirSync(join(root, '.spectruth', 'snapshots'), { recursive: true });
    writeFileSync(path, JSON.stringify({ schemaVersion: 1 }), 'utf-8');
    expect(() => readSnapshot(path)).toThrowError(
      expect.objectContaining({ code: 'SNAPSHOT_UNREADABLE' }),
    );
  });

  it('works under a project path containing spaces', () => {
    expect(root).toContain(' ');
    const captured = captureSpecSnapshot({ specDir, codePath: root });
    expect(existsSync(captured.path)).toBe(true);
  });
});

describe('inferCompletedTask', () => {
  function snapshotPair(): { previous: SpecSnapshot; current: SpecSnapshot } {
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    completeSecondTask();
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    return { previous, current };
  }

  it('infers exactly one completed task', () => {
    const { previous, current } = snapshotPair();
    const result = inferCompletedTask(previous, current);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transition.taskId).toBe('2');
    expect(result.transition.title).toBe('Enforce record ownership');
    expect(result.transition.previousState).toBe('not_started');
    expect(result.transition.currentState).toBe('completed');
    expect(result.transition.location.line).toBeGreaterThan(0);
  });

  it('includes changed files in the transition', () => {
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    writeFileSync(join(root, 'src', 'records.ts'), 'export function remove() { return 403; }\n');
    writeFileSync(join(root, 'src', 'added.ts'), 'export const added = true;\n');
    completeSecondTask();
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });

    const result = inferCompletedTask(previous, current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.transition.changedFiles;
    expect(changes).toEqual(expect.arrayContaining([
      { path: 'src/records.ts', change: 'modified' },
      { path: 'src/added.ts', change: 'added' },
    ]));
  });

  it('reports no transition when nothing was completed', () => {
    const spec = loadKiroSpec(specDir, { requireTasks: true });
    const previous = captureSnapshot({ spec, codePath: root });
    const current = captureSnapshot({ spec, codePath: root });
    const result = inferCompletedTask(previous, current);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_COMPLETED_TRANSITION');
  });

  it('rejects multiple completed transitions', () => {
    writeFileSync(
      join(specDir, 'tasks.md'),
      '# Records — Tasks\n\n- [ ] 1. First\n- [ ] 2. Second\n',
      'utf-8',
    );
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    writeFileSync(
      join(specDir, 'tasks.md'),
      '# Records — Tasks\n\n- [x] 1. First\n- [x] 2. Second\n',
      'utf-8',
    );
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });

    const result = inferCompletedTask(previous, current);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('MULTIPLE_COMPLETED_TRANSITIONS');
    expect(result.candidateTaskIds).toEqual(['1', '2']);
  });

  it('detects a renamed task title across the transition', () => {
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    writeFileSync(
      join(specDir, 'tasks.md'),
      `# Records — Tasks

- [x] 1. Add the delete route
  - _Requirements: 1.1_

- [x] 2. Enforce ownership on delete
  - _Requirements: 1.2_
`,
      'utf-8',
    );
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });

    const result = inferCompletedTask(previous, current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transition.renamedFrom).toBe('Enforce record ownership');
    expect(result.transition.title).toBe('Enforce ownership on delete');
  });

  it('reports removed tasks when nothing completed', () => {
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    writeFileSync(
      join(specDir, 'tasks.md'),
      '# Records — Tasks\n\n- [x] 1. Add the delete route\n  - _Requirements: 1.1_\n',
      'utf-8',
    );
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });

    const result = inferCompletedTask(previous, current);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TASK_REMOVED');
    expect(result.candidateTaskIds).toEqual(['2']);
  });

  it('does not accept a completed task that never had a prior incomplete state', () => {
    writeFileSync(join(specDir, 'tasks.md'), '# Records — Tasks\n\n- [x] 1. Existing\n', 'utf-8');
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    writeFileSync(
      join(specDir, 'tasks.md'),
      '# Records — Tasks\n\n- [x] 1. Existing\n- [x] 2. Brand new and already done\n',
      'utf-8',
    );
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });

    const result = inferCompletedTask(previous, current);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_COMPLETED_TRANSITION');
    expect(result.candidateTaskIds).toEqual(['2']);
  });

  it('treats an in-progress to completed change as a transition', () => {
    writeFileSync(join(specDir, 'tasks.md'), '# Records — Tasks\n\n- [-] 1. Working\n', 'utf-8');
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    writeFileSync(join(specDir, 'tasks.md'), '# Records — Tasks\n\n- [x] 1. Working\n', 'utf-8');
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });

    const result = inferCompletedTask(previous, current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transition.previousState).toBe('in_progress');
  });

  it('rejects a snapshot from a different spec', () => {
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    completeSecondTask();
    const current = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });

    const result = inferCompletedTask({ ...previous, specName: 'other' }, current);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SNAPSHOT_SPEC_MISMATCH');
  });

  it('rejects mismatched snapshot schema versions', () => {
    const previous = captureSnapshot({
      spec: loadKiroSpec(specDir, { requireTasks: true }),
      codePath: root,
    });
    const result = inferCompletedTask({ ...previous, schemaVersion: 0 }, previous);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SNAPSHOT_SCHEMA_MISMATCH');
  });
});

describe('diffChangedFiles', () => {
  it('reports added, modified, and deleted files', () => {
    const base: SpecSnapshot = {
      schemaVersion: 1,
      specName: 'records',
      specPath: 'spec',
      createdAt: '2026-08-10T00:00:00.000Z',
      tasks: [],
      git: { available: false, dirtyFiles: [] },
      fingerprints: [
        { path: 'src/keep.ts', hash: 'a', size: 1 },
        { path: 'src/change.ts', hash: 'b', size: 1 },
        { path: 'src/gone.ts', hash: 'c', size: 1 },
      ],
    };
    const next: SpecSnapshot = {
      ...base,
      fingerprints: [
        { path: 'src/keep.ts', hash: 'a', size: 1 },
        { path: 'src/change.ts', hash: 'b2', size: 2 },
        { path: 'src/new.ts', hash: 'd', size: 1 },
      ],
    };

    expect(diffChangedFiles(base, next)).toEqual([
      { path: 'src/change.ts', change: 'modified' },
      { path: 'src/gone.ts', change: 'deleted' },
      { path: 'src/new.ts', change: 'added' },
    ]);
  });

  it('includes git-reported paths that have no fingerprint', () => {
    const snapshot: SpecSnapshot = {
      schemaVersion: 1,
      specName: 'records',
      specPath: 'spec',
      createdAt: '2026-08-10T00:00:00.000Z',
      tasks: [],
      git: { available: true, head: 'abc', dirtyFiles: ['docs/diagram.png'] },
      fingerprints: [],
    };
    expect(diffChangedFiles(snapshot, snapshot)).toEqual([
      { path: 'docs/diagram.png', change: 'modified' },
    ]);
  });
});

describe('inferCompletedTaskForSpec', () => {
  it('reads the stored snapshot and infers the completed task', () => {
    captureSpecSnapshot({ specDir, codePath: root });
    completeSecondTask();

    const result = inferCompletedTaskForSpec({ specDir, codePath: root });
    expect(result.inference.ok).toBe(true);
    if (!result.inference.ok) return;
    expect(result.inference.transition.taskId).toBe('2');
    expect(result.spec.links.find(link => link.taskId === '2')?.criteria).toHaveLength(1);
  });

  it('throws when no pre-task snapshot was captured', () => {
    expect(() => inferCompletedTaskForSpec({ specDir, codePath: root })).toThrowError(
      expect.objectContaining({ code: 'SNAPSHOT_NOT_FOUND' }),
    );
  });
});
