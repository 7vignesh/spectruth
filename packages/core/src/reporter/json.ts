/**
 * Structured reporters for Done Integrity audit reports.
 */

import type { AuditReport } from '../types.js';

export function formatJSONReport(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}

/** Flatten findings without dropping their justification or evidence chain. */
export function formatMatrixJSON(report: AuditReport): string {
  const rows = report.requirements.flatMap(requirement =>
    requirement.criteria.map(criterion => ({
      requirementId: requirement.requirement.id,
      requirementTitle: requirement.requirement.title,
      criterionId: criterion.criterionId,
      criterionText: criterion.criterionText,
      state: criterion.state,
      justification: criterion.justification,
      evidence: criterion.evidence,
      gaps: criterion.gaps,
      repairPreviewAvailable: criterion.repairPreviewAvailable,
    })),
  );

  return JSON.stringify(
    {
      scope: report.scope,
      spec: report.specTitle,
      timestamp: report.timestamp,
      codebase: report.codebasePath,
      summary: report.summary,
      truthMap: rows,
    },
    null,
    2,
  );
}

/**
 * Format findings as GitHub Actions annotations. This remains a deterministic
 * serialization; CI gate behavior itself is outside Increment 1.
 */
export function formatGitHubAnnotations(report: AuditReport): string {
  const lines: string[] = [];

  for (const requirement of report.requirements) {
    for (const criterion of requirement.criteria) {
      if (criterion.state === 'SUPPORTED') continue;

      const level = criterion.state === 'UNVERIFIED' ? 'warning' : 'error';
      const locatedEvidence = criterion.evidence.find(item => item.location);
      const file = locatedEvidence?.location?.file ?? 'unknown';
      const line = locatedEvidence?.location?.line ?? 1;
      const title = `${requirement.requirement.id}: ${criterion.criterionId} [${criterion.state}]`;
      const gaps = criterion.gaps.length > 0
        ? ` Gaps: ${criterion.gaps.join('; ')}`
        : '';
      const message = `${criterion.justification}${gaps}`;

      lines.push(
        `::${level} file=${file},line=${line},title=${title}::${escapeAnnotation(message)}`,
      );
    }
  }

  const { states, shipStatus } = report.summary;
  lines.push(
    `::notice title=SpecTruth Ship Decision::${shipStatus} — ` +
    `${states.supported} supported, ${states.partial} partial, ` +
    `${states.unsupported} unsupported, ${states.unverified} unverified`,
  );

  return lines.join('\n');
}

function escapeAnnotation(text: string): string {
  return text
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}
