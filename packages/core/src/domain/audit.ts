/**
 * Done Integrity domain constructors and validation.
 */

import type {
  CriterionAudit,
  EvidenceItem,
  EvidenceState,
} from '../types.js';

export const EVIDENCE_STATES = [
  'SUPPORTED',
  'PARTIAL',
  'UNSUPPORTED',
  'UNVERIFIED',
] as const satisfies readonly EvidenceState[];

const EVIDENCE_STATE_SET = new Set<EvidenceState>(EVIDENCE_STATES);

export interface CreateCriterionAuditInput {
  criterionId: string;
  criterionText: string;
  state: EvidenceState;
  justification: string;
  evidence?: EvidenceItem[];
  gaps?: string[];
  repairPreviewAvailable?: boolean;
}

/**
 * Create a validated criterion audit.
 *
 * Findings without an explicit justification are rejected because a state
 * without its reason is not an auditable Done Integrity result.
 */
export function createCriterionAudit(
  input: CreateCriterionAuditInput,
): CriterionAudit {
  const criterionId = input.criterionId.trim();
  const criterionText = input.criterionText.trim();
  const justification = input.justification.trim();

  if (!criterionId) {
    throw new Error('Criterion audit requires a criterionId');
  }
  if (!criterionText) {
    throw new Error('Criterion audit requires criterionText');
  }
  if (!EVIDENCE_STATE_SET.has(input.state)) {
    throw new Error(`Invalid evidence state: ${String(input.state)}`);
  }
  if (!justification) {
    throw new Error('Criterion audit requires a non-empty justification');
  }

  const evidence = (input.evidence ?? []).map(validateEvidenceItem);
  const gaps = (input.gaps ?? []).map(gap => gap.trim()).filter(Boolean);
  const repairPreviewAvailable = input.repairPreviewAvailable
    ?? (input.state === 'PARTIAL' || input.state === 'UNSUPPORTED');

  return {
    criterionId,
    criterionText,
    state: input.state,
    justification,
    evidence,
    gaps,
    repairPreviewAvailable,
  };
}

function validateEvidenceItem(item: EvidenceItem): EvidenceItem {
  const observation = item.observation.trim();
  if (!observation) {
    throw new Error('Evidence item requires a non-empty observation');
  }

  return {
    ...item,
    observation,
    location: item.location
      ? {
          file: item.location.file.trim(),
          ...(item.location.line === undefined ? {} : { line: item.location.line }),
        }
      : undefined,
  };
}
