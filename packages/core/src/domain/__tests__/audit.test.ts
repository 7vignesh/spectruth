import { describe, expect, it } from 'vitest';
import { createCriterionAudit, EVIDENCE_STATES } from '../audit.js';
import {
  countEvidenceStates,
  deriveRequirementState,
  deriveShipStatus,
  isSecuritySensitiveCriterion,
  SHIP_STATUSES,
  stateForAbsentImplementation,
} from '../policy.js';
import type {
  EvidenceState,
  EvidenceStateCounts,
  Requirement,
  RequirementAudit,
  SpecAuditReport,
} from '../../types.js';

const requirement: Requirement = {
  id: 'REQ-1',
  title: 'Protected records',
  userStory: 'As a user, I can access my records.',
  acceptanceCriteria: [],
};

function criterion(state: EvidenceState, justification = `${state} because evidence was adjudicated`) {
  return createCriterionAudit({
    criterionId: `AC-${state}`,
    criterionText: 'The system SHALL enforce the specified behavior',
    state,
    justification,
    evidence: [{
      source: 'source-code',
      location: { file: 'src/service.ts', line: 8 },
      observation: 'The relevant branch is present',
      supports: state === 'SUPPORTED',
    }],
    gaps: state === 'SUPPORTED' ? [] : ['Additional proof is required'],
  });
}

function counts(overrides: Partial<EvidenceStateCounts>): EvidenceStateCounts {
  return { supported: 0, partial: 0, unsupported: 0, unverified: 0, ...overrides };
}

describe('Done Integrity domain model', () => {
  it('defines exactly the four approved evidence states', () => {
    expect(EVIDENCE_STATES).toEqual([
      'SUPPORTED',
      'PARTIAL',
      'UNSUPPORTED',
      'UNVERIFIED',
    ]);
    expect(new Set(EVIDENCE_STATES).size).toBe(4);
  });

  it.each(EVIDENCE_STATES)('creates a validated %s finding', state => {
    const finding = criterion(state);
    expect(finding.state).toBe(state);
    expect(finding.justification.length).toBeGreaterThan(0);
  });

  it('defines exactly three ship statuses and READY occurs once', () => {
    expect(SHIP_STATUSES).toEqual(['READY', 'REVIEW_REQUIRED', 'BLOCKED']);
    expect(SHIP_STATUSES).toHaveLength(3);
    expect(SHIP_STATUSES.filter(status => status === 'READY')).toHaveLength(1);
  });

  it.each(['', ' ', '\n\t'])('rejects an empty justification (%j)', justification => {
    expect(() => criterion('SUPPORTED', justification)).toThrow(/non-empty justification/i);
  });

  it('rejects evidence with an empty observation', () => {
    expect(() => createCriterionAudit({
      criterionId: 'AC-1',
      criterionText: 'A criterion',
      state: 'SUPPORTED',
      justification: 'A valid reason',
      evidence: [{ source: 'source-code', observation: '  ', supports: true }],
    })).toThrow(/observation/i);
  });

  it('serializes and deserializes without losing evidence semantics', () => {
    const audit = criterion('PARTIAL');
    expect(JSON.parse(JSON.stringify(audit))).toEqual(audit);
  });
});

describe('ship policy', () => {
  it('maps all supported evidence to READY', () => {
    expect(deriveShipStatus(counts({ supported: 3 }))).toBe('READY');
  });

  it('maps any partial evidence to BLOCKED', () => {
    expect(deriveShipStatus(counts({ supported: 2, partial: 1 }))).toBe('BLOCKED');
  });

  it('maps any unsupported evidence to BLOCKED', () => {
    expect(deriveShipStatus(counts({ supported: 2, unsupported: 1 }))).toBe('BLOCKED');
  });

  it('maps supported plus unverified evidence to REVIEW_REQUIRED', () => {
    expect(deriveShipStatus(counts({ supported: 2, unverified: 1 }))).toBe('REVIEW_REQUIRED');
  });

  it('does not call an empty audit READY', () => {
    expect(deriveShipStatus(counts({}))).toBe('REVIEW_REQUIRED');
  });

  it('aggregates requirement state with blocking evidence first', () => {
    expect(deriveRequirementState([criterion('SUPPORTED'), criterion('UNVERIFIED')]))
      .toBe('UNVERIFIED');
    expect(deriveRequirementState([criterion('SUPPORTED'), criterion('PARTIAL')]))
      .toBe('PARTIAL');
    expect(deriveRequirementState([criterion('PARTIAL'), criterion('UNSUPPORTED')]))
      .toBe('UNSUPPORTED');
  });

  it('counts every criterion evidence state', () => {
    const requirements: RequirementAudit[] = [{
      requirement,
      state: 'UNSUPPORTED',
      criteria: EVIDENCE_STATES.map(state => criterion(state)),
    }];
    expect(countEvidenceStates(requirements)).toEqual({
      supported: 1,
      partial: 1,
      unsupported: 1,
      unverified: 1,
    });
  });

  it('classifies missing authorization enforcement as UNSUPPORTED and BLOCKED', () => {
    const text = 'The system SHALL verify record ownership before allowing deletion';
    expect(isSecuritySensitiveCriterion(text)).toBe(true);
    const state = stateForAbsentImplementation(text);
    expect(state).toBe('UNSUPPORTED');
    expect(deriveShipStatus(counts({ unsupported: 1 }))).toBe('BLOCKED');
  });

  /**
   * Credential storage was previously not recognised as security-sensitive, so
   * a criterion requiring bcrypt hashing was adjudicated as an ordinary
   * unproven behaviour instead of a blocking absence.
   */
  it('treats credential storage criteria as security-sensitive', () => {
    const texts = [
      'WHEN a user registers THEN the system SHALL hash the password using bcrypt',
      'The system SHALL store passwords using argon2',
      'WHEN a request is unauthenticated THEN the system SHALL return 401',
      'WHEN credentials do not match THEN the system SHALL refuse the request',
      'The system SHALL reject an invalid api key',
    ];

    for (const text of texts) {
      expect(isSecuritySensitiveCriterion(text), text).toBe(true);
      expect(stateForAbsentImplementation(text)).toBe('UNSUPPORTED');
    }
  });

  it('does not treat ordinary behaviour criteria as security-sensitive', () => {
    const texts = [
      'WHEN a client requests the log THEN the system SHALL return at most 50 entries per page',
      'WHEN a record is created THEN the system SHALL return 201',
    ];

    for (const text of texts) {
      expect(isSecuritySensitiveCriterion(text), text).toBe(false);
    }
  });

  it('round-trips a complete report with its ship decision intact', () => {
    const finding = criterion('UNVERIFIED');
    const report: SpecAuditReport = {
      scope: { kind: 'spec' },
      specTitle: 'Serialization spec',
      timestamp: '2026-08-09T14:30:00.000Z',
      codebasePath: '/project',
      requirements: [{ requirement, state: 'UNVERIFIED', criteria: [finding] }],
      summary: {
        totalRequirements: 1,
        totalCriteria: 1,
        states: counts({ unverified: 1 }),
        shipStatus: 'REVIEW_REQUIRED',
      },
    };
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
