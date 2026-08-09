import { describe, expect, it } from 'vitest';
import { join } from 'path';
import {
  buildReport,
  loadSpec,
  reportToExitCode,
  SpecTruthError,
  validateCodePath,
  verify,
} from '../verify.js';
import { createCriterionAudit } from '../domain/audit.js';
import type {
  EvidenceState,
  LLMProvider,
  ParsedSpec,
  RequirementAudit,
  ShipStatus,
  SpecAuditReport,
} from '../types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const SPEC_PATH = join(FIXTURES, 'sample-spec.md');
const NO_REQ_SPEC_PATH = join(FIXTURES, 'no-requirements.md');
const CODE_PATH = join(FIXTURES, 'sample-code');

function mockProvider(state: EvidenceState): LLMProvider {
  return {
    name: 'mock',
    async verify(): Promise<string> {
      return JSON.stringify({
        state,
        justification: `Mock evidence supports state ${state}`,
        evidence: [{
          source: 'source-code',
          location: { file: 'register.js', line: 5 },
          observation: 'Mock source observation',
          supports: state === 'SUPPORTED',
        }],
        gaps: state === 'SUPPORTED' ? [] : ['Mock evidence gap'],
      });
    },
  };
}

describe('loadSpec', () => {
  it('parses a valid spec file', () => {
    const spec = loadSpec(SPEC_PATH);
    expect(spec.title).toBe('Sample Feature');
    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0].acceptanceCriteria).toHaveLength(2);
  });

  it('throws SPEC_NOT_FOUND for a missing file', () => {
    try {
      loadSpec(join(FIXTURES, 'does-not-exist.md'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SpecTruthError);
      expect((error as SpecTruthError).code).toBe('SPEC_NOT_FOUND');
      expect((error as SpecTruthError).hint).toBeTruthy();
    }
  });

  it('throws SPEC_NO_REQUIREMENTS for a spec without requirements', () => {
    expect(() => loadSpec(NO_REQ_SPEC_PATH)).toThrowError(
      expect.objectContaining({ code: 'SPEC_NO_REQUIREMENTS' }),
    );
  });
});

describe('validateCodePath', () => {
  it('returns an absolute path for a valid directory', () => {
    expect(validateCodePath(CODE_PATH)).toContain('sample-code');
  });

  it('throws CODE_PATH_NOT_FOUND for a missing directory', () => {
    try {
      validateCodePath(join(FIXTURES, 'nope'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SpecTruthError).code).toBe('CODE_PATH_NOT_FOUND');
    }
  });

  it('throws CODE_PATH_NOT_DIRECTORY for a file', () => {
    try {
      validateCodePath(SPEC_PATH);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SpecTruthError).code).toBe('CODE_PATH_NOT_DIRECTORY');
    }
  });
});

describe('verify', () => {
  it('produces READY only when all criteria are supported', async () => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('SUPPORTED'),
    });
    expect(report.scope).toEqual({ kind: 'spec' });
    expect(report.specTitle).toBe('Sample Feature');
    expect(report.requirements).toHaveLength(1);
    expect(report.summary.totalRequirements).toBe(1);
    expect(report.summary.totalCriteria).toBe(2);
    expect(report.summary.states.supported).toBe(2);
    expect(report.summary.shipStatus).toBe('READY');
  });

  it.each([
    ['PARTIAL', 'BLOCKED'],
    ['UNSUPPORTED', 'BLOCKED'],
    ['UNVERIFIED', 'REVIEW_REQUIRED'],
  ] as const)('maps %s findings to %s', async (state, shipStatus) => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider(state),
    });
    expect(report.summary.shipStatus).toBe(shipStatus);
    expect(report.requirements[0].criteria.every(item => item.state === state)).toBe(true);
  });

  it('carries evidence gaps into the report', async () => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('PARTIAL'),
    });
    expect(report.requirements[0].criteria.every(item =>
      item.gaps.includes('Mock evidence gap'),
    )).toBe(true);
  });

  it('invokes onProgress once per requirement', async () => {
    const seen: string[] = [];
    await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('SUPPORTED'),
      onProgress: (result: RequirementAudit) => seen.push(result.requirement.id),
    });
    expect(seen).toEqual(['REQ-1']);
  });

  it('includes an ISO timestamp', async () => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('SUPPORTED'),
    });
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });

  it('propagates spec errors before touching the LLM', async () => {
    await expect(verify({
      specPath: join(FIXTURES, 'missing.md'),
      codePath: CODE_PATH,
      llmProvider: mockProvider('SUPPORTED'),
    })).rejects.toThrow(SpecTruthError);
  });
});

describe('buildReport', () => {
  const spec: ParsedSpec = { title: 'Aggregation Spec', introduction: '', requirements: [] };

  function makeResult(state: EvidenceState, id: string): RequirementAudit {
    const criterion = createCriterionAudit({
      criterionId: `${id}-AC-1`,
      criterionText: 'The behavior is implemented',
      state,
      justification: `Evidence adjudicated as ${state}`,
      evidence: [],
      gaps: [],
      repairPreviewAvailable: false,
    });
    return {
      requirement: {
        id,
        title: id,
        userStory: '',
        acceptanceCriteria: [],
      },
      state,
      criteria: [criterion],
    };
  }

  it('aggregates all four evidence-state counts', () => {
    const report = buildReport(spec, '/code', [
      makeResult('SUPPORTED', 'REQ-1'),
      makeResult('PARTIAL', 'REQ-2'),
      makeResult('UNSUPPORTED', 'REQ-3'),
      makeResult('UNVERIFIED', 'REQ-4'),
    ]);
    expect(report.summary.states).toEqual({
      supported: 1,
      partial: 1,
      unsupported: 1,
      unverified: 1,
    });
    expect(report.summary.totalCriteria).toBe(4);
    expect(report.summary.shipStatus).toBe('BLOCKED');
  });

  it('does not treat an empty result set as READY', () => {
    const report = buildReport(spec, '/code', []);
    expect(report.summary.totalRequirements).toBe(0);
    expect(report.summary.totalCriteria).toBe(0);
    expect(report.summary.shipStatus).toBe('REVIEW_REQUIRED');
  });
});

describe('reportToExitCode', () => {
  function reportWithStatus(shipStatus: ShipStatus): SpecAuditReport {
    return {
      scope: { kind: 'spec' },
      specTitle: 'x',
      timestamp: new Date().toISOString(),
      codebasePath: '/code',
      requirements: [],
      summary: {
        totalRequirements: 0,
        totalCriteria: 0,
        states: { supported: 0, partial: 0, unsupported: 0, unverified: 0 },
        shipStatus,
      },
    };
  }

  it('returns zero only for READY', () => {
    expect(reportToExitCode(reportWithStatus('READY'))).toBe(0);
    expect(reportToExitCode(reportWithStatus('BLOCKED'))).toBe(1);
    expect(reportToExitCode(reportWithStatus('REVIEW_REQUIRED'))).toBe(1);
  });
});
