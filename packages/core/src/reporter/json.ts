/**
 * JSON Reporter
 *
 * Formats verification reports as structured JSON for programmatic use:
 * - CI pipelines
 * - Web UI consumption
 * - Storing verification history
 */

import type { VerificationReport } from '../types.js';

/**
 * Format a verification report as pretty-printed JSON.
 */
export function formatJSONReport(report: VerificationReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format a verification report as a compact coverage matrix in JSON.
 * Flattens the nested structure into a table-friendly array.
 */
export function formatMatrixJSON(report: VerificationReport): string {
  const rows = report.results.flatMap(result =>
    result.criteriaResults.map(cr => ({
      requirementId: result.requirement.id,
      requirementTitle: result.requirement.title,
      criterionId: cr.criterion.id,
      criterion: cr.criterion.text,
      status: cr.verdict,
      confidence: cr.confidence,
      evidenceFile: cr.evidence.file || null,
      evidenceLine: cr.evidence.line || null,
      reason: cr.reason,
      action: cr.suggestion || null,
    }))
  );

  return JSON.stringify(
    {
      spec: report.specTitle,
      timestamp: report.timestamp,
      codebase: report.codebasePath,
      summary: report.summary,
      matrix: rows,
    },
    null,
    2
  );
}

/**
 * Format as GitHub Actions annotations (for CI integration).
 * Outputs ::error and ::warning commands that GitHub renders in PR checks.
 */
export function formatGitHubAnnotations(report: VerificationReport): string {
  const lines: string[] = [];

  for (const result of report.results) {
    for (const cr of result.criteriaResults) {
      if (cr.verdict === 'PASS') continue;

      const level = cr.verdict === 'FAIL' ? 'error' : 'warning';
      const file = cr.evidence.file || 'unknown';
      const line = cr.evidence.line || 1;
      const title = `${result.requirement.id}: ${cr.criterion.id}`;
      const message = `${cr.reason}${cr.suggestion ? ` — ${cr.suggestion}` : ''}`;

      lines.push(
        `::${level} file=${file},line=${line},title=${title}::${escapeAnnotation(message)}`
      );
    }
  }

  // Summary line
  const { summary } = report;
  lines.push(
    `::notice title=SpecTruth Result::${summary.overallScore} — ` +
    `${summary.passed} passed, ${summary.partial} partial, ${summary.failed} failed`
  );

  return lines.join('\n');
}

/** Escape special characters in GitHub Actions annotations */
function escapeAnnotation(text: string): string {
  return text
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}
