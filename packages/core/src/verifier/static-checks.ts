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

export interface StaticCheckResult {
  type: 'route' | 'file' | 'dependency' | 'env' | 'test' | 'pattern';
  found: boolean;
  detail: string;
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
 */
function checkRouteExistence(text: string, snippets: CodeSnippet[]): StaticCheckResult | null {
  // Extract HTTP methods and paths from criterion
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
  const mentionedMethod = httpMethods.find(m => text.includes(m));

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
        detail: `Status code ${statusCode} found in code`,
        file: snippet.filePath,
        line: snippet.startLine + (lineIdx >= 0 ? lineIdx : 0),
      };
    }
  }

  return {
    type: 'pattern',
    found: false,
    detail: `Status code ${statusCode} not found in relevant code`,
  };
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
          detail: `Dependency "${dep}" found in package.json`,
          file: 'package.json',
        };
      }
    }

    return {
      type: 'dependency',
      found: false,
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
        detail: `Config file found: ${envFile}`,
        file: envFile,
      };
    }
  }

  return null;
}
