/**
 * Self-contained demonstration.
 *
 * Runs the whole Done Integrity loop in a temporary directory: a task is marked
 * complete, the audit refuses the claim, a repair is previewed and approved, the
 * fix is applied, and the re-audit confirms it independently.
 *
 * Everything is embedded here rather than read from the repository, so the demo
 * works identically from a published package with no spec, no API key, and no
 * network access.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ShipStatus } from '../types.js';
import { auditProject } from '../audit/run.js';
import { formatHookSummary } from '../reporter/hook.js';
import { approveRepair, buildRepairPreviews, savePreviews } from '../repair/index.js';
import { reauditTask } from '../repair/reaudit.js';

const REQUIREMENTS = `# Records API — Requirements

## Requirements

### Requirement 1
**User Story:** As a signed-in user, I want to delete a record I own, so that I can remove my own data.

#### Acceptance Criteria
1. WHEN a user requests to delete a record they do not own THEN the system SHALL refuse and return 403
`;

const TASKS = `# Records API — Tasks

- [x] 2. Enforce record ownership on delete
  - Refuse the delete when the caller does not own the record
  - _Requirements: 1.1_
`;

/** The implementation an agent produced after marking the task complete. */
const ROUTE_WITHOUT_CHECK = `import { Router } from 'express';
import { db } from './db.js';

export const router = Router();

router.delete('/records/:id', async (req, res) => {
  const record = await db.records.find(req.params.id);

  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }

  await db.records.delete(record.id);
  return res.status(204).send();
});
`;

/** The same route after the approved repair. */
const ROUTE_WITH_CHECK = `import { Router } from 'express';
import { db } from './db.js';

export const router = Router();

router.delete('/records/:id', async (req, res) => {
  const record = await db.records.find(req.params.id);

  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }

  if (record.ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: you do not own this record' });
  }

  await db.records.delete(record.id);
  return res.status(204).send();
});
`;

export interface DemoStep {
  heading: string;
  body: string;
}

export interface DemoResult {
  steps: DemoStep[];
  initialShipStatus: ShipStatus;
  finalShipStatus: ShipStatus;
  /** True when the loop ended with the claim genuinely supported. */
  resolved: boolean;
}

export interface DemoOptions {
  /** Leave the scratch project on disk and report where it is. */
  keepFiles?: boolean;
  now?: () => Date;
}

export async function runDemo(options: DemoOptions = {}): Promise<DemoResult> {
  const root = mkdtempSync(join(tmpdir(), 'spectruth-demo-'));
  const specDir = join(root, '.kiro', 'specs', 'records');
  const routePath = join(root, 'src', 'records.js');

  try {
    mkdirSync(specDir, { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(specDir, 'requirements.md'), REQUIREMENTS, 'utf-8');
    writeFileSync(join(specDir, 'tasks.md'), TASKS, 'utf-8');
    writeFileSync(routePath, ROUTE_WITHOUT_CHECK, 'utf-8');

    const steps: DemoStep[] = [];

    steps.push({
      heading: '1. An agent marked this task complete',
      body: [
        'tasks.md',
        '  - [x] 2. Enforce record ownership on delete',
        '        _Requirements: 1.1_',
        '',
        'requirements.md',
        '  1.1  WHEN a user requests to delete a record they do not own',
        '       THEN the system SHALL refuse and return 403',
        '',
        'Nobody read the diff. The task is checked off, so the work looks done.',
      ].join('\n'),
    });

    // Step 2 — audit the claim
    const first = await auditProject({
      projectRoot: root,
      codePath: root,
      deterministicOnly: true,
      ...(options.now ? { now: options.now } : {}),
    });
    const firstOutcome = first.runs[0].outcomes[0];
    const previews = buildRepairPreviews(firstOutcome.report);
    savePreviews(root, firstOutcome.report.reportId, previews);

    steps.push({
      heading: '2. SpecTruth audits the claim',
      body: formatHookSummary(firstOutcome.report, {
        previewIds: previews.map(preview => preview.previewId),
      }),
    });

    const preview = previews[0];

    steps.push({
      heading: '3. A repair is proposed, and nothing is changed',
      body: [
        field('preview', preview.previewId),
        field('criterion', preview.criterionId),
        field('gap', preview.gap),
        field('proposed', preview.proposedChange),
        field('afterwards', preview.expectedEvidence),
        '',
        'The working tree is untouched. This is a proposal awaiting approval.',
      ].join('\n'),
    });

    // Step 4 — explicit approval
    const approval = approveRepair({
      projectRoot: root,
      reportId: firstOutcome.report.reportId,
      previewId: preview.previewId,
      codePath: root,
      ...(options.now ? { now: options.now } : {}),
    });

    steps.push({
      heading: '4. The user approves that one repair',
      body: [
        field('approved', `${approval.previewId} for ${approval.criterionId}`),
        field('scope', approval.approvedChange),
        '',
        'The approval is bound to this report and to the current file contents.',
        'It authorizes nothing else, and it never authorizes editing tasks.md.',
      ].join('\n'),
    });

    // Step 5 — the agent implements only the approved scope
    writeFileSync(routePath, ROUTE_WITH_CHECK, 'utf-8');

    steps.push({
      heading: '5. The agent implements the approved change',
      body: [
        'src/records.js',
        '+  if (record.ownerId !== req.user.id) {',
        "+    return res.status(403).json({ error: 'Forbidden: you do not own this record' });",
        '+  }',
      ].join('\n'),
    });

    // Step 6 — independent re-audit
    const reaudit = await reauditTask({
      projectRoot: root,
      specDir,
      codePath: root,
      taskId: '2',
      criterionId: preview.criterionId,
      deterministicOnly: true,
      ...(options.now ? { now: options.now } : {}),
    });

    steps.push({
      heading: '6. SpecTruth re-audits rather than taking the repair at its word',
      body: formatHookSummary(reaudit.report),
    });

    if (options.keepFiles) {
      steps.push({
        heading: 'Scratch project kept for inspection',
        body: root,
      });
    }

    return {
      steps,
      initialShipStatus: firstOutcome.report.summary.shipStatus,
      finalShipStatus: reaudit.shipStatus,
      resolved: Boolean(reaudit.targeted?.resolved),
    };
  } finally {
    if (!options.keepFiles) rmSync(root, { recursive: true, force: true });
  }
}

/** Render a demo result as plain terminal text. */
export function formatDemo(result: DemoResult): string {  const divider = '─'.repeat(72);
  const sections = result.steps.map(step => `${step.heading}\n${divider}\n${step.body}`);

  sections.push([
    'Outcome',
    divider,
    `${result.initialShipStatus} → ${result.finalShipStatus}`,
    result.resolved
      ? 'The completion claim was false, then repaired with consent, then verified.'
      : 'The gap did not close, and SpecTruth reported that rather than assuming success.',
  ].join('\n'));

  return `${sections.join('\n\n')}\n`;
}

// ─── Layout ──────────────────────────────────────────────────────────────────

const FIELD_WIDTH = 11;
const FIELD_WRAP = 60;

/** `label` then a wrapped value, with continuation lines hanging under it. */
function field(label: string, value: string): string {
  const wrapped = wrapText(value, FIELD_WRAP);
  const hang = ' '.repeat(FIELD_WIDTH);
  return [
    `${label.padEnd(FIELD_WIDTH)}${wrapped[0] ?? ''}`,
    ...wrapped.slice(1).map(line => `${hang}${line}`),
  ].join('\n');
}

function wrapText(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) current = word;
    else if (`${current} ${word}`.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [''];
}
