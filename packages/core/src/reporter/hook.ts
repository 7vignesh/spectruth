/**
 * Human-legible audit summary.
 *
 * This output is read by someone who did not read the diff, so each finding is
 * shown as three lines: what the spec *required*, what was actually *found*,
 * and what is *missing*. That structure makes a failure understandable without
 * any knowledge of SpecTruth.
 *
 * Plain text only. It is injected into an agent's context and embedded in docs,
 * so no colour and no non-deterministic content.
 */

import type { AuditReport, CriterionAudit, EvidenceItem } from '../types.js';

const MAX_LISTED_CRITERIA = 6;
const WRAP_WIDTH = 66;
const LABEL_WIDTH = 10;
const INDENT = '    ';

export interface HookSummaryOptions {
  /** Where the full report was written, shown as a follow-up pointer. */
  reportPath?: string;
  /** Repair preview ids available for this report. */
  previewIds?: string[];
}

export function formatHookSummary(
  report: AuditReport,
  options: HookSummaryOptions = {},
): string {
  const lines: string[] = ['SpecTruth — Done Integrity', ''];
  const { summary } = report;

  if (report.scope.kind === 'task') {
    const title = report.scope.taskTitle ? `  ${report.scope.taskTitle}` : '';
    lines.push(`Task ${report.scope.taskId}${title}   ← marked complete`);
  } else {
    lines.push(`Full spec audit   ${report.specTitle}`);
  }
  lines.push('');

  const findings = orderedFindings(report);
  if (findings.length === 0) {
    lines.push('  No linked acceptance criteria were audited.');
    lines.push('');
  }

  for (const criterion of findings.slice(0, MAX_LISTED_CRITERIA)) {
    lines.push(...formatFinding(criterion));
    lines.push('');
  }

  const hidden = findings.length - MAX_LISTED_CRITERIA;
  if (hidden > 0) {
    lines.push(`  ...and ${hidden} more finding(s) in the full report`);
    lines.push('');
  }

  lines.push(`SHIP DECISION  ${summary.shipStatus}`);
  lines.push(stateCountLine(report));

  if (report.adjudication === 'deterministic') {
    lines.push('Verdict computed from static evidence only. No model was used.');
  }

  const previewIds = options.previewIds ?? [];
  if (previewIds.length > 0) {
    lines.push('');
    lines.push(
      `Repair preview${previewIds.length > 1 ? 's' : ''} available: ${previewIds.join(', ')}`,
    );
    lines.push('Nothing has been changed. Approve a preview to authorize that repair.');
  } else if (findings.some(finding => finding.repairPreviewAvailable)) {
    lines.push('');
    lines.push('A repair preview is available. Nothing has been changed.');
  }

  if (options.reportPath) {
    lines.push('');
    lines.push(`Full report: ${options.reportPath}`);
  }

  return lines.join('\n');
}

// ─── Finding Rendering ───────────────────────────────────────────────────────

function formatFinding(criterion: CriterionAudit): string[] {
  const lines = [`  ${criterion.criterionId}   ${criterion.state}`];

  lines.push(...labelled('required', criterion.criterionText));
  lines.push(...labelled('found', describeFound(criterion)));

  const missing = describeMissing(criterion);
  if (missing) lines.push(...labelled('missing', missing));

  return lines;
}

/** What the codebase actually shows, with a location when one is known. */
function describeFound(criterion: CriterionAudit): string {
  const supporting = criterion.evidence.find(item => item.supports && located(item));
  if (supporting) return `${locationOf(supporting)}  ${supporting.observation}`;

  const anyLocated = criterion.evidence.find(item => located(item) && item.source !== 'task-transition');
  if (anyLocated) return `${locationOf(anyLocated)}  ${anyLocated.observation}`;

  const transition = criterion.evidence.find(item => item.source === 'task-transition');
  if (transition) return `${transition.observation}`;

  return 'no implementation evidence located for this criterion';
}

/** The absence that drives the state, taken from the recorded gaps. */
function describeMissing(criterion: CriterionAudit): string | undefined {
  if (criterion.state === 'SUPPORTED') return undefined;
  if (criterion.gaps.length > 0) return criterion.gaps.join('; ');
  return criterion.justification;
}

function located(item: EvidenceItem): boolean {
  return Boolean(item.location?.file);
}

function locationOf(item: EvidenceItem): string {
  const file = item.location?.file ?? '';
  const line = item.location?.line;
  return line === undefined ? file : `${file}:${line}`;
}

// ─── Layout Helpers ──────────────────────────────────────────────────────────

/** `label` then wrapped value, with continuation lines hanging under the value. */
function labelled(label: string, value: string): string[] {
  const wrapped = wrap(value, WRAP_WIDTH);
  const head = `${INDENT}${label.padEnd(LABEL_WIDTH)}${wrapped[0] ?? ''}`;
  const hang = ' '.repeat(INDENT.length + LABEL_WIDTH);
  return [head, ...wrapped.slice(1).map(line => `${hang}${line}`)];
}

function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) current = word;
    else if (`${current} ${word}`.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/** Only mention states that actually occurred, so zeros do not add noise. */
function stateCountLine(report: AuditReport): string {
  const { states } = report.summary;
  const parts = [
    states.supported > 0 ? `${states.supported} supported` : '',
    states.partial > 0 ? `${states.partial} partial` : '',
    states.unsupported > 0 ? `${states.unsupported} unsupported` : '',
    states.unverified > 0 ? `${states.unverified} unverified` : '',
  ].filter(Boolean);

  const total = report.summary.totalCriteria;
  const noun = total === 1 ? 'criterion' : 'criteria';
  return parts.length === 0
    ? 'No criteria were adjudicated.'
    : `${total} ${noun} checked: ${parts.join(', ')}`;
}

/** Blocking findings first, so the reason for a BLOCKED decision leads. */
function orderedFindings(report: AuditReport): CriterionAudit[] {
  const severity = { UNSUPPORTED: 0, PARTIAL: 1, UNVERIFIED: 2, SUPPORTED: 3 } as const;
  return report.requirements
    .flatMap(requirement => requirement.criteria)
    .sort((a, b) => severity[a.state] - severity[b.state]);
}

/** Message used when a task event produced nothing to audit. */
export function formatNoTransitionSummary(message: string): string {
  return ['SpecTruth — Done Integrity', '', 'No completed task to audit.', message].join('\n');
}
