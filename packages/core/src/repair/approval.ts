/**
 * Repair approval.
 *
 * SpecTruth never repairs anything itself. Approval is a durable record that
 * the agent must check before it changes code, and it is deliberately narrow:
 *
 * - bound to one preview, so an approval cannot be widened to other findings
 * - bound to a report id, so a re-audit that changes the findings invalidates it
 * - bound to a state fingerprint, so it cannot be replayed after the code moves
 *
 * Approval also never authorizes editing `tasks.md`. Marking a task complete is
 * the user's claim to make, not SpecTruth's.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type {
  ApprovalCheck,
  AuditReport,
  RepairApproval,
  RepairPreview,
} from '../types.js';
import { SpecTruthError } from '../errors.js';
import { findCurrentReportForTask } from '../report/store.js';
import { findPreview } from './preview.js';

export const APPROVAL_DIR = join('.spectruth', 'approvals');

/** Files SpecTruth will never authorize a repair to modify. */
export const PROTECTED_PATHS = ['tasks.md'];

export function approvalDirFor(projectRoot: string): string {
  return join(resolve(projectRoot), APPROVAL_DIR);
}

export function approvalPathFor(projectRoot: string, previewId: string): string {
  return join(approvalDirFor(projectRoot), `${previewId}.json`);
}

export interface ApproveOptions {
  projectRoot: string;
  reportId: string;
  previewId: string;
  codePath?: string;
  now?: () => Date;
}

/**
 * Record an explicit approval for one preview.
 *
 * This is intended to be a separate user turn: the preview is shown, the user
 * responds, and only then is this called.
 */
export function approveRepair(options: ApproveOptions): RepairApproval {
  const preview = findPreview(options.projectRoot, options.reportId, options.previewId);
  if (!preview) {
    throw new SpecTruthError(
      `No repair preview ${options.previewId} exists for report ${options.reportId}.`,
      'PREVIEW_NOT_FOUND',
      'Run an audit to regenerate previews, then approve one of the listed ids.',
    );
  }

  // Consent recorded against a superseded report would authorize a gap that a
  // later audit may already have closed, so refuse it at the point of consent
  // rather than only when a repair is attempted.
  const current = findCurrentReportForTask(options.projectRoot, preview.taskId);
  if (current && current.reportId !== options.reportId) {
    throw new SpecTruthError(
      `Report ${options.reportId} has been superseded by ${current.reportId} for task ${preview.taskId}.`,
      'REPORT_SUPERSEDED',
      'Re-run the audit, review the current preview, and approve that one instead.',
    );
  }

  const now = options.now ?? (() => new Date());
  const approval: RepairApproval = {
    previewId: preview.previewId,
    reportId: preview.reportId,
    taskId: preview.taskId,
    criterionId: preview.criterionId,
    approvedAt: now().toISOString(),
    stateFingerprint: computeStateFingerprint(
      options.codePath ?? options.projectRoot,
      preview,
    ),
    approvedChange: preview.proposedChange,
  };

  writeApproval(options.projectRoot, approval);
  return approval;
}

export function readApproval(
  projectRoot: string,
  previewId: string,
): RepairApproval | undefined {
  const path = approvalPathFor(projectRoot, previewId);
  if (!existsSync(path)) return undefined;

  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as RepairApproval;
  } catch {
    return undefined;
  }
}

export interface ApprovalCheckOptions {
  projectRoot: string;
  previewId: string;
  /** The report the agent believes it is acting on. */
  report: AuditReport;
  codePath?: string;
}

/**
 * Decide whether a repair may proceed. Returns a typed rejection rather than
 * throwing, so callers can explain the refusal to the user.
 */
export function checkApproval(options: ApprovalCheckOptions): ApprovalCheck {
  const approval = readApproval(options.projectRoot, options.previewId);
  if (!approval) {
    return {
      ok: false,
      code: 'APPROVAL_NOT_FOUND',
      message: `Repair ${options.previewId} has not been approved. Nothing may be changed until the user approves it explicitly.`,
    };
  }

  if (approval.reportId !== options.report.reportId) {
    return {
      ok: false,
      code: 'REPORT_SUPERSEDED',
      message: `Approval ${options.previewId} was granted for report ${approval.reportId}, but the current report is ${options.report.reportId}. Re-audit and ask for approval again.`,
    };
  }

  const preview = findPreview(options.projectRoot, approval.reportId, approval.previewId);
  if (!preview) {
    return {
      ok: false,
      code: 'PREVIEW_NOT_FOUND',
      message: `The preview behind approval ${options.previewId} is no longer recorded.`,
    };
  }

  const current = computeStateFingerprint(options.codePath ?? options.projectRoot, preview);
  if (current !== approval.stateFingerprint) {
    return {
      ok: false,
      code: 'STATE_CHANGED',
      message: `The files covered by approval ${options.previewId} changed after it was granted. Re-audit and ask for approval again.`,
    };
  }

  return { ok: true, approval };
}

/** Throwing variant for callers that treat an unapproved repair as an error. */
export function assertApproved(options: ApprovalCheckOptions): RepairApproval {
  const result = checkApproval(options);
  if (result.ok) return result.approval;

  throw new SpecTruthError(
    result.message,
    result.code === 'STATE_CHANGED' || result.code === 'REPORT_SUPERSEDED'
      ? 'APPROVAL_STALE'
      : 'APPROVAL_REQUIRED',
    'Present the preview again and obtain explicit approval before changing anything.',
  );
}

/** True when a path may never be modified by an approved repair. */
export function isProtectedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  return PROTECTED_PATHS.some(protectedPath =>
    normalized === protectedPath || normalized.endsWith(`/${protectedPath}`),
  );
}

/**
 * Fingerprint the files a repair would touch, so approval cannot be replayed
 * against different code. A missing file contributes a stable marker, which
 * means creating it later is itself a detected change.
 */
export function computeStateFingerprint(
  codePath: string,
  preview: RepairPreview,
): string {
  const hash = createHash('sha256');
  hash.update(`${preview.previewId}|${preview.reportId}|${preview.criterionId}`);

  for (const file of [...preview.likelyFiles].sort()) {
    const absolute = join(resolve(codePath), file);
    hash.update(`\n${file}:`);
    try {
      hash.update(existsSync(absolute) ? readFileSync(absolute) : Buffer.from('<absent>'));
    } catch {
      hash.update(Buffer.from('<unreadable>'));
    }
  }

  return hash.digest('hex').slice(0, 16);
}

function writeApproval(projectRoot: string, approval: RepairApproval): void {
  const target = resolve(approvalPathFor(projectRoot, approval.previewId));
  const temporary = `${target}.tmp`;

  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(approval, null, 2)}\n`, 'utf-8');
    renameSync(temporary, target);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Cleanup failure must not mask the cause.
    }
    throw new SpecTruthError(
      `Could not record approval: ${target}`,
      'REPORT_WRITE_FAILED',
      error instanceof Error ? error.message : 'Check directory permissions.',
    );
  }
}
