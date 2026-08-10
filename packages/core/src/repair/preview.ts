/**
 * Repair previews.
 *
 * A preview describes work; it never performs it. Nothing in this module opens
 * a source file for writing, and nothing here touches `tasks.md`. Generating a
 * preview for a blocked finding must leave the working tree byte-identical.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type { AuditReport, CriterionAudit, EvidenceItem, RepairPreview } from '../types.js';
import { SpecTruthError } from '../errors.js';
import { isSecuritySensitiveCriterion } from '../domain/policy.js';

export const PREVIEW_DIR = join('.spectruth', 'previews');

export function previewDirFor(projectRoot: string): string {
  return join(resolve(projectRoot), PREVIEW_DIR);
}

export function previewPathFor(projectRoot: string, reportId: string): string {
  return join(previewDirFor(projectRoot), `${reportId}.json`);
}

/**
 * Derive previews for every finding that is not SUPPORTED.
 *
 * Wording is deterministic so the same gap always produces the same preview,
 * which keeps preview ids stable across repeated audits.
 */
export function buildRepairPreviews(report: AuditReport): RepairPreview[] {
  if (report.scope.kind !== 'task') return [];
  const taskId = report.scope.taskId;
  const previews: RepairPreview[] = [];

  for (const requirement of report.requirements) {
    for (const criterion of requirement.criteria) {
      if (criterion.state === 'SUPPORTED') continue;

      const gap = criterion.gaps[0] ?? criterion.justification;
      previews.push({
        previewId: computePreviewId(report.reportId, criterion.criterionId),
        reportId: report.reportId,
        taskId,
        criterionId: criterion.criterionId,
        criterionText: criterion.criterionText,
        currentState: criterion.state,
        gap,
        proposedChange: proposeChange(criterion, gap),
        likelyFiles: likelyFilesFor(criterion),
        expectedEvidence: expectedEvidenceFor(criterion),
      });
    }
  }

  return previews;
}

export function computePreviewId(reportId: string, criterionId: string): string {
  const digest = createHash('sha256').update(`${reportId}|${criterionId}`).digest('hex');
  return `RP-${digest.slice(0, 8)}`;
}

/**
 * Describe the repair in terms of the criterion and the missing evidence.
 * An UNVERIFIED finding asks for proof rather than assuming code is absent.
 */
function proposeChange(criterion: CriterionAudit, gap: string): string {
  const subject = criterion.criterionText.replace(/\s+/g, ' ').trim();

  if (criterion.state === 'UNVERIFIED') {
    return `Establish observable evidence that this behavior holds: ${subject}. `
      + `The implementation may already exist, so prefer adding proof over rewriting code. Gap: ${gap}`;
  }

  if (isSecuritySensitiveCriterion(criterion.criterionText)) {
    return `Add the missing enforcement so the system satisfies: ${subject}. `
      + `Reject unauthorized access explicitly rather than relying on callers. Gap: ${gap}`;
  }

  if (criterion.state === 'PARTIAL') {
    return `Complete the remaining behavior for: ${subject}. Gap: ${gap}`;
  }

  return `Implement: ${subject}. Gap: ${gap}`;
}

function likelyFilesFor(criterion: CriterionAudit): string[] {
  const files = new Set<string>();
  for (const item of criterion.evidence) {
    if (item.location?.file && isSourceEvidence(item)) files.add(item.location.file);
  }
  return [...files].sort();
}

function isSourceEvidence(item: EvidenceItem): boolean {
  return item.source === 'source-code'
    || item.source === 'git-diff'
    || item.source === 'static-check';
}

function expectedEvidenceFor(criterion: CriterionAudit): string {
  return criterion.state === 'UNVERIFIED'
    ? 'Observable proof of the required behavior, such as an existing test result or an explicit check in the code path.'
    : 'Source evidence showing the required behavior is implemented, which a re-audit can cite.';
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export function savePreviews(
  projectRoot: string,
  reportId: string,
  previews: RepairPreview[],
): string {
  const path = previewPathFor(projectRoot, reportId);
  const target = resolve(path);
  const temporary = `${target}.tmp`;

  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(previews, null, 2)}\n`, 'utf-8');
    renameSync(temporary, target);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Cleanup failure must not mask the cause.
    }
    throw new SpecTruthError(
      `Could not write repair previews: ${path}`,
      'REPORT_WRITE_FAILED',
      error instanceof Error ? error.message : 'Check directory permissions.',
    );
  }

  return target;
}

export function readPreviews(projectRoot: string, reportId: string): RepairPreview[] {
  const path = previewPathFor(projectRoot, reportId);
  if (!existsSync(path)) return [];

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(parsed) ? parsed as RepairPreview[] : [];
  } catch {
    return [];
  }
}

/** Look up one preview by id across the previews recorded for a report. */
export function findPreview(
  projectRoot: string,
  reportId: string,
  previewId: string,
): RepairPreview | undefined {
  return readPreviews(projectRoot, reportId)
    .find(preview => preview.previewId === previewId);
}
