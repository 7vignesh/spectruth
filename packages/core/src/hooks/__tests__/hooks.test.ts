import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runPostTaskHook, runPreTaskHook } from '../index.js';
import { findSpecDirs, resolveSingleSpecDir } from '../spec-discovery.js';
import { hookEventDirFor, recordHookEvent } from '../events.js';
import { latestReportPath, readLatestReport } from '../../report/store.js';
import { snapshotPathFor } from '../../snapshot/index.js';
import { PENDING_ADJUDICATION_JUSTIFICATION } from '../../audit/task-report.js';

const REQUIREMENTS = `# Records — Requirements

## Requirements

### Requirement 1
**User Story:** As a user, I want to delete my own records, so that my data stays private.

#### Acceptance Criteria
1. WHEN the caller owns the record THEN the system SHALL delete it
2. WHEN the caller is not the owner THEN the system SHALL return 403
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
  root = mkdtempSync(join(tmpdir(), 'spectruth hooks '));
  specDir = join(root, '.kiro', 'specs', 'records');
  mkdirSync(specDir, { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(specDir, 'requirements.md'), REQUIREMENTS, 'utf-8');
  writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown(' '), 'utf-8');
  writeFileSync(join(root, 'src', 'records.ts'), 'export function remove() {}\n', 'utf-8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function completeSecondTask(): void {
  writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown('x'), 'utf-8');
}

describe('spec discovery', () => {
  it('finds a single spec directory', () => {
    expect(findSpecDirs(root)).toEqual([specDir]);
    expect(resolveSingleSpecDir(root)).toBe(specDir);
  });

  it('reports ambiguity instead of guessing between specs', () => {
    const second = join(root, '.kiro', 'specs', 'billing');
    mkdirSync(second, { recursive: true });
    writeFileSync(join(second, 'requirements.md'), REQUIREMENTS, 'utf-8');

    expect(() => resolveSingleSpecDir(root)).toThrowError(
      expect.objectContaining({ code: 'SPEC_AMBIGUOUS' }),
    );
  });

  it('throws when no spec exists', () => {
    rmSync(join(root, '.kiro'), { recursive: true, force: true });
    expect(() => resolveSingleSpecDir(root)).toThrowError(
      expect.objectContaining({ code: 'SPEC_DIR_NOT_FOUND' }),
    );
  });

  it('ignores directories without requirements.md', () => {
    mkdirSync(join(root, '.kiro', 'specs', 'draft'), { recursive: true });
    expect(findSpecDirs(root)).toEqual([specDir]);
  });
});

describe('runPreTaskHook', () => {
  it('captures a snapshot and exits 0', () => {
    const result = runPreTaskHook({ projectRoot: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Captured pre-task snapshot');
    expect(result.stdout).toContain('records');
    expect(existsSync(snapshotPathFor(root, 'records'))).toBe(true);
  });

  it('discovers the spec when none is given', () => {
    expect(runPreTaskHook({ projectRoot: root }).exitCode).toBe(0);
  });

  it('exits non-zero when the spec is ambiguous', () => {
    const second = join(root, '.kiro', 'specs', 'billing');
    mkdirSync(second, { recursive: true });
    writeFileSync(join(second, 'requirements.md'), REQUIREMENTS, 'utf-8');

    const result = runPreTaskHook({ projectRoot: root });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('SPEC_AMBIGUOUS');
  });

  it('records the hook payload without depending on it', () => {
    const result = runPreTaskHook({
      projectRoot: root,
      event: { hook_event_name: 'PreTaskExec', cwd: root },
    });

    expect(result.exitCode).toBe(0);
    expect(result.eventPath).toBeDefined();
    const recorded = JSON.parse(readFileSync(result.eventPath!, 'utf-8'));
    expect(recorded.hook).toBe('PreTaskExec');
    expect(recorded.payload.hook_event_name).toBe('PreTaskExec');
  });

  it('succeeds when no payload is supplied at all', () => {
    const result = runPreTaskHook({ projectRoot: root });
    expect(result.exitCode).toBe(0);
    expect(result.eventPath).toBeUndefined();
  });
});

describe('runPostTaskHook', () => {
  it('audits the completed task and exits 0', () => {
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();

    const result = runPostTaskHook({ projectRoot: root });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.report?.scope).toEqual({
      kind: 'task',
      taskId: '2',
      taskTitle: 'Enforce record ownership',
    });
    expect(result.stdout).toContain('Completed task 2');
    expect(result.stdout).toContain('Ship decision: REVIEW_REQUIRED');
  });

  it('reports only the criteria linked to the completed task', () => {
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();

    const report = runPostTaskHook({ projectRoot: root }).report!;
    const criteria = report.requirements.flatMap(requirement => requirement.criteria);
    expect(criteria.map(criterion => criterion.criterionId)).toEqual(['REQ-1-AC-2']);
  });

  it('never fabricates support before adjudication exists', () => {
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();

    const report = runPostTaskHook({ projectRoot: root }).report!;
    const criterion = report.requirements[0].criteria[0];
    expect(criterion.state).toBe('UNVERIFIED');
    expect(criterion.justification).toBe(PENDING_ADJUDICATION_JUSTIFICATION);
    expect(report.summary.shipStatus).toBe('REVIEW_REQUIRED');
    expect(report.summary.states.supported).toBe(0);
  });

  it('carries task-transition evidence that does not by itself support the criterion', () => {
    runPreTaskHook({ projectRoot: root });
    writeFileSync(join(root, 'src', 'authorization.ts'), 'export function assertOwner() {}\n');
    completeSecondTask();

    const report = runPostTaskHook({ projectRoot: root }).report!;
    const evidence = report.requirements[0].criteria[0].evidence;
    expect(evidence).toHaveLength(1);
    expect(evidence[0].source).toBe('task-transition');
    expect(evidence[0].supports).toBe(false);
    expect(evidence[0].observation).toContain('changed from not_started to completed');
    expect(evidence[0].observation).toContain('changed file');
  });

  it('persists the report and a latest pointer', () => {
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();

    const result = runPostTaskHook({ projectRoot: root });
    expect(existsSync(result.reportPath!)).toBe(true);
    expect(existsSync(latestReportPath(root))).toBe(true);
    expect(readLatestReport(root).scope).toEqual(result.report!.scope);
    expect(result.stdout).toContain('Full report:');
  });

  it('exits 0 and reports a no-op when nothing completed', () => {
    runPreTaskHook({ projectRoot: root });

    const result = runPostTaskHook({ projectRoot: root });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('No completed task to audit');
    expect(result.report).toBeUndefined();
  });

  it('exits non-zero when several tasks completed at once', () => {
    writeFileSync(join(specDir, 'tasks.md'), '# T\n\n- [ ] 1. A\n- [ ] 2. B\n', 'utf-8');
    runPreTaskHook({ projectRoot: root });
    writeFileSync(join(specDir, 'tasks.md'), '# T\n\n- [x] 1. A\n- [x] 2. B\n', 'utf-8');

    const result = runPostTaskHook({ projectRoot: root });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('MULTIPLE_COMPLETED_TRANSITIONS');
    expect(result.stderr).toContain('Candidate tasks: 1, 2');
  });

  it('exits non-zero when no pre-task snapshot exists', () => {
    completeSecondTask();

    const result = runPostTaskHook({ projectRoot: root });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('SNAPSHOT_NOT_FOUND');
  });

  it('explains when the completed task references no requirement', () => {
    writeFileSync(join(specDir, 'tasks.md'), '# T\n\n- [ ] 1. Unlinked task\n', 'utf-8');
    runPreTaskHook({ projectRoot: root });
    writeFileSync(join(specDir, 'tasks.md'), '# T\n\n- [x] 1. Unlinked task\n', 'utf-8');

    const result = runPostTaskHook({ projectRoot: root });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('references no requirement');
    expect(result.report!.summary.totalCriteria).toBe(0);
  });

  it('does not leak provider or environment configuration into stdout', () => {
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();

    const stdout = runPostTaskHook({ projectRoot: root }).stdout;
    expect(stdout).not.toMatch(/API_KEY|ANTHROPIC|OPENAI|token/i);
  });

  it('emits no ANSI escape sequences for Kiro context', () => {
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();

    // eslint-disable-next-line no-control-regex
    expect(runPostTaskHook({ projectRoot: root }).stdout).not.toMatch(/\x1b\[/);
  });

  it('produces identical stdout for identical state', () => {
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();
    const now = () => new Date('2026-08-10T00:00:00.000Z');

    const first = runPostTaskHook({ projectRoot: root, now });
    const second = runPostTaskHook({ projectRoot: root, now });
    expect(second.stdout).toBe(first.stdout);
  });

  it('works under a project path containing spaces', () => {
    expect(root).toContain(' ');
    runPreTaskHook({ projectRoot: root });
    completeSecondTask();
    expect(runPostTaskHook({ projectRoot: root }).exitCode).toBe(0);
  });
});

describe('recordHookEvent', () => {
  it('skips recording when there is no payload', () => {
    expect(recordHookEvent(root, 'PostTaskExec', undefined)).toBeUndefined();
    expect(existsSync(hookEventDirFor(root))).toBe(false);
  });

  it('records an unparsed payload wrapper', () => {
    const path = recordHookEvent(root, 'PostTaskExec', { unparsedPayload: 'not json' });
    expect(path).toBeDefined();
    expect(JSON.parse(readFileSync(path!, 'utf-8')).payload.unparsedPayload).toBe('not json');
  });

  it('retains at most twenty recorded events', () => {
    for (let index = 0; index < 25; index++) {
      recordHookEvent(
        root,
        'PostTaskExec',
        { index },
        () => new Date(Date.UTC(2026, 7, 10, 0, 0, index)),
      );
    }
    expect(readdirSync(hookEventDirFor(root)).length).toBe(20);
  });
});
