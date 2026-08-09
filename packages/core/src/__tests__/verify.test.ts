import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  verify,
  loadSpec,
  validateCodePath,
  buildReport,
  reportToExitCode,
  SpecTruthError,
} from '../verify.js';
import type { LLMProvider, ParsedSpec, RequirementResult, VerificationReport } from '../types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const SPEC_PATH = join(FIXTURES, 'sample-spec.md');
const NO_REQ_SPEC_PATH = join(FIXTURES, 'no-requirements.md');
const CODE_PATH = join(FIXTURES, 'sample-code');

// ─── Mock Provider ───────────────────────────────────────────────────────────

/** Returns a fixed verdict for every criterion. */
function mockProvider(verdict: 'PASS' | 'FAIL' | 'PARTIAL'): LLMProvider {
  return {
    name: 'mock',
    async verify(): Promise<string> {
      return JSON.stringify({
        verdict,
        confidence: 0.9,
        reason: `Mock verdict: ${verdict}`,
        evidence: { file: 'register.js', line: 5, detail: 'mock evidence' },
        suggestion: verdict === 'PASS' ? null : 'Mock remediation task',
      });
    },
  };
}

// ─── loadSpec ────────────────────────────────────────────────────────────────

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

  it('throws SPEC_NO_REQUIREMENTS when the spec has no requirements', () => {
    try {
      loadSpec(NO_REQ_SPEC_PATH);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SpecTruthError).code).toBe('SPEC_NO_REQUIREMENTS');
    }
  });
});

// ─── validateCodePath ────────────────────────────────────────────────────────

describe('validateCodePath', () => {
  it('returns an absolute path for a valid directory', () => {
    const resolved = validateCodePath(CODE_PATH);
    expect(resolved).toContain('sample-code');
  });

  it('throws CODE_PATH_NOT_FOUND for a missing directory', () => {
    try {
      validateCodePath(join(FIXTURES, 'nope'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SpecTruthError).code).toBe('CODE_PATH_NOT_FOUND');
    }
  });

  it('throws CODE_PATH_NOT_DIRECTORY when given a file', () => {
    try {
      validateCodePath(SPEC_PATH);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SpecTruthError).code).toBe('CODE_PATH_NOT_DIRECTORY');
    }
  });
});

// ─── verify (end-to-end with mock LLM) ───────────────────────────────────────

describe('verify', () => {
  it('produces a full report when everything passes', async () => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('PASS'),
    });

    expect(report.specTitle).toBe('Sample Feature');
    expect(report.results).toHaveLength(1);
    expect(report.summary.totalRequirements).toBe(1);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.overallVerdict).toBe('PASS');
    expect(report.summary.overallScore).toBe('2/2 criteria satisfied');
  });

  it('marks the requirement FAIL when all criteria fail', async () => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('FAIL'),
    });

    expect(report.summary.failed).toBe(1);
    expect(report.summary.overallVerdict).toBe('FAIL');
    expect(report.summary.overallScore).toBe('0/2 criteria satisfied');
  });

  it('carries remediation suggestions through to the report', async () => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('FAIL'),
    });

    const suggestions = report.results[0].criteriaResults.map(cr => cr.suggestion);
    expect(suggestions.every(s => s === 'Mock remediation task')).toBe(true);
  });

  it('invokes onProgress once per requirement', async () => {
    const seen: string[] = [];

    await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('PASS'),
      onProgress: (result: RequirementResult) => {
        seen.push(result.requirement.id);
      },
    });

    expect(seen).toEqual(['REQ-1']);
  });

  it('includes an ISO timestamp', async () => {
    const report = await verify({
      specPath: SPEC_PATH,
      codePath: CODE_PATH,
      llmProvider: mockProvider('PASS'),
    });

    expect(() => new Date(report.timestamp).toISOString()).not.toThrow();
  });

  it('propagates spec errors before touching the LLM', async () => {
    await expect(
      verify({
        specPath: join(FIXTURES, 'missing.md'),
        codePath: CODE_PATH,
        llmProvider: mockProvider('PASS'),
      })
    ).rejects.toThrow(SpecTruthError);
  });
});

// ─── buildReport ─────────────────────────────────────────────────────────────

describe('buildReport', () => {
  const spec: ParsedSpec = {
    title: 'Aggregation Spec',
    introduction: '',
    requirements: [],
  };

  function makeResult(verdict: 'PASS' | 'FAIL' | 'PARTIAL', id: string): RequirementResult {
    const criterion = { id: `${id}-AC-1`, text: 'something', keyword: 'plain' as const };
    return {
      requirement: { id, title: id, userStory: '', acceptanceCriteria: [criterion] },
      criteriaResults: [
        {
          criterion,
          verdict,
          confidence: 0.9,
          reason: 'x',
          evidence: { file: 'a.ts', line: 1, detail: 'x' },
        },
      ],
      overallVerdict: verdict,
      score: verdict === 'PASS' ? '1/1 criteria met' : '0/1 criteria met',
    };
  }

  it('reports PASS only when every requirement passes', () => {
    const report = buildReport(spec, '/code', [makeResult('PASS', 'REQ-1'), makeResult('PASS', 'REQ-2')]);
    expect(report.summary.overallVerdict).toBe('PASS');
  });

  it('reports FAIL when nothing passes and nothing is partial', () => {
    const report = buildReport(spec, '/code', [makeResult('FAIL', 'REQ-1'), makeResult('FAIL', 'REQ-2')]);
    expect(report.summary.overallVerdict).toBe('FAIL');
  });

  it('reports PARTIAL for a mix of pass and fail', () => {
    const report = buildReport(spec, '/code', [makeResult('PASS', 'REQ-1'), makeResult('FAIL', 'REQ-2')]);
    expect(report.summary.overallVerdict).toBe('PARTIAL');
  });

  it('reports PARTIAL when any requirement is partial', () => {
    const report = buildReport(spec, '/code', [makeResult('PARTIAL', 'REQ-1')]);
    expect(report.summary.overallVerdict).toBe('PARTIAL');
  });

  it('counts criteria across all requirements', () => {
    const report = buildReport(spec, '/code', [
      makeResult('PASS', 'REQ-1'),
      makeResult('FAIL', 'REQ-2'),
      makeResult('PASS', 'REQ-3'),
    ]);
    expect(report.summary.overallScore).toBe('2/3 criteria satisfied');
  });

  it('handles an empty result set', () => {
    const report = buildReport(spec, '/code', []);
    expect(report.summary.totalRequirements).toBe(0);
    expect(report.summary.overallScore).toBe('0/0 criteria satisfied');
    expect(report.summary.overallVerdict).toBe('PASS');
  });
});

// ─── reportToExitCode ────────────────────────────────────────────────────────

describe('reportToExitCode', () => {
  function reportWithVerdict(verdict: 'PASS' | 'FAIL' | 'PARTIAL'): VerificationReport {
    return {
      specTitle: 'x',
      timestamp: new Date().toISOString(),
      codebasePath: '/code',
      results: [],
      summary: {
        totalRequirements: 1,
        passed: verdict === 'PASS' ? 1 : 0,
        failed: verdict === 'FAIL' ? 1 : 0,
        partial: verdict === 'PARTIAL' ? 1 : 0,
        overallScore: '0/1 criteria satisfied',
        overallVerdict: verdict,
      },
    };
  }

  it('returns 0 on PASS', () => {
    expect(reportToExitCode(reportWithVerdict('PASS'))).toBe(0);
  });

  it('returns 1 on FAIL', () => {
    expect(reportToExitCode(reportWithVerdict('FAIL'))).toBe(1);
  });

  it('returns 1 on PARTIAL', () => {
    expect(reportToExitCode(reportWithVerdict('PARTIAL'))).toBe(1);
  });
});
