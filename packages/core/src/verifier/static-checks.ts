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
 */
export function runStaticChecks(
  criterion: AcceptanceCriterion,
  snippets: CodeSnippet[],
  codebasePath: string,
): StaticCheckResult[] {
  const results: StaticCheckResult[] = [];
  const text = criterion.text.toLowerCase();

  // Ordered from most to least specific to the criterion. Reporting cites the
  // first supporting evidence it finds, and a status code names the behaviour
  // being required far more precisely than the presence of a route does.
  const statusCheck = checkStatusCode(criterion.text, snippets);
  if (statusCheck) results.push(statusCheck);

  // A criterion that names an algorithm or library is making a checkable claim
  // about *how* the behaviour is implemented, not merely that it exists.
  const techniqueCheck = checkNamedTechnique(criterion.text, snippets, codebasePath);
  if (techniqueCheck) results.push(techniqueCheck);

  const limitCheck = checkNumericLimit(criterion.text, snippets);
  if (limitCheck) results.push(limitCheck);

  const routeCheck = checkRouteExistence(text, snippets);
  if (routeCheck) results.push(routeCheck);

  // Check for dependency mentions
  const depCheck = checkDependency(text, codebasePath);
  if (depCheck) results.push(depCheck);

  // Check for test file existence
  const testCheck = checkTestExists(text, snippets, codebasePath);
  if (testCheck) results.push(testCheck);

  // Check for environment variable
  const envCheck = checkEnvVariable(text, codebasePath);
  if (envCheck) results.push(envCheck);

  return results;
}

/**
 * Check if a route/endpoint mentioned in the criterion exists in the code.
 *
 * This is corroborating evidence only. It proves an endpoint exists, never
 * that the endpoint does what the criterion requires.
 */
function checkRouteExistence(text: string, snippets: CodeSnippet[]): StaticCheckResult | null {
  // Extract HTTP methods and paths from criterion
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
  // Matched on a word boundary: "budget" and "target" are not GET requests.
  const mentionedMethod = httpMethods.find(method =>
    new RegExp(`\\b${method}\\b`, 'i').test(text),
  );

  if (!mentionedMethod) return null;

  // Look for route definition in snippets
  const routePatterns = [
    new RegExp(`router\\.(${mentionedMethod}|${mentionedMethod.toUpperCase()})`, 'i'),
    new RegExp(`app\\.(${mentionedMethod}|${mentionedMethod.toUpperCase()})`, 'i'),
    new RegExp(`@(${mentionedMethod}|${mentionedMethod.charAt(0).toUpperCase() + mentionedMethod.slice(1)})`, 'i'),
  ];

  for (const snippet of snippets) {
    for (const pattern of routePatterns) {
      if (pattern.test(snippet.content)) {
        // Cite the line the route is actually on, not the snippet start.
        const lines = snippet.content.split('\n');
        const lineIdx = lines.findIndex(line => pattern.test(line));
        return {
          type: 'route',
          found: true,
          strength: 'corroborating',
          detail: `Found ${mentionedMethod.toUpperCase()} route definition`,
          file: snippet.filePath,
          line: snippet.startLine + (lineIdx >= 0 ? lineIdx : 0),
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
function checkStatusCode(text: string, snippets: CodeSnippet[]): StaticCheckResult | null {
  const statusMatch = text.match(/\b([1-5]\d{2})\b/);
  if (!statusMatch) return null;

  const statusCode = statusMatch[1];

  for (const snippet of snippets) {
    if (snippet.content.includes(statusCode)) {
      // Find the specific line
      const lines = snippet.content.split('\n');
      const lineIdx = lines.findIndex(l => l.includes(statusCode));
      return {
        type: 'pattern',
        found: true,
        strength: 'specific',
        detail: `Status code ${statusCode} found in code`,
        file: snippet.filePath,
        line: snippet.startLine + (lineIdx >= 0 ? lineIdx : 0),
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
  snippets: CodeSnippet[],
  codebasePath: string,
): StaticCheckResult | null {
  const named = NAMED_TECHNIQUES.find(technique => technique.term.test(text));
  if (!named) return null;

  for (const snippet of snippets) {
    for (const token of named.tokens) {
      const pattern = new RegExp(`\\b${escapeRegExp(token)}`, 'i');
      if (!pattern.test(snippet.content)) continue;

      const lines = snippet.content.split('\n');
      const lineIdx = lines.findIndex(line => pattern.test(line));
      return {
        type: 'technique',
        found: true,
        strength: 'specific',
        detail: `${named.label} referenced in code`,
        file: snippet.filePath,
        line: snippet.startLine + (lineIdx >= 0 ? lineIdx : 0),
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
function checkNumericLimit(text: string, snippets: CodeSnippet[]): StaticCheckResult | null {
  const match = text.match(
    /\b(?:at most|no more than|maximum of|up to|limited to|cap(?:ped)? at)\s+(\d+)\b/i,
  );
  if (!match) return null;

  const limit = match[1];

  for (const snippet of snippets) {
    const pattern = new RegExp(`\\b${limit}\\b`);
    if (!pattern.test(snippet.content)) continue;

    const lines = snippet.content.split('\n');
    const lineIdx = lines.findIndex(line => pattern.test(line));
    return {
      type: 'limit',
      found: true,
      strength: 'specific',
      detail: `Limit ${limit} found in code`,
      file: snippet.filePath,
      line: snippet.startLine + (lineIdx >= 0 ? lineIdx : 0),
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
          strength: 'specific',
          detail: `Dependency "${dep}" found in package.json`,
          file: 'package.json',
        };
      }
    }

    return {
      type: 'dependency',
      found: false,
      strength: 'specific',
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
