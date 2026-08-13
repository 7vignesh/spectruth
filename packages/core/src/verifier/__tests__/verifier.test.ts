import { describe, expect, it } from 'vitest';
import { buildVerificationPrompt, parseLLMResponse } from '../index.js';
import { createProvider, isKiroSession } from '../provider.js';
import { maskComments, runStaticChecks, scopeToSubject } from '../static-checks.js';
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
  strength: 'specific' as const,
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

  /**
   * Reporting cites the first supporting evidence, so the check that names the
   * required behaviour must come before the one that merely proves a route
   * exists. Otherwise a repaired criterion cites the route instead of the fix.
   */
  it('orders the status code check ahead of the route check', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'WHEN a user cannot delete a record THEN the system SHALL return 403',
      keyword: 'WHEN/THEN',
    };
    const snippets: CodeSnippet[] = [{
      filePath: 'src/records.ts',
      content: "router.delete('/records/:id', (req, res) => res.status(403).send());",
      startLine: 1,
      endLine: 1,
      language: 'typescript',
    }];

    const results = runStaticChecks(criterion, snippets, '.');
    const statusIndex = results.findIndex(result => result.type === 'pattern');
    const routeIndex = results.findIndex(result => result.type === 'route');

    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(routeIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeLessThan(routeIndex);
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

/**
 * These guard the defect where a criterion requiring bcrypt password hashing
 * was reported SUPPORTED because a POST route existed. Route presence locates
 * a behaviour; it never demonstrates one.
 */
describe('static check evidence strength', () => {
  const routeOnlySnippets: CodeSnippet[] = [{
    filePath: 'src/register.ts',
    content: "router.post('/register', (req, res) => { accounts.push({ email, password }); return res.status(201).json({}); });",
    startLine: 1,
    endLine: 1,
    language: 'typescript',
  }];

  it('marks a route definition as corroborating, never specific', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'WHEN a user registers via POST /register THEN the system SHALL persist the account',
      keyword: 'WHEN/THEN',
    };

    const route = runStaticChecks(criterion, routeOnlySnippets, '.')
      .find(result => result.type === 'route');

    expect(route?.found).toBe(true);
    expect(route?.strength).toBe('corroborating');
  });

  it('reports a named technique as absent when it appears nowhere', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'WHEN a user registers via POST /register THEN the system SHALL hash the password using bcrypt',
      keyword: 'WHEN/THEN',
    };

    const results = runStaticChecks(criterion, routeOnlySnippets, '.');
    const technique = results.find(result => result.type === 'technique');

    expect(technique?.found).toBe(false);
    expect(technique?.strength).toBe('specific');
    expect(technique?.detail).toMatch(/bcrypt/i);

    // The route is still found — which is exactly why route evidence alone
    // must not be allowed to carry the criterion.
    expect(results.find(result => result.type === 'route')?.found).toBe(true);
  });

  it('reports a named technique as present when the code uses it', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'WHEN a user registers THEN the system SHALL hash the password using bcrypt',
      keyword: 'WHEN/THEN',
    };
    const snippets: CodeSnippet[] = [{
      filePath: 'src/register.ts',
      content: "const digest = await bcrypt.hash(password, 10);",
      startLine: 4,
      endLine: 4,
      language: 'typescript',
    }];

    const technique = runStaticChecks(criterion, snippets, '.')
      .find(result => result.type === 'technique');

    expect(technique?.found).toBe(true);
    expect(technique?.strength).toBe('specific');
  });

  it('does not read an HTTP verb out of an unrelated word', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'WHEN the budget is exceeded THEN the system SHALL notify the owner',
      keyword: 'WHEN/THEN',
    };

    const results = runStaticChecks(criterion, routeOnlySnippets, '.');

    expect(results.find(result => result.type === 'route')).toBeUndefined();
  });

  it('detects a stated numeric limit as specific evidence', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'WHEN a client requests the log THEN the system SHALL return at most 50 entries per page',
      keyword: 'WHEN/THEN',
    };
    const snippets: CodeSnippet[] = [{
      filePath: 'src/audit.ts',
      content: 'const PAGE_SIZE = 50;',
      startLine: 3,
      endLine: 3,
      language: 'typescript',
    }];

    const limit = runStaticChecks(criterion, snippets, '.')
      .find(result => result.type === 'limit');

    expect(limit?.found).toBe(true);
    expect(limit?.strength).toBe('specific');
  });

  it('reports a stated numeric limit as absent when the code omits it', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-1-AC-1',
      text: 'WHEN a client requests the log THEN the system SHALL return at most 50 entries per page',
      keyword: 'WHEN/THEN',
    };
    const snippets: CodeSnippet[] = [{
      filePath: 'src/audit.ts',
      content: 'return res.json({ entries: all });',
      startLine: 3,
      endLine: 3,
      language: 'typescript',
    }];

    expect(
      runStaticChecks(criterion, snippets, '.').find(result => result.type === 'limit')?.found,
    ).toBe(false);
  });
});

/**
 * Commentary is documentation, and documentation is not evidence. A doc comment
 * reading "a non-administrator is refused with 403" was once cited as the
 * refusal itself.
 */
describe('comments are not evidence', () => {
  function statusFinding(text: string, content: string) {
    const criterion: AcceptanceCriterion = { id: 'REQ-1-AC-1', text, keyword: 'WHEN/THEN' };
    const snippets: CodeSnippet[] = [{
      filePath: 'src/thing.ts', content, startLine: 1, endLine: content.split('\n').length,
      language: 'typescript',
    }];
    return runStaticChecks(criterion, snippets, '.').find(r => r.type === 'pattern');
  }

  const criterion = 'WHEN a caller is not the owner THEN the system SHALL return 403';

  it('ignores a status code that only appears in a line comment', () => {
    expect(statusFinding(criterion, '// refuse with 403 here\nreturn next();')?.found).toBe(false);
  });

  it('ignores a status code that only appears in a block comment', () => {
    expect(statusFinding(criterion, '/**\n * refused with 403\n */\nreturn next();')?.found).toBe(false);
  });

  it('still accepts a status code in real code', () => {
    expect(statusFinding(criterion, 'return res.status(403).send();')?.found).toBe(true);
  });

  it('treats a string literal as behaviour, not commentary', () => {
    expect(statusFinding(criterion, "throw new Error('403 Forbidden');")?.found).toBe(true);
  });

  it('does not mistake a TypeScript private field for a comment', () => {
    const masked = maskComments('class A { #count = 403; }', 'typescript');
    expect(masked).toContain('403');
  });

  it('treats # as a comment in languages that use it', () => {
    expect(maskComments('# returns 403\nx = 1', 'python')).not.toContain('403');
  });

  it('preserves line count so citations stay aligned', () => {
    const source = 'a\n// 403\nb\n';
    expect(maskComments(source, 'typescript').split('\n')).toHaveLength(source.split('\n').length);
  });
});

/**
 * Retrieval ranks by keyword overlap and a status code is one of those
 * keywords, so a criterion requiring 403 on one route would retrieve an
 * unrelated route that legitimately returns 403 and accept it as enforcement.
 */
describe('evidence is scoped to the endpoint the criterion names', () => {
  const profileRoute: CodeSnippet = {
    filePath: 'src/profile.ts',
    content: "router.get('/profile/:id', (req, res) => res.status(200).json(account));",
    startLine: 1, endLine: 1, language: 'typescript',
  };
  const accountsRoute: CodeSnippet = {
    filePath: 'src/accounts.ts',
    content: "router.delete('/accounts/:id', (req, res) => res.status(403).send());",
    startLine: 1, endLine: 1, language: 'typescript',
  };

  it('does not accept a status code from an unrelated route', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-2-AC-2',
      text: 'WHEN a signed-in user requests GET /profile/:id for an account they do not own THEN the system SHALL return 403',
      keyword: 'WHEN/THEN',
    };

    const status = runStaticChecks(criterion, [profileRoute, accountsRoute], '.')
      .find(result => result.type === 'pattern');

    expect(status?.found).toBe(false);
  });

  it('accepts the status code when it is in the named route', () => {
    const criterion: AcceptanceCriterion = {
      id: 'REQ-6-AC-2',
      text: 'WHEN a non-administrator requests DELETE /accounts/:id THEN the system SHALL return 403',
      keyword: 'WHEN/THEN',
    };

    const status = runStaticChecks(criterion, [profileRoute, accountsRoute], '.')
      .find(result => result.type === 'pattern');

    expect(status?.found).toBe(true);
    expect(status?.file).toBe('src/accounts.ts');
  });

  it('scopes to the snippets containing the named path', () => {
    const scoped = scopeToSubject(
      'WHEN a user requests GET /profile/:id THEN the system SHALL return 200',
      [profileRoute, accountsRoute],
    );

    expect(scoped.map(s => s.filePath)).toEqual(['src/profile.ts']);
  });

  it('falls back to every snippet when no path is named', () => {
    const scoped = scopeToSubject('The system SHALL return 403 when refused', [profileRoute, accountsRoute]);
    expect(scoped).toHaveLength(2);
  });

  it('does not read prose like "and/or" as a route', () => {
    const scoped = scopeToSubject('The system SHALL accept and/or reject', [profileRoute, accountsRoute]);
    expect(scoped).toHaveLength(2);
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
