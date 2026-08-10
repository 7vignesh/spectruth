/**
 * Concise hook summary.
 *
 * Hook stdout is injected into Kiro's context, so it must stay short, plain,
 * and deterministic. Full detail lives in the persisted report. No ANSI colour
 * is emitted, and provider or environment configuration is never echoed.
 */

import type { AuditReport, CriterionAudit } from '../types.js';

const MAX_LISTED_CRITERIA = 5;
const MAX_LISTED_GAPS = 3;

export interface HookSummaryOptions {
  /** Where the full report was written, shown as a follow-up pointer. */
  reportPath?: string;
}

export function formatHookSummary(
  report: AuditReport,
  options: HookSummaryOptions = {},
): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push('SpecTruth — Done Integrity');

  if (report.scope.kind === 'task') {
    const title = report.scope.taskTitle ? `: ${report.scope.taskTitle}` : '';
    lines.push(`Completed task ${report.scope.taskId}${title}`);
  } else {
    lines.push(`Full spec audit: ${report.specTitle}`);
  }

  lines.push(`Ship decision: ${summary.shipStatus}`);
  lines.push(
    `Evidence: ${summary.states.supported} supported, ${summary.states.partial} partial, `
    + `${summary.states.unsupported} unsupported, ${summary.states.unverified} unverified`,
  );

  const attention = collectAttentionCriteria(report);
  if (attention.length === 0) {
    lines.push('All linked criteria are supported by evidence.');
  } else {
    lines.push('Needs attention:');
    for (const criterion of attention.slice(0, MAX_LISTED_CRITERIA)) {
      lines.push(`- ${criterion.criterionId} [${criterion.state}] ${criterion.justification}`);
      for (const gap of criterion.gaps.slice(0, MAX_LISTED_GAPS)) {
        lines.push(`  gap: ${gap}`);
      }
    }
    const remaining = attention.length - MAX_LISTED_CRITERIA;
    if (remaining > 0) lines.push(`- ...and ${remaining} more in the full report`);
  }

  if (attention.some(criterion => criterion.repairPreviewAvailable)) {
    lines.push('A repair preview is available. Previews change nothing until you approve them.');
  }

  if (options.reportPath) lines.push(`Full report: ${options.reportPath}`);
  return lines.join('\n');
}

function collectAttentionCriteria(report: AuditReport): CriterionAudit[] {
  const order = { UNSUPPORTED: 0, PARTIAL: 1, UNVERIFIED: 2, SUPPORTED: 3 } as const;
  return report.requirements
    .flatMap(requirement => requirement.criteria)
    .filter(criterion => criterion.state !== 'SUPPORTED')
    .sort((a, b) => order[a.state] - order[b.state]);
}

/** Message used when a task event produced nothing to audit. */
export function formatNoTransitionSummary(message: string): string {
  return ['SpecTruth — Done Integrity', 'No completed task to audit.', message].join('\n');
}
