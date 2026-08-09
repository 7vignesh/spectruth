/**
 * Terminal reporter for evidence-backed Done Integrity audit reports.
 */

import type {
  AuditReport,
  CriterionAudit,
  EvidenceState,
  RequirementAudit,
  ShipStatus,
} from '../types.js';

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

function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
}

function color(text: string, ...codes: string[]): string {
  if (!shouldUseColor()) return text;
  return codes.join('') + text + c.reset;
}

function stateLabel(state: EvidenceState): string {
  switch (state) {
    case 'SUPPORTED': return color(state, c.green, c.bold);
    case 'PARTIAL': return color(state, c.yellow, c.bold);
    case 'UNSUPPORTED': return color(state, c.red, c.bold);
    case 'UNVERIFIED': return color(state, c.blue, c.bold);
  }
}

function stateIcon(state: EvidenceState): string {
  switch (state) {
    case 'SUPPORTED': return color('+', c.green, c.bold);
    case 'PARTIAL': return color('~', c.yellow, c.bold);
    case 'UNSUPPORTED': return color('x', c.red, c.bold);
    case 'UNVERIFIED': return color('?', c.blue, c.bold);
  }
}

function shipLabel(status: ShipStatus): string {
  switch (status) {
    case 'READY': return color(status, c.green, c.bold);
    case 'REVIEW_REQUIRED': return color(status, c.yellow, c.bold);
    case 'BLOCKED': return color(status, c.red, c.bold);
  }
}

export function formatTerminalReport(report: AuditReport): string {
  const lines: string[] = [];
  const divider = color('─'.repeat(88), c.gray);

  lines.push('');
  lines.push(color(' SpecTruth', c.cyan, c.bold) + color(' — Done Integrity Audit', c.bold));
  lines.push(divider);
  lines.push('');
  lines.push(`  ${color('Scope:', c.dim)}     ${formatScope(report)}`);
  lines.push(`  ${color('Spec:', c.dim)}      ${report.specTitle}`);
  lines.push(`  ${color('Codebase:', c.dim)}  ${report.codebasePath}`);
  lines.push(`  ${color('Audited:', c.dim)}   ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');
  lines.push(divider);
  lines.push('');

  for (const requirement of report.requirements) {
    lines.push(...formatRequirement(requirement));
    lines.push('');
  }

  lines.push(divider);
  lines.push(...formatSummary(report));
  lines.push(divider);
  lines.push('');
  return lines.join('\n');
}

function formatScope(report: AuditReport): string {
  return report.scope.kind === 'task'
    ? `task ${report.scope.taskId}${report.scope.taskTitle ? ` — ${report.scope.taskTitle}` : ''}`
    : 'full spec';
}

function formatRequirement(result: RequirementAudit): string[] {
  const lines: string[] = [];
  const title = result.requirement.title || result.requirement.id;
  lines.push(
    `  ${stateIcon(result.state)} ${color(result.requirement.id, c.bold)}: ${title}  ` +
    color(`[${result.state}]`, c.dim),
  );

  for (const criterion of result.criteria) {
    lines.push(...formatCriterion(criterion));
  }
  return lines;
}

function formatCriterion(criterion: CriterionAudit): string[] {
  const lines: string[] = [];
  const text = truncateText(criterion.criterionText, 76);
  lines.push(`      ${stateIcon(criterion.state)} ${criterion.criterionId}: ${text}`);
  lines.push(`        ${color('state:', c.dim)} ${stateLabel(criterion.state)}`);
  lines.push(`        ${color('why:', c.dim)} ${criterion.justification}`);

  if (criterion.evidence.length === 0) {
    lines.push(`        ${color('evidence:', c.dim)} none recorded`);
  } else {
    for (const item of criterion.evidence) {
      const location = item.location
        ? `${item.location.file}${item.location.line === undefined ? '' : `:${item.location.line}`}`
        : 'no location';
      const support = item.supports ? color('+', c.green) : color('-', c.red);
      lines.push(
        `        ${support} ${color(item.source, c.cyan)} ${color(location, c.blue)} — ${item.observation}`,
      );
    }
  }

  for (const gap of criterion.gaps) {
    lines.push(`        ${color('gap:', c.yellow)} ${gap}`);
  }
  if (criterion.repairPreviewAvailable) {
    lines.push(`        ${color('repair:', c.yellow)} preview available; explicit approval required`);
  }
  return lines;
}

function formatSummary(report: AuditReport): string[] {
  const { states, totalCriteria, totalRequirements, shipStatus } = report.summary;
  return [
    '',
    `  ${color('SHIP DECISION', c.bold)}  ${shipLabel(shipStatus)}`,
    '',
    `  ${color('Requirements:', c.dim)} ${totalRequirements}`,
    `  ${color('Criteria:', c.dim)}     ${totalCriteria}`,
    `  ${color('Evidence:', c.dim)}     ` +
      `${color(`${states.supported} supported`, c.green)}  ` +
      `${color(`${states.partial} partial`, c.yellow)}  ` +
      `${color(`${states.unsupported} unsupported`, c.red)}  ` +
      `${color(`${states.unverified} unverified`, c.blue)}`,
    '',
  ];
}

/**
 * Render a compact truth map. Each row still carries the criterion state,
 * justification, evidence, and gaps rather than reducing integrity to a score.
 */
export function formatMatrixReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(color(' Done Integrity Truth Map', c.bold));
  lines.push(color('─'.repeat(154), c.gray));
  lines.push(color(
    ' Criterion           │ State       │ Justification                    │ Evidence                         │ Gaps',
    c.dim,
  ));
  lines.push(color('─'.repeat(154), c.gray));

  for (const requirement of report.requirements) {
    for (const criterion of requirement.criteria) {
      const id = truncateCell(criterion.criterionId, 19);
      const state = padVisible(stateLabel(criterion.state), 11);
      const justification = truncateCell(criterion.justification, 32);
      const evidence = truncateCell(formatEvidenceSummary(criterion), 32);
      const gaps = truncateCell(criterion.gaps.join('; ') || 'none', 32);
      lines.push(` ${id} │ ${state} │ ${justification} │ ${evidence} │ ${gaps}`);
    }
  }

  lines.push(color('─'.repeat(154), c.gray));
  lines.push(` Ship decision: ${shipLabel(report.summary.shipStatus)}`);
  lines.push('');
  return lines.join('\n');
}

function formatEvidenceSummary(criterion: CriterionAudit): string {
  if (criterion.evidence.length === 0) return 'none recorded';
  const item = criterion.evidence[0];
  if (!item.location) return `${item.source}: ${item.observation}`;
  const line = item.location.line === undefined ? '' : `:${item.location.line}`;
  return `${item.source}: ${item.location.file}${line}`;
}

function padVisible(text: string, width: number): string {
  const visibleLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  return text + ' '.repeat(Math.max(0, width - visibleLength));
}

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.substring(0, max - 3)}...` : text;
}

function truncateCell(text: string, width: number): string {
  return truncateText(text, width).padEnd(width);
}
