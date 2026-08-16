/**
 * Static Checks
 *
 * Deterministic verification checks that don't require an LLM.
 * These run BEFORE the LLM call and can resolve some criteria instantly.
 *
 * Checks:
 * - Route/endpoint existence (grep for route definitions)
 * - File/module existence (does the expected file exist?)
 * - Dependency existence (check package.json)
 * - Environment variable presence (check .env files)
 * - Test file existence (is there a test for this feature?)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AcceptanceCriterion, CodeSnippet } from '../types.js';

/** Languages where `#` begins a comment. In TS/JS it is private-field syntax. */
const HASH_COMMENT_LANGUAGES = new Set([
  'python', 'yaml', 'toml', 'shell', 'bash', 'ruby', 'perl', 'text',
]);

/**
 * Blank out comment bodies, preserving every line break and column.
 *
 * Documentation is not evidence, and a comment is documentation that happens to
 * live in a source file. An early version cited a README as proof that code
 * returned 403; this is the same failure one directory deeper — a doc comment
 * reading "a non-administrator is refused with 403" was cited as the refusal
 * itself.
 *
 * String literals are deliberately left intact: `throw new Error('403')` is
 * behaviour, not commentary.
 *
 * Masking rather than deleting keeps line numbers aligned with the original, so
 * a citation still points at the right place.
 */
export function maskComments(content: string, language = 'typescript'): string {
  const hashComments = HASH_COMMENT_LANGUAGES.has(language);
  const out = content.split('');

  type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let mode: Mode = 'code';

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    switch (mode) {
      case 'code':
        if (ch === '/' && next === '/') {
          mode = 'line';
          out[i] = ' ';
        } else if (ch === '/' && next === '*') {
          mode = 'block';
          out[i] = ' ';
        } else if (hashComments && ch === '#') {
          mode = 'line';
          out[i] = ' ';
        } else if (ch === "'") {
          mode = 'single';
        } else if (ch === '"') {
          mode = 'double';
        } else if (ch === '`') {
          mode = 'template';
        }
        break;

      case 'line':
        if (ch === '\n') mode = 'code';
        else out[i] = ' ';
        break;

      case 'block':
        if (ch === '*' && next === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 1;
          mode = 'code';
        } else if (ch !== '\n') {
          out[i] = ' ';
        }
        break;

      case 'single':
      case 'double':
      case 'template': {
        if (ch === '\\') {
          i += 1;
          break;
        }
        const closer = mode === 'single' ? "'" : mode === 'double' ? '"' : '`';
        if (ch === closer) mode = 'code';
        break;
      }
    }
  }

  return out.join('');
}

/** A snippet with commentary removed, for pattern matching only. */
function executableContent(snippet: CodeSnippet): string {
  return maskComments(snippet.content, snippet.language);
}

// ─── Full-File Reader ────────────────────────────────────────────────────────

/**
 * A searchable representation of a source file — the full text with comments
 * masked, rather than the 50-line retrieval window.
 *
 * The retrieval window exists to bound what goes into a report and an LLM
 * prompt. It has no business bounding a pattern search. A file can be 200 lines
 * and the status code can sit on line 75 — a hard cap at 50 lines would report
 * it missing while it is right there. Separating "what we search" from "what we
 * display" fixes this without changing what the model or the report sees.
 */
interface Searchable {
  filePath: string;
  code: string;        // full file, comment-masked
  language: string;
}

/**
 * Memoizing reader that resolves a snippet's backing file exactly once per
 * audit, masks comments over the whole thing, and returns it. Falls back to the
 * snippet window if the file cannot be read (permissions, deletion between
 * retrieval and check), so an IO error degrades rather than throws.
 */
export class FileReader {
  private cache = new Map<string, Searchable | null>();

  constructor(private codebasePath: string) {}

  resolve(snippet: CodeSnippet): Searchable {
    const cached = this.cache.get(snippet.filePath);
    if (cached !== undefined) {
      return cached ?? this.fallback(snippet);
    }

    const fullPath = join(this.codebasePath, snippet.filePath);
    try {
      const raw = readFileSync(fullPath, 'utf-8');
      const searchable: Searchable = {
        filePath: snippet.filePath,
        code: maskComments(raw, snippet.language),
        language: snippet.language,
      };
      this.cache.set(snippet.filePath, searchable);
      return searchable;
    } catch {
      this.cache.set(snippet.filePath, null);
      return this.fallback(snippet);
    }
  }

  private fallback(snippet: CodeSnippet): Searchable {
    return {
      filePath: snippet.filePath,
      code: maskComments(snippet.content, snippet.language),
      language: snippet.language,
    };
  }
}

/** Find a line number in a full-file Searchable (1-indexed). */
function findLine(searchable: Searchable, test: (line: string) => boolean): number | undefined {
  const lines = searchable.code.split('\n');
  const idx = lines.findIndex(test);
  return idx >= 0 ? idx + 1 : undefined;
}

/**
 * How much a check can prove.
 *
 * `specific` checks test the behaviour the criterion actually requires — a
 * status code, a named algorithm, a stated limit. They can carry a criterion
 * to SUPPORTED on their own.
 *
 * `corroborating` checks only establish that there is somewhere for the
 * behaviour to live. A route definition proves an endpoint exists; it says
 * nothing about whether that endpoint hashes a password or refuses a
 * request. Corroborating evidence alone must never reach SUPPORTED — that
 * mistake is precisely the false completion claim this tool exists to catch.
 */
export type CheckStrength = 'specific' | 'corroborating';

export interface StaticCheckResult {
  type: 'route' | 'file' | 'dependency' | 'env' | 'test' | 'pattern' | 'technique' | 'limit';
  found: boolean;
  detail: string;
  strength: CheckStrength;
  file?: string;
  line?: number;
}

/**
 * Run deterministic static checks against the codebase for a criterion.
 * Returns any evidence found without needing an LLM.
 *
 * When a `FileReader` is supplied (recommended), checks scan the full masked
 * file rather than just the 50-line retrieval window. The window caps what goes
 * into the report and LLM prompt; it should never cap a pattern search, because
 * evidence past line 50 of a file would be reported as absent while it exists.
 */
export function runStaticChecks(
  criterion: AcceptanceCriterion,
  snippets: CodeSnippet[],
  codebasePath: string,
  reader?: FileReader,
): StaticCheckResult[] {
  const results: StaticCheckResult[] = [];
  const text = criterion.text.toLowerCase();
  const r = reader ?? new FileReader(codebasePath);

  // Restrict evidence to the endpoint the criterion names.
  const scoped = scopeToSubject(criterion.text, snippets, r);

  // Resolve full files for each scoped snippet.
  const files = scoped.map(snippet => r.resolve(snippet));

  const statusCheck = checkStatusCode(criterion.text, files);
  if (statusCheck) results.push(statusCheck);

  const techniqueCheck = checkNamedTechnique(criterion.text, files, codebasePath);
  if (techniqueCheck) results.push(techniqueCheck);

  const limitCheck = checkNumericLimit(criterion.text, files);
  if (limitCheck) results.push(limitCheck);

  const routeCheck = checkRouteExistence(text, files);
  if (routeCheck) results.push(routeCheck);

  const depCheck = checkDependency(text, codebasePath);
  if (depCheck) results.push(depCheck);

  const testCheck = checkTestExists(text, scoped, codebasePath);
  if (testCheck) results.push(testCheck);

  const envCheck = checkEnvVariable(text, codebasePath);
  if (envCheck) results.push(envCheck);

  return results;
}

/**
 * Narrow snippets to those implementing the endpoint the criterion names.
 *
 * Uses full-file content for the match, so a route definition past the 50-line
 * window still scopes correctly.
 */
export function scopeToSubject(
  criterionText: string,
  snippets: CodeSnippet[],
  reader?: FileReader,
): CodeSnippet[] {
  const anchors = routeAnchors(criterionText);
  if (anchors.length === 0) return snippets;

  const matching = snippets.filter(snippet => {
    const code = reader ? reader.resolve(snippet).code : maskComments(snippet.content, snippet.language);
    return anchors.some(anchor => code.includes(anchor));
  });

  return matching.length > 0 ? matching : snippets;
}

/**
 * Pull route path prefixes out of a criterion, e.g. "/profile/:id" → "/profile".
 * The prefix is used rather than the full path so that ":id" versus "{id}"
 * versus "<id>" parameter styles all still match.
 */
function routeAnchors(criterionText: string): string[] {
  const anchors = new Set<string>();
  const withoutUrls = criterionText.replace(/https?:\/\/\S+/gi, ' ');

  for (const match of withoutUrls.matchAll(/\/([A-Za-z][A-Za-z0-9_-]*)/g)) {
    const segment = match[1].toLowerCase();
    // 'and/or' and similar prose are not routes.
    if (segment.length < 2) continue;
    if (PROSE_SLASH_WORDS.has(segment)) continue;
    anchors.add(`/${match[1]}`);
  }

  return [...anchors];
}

const PROSE_SLASH_WORDS = new Set(['or', 'and', 'not', 'no', 'off', 'on']);

/**
 * Check if a route/endpoint mentioned in the criterion exists in the code.
 *
 * This is corroborating evidence only. It proves an endpoint exists, never
 * that the endpoint does what the criterion requires.
 */
function checkRouteExistence(text: string, files: Searchable[]): StaticCheckResult | null {
  // Extract HTTP methods and paths from criterion
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
  // Matched on a word boundary: "budget" and "target" are not GET requests.
  const mentionedMethod = httpMethods.find(method =>
    new RegExp(`\\b${method}\\b`, 'i').test(text),
  );

  if (!mentionedMethod) return null;

  // Look for route definition in files
  const routePatterns = [
    new RegExp(`router\\.(${mentionedMethod}|${mentionedMethod.toUpperCase()})`, 'i'),
    new RegExp(`app\\.(${mentionedMethod}|${mentionedMethod.toUpperCase()})`, 'i'),
    new RegExp(`@(${mentionedMethod}|${mentionedMethod.charAt(0).toUpperCase() + mentionedMethod.slice(1)})`, 'i'),
  ];

  for (const file of files) {
    for (const pattern of routePatterns) {
      if (pattern.test(file.code)) {
        const line = findLine(file, l => pattern.test(l));
        return {
          type: 'route',
          found: true,
          strength: 'corroborating',
          detail: `Found ${mentionedMethod.toUpperCase()} route definition`,
          file: file.filePath,
          line,
        };
      }
    }
  }

  return {
    type: 'route',
    found: false,
    strength: 'corroborating',
    detail: `No ${mentionedMethod.toUpperCase()} route definition found in relevant code`,
  };
}

/**
 * Check if a status code mentioned in the criterion appears in the code.
 */
function checkStatusCode(text: string, files: Searchable[]): StaticCheckResult | null {
  const statusMatch = text.match(/\b([1-5]\d{2})\b/);
  if (!statusMatch) return null;

  const statusCode = statusMatch[1];

  for (const file of files) {
    if (file.code.includes(statusCode)) {
      const line = findLine(file, l => l.includes(statusCode));
      return {
        type: 'pattern',
        found: true,
        strength: 'specific',
        detail: `Status code ${statusCode} found in code`,
        file: file.filePath,
        line,
      };
    }
  }

  return {
    type: 'pattern',
    found: false,
    strength: 'specific',
    detail: `Status code ${statusCode} not found in relevant code`,
  };
}

/**
 * Check a technique the criterion names explicitly.
 *
 * When a criterion says "hash the password using bcrypt", the word bcrypt is
 * the checkable part. If it appears nowhere in the relevant source and nowhere
 * in the manifest, the claim is contradicted rather than merely unproven.
 */
function checkNamedTechnique(
  text: string,
  files: Searchable[],
  codebasePath: string,
): StaticCheckResult | null {
  const named = NAMED_TECHNIQUES.find(technique => technique.term.test(text));
  if (!named) return null;

  for (const file of files) {
    for (const token of named.tokens) {
      const pattern = new RegExp(`\\b${escapeRegExp(token)}`, 'i');
      if (!pattern.test(file.code)) continue;

      const line = findLine(file, l => pattern.test(l));
      return {
        type: 'technique',
        found: true,
        strength: 'specific',
        detail: `${named.label} referenced in code`,
        file: file.filePath,
        line,
      };
    }
  }

  // A manifest entry is weaker than a call site but still shows the technique
  // was actually reached for, so it is reported separately from source use.
  if (manifestMentions(codebasePath, named.tokens)) {
    return {
      type: 'technique',
      found: true,
      strength: 'specific',
      detail: `${named.label} declared in package.json but not found in the relevant code`,
      file: 'package.json',
    };
  }

  return {
    type: 'technique',
    found: false,
    strength: 'specific',
    detail: `${named.label} is required by this criterion but appears nowhere in the relevant code or package.json`,
  };
}

/**
 * Check a numeric bound the criterion states, such as "at most 50 per page".
 */
function checkNumericLimit(text: string, files: Searchable[]): StaticCheckResult | null {
  const match = text.match(
    /\b(?:at most|no more than|maximum of|up to|limited to|cap(?:ped)? at)\s+(\d+)\b/i,
  );
  if (!match) return null;

  const limit = match[1];

  for (const file of files) {
    const pattern = new RegExp(`\\b${limit}\\b`);
    if (!pattern.test(file.code)) continue;

    const line = findLine(file, l => pattern.test(l));
    return {
      type: 'limit',
      found: true,
      strength: 'specific',
      detail: `Limit ${limit} found in code`,
      file: file.filePath,
      line,
    };
  }

  return {
    type: 'limit',
    found: false,
    strength: 'specific',
    detail: `Stated limit of ${limit} not found in relevant code`,
  };
}

/**
 * Techniques a criterion can name by hand. Each entry pairs the phrasing a
 * requirement would use with the tokens that would appear if it were really
 * implemented.
 */
const NAMED_TECHNIQUES: Array<{ term: RegExp; label: string; tokens: string[] }> = [
  { term: /\bbcrypt\b/i, label: 'bcrypt', tokens: ['bcrypt'] },
  { term: /\bargon2\b/i, label: 'argon2', tokens: ['argon2'] },
  { term: /\bscrypt\b/i, label: 'scrypt', tokens: ['scrypt'] },
  { term: /\bpbkdf2\b/i, label: 'PBKDF2', tokens: ['pbkdf2'] },
  { term: /\bhmac\b/i, label: 'HMAC', tokens: ['hmac', 'createHmac'] },
  { term: /\bsha-?256\b/i, label: 'SHA-256', tokens: ['sha256'] },
  { term: /\bsha-?512\b/i, label: 'SHA-512', tokens: ['sha512'] },
  { term: /\baes(?:-\d+)?\b/i, label: 'AES', tokens: ['aes', 'createCipher'] },
  { term: /\bjwt\b|\bjson web token\b/i, label: 'JWT', tokens: ['jwt', 'jsonwebtoken', 'jose'] },
  { term: /\bcsrf\b/i, label: 'CSRF protection', tokens: ['csrf', 'csurf'] },
  { term: /\bcors\b/i, label: 'CORS', tokens: ['cors'] },
  { term: /\buuid\b/i, label: 'UUID', tokens: ['uuid', 'randomUUID'] },
];

function manifestMentions(codebasePath: string, tokens: string[]): boolean {
  const pkgPath = join(codebasePath, 'package.json');
  if (!existsSync(pkgPath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    return names.some(name =>
      tokens.some(token => name.toLowerCase().includes(token.toLowerCase())),
    );
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a dependency mentioned in the criterion exists in package.json.
 */
function checkDependency(text: string, codebasePath: string): StaticCheckResult | null {
  // Common dependency-related keywords in criteria
  const depKeywords: Record<string, string[]> = {
    'email': ['nodemailer', 'sendgrid', '@sendgrid/mail', 'ses', 'resend'],
    'rate limit': ['express-rate-limit', 'rate-limiter-flexible', 'bottleneck'],
    'encrypt': ['bcrypt', 'crypto', 'argon2', 'scrypt'],
    'jwt': ['jsonwebtoken', 'jose', '@auth/core'],
    'websocket': ['ws', 'socket.io', '@socket.io/'],
    'database': ['prisma', 'drizzle', 'typeorm', 'mongoose', 'pg', 'mysql2', 'better-sqlite3'],
    'cache': ['redis', 'ioredis', 'memcached', 'lru-cache'],
    'upload': ['multer', 'formidable', 'busboy'],
    'pdf': ['pdfkit', 'puppeteer', 'jspdf', '@react-pdf'],
    'csv': ['csv-parse', 'papaparse', 'fast-csv', 'csv-writer'],
  };

  // Find which keywords are mentioned in the criterion
  let relevantDeps: string[] = [];
  for (const [keyword, deps] of Object.entries(depKeywords)) {
    if (text.includes(keyword)) {
      relevantDeps = deps;
      break;
    }
  }

  if (relevantDeps.length === 0) return null;

  // Check package.json
  const pkgPath = join(codebasePath, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const dep of relevantDeps) {
      if (allDeps[dep]) {
        return {
          type: 'dependency',
          found: true,
          strength: 'corroborating',
          detail: `Dependency "${dep}" found in package.json`,
          file: 'package.json',
        };
      }
    }

    return {
      type: 'dependency',
      found: false,
      strength: 'corroborating',
      detail: `No relevant dependency found (expected one of: ${relevantDeps.slice(0, 3).join(', ')})`,
      file: 'package.json',
    };
  } catch {
    return null;
  }
}

/**
 * Check if a test file exists for the feature mentioned in the criterion.
 */
function checkTestExists(
  text: string,
  snippets: CodeSnippet[],
  codebasePath: string,
): StaticCheckResult | null {
  // Only check if criterion is about testing or we have relevant source files
  if (snippets.length === 0) return null;

  // Check if test files exist for the source files found
  const sourceFile = snippets[0]?.filePath;
  if (!sourceFile) return null;

  const baseName = sourceFile.replace(/\.(ts|js|tsx|jsx)$/, '');
  const testPatterns = [
    `${baseName}.test.ts`,
    `${baseName}.spec.ts`,
    `${baseName}.test.js`,
    `${baseName}.spec.js`,
  ];

  for (const pattern of testPatterns) {
    const testPath = join(codebasePath, pattern);
    if (existsSync(testPath)) {
      return {
        type: 'test',
        found: true,
        strength: 'corroborating',
        detail: `Test file exists: ${pattern}`,
        file: pattern,
      };
    }
  }

  // Not finding a test isn't necessarily a failure — don't report
  return null;
}

/**
 * Check if an environment variable mentioned in the criterion is configured.
 */
function checkEnvVariable(text: string, codebasePath: string): StaticCheckResult | null {
  // Look for env-related keywords
  const envKeywords = ['environment', 'config', 'secret', 'key', 'connection string'];
  const hasEnvMention = envKeywords.some(k => text.includes(k));
  if (!hasEnvMention) return null;

  // Check for .env, .env.example, or config files
  const envFiles = ['.env', '.env.example', '.env.local', 'config.json', 'config.yaml'];
  for (const envFile of envFiles) {
    if (existsSync(join(codebasePath, envFile))) {
      return {
        type: 'env',
        found: true,
        strength: 'corroborating',
        detail: `Config file found: ${envFile}`,
        file: envFile,
      };
    }
  }

  return null;
}
