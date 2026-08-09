/**
 * Reporter
 *
 * Formats verification reports in multiple output formats.
 */

import type { VerificationReport } from '../types.js';
import { formatTerminalReport, formatMatrixReport } from './terminal.js';
import { formatJSONReport, formatMatrixJSON, formatGitHubAnnotations } from './json.js';

export {
  formatTerminalReport,
  formatMatrixReport,
  formatJSONReport,
  formatMatrixJSON,
  formatGitHubAnnotations,
};

export type OutputFormat = 'terminal' | 'json' | 'matrix' | 'github';

/**
 * Generate a report in the requested format.
 */
export function generateReport(
  report: VerificationReport,
  format: OutputFormat = 'terminal'
): string {
  switch (format) {
    case 'json':
      return formatJSONReport(report);
    case 'matrix':
      return formatMatrixReport(report);
    case 'github':
      return formatGitHubAnnotations(report);
    case 'terminal':
    default:
      return formatTerminalReport(report);
  }
}
