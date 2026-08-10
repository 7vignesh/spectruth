/**
 * Report identity.
 *
 * Approvals bind to a report, so a report needs a stable identifier.
 *
 * The id is derived from the *findings*, deliberately excluding the timestamp.
 * Re-auditing and getting the same answer therefore yields the same id and
 * keeps an existing approval valid, while any change in the findings produces a
 * new id that supersedes it. Timestamps would have made a no-op re-audit
 * invalidate consent for no reason.
 */

import { createHash } from 'crypto';
import type { AuditSummary, RequirementAudit } from '../types.js';

export interface ReportIdentityInput {
  specName: string;
  scopeKey: string;
  requirements: RequirementAudit[];
  summary: AuditSummary;
}

export function computeReportId(input: ReportIdentityInput): string {
  const findings = input.requirements
    .flatMap(requirement => requirement.criteria)
    .map(criterion => `${criterion.criterionId}:${criterion.state}`)
    .sort()
    .join('|');

  const digest = createHash('sha256')
    .update([
      input.specName,
      input.scopeKey,
      input.summary.shipStatus,
      findings,
    ].join('\n'))
    .digest('hex');

  return `R-${digest.slice(0, 12)}`;
}
