import { describe, expect, it } from 'vitest';
import { buildVerificationPrompt, parseLLMResponse } from '../index.js';
import { createProvider, isKiroSession } from '../provider.js';
import { runStaticChecks } from '../static-checks.js';
import type { AcceptanceCriterion, CodeSnippet, LLMProvider } from '../../types.js';

class MockProvider implements LLMProvider {
  name = 'mock';
  constructor(private readonly response: string) {}
  async verify(_prompt: string): Promise<string> {
    return this.response;
  }
}

const SAMPLE_CRITERION: AcceptanceCriterion = {
  id: 'REQ-1-AC-1',
  text: 'WHEN a user provides duplicate email THEN the system SHALL return a 409 error',
  keyword: 'WHEN/THEN',
};

const SAMPLE_SNIPPETS: CodeSnippet[] = [{
  filePath: 'src/routes/auth.ts',
  content: `router.post('/register', async (req, res) => {
  const existing = await db.users.findByEmail(email);
  if (existing) return res.status(409).json({ error: 'Email already exists' });
});`,
  startLine: 8,
  endLine: 12,
  language: 'typescript',
}];

const staticEvidence = [{
  type: 'pattern' as const,
  found: true,
  detail: 'Status code 409 found in code',
  file: 'src/routes/auth.ts',
  line: 10,
}];

describe('buildVerificationPrompt', () => {
  it('includes criterion, source, and static evidence', () => {
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, SAMPLE_SNIPPETS, staticEvidence);
    expect(prompt).toContain('duplicate email');
    expect(prompt).toContain('src/routes/auth.ts');
    expect(prompt).toContain('Status code 409 found');
  });

  it('requests the four-state evidence response shape', () => {
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, SAMPLE_SNIPPETS, []);
    expect(prompt).toContain('"state"');
    expect(prompt).toContain('"justification"');
    expect(prompt).toContain('"evidence"');
    expect(prompt).toContain('"gaps"');
    expect(prompt).toContain('UNVERIFIED');
  });

  it('forbids confidence and completion scoring', () => {
    const prompt = buildVerificationPrompt(SAMPLE_CRITERION, SAMPLE_SNIPPETS, []);
    expect(prompt).toContain('Do not use confidence values');
    expect(prompt).toContain('completion scores');
  });

  it('handles empty snippets', () => {
    expect(buildVerificationPrompt(SAMPLE_CRITERION, [], []))
      .toContain('No relevant code found');
  });
});

describe('parseLLMResponse', () => {
  it('parses a supported result with evidence and no confidence field', () => {
    const response = JSON.stringify({
      state: 'SUPPORTED',
      justification: 'The duplicate branch returns 409.',
      evidence: [{
        source: 'source-code',
        location: { file: 'src/routes/auth.ts', line: 10 },
        observation: 'The duplicate branch calls res.status(409)',
        supports: true,
      }],
      gaps: [],
    });
    const result = parseLLMResponse(response, SAMPLE_CRITERION, staticEvidence);
    expect(result.state).toBe('SUPPORTED');
    expect(result.justification).toContain('returns 409');
    expect(result.evidence.some(item => item.source === 'source-code')).toBe(true);
    expect(result.evidence.some(item => item.source === 'static-check')).toBe(true);
    expect(result).not.toHaveProperty('confidence');
  });

  it('parses JSON wrapped in a markdown block', () => {
    const response = '```json\n{"state":"UNSUPPORTED","justification":"No duplicate check is present.","evidence":[],"gaps":["Missing duplicate lookup"]}\n```';
    const result = parseLLMResponse(response, SAMPLE_CRITERION, []);
    expect(result.state).toBe('UNSUPPORTED');
    expect(result.gaps).toEqual(['Missing duplicate lookup']);
  });

  it('normalizes evidence-state casing', () => {
    const response = JSON.stringify({
      state: 'partial',
      justification: 'The lookup exists, but no 409 response is returned.',
      evidence: [],
      gaps: ['Missing status response'],
    });
    expect(parseLLMResponse(response, SAMPLE_CRITERION, []).state).toBe('PARTIAL');
  });

  it('uses an explicit state token from malformed output', () => {
    const result = parseLLMResponse(
      'The available evidence is UNSUPPORTED because no handler exists.',
      SAMPLE_CRITERION,
      [],
    );
    expect(result.state).toBe('UNSUPPORTED');
    expect(result.justification).toContain('malformed');
  });

  it('defaults malformed ambiguous output to UNVERIFIED', () => {
    const result = parseLLMResponse('Some ambiguous prose', SAMPLE_CRITERION, []);
    expect(result.state).toBe('UNVERIFIED');
    expect(result.gaps).toHaveLength(1);
  });

  it('does not accept an empty adjudicator justification', () => {
    const result = parseLLMResponse(JSON.stringify({
      state: 'SUPPORTED',
      justification: ' ',
      evidence: [],
      gaps: [],
    }), SAMPLE_CRITERION, []);
    expect(result.state).toBe('SUPPORTED');
    expect(result.justification).toContain('malformed');
  });
});

describe('runStaticChecks', () => {
  it('detects status code in snippets', () => {
    const results = runStaticChecks(SAMPLE_CRITERION, SAMPLE_SNIPPETS, '.');
    const statusCheck = results.find(result => result.type === 'pattern');
    expect(statusCheck?.found).toBe(true);
    expect(statusCheck?.detail).toContain('409');
  });

  it('returns no checks for a vague criterion', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'The application should be user-friendly',
      keyword: 'plain',
    };
    expect(runStaticChecks(criterion, [], '.')).toEqual([]);
  });
});

describe('provider factory', () => {
  it('isKiroSession returns false when no Kiro env vars are set', () => {
    delete process.env.KIRO_SESSION;
    delete process.env.KIRO_HOME;
    delete process.env.KIRO_API_KEY;
    expect(isKiroSession()).toBe(false);
  });

  it('throws a helpful error when no provider is available', () => {
    const originalAnthropic = process.env.ANTHROPIC_API_KEY;
    const originalOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.KIRO_SESSION;
    expect(() => createProvider()).toThrow('No LLM provider detected');
    if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
    if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
  });

  it('throws for an explicit unknown provider', () => {
    expect(() => createProvider('unknown')).toThrow('Unknown provider');
  });

  it('accepts an LLMProvider implementation without score concepts', async () => {
    const provider = new MockProvider('{"state":"UNVERIFIED"}');
    expect(await provider.verify('prompt')).toContain('UNVERIFIED');
  });
});
