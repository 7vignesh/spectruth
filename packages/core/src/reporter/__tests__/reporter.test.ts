import { describe, it, expect } from 'vitest';
import {
  formatTerminalReport,
  formatMatrixReport,
  formatJSONReport,
  formatMatrixJSON,
  formatGitHubAnnotations,
  generateReport,
} from '../index.js';
import type { VerificationReport } from '../../types.js';

// ─── Test Fixture ────────────────────────────────────────────────────────────

const SAMPLE_REPORT: VerificationReport = {
  specTitle: 'User Authentication',
  timestamp: '2026-08-09T14:30:00.000Z',
  codebasePath: '/project/src',
  results: [
    {
      requirement: {
        id: 'REQ-1',
        title: 'create an account',
        userStory: 'As a new user, I want to create an account, so that I can log in.',
        acceptanceCriteria: [
          { id: 'REQ-1-AC-1', text: 'WHEN valid email THEN create account', keyword: 'WHEN/THEN' },
          { id: 'REQ-1-AC-2', text: 'WHEN duplicate email THEN return 409', keyword: 'WHEN/THEN' },
        ],
      },
      criteriaResults: [
        {
          criterion: { id: 'REQ-1-AC-1', text: 'WHEN valid email THEN create account', keyword: 'WHEN/THEN' },
          verdict: 'PASS',
          confidence: 0.95,
          reason: 'Registration endpoint creates users',
          evidence: { file: 'src/routes/auth.ts', line: 12, detail: 'db.users.create' },
        },
        {
          criterion: { id: 'REQ-1-AC-2', text: 'WHEN duplicate email THEN return 409', keyword: 'WHEN/THEN' },
          verdict: 'PASS',
          confidence: 0.9,
          reason: 'Duplicate check returns 409',
          evidence: { file: 'src/routes/auth.ts', line: 19, detail: 'res.status(409)' },
        },
      ],
      overallVerdict: 'PASS',
      score: '2/2 criteria met',
    },
    {
      requirement: {
        id: 'REQ-2',
        title: 'rate limiting on login',
        userStory: 'As an operator, I want rate limiting, so that brute force is blocked.',
        acceptanceCriteria: [
          { id: 'REQ-2-AC-1', text: 'WHEN repeated failed logins THEN throttle requests', keyword: 'WHEN/THEN' },
        ],
      },
      criteriaResults: [
        {
          criterion: { id: 'REQ-2-AC-1', text: 'WHEN repeated failed logins THEN throttle requests', keyword: 'WHEN/THEN' },
          verdict: 'FAIL',
          confidence: 0.85,
          reason: 'No rate limiting middleware found',
          evidence: { file: '', line: 0, detail: 'No matching code found' },
          suggestion: 'Add express-rate-limit middleware to the login route',
        },
      ],
      overallVerdict: 'FAIL',
      score: '0/1 criteria met',
    },
  ],
  summary: {
    totalRequirements: 2,
    passed: 1,
    failed: 1,
    partial: 0,
    overallScore: '2/3 criteria satisfied',
    overallVerdict: 'PARTIAL',
  },
};

/** Strip ANSI codes so assertions are stable regardless of TTY */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Terminal Report Tests ───────────────────────────────────────────────────

describe('formatTerminalReport', () => {
  const output = stripAnsi(formatTerminalReport(SAMPLE_REPORT));

  it('includes the spec title', () => {
    expect(output).toContain('User Authentication');
  });

  it('includes the codebase path', () => {
    expect(output).toContain('/project/src');
  });

  it('lists every requirement id', () => {
    expect(output).toContain('REQ-1');
    expect(output).toContain('REQ-2');
  });

  it('shows per-requirement scores', () => {
    expect(output).toContain('2/2 criteria met');
    expect(output).toContain('0/1 criteria met');
  });

  it('shows evidence file and line for passing criteria', () => {
    expect(output).toContain('src/routes/auth.ts:12');
  });

  it('shows the failure reason for failing criteria', () => {
    expect(output).toContain('No rate limiting middleware found');
  });

  it('shows the remediation suggestion for failures', () => {
    expect(output).toContain('express-rate-limit');
  });

  it('shows summary counts', () => {
    expect(output).toContain('1 passed');
    expect(output).toContain('1 failed');
  });

  it('shows the overall percentage', () => {
    // 2 of 3 criteria = 67%
    expect(output).toContain('67%');
  });

  it('does not print the reason line for passing criteria', () => {
    expect(output).not.toContain('Registration endpoint creates users');
  });
});

// ─── Matrix Report Tests ─────────────────────────────────────────────────────

describe('formatMatrixReport', () => {
  const output = stripAnsi(formatMatrixReport(SAMPLE_REPORT));

  it('renders a header row', () => {
    expect(output).toContain('Requirements Coverage Matrix');
    expect(output).toContain('Status');
    expect(output).toContain('Evidence');
  });

  it('renders one row per requirement', () => {
    expect(output).toContain('REQ-1');
    expect(output).toContain('REQ-2');
  });

  it('shows verdicts', () => {
    expect(output).toContain('PASS');
    expect(output).toContain('FAIL');
  });
});

// ─── JSON Report Tests ───────────────────────────────────────────────────────

describe('formatJSONReport', () => {
  it('produces valid parseable JSON', () => {
    const json = formatJSONReport(SAMPLE_REPORT);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips the report structure', () => {
    const parsed = JSON.parse(formatJSONReport(SAMPLE_REPORT));
    expect(parsed.specTitle).toBe('User Authentication');
    expect(parsed.results).toHaveLength(2);
    expect(parsed.summary.overallVerdict).toBe('PARTIAL');
  });
});

describe('formatMatrixJSON', () => {
  const parsed = JSON.parse(formatMatrixJSON(SAMPLE_REPORT));

  it('flattens criteria into matrix rows', () => {
    expect(parsed.matrix).toHaveLength(3); // 2 + 1 criteria
  });

  it('includes requirement and criterion identifiers on each row', () => {
    expect(parsed.matrix[0].requirementId).toBe('REQ-1');
    expect(parsed.matrix[0].criterionId).toBe('REQ-1-AC-1');
  });

  it('nulls out missing evidence fields', () => {
    const failRow = parsed.matrix.find((r: { status: string }) => r.status === 'FAIL');
    expect(failRow.evidenceFile).toBeNull();
  });

  it('carries the remediation action', () => {
    const failRow = parsed.matrix.find((r: { status: string }) => r.status === 'FAIL');
    expect(failRow.action).toContain('express-rate-limit');
  });
});

// ─── GitHub Annotations Tests ────────────────────────────────────────────────

describe('formatGitHubAnnotations', () => {
  const output = formatGitHubAnnotations(SAMPLE_REPORT);

  it('emits an error annotation for failures', () => {
    expect(output).toContain('::error');
    expect(output).toContain('REQ-2');
  });

  it('does not emit annotations for passing criteria', () => {
    expect(output).not.toContain('REQ-1-AC-1');
  });

  it('emits a notice with the summary', () => {
    expect(output).toContain('::notice');
    expect(output).toContain('2/3 criteria satisfied');
  });
});

// ─── Format Dispatch Tests ───────────────────────────────────────────────────

describe('generateReport', () => {
  it('defaults to terminal format', () => {
    const output = stripAnsi(generateReport(SAMPLE_REPORT));
    expect(output).toContain('SpecTruth');
  });

  it('dispatches to json', () => {
    const output = generateReport(SAMPLE_REPORT, 'json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('dispatches to matrix', () => {
    const output = stripAnsi(generateReport(SAMPLE_REPORT, 'matrix'));
    expect(output).toContain('Coverage Matrix');
  });

  it('dispatches to github', () => {
    const output = generateReport(SAMPLE_REPORT, 'github');
    expect(output).toContain('::error');
  });
});
