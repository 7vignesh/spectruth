import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildPendingCriteriaAudits, buildTaskAuditReport } from '../../audit/task-report.js';
import { formatHookSummary, formatNoTransitionSummary } from '../../reporter/hook.js';
import { latestReportPath, readLatestReport, reportPathFor, saveReport } from '../store.js';
import { createCriterionAudit } from '../../domain/audit.js';
import type {
  AcceptanceCriterion,
  CompletedTaskTransition,
  KiroSpec,
  Requirement,
  TaskAuditReport,
} from '../../types.js';

const CRITERIA: AcceptanceCriterion[] = [
  { id: 'REQ-1-AC-1', text: 'WHEN the caller owns the record THEN delete it', keyword: 'WHEN/THEN' },
  { id: 'REQ-1-AC-2', text: 'WHEN the caller is not the owner THEN return 403', keyword: 'WHEN/THEN' },
];

const REQUIREMENT: Requirement = {
  id: 'REQ-1',
  title: 'delete my own records',
  userStory: '',
  acceptanceCriteria: CRITERIA,
};

const TRANSITION: CompletedTaskTransition = {
  taskId: '2',
  title: 'Enforce record ownership',
  previousState: 'not_started',
  currentState: 'completed',
  location: { file: 'tasks.md', line: 6 },
  changedFiles: [{ path: 'src/records.ts', change: 'modified' }],
  gitHeadChanged: false,
};

function spec(): KiroSpec {
  return {
    name: 'records',
    specPath: '/project/.kiro/specs/records',
    requirements: { title: 'Records', introduction: '', requirements: [REQUIREMENT] },
    tasks: { title: 'Records', tasks: [], diagnostics: [] },
    links: [{
      taskId: '2',
      requirements: [REQUIREMENT],
      criteria: [CRITERIA[1]],
      designSections: [],
      unresolvedRefs: [],
    }],
    diagnostics: [],
  };
}

describe('buildTaskAuditReport', () => {
  const report = buildTaskAuditReport({
    spec: spec(),
    transition: TRANSITION,
    criteria: buildPendingCriteriaAudits([CRITERIA[1]], TRANSITION),
    codebasePath: '/project',
    now: () => new Date('2026-08-10T00:00:00.000Z'),
  });

  it('scopes the report to the completed task', () => {
    expect(report.scope).toEqual({
      kind: 'task',
      taskId: '2',
      taskTitle: 'Enforce record ownership',
    });
    expect(report.timestamp).toBe('2026-08-10T00:00:00.000Z');
    expect(report.codebasePath).toBe('/project');
  });

  it('includes only the linked criteria', () => {
    expect(report.summary.totalRequirements).toBe(1);
    expect(report.summary.totalCriteria).toBe(1);
    expect(report.requirements[0].criteria[0].criterionId).toBe('REQ-1-AC-2');
  });

  it('derives requirement state and ship status from the findings', () => {
    expect(report.requirements[0].state).toBe('UNVERIFIED');
    expect(report.summary.states).toEqual({
      supported: 0,
      partial: 0,
      unsupported: 0,
      unverified: 1,
    });
    expect(report.summary.shipStatus).toBe('REVIEW_REQUIRED');
  });

  it('omits requirements that have no adjudicated criteria', () => {
    const empty = buildTaskAuditReport({
      spec: spec(),
      transition: TRANSITION,
      criteria: [],
      codebasePath: '/project',
    });
    expect(empty.requirements).toEqual([]);
    expect(empty.summary.shipStatus).toBe('REVIEW_REQUIRED');
  });

  it('groups adjudicated criteria under their requirement', () => {
    const audited = buildTaskAuditReport({
      spec: {
        ...spec(),
        links: [{
          taskId: '2',
          requirements: [REQUIREMENT],
          criteria: CRITERIA,
          designSections: [],
          unresolvedRefs: [],
        }],
      },
      transition: TRANSITION,
      criteria: [
        createCriterionAudit({
          criterionId: 'REQ-1-AC-1',
          criterionText: CRITERIA[0].text,
          state: 'SUPPORTED',
          justification: 'The delete path removes the record.',
        }),
        createCriterionAudit({
          criterionId: 'REQ-1-AC-2',
          criterionText: CRITERIA[1].text,
          state: 'UNSUPPORTED',
          justification: 'No ownership comparison exists before deletion.',
        }),
      ],
      codebasePath: '/project',
    });

    expect(audited.requirements).toHaveLength(1);
    expect(audited.requirements[0].criteria).toHaveLength(2);
    expect(audited.requirements[0].state).toBe('UNSUPPORTED');
    expect(audited.summary.shipStatus).toBe('BLOCKED');
  });

  it('round-trips through JSON', () => {
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});

describe('buildPendingCriteriaAudits', () => {
  it('marks every criterion UNVERIFIED with a justification and a gap', () => {
    const audits = buildPendingCriteriaAudits(CRITERIA, TRANSITION);
    expect(audits).toHaveLength(2);
    for (const audit of audits) {
      expect(audit.state).toBe('UNVERIFIED');
      expect(audit.justification.trim().length).toBeGreaterThan(0);
      expect(audit.gaps).toHaveLength(1);
      expect(audit.repairPreviewAvailable).toBe(false);
    }
  });

  it('describes a transition with no file changes honestly', () => {
    const audits = buildPendingCriteriaAudits(
      [CRITERIA[0]],
      { ...TRANSITION, changedFiles: [] },
    );
    expect(audits[0].evidence[0].observation).toContain('no detected file changes');
  });
});

describe('formatHookSummary', () => {
  const report = buildTaskAuditReport({
    spec: spec(),
    transition: TRANSITION,
    criteria: buildPendingCriteriaAudits([CRITERIA[1]], TRANSITION),
    codebasePath: '/project',
  });

  it('leads with the task and ship decision', () => {
    const output = formatHookSummary(report);
    const lines = output.split('\n');
    expect(lines[0]).toBe('SpecTruth — Done Integrity');
    expect(lines[1]).toContain('Completed task 2: Enforce record ownership');
    expect(lines[2]).toBe('Ship decision: REVIEW_REQUIRED');
  });

  it('lists state counts and the gap', () => {
    const output = formatHookSummary(report);
    expect(output).toContain('0 supported');
    expect(output).toContain('1 unverified');
    expect(output).toContain('gap:');
  });

  it('includes the report path when provided', () => {
    expect(formatHookSummary(report, { reportPath: '/project/.spectruth/reports/x.json' }))
      .toContain('Full report: /project/.spectruth/reports/x.json');
  });

  it('says so when everything is supported', () => {
    const ready = buildTaskAuditReport({
      spec: spec(),
      transition: TRANSITION,
      criteria: [createCriterionAudit({
        criterionId: 'REQ-1-AC-2',
        criterionText: CRITERIA[1].text,
        state: 'SUPPORTED',
        justification: 'Ownership is compared before deletion.',
      })],
      codebasePath: '/project',
    });

    const output = formatHookSummary(ready);
    expect(output).toContain('Ship decision: READY');
    expect(output).toContain('All linked criteria are supported by evidence.');
  });

  it('prioritizes unsupported findings ahead of unverified ones', () => {
    const mixed = buildTaskAuditReport({
      spec: {
        ...spec(),
        links: [{
          taskId: '2',
          requirements: [REQUIREMENT],
          criteria: CRITERIA,
          designSections: [],
          unresolvedRefs: [],
        }],
      },
      transition: TRANSITION,
      criteria: [
        createCriterionAudit({
          criterionId: 'REQ-1-AC-1',
          criterionText: CRITERIA[0].text,
          state: 'UNVERIFIED',
          justification: 'Behavior is not demonstrated.',
        }),
        createCriterionAudit({
          criterionId: 'REQ-1-AC-2',
          criterionText: CRITERIA[1].text,
          state: 'UNSUPPORTED',
          justification: 'No ownership check exists.',
          gaps: ['Ownership enforcement is absent.'],
        }),
      ],
      codebasePath: '/project',
    });

    const output = formatHookSummary(mixed);
    expect(output).toContain('Ship decision: BLOCKED');
    expect(output.indexOf('REQ-1-AC-2')).toBeLessThan(output.indexOf('REQ-1-AC-1'));
    expect(output).toContain('repair preview is available');
    expect(output).toContain('change nothing until you approve');
  });

  it('formats the no-transition case', () => {
    const output = formatNoTransitionSummary('No task changed to completed.');
    expect(output).toContain('No completed task to audit.');
    expect(output).toContain('No task changed to completed.');
  });
});

describe('report store', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spectruth reports '));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function taskReport(): TaskAuditReport {
    return buildTaskAuditReport({
      spec: spec(),
      transition: TRANSITION,
      criteria: buildPendingCriteriaAudits([CRITERIA[1]], TRANSITION),
      codebasePath: root,
    });
  }

  it('writes a per-task report and a latest pointer', () => {
    const report = taskReport();
    const saved = saveReport(root, 'records', report);

    expect(saved.path).toBe(reportPathFor(root, 'records', report));
    expect(saved.path).toContain('records-task-2.json');
    expect(saved.latestPath).toBe(latestReportPath(root));
    expect(JSON.parse(readFileSync(saved.path, 'utf-8'))).toEqual(report);
    expect(readLatestReport(root)).toEqual(report);
  });

  it('replaces the report for the same task on re-audit', () => {
    const first = taskReport();
    saveReport(root, 'records', first);
    const second = { ...first, timestamp: '2026-08-11T00:00:00.000Z' };
    const saved = saveReport(root, 'records', second);

    expect(saved.path).toBe(reportPathFor(root, 'records', first));
    expect(readLatestReport(root).timestamp).toBe('2026-08-11T00:00:00.000Z');
  });

  it('throws REPORT_NOT_FOUND before any audit runs', () => {
    expect(() => readLatestReport(root)).toThrowError(
      expect.objectContaining({ code: 'REPORT_NOT_FOUND' }),
    );
  });

  it('throws REPORT_UNREADABLE for corrupt JSON', () => {
    mkdirSync(join(root, '.spectruth', 'reports'), { recursive: true });
    writeFileSync(latestReportPath(root), '{ not json', 'utf-8');
    expect(() => readLatestReport(root)).toThrowError(
      expect.objectContaining({ code: 'REPORT_UNREADABLE' }),
    );
  });

  it('throws REPORT_UNREADABLE when required fields are missing', () => {
    mkdirSync(join(root, '.spectruth', 'reports'), { recursive: true });
    writeFileSync(latestReportPath(root), JSON.stringify({ specTitle: 'x' }), 'utf-8');
    expect(() => readLatestReport(root)).toThrowError(
      expect.objectContaining({ code: 'REPORT_UNREADABLE' }),
    );
  });
});
