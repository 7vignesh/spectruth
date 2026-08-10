/**
 * Re-audit after an approved repair.
 *
 * The point of re-auditing is to avoid taking the repair's word for it. The
 * same evidence engine runs again and the specific criterion is compared, so a
 * repair that did not actually close the gap is reported as still open.
 */

import type {
  AuditReport,
  CriterionAudit,
  EvidenceState,
  ShipStatus,
  TaskAuditReport,
} from '../types.js';
import { runAudit, type AuditOptions } from '../audit/run.js';

export interface CriterionDelta {
  criterionId: string;
  before?: EvidenceState;
  after: EvidenceState;
  /** True when the finding moved to SUPPORTED. */
  resolved: boolean;
  /** True when the finding became worse than it was. */
  regressed: boolean;
  justification: string;
  gaps: string[];
}

export interface ReauditResult {
  report: TaskAuditReport;
  reportPath: string;
  previousShipStatus?: ShipStatus;
  shipStatus: ShipStatus;
  deltas: CriterionDelta[];
  /** The criterion the approved repair was supposed to fix, when specified. */
  targeted?: CriterionDelta;
}

export interface ReauditOptions extends AuditOptions {
  taskId: string;
  /** The criterion an approved repair claimed to address. */
  criterionId?: string;
}

export async function reauditTask(options: ReauditOptions): Promise<ReauditResult> {
  const run = await runAudit(options);
  const outcome = run.outcomes[0];

  if (!outcome) {
    // runAudit throws when nothing is auditable, so this is the unlinked case.
    throw Object.assign(
      new Error(`Task ${options.taskId} references no requirement, so a re-audit has nothing to check.`),
      { code: 'NO_LINKED_CRITERIA' },
    );
  }

  const deltas = compareReports(outcome.previous, outcome.report);
  const targeted = options.criterionId
    ? deltas.find(delta => delta.criterionId === options.criterionId)
    : undefined;

  return {
    report: outcome.report,
    reportPath: outcome.reportPath,
    ...(outcome.previous ? { previousShipStatus: outcome.previous.summary.shipStatus } : {}),
    shipStatus: outcome.report.summary.shipStatus,
    deltas,
    ...(targeted ? { targeted } : {}),
  };
}

/** Severity ordering used to decide whether a finding regressed. */
const SEVERITY: Record<EvidenceState, number> = {
  SUPPORTED: 0,
  UNVERIFIED: 1,
  PARTIAL: 2,
  UNSUPPORTED: 3,
};

export function compareReports(
  previous: AuditReport | undefined,
  current: AuditReport,
): CriterionDelta[] {
  const before = new Map<string, CriterionAudit>();
  for (const requirement of previous?.requirements ?? []) {
    for (const criterion of requirement.criteria) {
      before.set(criterion.criterionId, criterion);
    }
  }

  const deltas: CriterionDelta[] = [];
  for (const requirement of current.requirements) {
    for (const criterion of requirement.criteria) {
      const prior = before.get(criterion.criterionId);
      deltas.push({
        criterionId: criterion.criterionId,
        ...(prior ? { before: prior.state } : {}),
        after: criterion.state,
        resolved: criterion.state === 'SUPPORTED' && prior?.state !== 'SUPPORTED',
        regressed: prior ? SEVERITY[criterion.state] > SEVERITY[prior.state] : false,
        justification: criterion.justification,
        gaps: criterion.gaps,
      });
    }
  }

  return deltas;
}

/** Plain summary of a re-audit, suitable for the agent to relay verbatim. */
export function formatReauditSummary(result: ReauditResult): string {
  const lines: string[] = ['SpecTruth — re-audit after approved repair'];
  lines.push(`Task ${result.report.scope.taskId}: ${result.report.scope.taskTitle ?? ''}`.trim());

  if (result.previousShipStatus && result.previousShipStatus !== result.shipStatus) {
    lines.push(`Ship decision: ${result.previousShipStatus} -> ${result.shipStatus}`);
  } else {
    lines.push(`Ship decision: ${result.shipStatus}`);
  }

  if (result.targeted) {
    const target = result.targeted;
    lines.push(
      target.resolved
        ? `${target.criterionId} is now SUPPORTED. The approved repair closed the gap.`
        : `${target.criterionId} is still ${target.after}. The approved repair did not close the gap.`,
    );
    if (!target.resolved) {
      lines.push(`why: ${target.justification}`);
      for (const gap of target.gaps) lines.push(`  gap: ${gap}`);
    }
  }

  const regressions = result.deltas.filter(delta => delta.regressed);
  for (const regression of regressions) {
    lines.push(`regression: ${regression.criterionId} moved ${regression.before} -> ${regression.after}`);
  }

  return lines.join('\n');
}
