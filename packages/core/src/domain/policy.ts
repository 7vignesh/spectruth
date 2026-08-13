/**
 * Done Integrity evidence and ship policy.
 */

import type {
  AcceptanceCriterion,
  CriterionAudit,
  EvidenceState,
  EvidenceStateCounts,
  RequirementAudit,
  ShipStatus,
} from '../types.js';

export const SHIP_STATUSES = [
  'READY',
  'REVIEW_REQUIRED',
  'BLOCKED',
] as const satisfies readonly ShipStatus[];

const SECURITY_TERMS = [
  /\badmin(?:istrator)?\b/i,
  /\bauthori[sz](?:e|ed|ation)\b/i,
  /\bunauthori[sz]ed\b/i,
  /\bpermission\b/i,
  /\brole[- ]based\b/i,
  /\bownership\b/i,
  /\bonly (?:the )?(?:owner|user)\b/i,
  /\bdo(?:es)? not own\b/i,
  /\bforbidden\b/i,
  /\b403\b/,
  /\b401\b/,
  /\bsecret\b/i,
  /\bcredentials?\b/i,
  /\bencrypt(?:ed|ion)?\b/i,
  // Credential storage. A requirement to hash a password is a security
  // requirement; without these the engine treated absent hashing as an
  // ordinary unproven behaviour instead of a blocking absence.
  /\bpasswords?\b/i,
  /\bpassphrase\b/i,
  /\bhash(?:ed|es|ing)?\b/i,
  /\bbcrypt\b/i,
  /\bargon2\b/i,
  /\bscrypt\b/i,
  /\bpbkdf2\b/i,
  /\bauthenticat(?:e|ed|ion)\b/i,
  /\bunauthenticated\b/i,
  /\bapi key\b/i,
];

export function isSecuritySensitiveCriterion(
  criterion: Pick<AcceptanceCriterion, 'text'> | string,
): boolean {
  const text = typeof criterion === 'string' ? criterion : criterion.text;
  return SECURITY_TERMS.some(pattern => pattern.test(text));
}

/**
 * Missing security enforcement is an unsupported completion claim, not merely
 * an unknown one. Other absent implementation evidence is also unsupported;
 * UNVERIFIED is reserved for implementation that exists but lacks observable
 * proof for its behavior.
 *
 * Both cases return the same state, so this reads as a constant. It is kept as
 * a named function because callers are asserting *why* they block, and the
 * security reasoning above is the part worth not losing.
 */
export function stateForAbsentImplementation(_criterionText: string): EvidenceState {
  return 'UNSUPPORTED';
}

export function deriveRequirementState(
  criteria: readonly CriterionAudit[],
): EvidenceState {
  if (criteria.length === 0) return 'UNVERIFIED';
  if (criteria.some(criterion => criterion.state === 'UNSUPPORTED')) {
    return 'UNSUPPORTED';
  }
  if (criteria.some(criterion => criterion.state === 'PARTIAL')) {
    return 'PARTIAL';
  }
  if (criteria.some(criterion => criterion.state === 'UNVERIFIED')) {
    return 'UNVERIFIED';
  }
  return 'SUPPORTED';
}

export function countEvidenceStates(
  requirements: readonly RequirementAudit[],
): EvidenceStateCounts {
  const counts: EvidenceStateCounts = {
    supported: 0,
    partial: 0,
    unsupported: 0,
    unverified: 0,
  };

  for (const requirement of requirements) {
    for (const criterion of requirement.criteria) {
      switch (criterion.state) {
        case 'SUPPORTED': counts.supported++; break;
        case 'PARTIAL': counts.partial++; break;
        case 'UNSUPPORTED': counts.unsupported++; break;
        case 'UNVERIFIED': counts.unverified++; break;
      }
    }
  }

  return counts;
}

export function deriveShipStatus(
  counts: Readonly<EvidenceStateCounts>,
): ShipStatus {
  if (counts.unsupported > 0 || counts.partial > 0) return 'BLOCKED';
  if (counts.unverified > 0) return 'REVIEW_REQUIRED';
  if (counts.supported > 0) return 'READY';
  return 'REVIEW_REQUIRED';
}
