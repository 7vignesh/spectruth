import { describe, it, expect } from 'vitest';
import { buildVerificationPrompt, parseLLMResponse } from '../index.js';
import { createProvider, isKiroSession } from '../provider.js';
import { runStaticChecks } from '../static-checks.js';
import type { AcceptanceCriterion, CodeSnippet, LLMProvider } from '../../types.js';

// ─── Mock LLM Provider ───────────────────────────────────────────────────────

class MockProvider implements LLMProvider {
  name = 'mock';
  private response: string;

  constructor(response: string) {
    this.response = response;
  }

  async verify(_prompt: string): Promise<string> {
    return this.response;
  }
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const SAMPLE_CRITERION: AcceptanceCriterion = {
  id: 'REQ-1-AC-1',
  text: 'WHEN a user provides duplicate email THEN the system SHALL return a 409 error',
  keyword: 'WHEN/THEN',
};

const SAMPLE_SNIPPETS: CodeSnippet[] = [
  {
    filePath: 'src/routes/auth.ts',
    content: `router.post('/register', async (req, res) => {
  const existing = await db.users.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' });
  }
});`,
    startLine: 8,
    endLine: 14,
    language: 'typescript',
  },
];

// ─── Prompt Construction Tests ───────────────────────────────────────────────

describe('buildVerificationPrompt', () => {
  it('includes the criterion text', () => {
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, SAMPLE_SNIPPETS, []);
    expect(prompt).toContain('duplicate email');
    expect(prompt).toContain('409 error');
  });

  it('includes code snippets with file path', () => {
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, SAMPLE_SNIPPETS, []);
    expect(prompt).toContain('src/routes/auth.ts');
    expect(prompt).toContain('status(409)');
  });

  it('includes static analysis evidence', () => {
    const staticResults = [
      { type: 'pattern' as const, found: true, detail: 'Status code 409 found in code', file: 'src/routes/auth.ts', line: 11 },
    ];
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, SAMPLE_SNIPPETS, staticResults);
    expect(prompt).toContain('✓');
    expect(prompt).toContain('Status code 409 found');
  });

  it('requests JSON response format', () => {
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, SAMPLE_SNIPPETS, []);
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"evidence"');
  });

  it('handles empty snippets', () => {
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, [], []);
    expect(prompt).toContain('No relevant code found');
  });
});

// ─── Response Parsing Tests ──────────────────────────────────────────────────

describe('parseLLMResponse', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify({
      verdict: 'PASS',
      confidence: 0.95,
      reason: 'The code returns 409 for duplicate emails',
      evidence: { file: 'src/routes/auth.ts', line: 11, detail: 'res.status(409)' },
      suggestion: null,
    });

    const result = parseLLMResponse(response, SAMPLE_CRITERION, []);
    expect(result.verdict).toBe('PASS');
    expect(result.confidence).toBeCloseTo(0.95, 1);
    expect(result.reason).toContain('409');
    expect(result.evidence.file).toBe('src/routes/auth.ts');
  });

  it('parses JSON wrapped in code blocks', () => {
    const response = '```json\n{"verdict": "FAIL", "confidence": 0.8, "reason": "Not found", "evidence": {"file": "", "line": 0, "detail": "none"}, "suggestion": "Add rate limiting"}\n```';

    const result = parseLLMResponse(response, SAMPLE_CRITERION, []);
    expect(result.verdict).toBe('FAIL');
    expect(result.suggestion).toContain('rate limiting');
  });

  it('handles malformed response with heuristic fallback', () => {
    const response = 'The criterion is not satisfied. The code does not implement this feature.';

    const result = parseLLMResponse(response, SAMPLE_CRITERION, []);
    expect(result.verdict).toBe('FAIL');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('defaults to PARTIAL for ambiguous responses', () => {
    const response = 'Some random text without clear verdict';

    const result = parseLLMResponse(response, SAMPLE_CRITERION, []);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('boosts confidence when static checks agree', () => {
    const response = JSON.stringify({
      verdict: 'PASS',
      confidence: 0.8,
      reason: 'Found the code',
      evidence: { file: 'test.ts', line: 1, detail: 'found' },
      suggestion: null,
    });

    const staticResults = [
      { type: 'pattern' as const, found: true, detail: 'Status code 409 found', file: 'test.ts', line: 1 },
    ];

    const result = parseLLMResponse(response, SAMPLE_CRITERION, staticResults);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('normalizes verdict strings (case-insensitive)', () => {
    const response = JSON.stringify({
      verdict: 'pass',
      confidence: 0.9,
      reason: 'OK',
      evidence: { file: '', line: 0, detail: '' },
    });

    const result = parseLLMResponse(response, SAMPLE_CRITERION, []);
    expect(result.verdict).toBe('PASS');
  });

  it('clamps confidence to [0, 1]', () => {
    const response = JSON.stringify({
      verdict: 'PASS',
      confidence: 1.5,
      reason: 'Very confident',
      evidence: { file: '', line: 0, detail: '' },
    });

    const result = parseLLMResponse(response, SAMPLE_CRITERION, []);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ─── Static Checks Tests ─────────────────────────────────────────────────────

describe('runStaticChecks', () => {
  it('detects status code in snippets', () => {
    const results = runStaticChecks(SAMPLE_CRITERION, SAMPLE_SNIPPETS, '.');
    const statusCheck = results.find(r => r.type === 'pattern');
    expect(statusCheck).toBeDefined();
    expect(statusCheck!.found).toBe(true);
    expect(statusCheck!.detail).toContain('409');
  });

  it('returns empty array when no checks apply', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'The application should be user-friendly',
      keyword: 'plain',
    };
    const results = runStaticChecks(criterion, [], '.');
    // Vague criterion — no static checks apply
    expect(results.length).toBe(0);
  });
});

// ─── Provider Factory Tests ──────────────────────────────────────────────────

describe('provider factory', () => {
  it('isKiroSession returns false when no Kiro env vars set', () => {
    // In test environment, these shouldn't be set
    delete process.env.KIRO_SESSION;
    delete process.env.KIRO_HOME;
    delete process.env.KIRO_API_KEY;
    expect(isKiroSession()).toBe(false);
  });

  it('throws helpful error when no provider is available', () => {
    const originalAnthropic = process.env.ANTHROPIC_API_KEY;
    const originalOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.KIRO_SESSION;

    expect(() => createProvider()).toThrow('No LLM provider detected');

    // Restore
    if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
    if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
  });

  it('throws for explicit unknown provider', () => {
    expect(() => createProvider('unknown')).toThrow('Unknown provider');
  });
});
