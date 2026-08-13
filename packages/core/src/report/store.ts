/**
 * Audit report persistence.
 *
 * Hook stdout stays short so it is useful inside Kiro's context, while the full
 * report is written to disk for the Agent Skill, repair previews, and re-audits.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type { AuditReport } from '../types.js';
import { SpecTruthError } from '../errors.js';

export const REPORT_DIR = join('.spectruth', 'reports');
export const LATEST_REPORT_FILE = 'latest.json';

export function reportDirFor(projectRoot: string): string {
  return join(resolve(projectRoot), REPORT_DIR);
}

export function latestReportPath(projectRoot: string): string {
  return join(reportDirFor(projectRoot), LATEST_REPORT_FILE);
}

/** Stable per-task filename so a re-audit replaces the prior report for that task. */
export function reportPathFor(projectRoot: string, specName: string, report: AuditReport): string {
  const scope = report.scope.kind === 'task' ? `task-${report.scope.taskId}` : 'spec';
  return join(reportDirFor(projectRoot), `${sanitize(specName)}-${sanitize(scope)}.json`);
}

export interface SavedReport {
  path: string;
  latestPath: string;
}

export function saveReport(
  projectRoot: string,
  specName: string,
  report: AuditReport,
): SavedReport {
  const path = reportPathFor(projectRoot, specName, report);
  const latestPath = latestReportPath(projectRoot);
  const payload = `${JSON.stringify(report, null, 2)}\n`;

  writeAtomic(path, payload);
  writeAtomic(latestPath, payload);
  return { path, latestPath };
}

export function readLatestReport(projectRoot: string): AuditReport {
  const path = latestReportPath(projectRoot);

  if (!existsSync(path)) {
    throw new SpecTruthError(
      'No SpecTruth audit report has been recorded yet.',
      'REPORT_NOT_FOUND',
      'Complete a Kiro spec task, or run the post-task audit, to produce a report.',
    );
  }

  return parseReportFile(path);
}

/** Read a previously saved report for one task, when one exists. */
export function readReportForTask(
  projectRoot: string,
  specName: string,
  taskId: string,
): AuditReport | undefined {  const path = join(
    reportDirFor(projectRoot),
    `${sanitize(specName)}-${sanitize(`task-${taskId}`)}.json`,
  );
  if (!existsSync(path)) return undefined;

  try {
    return parseReportFile(path);
  } catch {
    return undefined; // A corrupt prior report must not block a fresh audit.
  }
}

/**
 * Find the current stored report for a task without knowing its spec name.
 *
 * Used to detect a superseded approval: consent recorded against a report that
 * a later audit has already replaced authorizes a gap that may no longer exist.
 */
export function findCurrentReportForTask(
  projectRoot: string,
  taskId: string,
): AuditReport | undefined {
  const dir = reportDirFor(projectRoot);
  if (!existsSync(dir)) return undefined;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json') || entry === LATEST_REPORT_FILE) continue;

    try {
      const report = parseReportFile(join(dir, entry));
      if (report.scope.kind === 'task' && report.scope.taskId === taskId) {
        return report;
      }
    } catch {
      continue; // A corrupt sibling report must not break the lookup.
    }
  }

  return undefined;
}

function parseReportFile(path: string): AuditReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new SpecTruthError(
      `Audit report is not readable: ${path}`,
      'REPORT_UNREADABLE',
      'Delete the report and re-run the audit.',
    );
  }

  const candidate = parsed as Partial<AuditReport> | null;
  const valid = candidate
    && typeof candidate.reportId === 'string'
    && typeof candidate.specTitle === 'string'
    && typeof candidate.timestamp === 'string'
    && Array.isArray(candidate.requirements)
    && candidate.summary !== undefined
    && candidate.scope !== undefined;

  if (!valid) {
    throw new SpecTruthError(
      `Audit report is missing required fields: ${path}`,
      'REPORT_UNREADABLE',
      'Delete the report and re-run the audit.',
    );
  }

  return candidate as AuditReport;
}

function writeAtomic(path: string, contents: string): void {
  const target = resolve(path);
  const temporary = `${target}.tmp`;

  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temporary, contents, 'utf-8');
    renameSync(temporary, target);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Cleanup failure must not mask the original cause.
    }
    throw new SpecTruthError(
      `Could not write audit report: ${path}`,
      'REPORT_WRITE_FAILED',
      error instanceof Error ? error.message : 'Check directory permissions.',
    );
  }
}

function sanitize(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe.length > 0 ? safe : 'report';
}
