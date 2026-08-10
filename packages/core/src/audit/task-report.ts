/**
 * Task-scoped audit report construction.
 *
 * Day 2 wires the Kiro task lifecycle end to end. Real evidence adjudication
 * arrives with the evidence engine, so until then the report records honest
 * `UNVERIFIED` findings rather than claiming support that was never checked.
 */

import type {
  AcceptanceCriterion,
  CompletedTaskTransition,
  CriterionAudit,
  KiroSpec,
  RequirementAudit,
  TaskAuditReport,
} from '../types.js';
import { createCriterionAudit } from '../domain/audit.js';
import { countEvidenceStates, deriveRequirementState, deriveShipStatus } from '../domain/policy.js';

export interface BuildTaskAuditReportInput {
  spec: KiroSpec;
  transition: CompletedTaskTransition;
  criteria: CriterionAudit[];
  codebasePath: string;
  now?: () => Date;
}

export function buildTaskAuditReport(input: BuildTaskAuditReportInput): TaskAuditReport {
  const { spec, transition, criteria, codebasePath } = input;
  const now = input.now ?? (() => new Date());
  const links = spec.links.find(link => link.taskId === transition.taskId);
  const byId = new Map(criteria.map(criterion => [criterion.criterionId, criterion]));
  const requirements: RequirementAudit[] = [];

  for (const requirement of links?.requirements ?? []) {
    const linkedCriteria = (links?.criteria ?? [])
      .filter(criterion => criterion.id.startsWith(`${requirement.id}-`))
      .map(criterion => byId.get(criterion.id))
      .filter((criterion): criterion is CriterionAudit => criterion !== undefined);

    if (linkedCriteria.length === 0) continue;
    requirements.push({
      requirement,
      state: deriveRequirementState(linkedCriteria),
      criteria: linkedCriteria,
    });
  }

  const states = countEvidenceStates(requirements);
  const totalCriteria = requirements.reduce((total, entry) => total + entry.criteria.length, 0);

  return {
    scope: {
      kind: 'task',
      taskId: transition.taskId,
      taskTitle: transition.title,
    },
    specTitle: spec.requirements.title,
    timestamp: now().toISOString(),
    codebasePath,
    requirements,
    summary: {
      totalRequirements: requirements.length,
      totalCriteria,
      states,
      shipStatus: deriveShipStatus(states),
    },
  };
}

export const PENDING_ADJUDICATION_JUSTIFICATION =
  'The task transition was confirmed, but evidence adjudication is not enabled in this build, '
  + 'so the completion claim has not been checked against requirement evidence.';

/**
 * Build placeholder findings for a confirmed transition.
 *
 * The transition is recorded as evidence that does not by itself support any
 * criterion, which keeps the report truthful and yields REVIEW_REQUIRED rather
 * than a fabricated READY.
 */
export function buildPendingCriteriaAudits(
  criteria: AcceptanceCriterion[],
  transition: CompletedTaskTransition,
): CriterionAudit[] {
  const transitionObservation =
    `Task ${transition.taskId} changed from ${transition.previousState} to completed`
    + `${transition.changedFiles.length > 0
      ? ` alongside ${transition.changedFiles.length} changed file(s)`
      : ' with no detected file changes'}`;

  return criteria.map(criterion => createCriterionAudit({
    criterionId: criterion.id,
    criterionText: criterion.text,
    state: 'UNVERIFIED',
    justification: PENDING_ADJUDICATION_JUSTIFICATION,
    evidence: [{
      source: 'task-transition',
      location: transition.location,
      observation: transitionObservation,
      supports: false,
    }],
    gaps: ['Requirement evidence for this criterion has not been collected or adjudicated.'],
    repairPreviewAvailable: false,
  }));
}
