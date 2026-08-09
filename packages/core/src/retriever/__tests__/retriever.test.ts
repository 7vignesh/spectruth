import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { extractKeywords, walkFileTree, searchAndRank, extractSnippets } from '../index.js';

const FIXTURES_PATH = join(import.meta.dirname, 'fixtures', 'sample-project');

// ─── Keyword Extraction Tests ────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('extracts meaningful words, filters stop words', () => {
    const keywords = extractKeywords(
      'WHEN a user provides valid email and password THEN the system SHALL create a new user account'
    );
    expect(keywords).toContain('email');
    expect(keywords).toContain('password');
    expect(keywords).toContain('create');
    expect(keywords).toContain('account');
    // Should NOT contain stop words
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('and');
    expect(keywords).not.toContain('a');
  });

  it('extracts HTTP status codes', () => {
    const keywords = extractKeywords(
      'WHEN a user provides duplicate email THEN the system SHALL return a 409 error'
    );
    expect(keywords).toContain('409');
  });

  it('extracts quoted strings', () => {
    const keywords = extractKeywords(
      'The system should display "rate limit exceeded" message'
    );
    expect(keywords).toContain('rate limit exceeded');
  });

  it('extracts technical terms (camelCase, snake_case)', () => {
    const keywords = extractKeywords(
      'The hashPassword function should enforce minimum length'
    );
    expect(keywords).toContain('hashPassword');
  });

  it('filters EARS keywords', () => {
    const keywords = extractKeywords(
      'WHEN the condition is met THEN the system SHALL respond'
    );
    expect(keywords).not.toContain('when');
    expect(keywords).not.toContain('then');
    expect(keywords).not.toContain('shall');
  });

  it('deduplicates keywords', () => {
    const keywords = extractKeywords('email email email password password');
    const emailCount = keywords.filter(k => k === 'email').length;
    expect(emailCount).toBe(1);
  });

  it('returns empty array for empty text', () => {
    expect(extractKeywords('')).toEqual([]);
  });
});

// ─── File Tree Walker Tests ──────────────────────────────────────────────────

describe('walkFileTree', () => {
  it('finds TypeScript files in the fixture', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const tsFiles = files.filter(f => f.endsWith('.ts'));
    expect(tsFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('includes json files', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    expect(jsonFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('returns absolute paths', () => {
    const files = walkFileTree(FIXTURES_PATH);
    for (const file of files) {
      expect(file).toMatch(/^[A-Z]:\\/i); // Windows absolute path
    }
  });

  it('does not include node_modules', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const nmFiles = files.filter(f => f.includes('node_modules'));
    expect(nmFiles).toHaveLength(0);
  });
});

// ─── Search and Rank Tests ───────────────────────────────────────────────────

describe('searchAndRank', () => {
  it('finds files containing search terms', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const results = searchAndRank(files, ['email', '409'], FIXTURES_PATH);
    expect(results.length).toBeGreaterThan(0);
    // auth.ts should rank highest (contains both email and 409)
    expect(results[0].filePath).toContain('auth');
  });

  it('ranks files with more matches higher', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const results = searchAndRank(files, ['password', 'hash'], FIXTURES_PATH);
    // password.ts should rank high (contains both terms prominently)
    const topFiles = results.slice(0, 2).map(r => r.filePath);
    const hasPasswordFile = topFiles.some(f => f.includes('password'));
    expect(hasPasswordFile).toBe(true);
  });

  it('returns empty for no matches', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const results = searchAndRank(files, ['xyznonexistent123'], FIXTURES_PATH);
    expect(results).toHaveLength(0);
  });

  it('returns empty for empty search terms', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const results = searchAndRank(files, [], FIXTURES_PATH);
    expect(results).toHaveLength(0);
  });
});

// ─── Snippet Extraction Tests ────────────────────────────────────────────────

describe('extractSnippets', () => {
  it('extracts code snippets from ranked files', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const ranked = searchAndRank(files, ['email', 'register'], FIXTURES_PATH);
    const snippets = extractSnippets(ranked.slice(0, 3), ['email', 'register'], FIXTURES_PATH);

    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].content).toContain('email');
    expect(snippets[0].language).toBe('typescript');
  });

  it('includes relative file paths', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const ranked = searchAndRank(files, ['email'], FIXTURES_PATH);
    const snippets = extractSnippets(ranked.slice(0, 3), ['email'], FIXTURES_PATH);

    for (const snippet of snippets) {
      expect(snippet.filePath).not.toContain(FIXTURES_PATH);
      expect(snippet.filePath).toMatch(/\.ts$/);
    }
  });

  it('includes line numbers', () => {
    const files = walkFileTree(FIXTURES_PATH);
    const ranked = searchAndRank(files, ['409'], FIXTURES_PATH);
    const snippets = extractSnippets(ranked.slice(0, 1), ['409'], FIXTURES_PATH);

    expect(snippets[0].startLine).toBeGreaterThan(0);
    expect(snippets[0].endLine).toBeGreaterThan(snippets[0].startLine);
  });
});
