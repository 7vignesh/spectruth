import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runAudit } from '../../audit/run.js';
import {
  approveRepair,
  assertApproved,
  buildRepairPreviews,
  checkApproval,
  computePreviewId,
  findPreview,
  isProtectedPath,
  readApproval,
  readPreviews,
  savePreviews,
} from '../index.js';
import { compareReports, formatReauditSummary, reauditTask } from '../reaudit.js';
import { SpecTruthError } from '../../errors.js';
import type { TaskAuditReport } from '../../types.js';

const REQUIREMENTS = `# Records — Requirements

## Requirements

### Requirement 4
**User Story:** As a user, I want to delete only my own records, so that my data stays private.

#### Acceptance Criteria
1. WHEN the caller is not the owner THEN the system SHALL return 403
`;

const UNSAFE_ROUTE = `export async function remove(req, res) {
  const record = await db.records.find(req.params.id);
  await db.records.delete(record.id);
  return res.status(204).send();
}
`;

const SAFE_ROUTE = `export async function remove(req, res) {
  const record = await db.records.find(req.params.id);
  if (record.ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await db.records.delete(record.id);
  return res.status(204).send();
}
`;

function tasksMarkdown(state: ' ' | 'x'): string {
  return `# Records — Tasks

- [${state}] 3.2 Enforce record ownership on delete
  - _Requirements: 4.1_
`;
}

let root: string;
let specDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spectruth repair '));
  specDir = join(root, '.kiro', 'specs', 'records');
  mkdirSync(specDir, { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(specDir, 'requirements.md'), REQUIREMENTS, 'utf-8');
  writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown('x'), 'utf-8');
  writeFileSync(join(root, 'src', 'records.ts'), UNSAFE_ROUTE, 'utf-8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function auditOnce(): Promise<TaskAuditReport> {
  const run = await runAudit({
    projectRoot: root,
    specDir,
    codePath: root,
    deterministicOnly: true,
  });
  return run.outcomes[0].report;
}

/** Snapshot every file under a directory so mutation can be proven absent. */
function fileTreeSnapshot(dir: string): Map<string, string> {
  const contents = new Map<string, string>();

  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (entry === '.spectruth') continue; // SpecTruth's own state is expected to change
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else contents.set(full, readFileSync(full, 'utf-8'));
    }
  };

  walk(dir);
  return contents;
}

describe('runAudit', () => {
  it('audits a completed task without any prior snapshot', async () => {
    const report = await auditOnce();

    expect(report.scope).toEqual({
      kind: 'task',
      taskId: '3.2',
      taskTitle: 'Enforce record ownership on delete',
    });
    expect(report.reportId).toMatch(/^R-[0-9a-f]{12}$/);
  });

  it('blocks the missing ownership enforcement', async () => {
    const report = await auditOnce();

    expect(report.summary.shipStatus).toBe('BLOCKED');
    expect(report.requirements[0].criteria[0].state).toBe('UNSUPPORTED');
  });

  it('does not claim it observed a transition', async () => {
    const report = await auditOnce();
    const transitionEvidence = report.requirements[0].criteria[0].evidence
      .find(item => item.source === 'task-transition')!;

    expect(transitionEvidence.observation).toContain('no transition was observed');
    expect(transitionEvidence.supports).toBe(false);
  });

  it('reaches READY once the enforcement exists', async () => {
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    const report = await auditOnce();

    expect(report.summary.shipStatus).toBe('READY');
    expect(report.requirements[0].criteria[0].state).toBe('SUPPORTED');
  });

  it('refuses to audit a task that is not marked complete', async () => {
    writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown(' '), 'utf-8');

    await expect(runAudit({ projectRoot: root, specDir, codePath: root }))
      .rejects.toThrowError(expect.objectContaining({ code: 'NO_COMPLETED_TASKS' }));
  });

  it('rejects an unknown task id', async () => {
    await expect(runAudit({ projectRoot: root, specDir, codePath: root, taskId: '99' }))
      .rejects.toThrowError(expect.objectContaining({ code: 'TASK_NOT_FOUND' }));
  });

  it('reports completed tasks that reference no requirement', async () => {
    writeFileSync(
      join(specDir, 'tasks.md'),
      `${tasksMarkdown('x')}\n- [x] 3.3 Unlinked cleanup\n`,
      'utf-8',
    );

    const run = await runAudit({ projectRoot: root, specDir, codePath: root, deterministicOnly: true });
    expect(run.unlinkedTaskIds).toContain('3.3');
    expect(run.outcomes).toHaveLength(1);
  });

  it('produces a different report id when the finding changes', async () => {
    const blocked = await auditOnce();
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    const ready = await auditOnce();

    expect(ready.reportId).not.toBe(blocked.reportId);
  });

  /**
   * Report identity is content-based, so auditing twice with nothing changed
   * must not invalidate an approval the user already granted.
   */
  it('keeps the same report id when nothing changed', async () => {
    const first = await auditOnce();
    const second = await auditOnce();

    expect(second.reportId).toBe(first.reportId);
    expect(second.timestamp).not.toBe(first.timestamp);
  });
});

describe('buildRepairPreviews', () => {
  it('offers a preview for a blocking finding', async () => {
    const report = await auditOnce();
    const previews = buildRepairPreviews(report);

    expect(previews).toHaveLength(1);
    expect(previews[0].criterionId).toBe('REQ-4-AC-1');
    expect(previews[0].currentState).toBe('UNSUPPORTED');
    expect(previews[0].previewId).toMatch(/^RP-[0-9a-f]{8}$/);
  });

  it('describes the gap, the change, and the expected evidence', async () => {
    const [preview] = buildRepairPreviews(await auditOnce());

    expect(preview.gap.trim().length).toBeGreaterThan(0);
    expect(preview.proposedChange).toMatch(/enforcement/i);
    expect(preview.proposedChange).toContain('403');
    expect(preview.expectedEvidence.trim().length).toBeGreaterThan(0);
  });

  it('offers no preview when everything is supported', async () => {
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    expect(buildRepairPreviews(await auditOnce())).toEqual([]);
  });

  it('asks for proof rather than a rewrite for an unverified finding', async () => {
    const report = await auditOnce();
    const unverified: TaskAuditReport = {
      ...report,
      requirements: [{
        ...report.requirements[0],
        criteria: [{ ...report.requirements[0].criteria[0], state: 'UNVERIFIED' }],
      }],
    };

    const [preview] = buildRepairPreviews(unverified);
    expect(preview.proposedChange).toMatch(/prefer adding proof over rewriting/i);
  });

  it('generates a stable preview id for the same report and criterion', async () => {
    const report = await auditOnce();
    const first = buildRepairPreviews(report)[0].previewId;
    const second = buildRepairPreviews(report)[0].previewId;

    expect(second).toBe(first);
    expect(first).toBe(computePreviewId(report.reportId, 'REQ-4-AC-1'));
  });

  it('changes nothing in the working tree', async () => {
    const report = await auditOnce();
    const before = fileTreeSnapshot(root);

    const previews = buildRepairPreviews(report);
    savePreviews(root, report.reportId, previews);

    expect(fileTreeSnapshot(root)).toEqual(before);
  });

  it('round-trips through persistence', async () => {
    const report = await auditOnce();
    const previews = buildRepairPreviews(report);
    savePreviews(root, report.reportId, previews);

    expect(readPreviews(root, report.reportId)).toEqual(previews);
    expect(findPreview(root, report.reportId, previews[0].previewId)).toEqual(previews[0]);
  });

  it('returns nothing for an unknown report', () => {
    expect(readPreviews(root, 'R-does-not-exist')).toEqual([]);
  });
});

describe('approveRepair', () => {
  async function auditAndPreview() {
    const report = await auditOnce();
    const previews = buildRepairPreviews(report);
    savePreviews(root, report.reportId, previews);
    return { report, preview: previews[0] };
  }

  it('records an approval bound to the preview and report', async () => {
    const { report, preview } = await auditAndPreview();

    const approval = approveRepair({
      projectRoot: root,
      reportId: report.reportId,
      previewId: preview.previewId,
      codePath: root,
    });

    expect(approval.previewId).toBe(preview.previewId);
    expect(approval.reportId).toBe(report.reportId);
    expect(approval.criterionId).toBe('REQ-4-AC-1');
    expect(approval.approvedChange).toBe(preview.proposedChange);
    expect(readApproval(root, preview.previewId)).toEqual(approval);
  });

  it('refuses to approve an unknown preview', async () => {
    const { report } = await auditAndPreview();

    expect(() => approveRepair({
      projectRoot: root,
      reportId: report.reportId,
      previewId: 'RP-deadbeef',
    })).toThrowError(expect.objectContaining({ code: 'PREVIEW_NOT_FOUND' }));
  });

  it('changes no source file when approving', async () => {
    const { report, preview } = await auditAndPreview();
    const before = fileTreeSnapshot(root);

    approveRepair({
      projectRoot: root,
      reportId: report.reportId,
      previewId: preview.previewId,
      codePath: root,
    });

    expect(fileTreeSnapshot(root)).toEqual(before);
  });
});

describe('checkApproval', () => {
  async function approved() {
    const report = await auditOnce();
    const previews = buildRepairPreviews(report);
    savePreviews(root, report.reportId, previews);
    const approval = approveRepair({
      projectRoot: root,
      reportId: report.reportId,
      previewId: previews[0].previewId,
      codePath: root,
    });
    return { report, preview: previews[0], approval };
  }

  it('permits a repair that was explicitly approved', async () => {
    const { report, preview } = await approved();

    const result = checkApproval({
      projectRoot: root,
      previewId: preview.previewId,
      report,
      codePath: root,
    });

    expect(result.ok).toBe(true);
  });

  it('survives a re-audit that finds exactly the same thing', async () => {
    const { preview } = await approved();
    const reaudited = await auditOnce();

    const result = checkApproval({
      projectRoot: root,
      previewId: preview.previewId,
      report: reaudited,
      codePath: root,
    });

    expect(result.ok).toBe(true);
  });

  it('refuses a repair that was never approved', async () => {
    const report = await auditOnce();
    const previews = buildRepairPreviews(report);
    savePreviews(root, report.reportId, previews);

    const result = checkApproval({
      projectRoot: root,
      previewId: previews[0].previewId,
      report,
      codePath: root,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('APPROVAL_NOT_FOUND');
    expect(result.message).toMatch(/has not been approved/i);
  });

  it('refuses an approval granted for a superseded report', async () => {
    const { preview } = await approved();
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    const freshReport = await auditOnce();

    const result = checkApproval({
      projectRoot: root,
      previewId: preview.previewId,
      report: freshReport,
      codePath: root,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('REPORT_SUPERSEDED');
  });

  it('refuses an approval after the covered files change', async () => {
    const { report, preview } = await approved();

    // Same report identity, but the approved file moved underneath it.
    for (const file of preview.likelyFiles) {
      writeFileSync(join(root, file), `${UNSAFE_ROUTE}\n// drifted\n`, 'utf-8');
    }

    const result = checkApproval({
      projectRoot: root,
      previewId: preview.previewId,
      report,
      codePath: root,
    });

    if (preview.likelyFiles.length === 0) {
      expect(result.ok).toBe(true); // Nothing was pinned, so nothing can drift.
      return;
    }
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('STATE_CHANGED');
  });

  it('assertApproved throws APPROVAL_REQUIRED without consent', async () => {
    const report = await auditOnce();
    const previews = buildRepairPreviews(report);
    savePreviews(root, report.reportId, previews);

    expect(() => assertApproved({
      projectRoot: root,
      previewId: previews[0].previewId,
      report,
      codePath: root,
    })).toThrowError(expect.objectContaining({ code: 'APPROVAL_REQUIRED' }));
  });

  it('assertApproved throws APPROVAL_STALE for a superseded report', async () => {
    const { preview } = await approved();
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    const freshReport = await auditOnce();

    expect(() => assertApproved({
      projectRoot: root,
      previewId: preview.previewId,
      report: freshReport,
      codePath: root,
    })).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
  });

  it('assertApproved returns the approval when consent is valid', async () => {
    const { report, preview } = await approved();

    const approval = assertApproved({
      projectRoot: root,
      previewId: preview.previewId,
      report,
      codePath: root,
    });
    expect(approval.previewId).toBe(preview.previewId);
  });
});

describe('protected paths', () => {
  it('never authorizes editing tasks.md', () => {
    expect(isProtectedPath('tasks.md')).toBe(true);
    expect(isProtectedPath('.kiro/specs/records/tasks.md')).toBe(true);
    expect(isProtectedPath('.kiro\\specs\\records\\tasks.md')).toBe(true);
  });

  it('allows ordinary source files', () => {
    expect(isProtectedPath('src/records.ts')).toBe(false);
    expect(isProtectedPath('src/tasks.ts')).toBe(false);
  });
});

describe('reauditTask', () => {
  it('confirms the gap closed after a genuine repair', async () => {
    const first = await auditOnce();
    expect(first.summary.shipStatus).toBe('BLOCKED');

    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');

    const result = await reauditTask({
      projectRoot: root,
      specDir,
      codePath: root,
      taskId: '3.2',
      criterionId: 'REQ-4-AC-1',
      deterministicOnly: true,
    });

    expect(result.previousShipStatus).toBe('BLOCKED');
    expect(result.shipStatus).toBe('READY');
    expect(result.targeted?.resolved).toBe(true);
    expect(result.targeted?.before).toBe('UNSUPPORTED');
    expect(result.targeted?.after).toBe('SUPPORTED');
  });

  it('reports the gap as still open when the repair did not work', async () => {
    await auditOnce();

    // A change that does not add the ownership check.
    writeFileSync(join(root, 'src', 'records.ts'), `${UNSAFE_ROUTE}\n// TODO: ownership\n`, 'utf-8');

    const result = await reauditTask({
      projectRoot: root,
      specDir,
      codePath: root,
      taskId: '3.2',
      criterionId: 'REQ-4-AC-1',
      deterministicOnly: true,
    });

    expect(result.shipStatus).toBe('BLOCKED');
    expect(result.targeted?.resolved).toBe(false);
    expect(result.targeted?.after).toBe('UNSUPPORTED');
  });

  it('summarizes a successful re-audit honestly', async () => {
    await auditOnce();
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');

    const result = await reauditTask({
      projectRoot: root,
      specDir,
      codePath: root,
      taskId: '3.2',
      criterionId: 'REQ-4-AC-1',
      deterministicOnly: true,
    });

    const summary = formatReauditSummary(result);
    expect(summary).toContain('BLOCKED -> READY');
    expect(summary).toContain('REQ-4-AC-1 is now SUPPORTED');
  });

  it('summarizes a failed repair without claiming success', async () => {
    await auditOnce();

    const result = await reauditTask({
      projectRoot: root,
      specDir,
      codePath: root,
      taskId: '3.2',
      criterionId: 'REQ-4-AC-1',
      deterministicOnly: true,
    });

    const summary = formatReauditSummary(result);
    expect(summary).toContain('did not close the gap');
    expect(summary).not.toMatch(/now SUPPORTED/);
  });

  it('leaves tasks.md untouched across the whole repair cycle', async () => {
    const tasksPath = join(specDir, 'tasks.md');
    const before = readFileSync(tasksPath, 'utf-8');

    const report = await auditOnce();
    const previews = buildRepairPreviews(report);
    savePreviews(root, report.reportId, previews);
    approveRepair({
      projectRoot: root,
      reportId: report.reportId,
      previewId: previews[0].previewId,
      codePath: root,
    });
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    await reauditTask({
      projectRoot: root,
      specDir,
      codePath: root,
      taskId: '3.2',
      deterministicOnly: true,
    });

    expect(readFileSync(tasksPath, 'utf-8')).toBe(before);
  });
});

describe('compareReports', () => {
  it('marks a finding resolved when it becomes supported', async () => {
    const before = await auditOnce();
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    const after = await auditOnce();

    const [delta] = compareReports(before, after);
    expect(delta.resolved).toBe(true);
    expect(delta.regressed).toBe(false);
  });

  it('marks a regression when a finding gets worse', async () => {
    writeFileSync(join(root, 'src', 'records.ts'), SAFE_ROUTE, 'utf-8');
    const before = await auditOnce();
    writeFileSync(join(root, 'src', 'records.ts'), UNSAFE_ROUTE, 'utf-8');
    const after = await auditOnce();

    const [delta] = compareReports(before, after);
    expect(delta.before).toBe('SUPPORTED');
    expect(delta.after).toBe('UNSUPPORTED');
    expect(delta.regressed).toBe(true);
    expect(delta.resolved).toBe(false);
  });

  it('handles having no prior report', async () => {
    const [delta] = compareReports(undefined, await auditOnce());
    expect(delta.before).toBeUndefined();
    expect(delta.regressed).toBe(false);
  });
});
