import { describe, expect, it } from 'vitest';
import {
  formatGitHubAnnotations,
  formatJSONReport,
  formatMatrixJSON,
  formatMatrixReport,
  formatTerminalReport,
  generateReport,
} from '../index.js';
import type { SpecAuditReport } from '../../types.js';

const SAMPLE_REPORT: SpecAuditReport = {
  scope: { kind: 'spec' },
  specTitle: 'User Authentication',
  timestamp: '2026-08-09T14:30:00.000Z',
  codebasePath: '/project/src',
  requirements: [
    {
      requirement: {
        id: 'REQ-1',
        title: 'create an account',
        userStory: 'As a new user, I want to create an account.',
        acceptanceCriteria: [],
      },
      state: 'SUPPORTED',
      criteria: [
        {
          criterionId: 'REQ-1-AC-1',
          criterionText: 'WHEN valid email THEN create account',
          state: 'SUPPORTED',
          justification: 'The registration endpoint creates a user record.',
          evidence: [{
            source: 'source-code',
            location: { file: 'src/routes/auth.ts', line: 12 },
            observation: 'db.users.create persists the account',
            supports: true,
          }],
          gaps: [],
          repairPreviewAvailable: false,
        },
        {
          criterionId: 'REQ-1-AC-2',
          criterionText: 'WHEN duplicate email THEN return 409',
          state: 'SUPPORTED',
          justification: 'The duplicate branch returns HTTP 409.',
          evidence: [{
            source: 'static-check',
            location: { file: 'src/routes/auth.ts', line: 19 },
            observation: 'Status code 409 is present in the duplicate branch',
            supports: true,
          }],
          gaps: [],
          repairPreviewAvailable: false,
        },
      ],
    },
    {
      requirement: {
        id: 'REQ-2',
        title: 'rate limiting on login',
        userStory: 'As an operator, I want brute-force protection.',
        acceptanceCriteria: [],
      },
      state: 'UNSUPPORTED',
      criteria: [{
        criterionId: 'REQ-2-AC-1',
        criterionText: 'WHEN repeated failed logins THEN throttle requests',
        state: 'UNSUPPORTED',
        justification: 'No rate-limiting middleware or equivalent guard was found.',
        evidence: [],
        gaps: ['Login throttling implementation is absent.'],
        repairPreviewAvailable: true,
      }],
    },
  ],
  summary: {
    totalRequirements: 2,
    totalCriteria: 3,
    states: { supported: 2, partial: 0, unsupported: 1, unverified: 0 },
    shipStatus: 'BLOCKED',
  },
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function expectNoScoringLanguage(output: string): void {
  expect(output.toLowerCase()).not.toContain('confidence');
  expect(output.toLowerCase()).not.toContain('overallscore');
  expect(output.toLowerCase()).not.toContain('completion score');
  expect(output).not.toMatch(/\b\d+(?:\.\d+)?%\b/);
  expect(output).not.toMatch(/\b\d+\/\d+\s+(?:criteria|requirements)\b/i);
}

describe('formatTerminalReport', () => {
  const output = stripAnsi(formatTerminalReport(SAMPLE_REPORT));

  it('includes audit metadata and scope', () => {
    expect(output).toContain('Done Integrity Audit');
    expect(output).toContain('User Authentication');
    expect(output).toContain('/project/src');
    expect(output).toContain('full spec');
  });

  it('renders every evidence state finding and its justification', () => {
    expect(output).toContain('REQ-1-AC-1');
    expect(output).toContain('SUPPORTED');
    expect(output).toContain('REQ-2-AC-1');
    expect(output).toContain('UNSUPPORTED');
    expect(output).toContain('registration endpoint creates a user');
    expect(output).toContain('No rate-limiting middleware');
  });

  it('renders evidence, gaps, and approval-gated repair availability', () => {
    expect(output).toContain('src/routes/auth.ts:12');
    expect(output).toContain('db.users.create');
    expect(output).toContain('Login throttling implementation is absent');
    expect(output).toContain('explicit approval required');
  });

  it('renders state counts and ship status', () => {
    expect(output).toContain('2 supported');
    expect(output).toContain('1 unsupported');
    expect(output).toContain('SHIP DECISION');
    expect(output).toContain('BLOCKED');
  });

  it('contains no confidence percentage or arbitrary completion score', () => {
    expectNoScoringLanguage(output);
  });
});

describe('formatMatrixReport', () => {
  const output = stripAnsi(formatMatrixReport(SAMPLE_REPORT));

  it('renders one truth-map row per criterion', () => {
    expect(output).toContain('Done Integrity Truth Map');
    expect(output).toContain('REQ-1-AC-1');
    expect(output).toContain('REQ-1-AC-2');
    expect(output).toContain('REQ-2-AC-1');
  });

  it('includes state, justification, evidence, gaps, and ship decision', () => {
    expect(output).toContain('State');
    expect(output).toContain('Justification');
    expect(output).toContain('Evidence');
    expect(output).toContain('Gaps');
    expect(output).toContain('BLOCKED');
  });

  it('contains no confidence percentage or arbitrary completion score', () => {
    expectNoScoringLanguage(output);
  });
});

describe('JSON reporters', () => {
  it('round-trips the complete audit report', () => {
    const parsed = JSON.parse(formatJSONReport(SAMPLE_REPORT));
    expect(parsed).toEqual(SAMPLE_REPORT);
    expect(parsed.summary.shipStatus).toBe('BLOCKED');
  });

  it('flattens criteria without dropping integrity evidence', () => {
    const parsed = JSON.parse(formatMatrixJSON(SAMPLE_REPORT));
    expect(parsed.truthMap).toHaveLength(3);
    const unsupported = parsed.truthMap.find(
      (row: { state: string }) => row.state === 'UNSUPPORTED',
    );
    expect(unsupported.justification).toContain('rate-limiting');
    expect(unsupported.gaps).toEqual(['Login throttling implementation is absent.']);
    expect(unsupported.repairPreviewAvailable).toBe(true);
  });

  it('contains no confidence percentage or arbitrary completion score', () => {
    expectNoScoringLanguage(formatJSONReport(SAMPLE_REPORT));
    expectNoScoringLanguage(formatMatrixJSON(SAMPLE_REPORT));
  });
});

describe('formatGitHubAnnotations', () => {
  const output = formatGitHubAnnotations(SAMPLE_REPORT);

  it('emits errors for blocking findings but not supported findings', () => {
    expect(output).toContain('::error');
    expect(output).toContain('REQ-2-AC-1');
    expect(output).not.toContain('REQ-1-AC-1');
  });

  it('emits the ship decision and state counts', () => {
    expect(output).toContain('::notice');
    expect(output).toContain('BLOCKED');
    expect(output).toContain('2 supported');
  });
});

describe('generateReport', () => {
  it('defaults to terminal and dispatches each requested format', () => {
    expect(stripAnsi(generateReport(SAMPLE_REPORT))).toContain('SpecTruth');
    expect(() => JSON.parse(generateReport(SAMPLE_REPORT, 'json'))).not.toThrow();
    expect(stripAnsi(generateReport(SAMPLE_REPORT, 'matrix'))).toContain('Truth Map');
    expect(generateReport(SAMPLE_REPORT, 'github')).toContain('::error');
  });
});
