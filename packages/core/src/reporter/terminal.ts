/**
 * Terminal Reporter
 *
 * Formats verification reports for terminal output.
 * Uses ANSI escape codes directly (no chalk dependency in core).
 *
 * Output includes:
 * - Header with spec title and metadata
 * - Per-requirement verdict with criteria breakdown
 * - Evidence with file:line references
 * - Remediation tasks for failures
 * - Summary with overall score
 */

import type { VerificationReport, RequirementResult, CriterionResult, Verdict } from '../types.js';

// ─── ANSI Color Codes ────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/** Detect if colors should be disabled (CI, no TTY, NO_COLOR env) */
function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
}

/** Apply color only if supported */
function color(text: string, ...codes: string[]): string {
  if (!shouldUseColor()) return text;
  return codes.join('') + text + c.reset;
}

// ─── Verdict Symbols ─────────────────────────────────────────────────────────

function verdictSymbol(verdict: Verdict): string {
  switch (verdict) {
    case 'PASS': return color('PASS', c.green, c.bold);
    case 'FAIL': return color('FAIL', c.red, c.bold);
    case 'PARTIAL': return color('PARTIAL', c.yellow, c.bold);
  }
}

function verdictIcon(verdict: Verdict): string {
  switch (verdict) {
    case 'PASS': return color('+', c.green, c.bold);
    case 'FAIL': return color('x', c.red, c.bold);
    case 'PARTIAL': return color('~', c.yellow, c.bold);
  }
}

// ─── Main Formatter ──────────────────────────────────────────────────────────

/**
 * Format a verification report for terminal output.
 */
export function formatTerminalReport(report: VerificationReport): string {
  const lines: string[] = [];
  const divider = color('─'.repeat(72), c.gray);

  // Header
  lines.push('');
  lines.push(color(' SpecTruth', c.cyan, c.bold) + color(' — Spec Conformance Report', c.bold));
  lines.push(divider);
  lines.push('');
  lines.push(`  ${color('Spec:', c.dim)}      ${report.specTitle}`);
  lines.push(`  ${color('Codebase:', c.dim)}  ${report.codebasePath}`);
  lines.push(`  ${color('Verified:', c.dim)}  ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');
  lines.push(divider);
  lines.push('');

  // Per-requirement results
  for (const result of report.results) {
    lines.push(...formatRequirement(result));
    lines.push('');
  }

  // Summary
  lines.push(divider);
  lines.push(...formatSummary(report));
  lines.push(divider);
  lines.push('');

  return lines.join('\n');
}

// ─── Requirement Formatting ──────────────────────────────────────────────────

function formatRequirement(result: RequirementResult): string[] {
  const lines: string[] = [];
  const { requirement, criteriaResults, overallVerdict, score } = result;

  // Requirement header
  const icon = verdictIcon(overallVerdict);
  const title = requirement.title || requirement.id;
  const scoreText = color(`[${score}]`, c.dim);
  lines.push(`  ${icon} ${color(requirement.id, c.bold)}: ${title}  ${scoreText}`);

  // Criteria breakdown
  for (const cr of criteriaResults) {
    lines.push(...formatCriterion(cr));
  }

  return lines;
}

function formatCriterion(cr: CriterionResult): string[] {
  const lines: string[] = [];
  const icon = verdictIcon(cr.verdict);
  const confidencePercent = Math.round(cr.confidence * 100);

  // Truncate long criterion text for readability
  const text = cr.criterion.text.length > 70
    ? cr.criterion.text.substring(0, 67) + '...'
    : cr.criterion.text;

  const confidenceLabel = color(`${confidencePercent}%`, c.gray);
  lines.push(`      ${icon} ${text}  ${confidenceLabel}`);

  // Evidence line
  if (cr.evidence.file) {
    const location = cr.evidence.line > 0
      ? `${cr.evidence.file}:${cr.evidence.line}`
      : cr.evidence.file;
    lines.push(`        ${color('→', c.gray)} ${color(location, c.blue)}`);
  }

  // Reason (only for non-PASS verdicts to reduce noise)
  if (cr.verdict !== 'PASS') {
    lines.push(`        ${color(cr.reason, c.dim)}`);
  }

  // Remediation suggestion
  if (cr.suggestion) {
    lines.push(`        ${color('fix:', c.yellow)} ${color(cr.suggestion, c.dim)}`);
  }

  return lines;
}

// ─── Summary Formatting ──────────────────────────────────────────────────────

function formatSummary(report: VerificationReport): string[] {
  const lines: string[] = [];
  const { summary } = report;

  // Count criteria totals
  let totalCriteria = 0;
  let passedCriteria = 0;
  for (const result of report.results) {
    totalCriteria += result.criteriaResults.length;
    passedCriteria += result.criteriaResults.filter(cr => cr.verdict === 'PASS').length;
  }

  const percent = totalCriteria > 0
    ? Math.round((passedCriteria / totalCriteria) * 100)
    : 0;

  // Progress bar
  const barWidth = 24;
  const filled = Math.round((percent / 100) * barWidth);
  const barColor = percent === 100 ? c.green : percent >= 60 ? c.yellow : c.red;
  const bar = color('█'.repeat(filled), barColor) + color('░'.repeat(barWidth - filled), c.gray);

  lines.push('');
  lines.push(`  ${color('RESULT', c.bold)}   ${bar}  ${color(`${percent}%`, c.bold)}`);
  lines.push('');
  lines.push(`  ${color('Criteria:', c.dim)}      ${passedCriteria}/${totalCriteria} satisfied`);
  lines.push(
    `  ${color('Requirements:', c.dim)}  ` +
    `${color(`${summary.passed} passed`, c.green)}  ` +
    `${color(`${summary.partial} partial`, c.yellow)}  ` +
    `${color(`${summary.failed} failed`, c.red)}`
  );
  lines.push(`  ${color('Status:', c.dim)}        ${verdictSymbol(summary.overallVerdict)}`);
  lines.push('');

  return lines;
}

// ─── Compact Matrix Format ───────────────────────────────────────────────────

/**
 * Format a compact coverage matrix (one row per requirement).
 * Useful for CI output or quick scanning.
 */
export function formatMatrixReport(report: VerificationReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(color(' Requirements Coverage Matrix', c.bold));
  lines.push(color('─'.repeat(88), c.gray));
  lines.push(
    color(
      ' ID      │ Status  │ Score      │ Evidence                                  ',
      c.dim
    )
  );
  lines.push(color('─'.repeat(88), c.gray));

  for (const result of report.results) {
    const id = result.requirement.id.padEnd(7);
    const status = padVisible(verdictIcon(result.overallVerdict) + ' ' + result.overallVerdict, 7);
    const score = result.score.padEnd(10);

    // Best evidence: first PASS file, or first FAIL reason
    const firstEvidence = result.criteriaResults.find(cr => cr.evidence.file);
    const evidence = firstEvidence
      ? truncate(firstEvidence.evidence.file, 40)
      : color('no evidence found', c.dim);

    lines.push(` ${id} │ ${status} │ ${score} │ ${evidence}`);
  }

  lines.push(color('─'.repeat(88), c.gray));
  lines.push('');

  return lines.join('\n');
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Pad a string accounting for ANSI escape sequences */
function padVisible(text: string, width: number): string {
  const visibleLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, width - visibleLength);
  return text + ' '.repeat(padding);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.substring(0, max - 3) + '...' : text.padEnd(max);
}
