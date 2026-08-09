/**
 * Code Retriever
 *
 * Given an acceptance criterion, finds the most relevant code snippets
 * from the codebase. Uses keyword extraction + file search + ranking.
 *
 * Strategy:
 * 1. Extract keywords from criterion text
 * 2. Walk the file tree (respecting .gitignore patterns)
 * 3. Search files for keyword matches
 * 4. Rank by match density
 * 5. Extract snippets (20-50 lines around matches)
 * 6. Return top 3-5 results
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import type { AcceptanceCriterion, CodeSnippet, RetrievalResult } from '../types.js';

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Find relevant code snippets for a given acceptance criterion.
 */
export async function findRelevantCode(
  criterion: AcceptanceCriterion,
  codebasePath: string,
  maxSnippets: number = 5,
): Promise<RetrievalResult> {
  const searchTerms = extractKeywords(criterion.text);
  const files = walkFileTree(codebasePath);
  const rankedFiles = searchAndRank(files, searchTerms, codebasePath);
  const snippets = extractSnippets(rankedFiles.slice(0, maxSnippets), searchTerms, codebasePath);

  return {
    criterion,
    snippets,
    searchTerms,
  };
}

// ─── Keyword Extraction ──────────────────────────────────────────────────────

/** Stop words to filter out from search terms */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'that', 'which', 'who', 'whom', 'this', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
  'what', 'where', 'when', 'how', 'why',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'any',
  'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'then', 'if', 'or', 'and', 'but', 'for', 'with', 'from',
  'to', 'of', 'in', 'on', 'at', 'by', 'as', 'into', 'about',
  'system', 'user', 'provides', 'provided', 'appropriate',
]);

/** EARS keywords to strip */
const EARS_KEYWORDS = new Set([
  'when', 'then', 'given', 'and', 'if', 'where', 'shall', 'should',
]);

/**
 * Extract meaningful keywords from acceptance criterion text.
 * Filters stop words, EARS notation keywords, and short words.
 * Also extracts numbers, HTTP status codes, and technical terms.
 */
export function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  // Extract HTTP status codes (e.g., 409, 401, 500)
  const statusCodes = text.match(/\b[1-5]\d{2}\b/g);
  if (statusCodes) {
    keywords.push(...statusCodes);
  }

  // Extract quoted strings (e.g., "rate limit", "email")
  const quoted = text.match(/"([^"]+)"|'([^']+)'/g);
  if (quoted) {
    keywords.push(...quoted.map(q => q.replace(/['"]/g, '')));
  }

  // Extract technical terms (camelCase, snake_case, kebab-case)
  const technicalTerms = text.match(/[a-z]+[A-Z][a-zA-Z]*|[a-z]+_[a-z]+|[a-z]+-[a-z]+/g);
  if (technicalTerms) {
    keywords.push(...technicalTerms);
  }

  // Split remaining text into words and filter
  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w))
    .filter(w => !EARS_KEYWORDS.has(w));

  keywords.push(...words);

  // Deduplicate and return
  return [...new Set(keywords)];
}

// ─── File Tree Walker ────────────────────────────────────────────────────────

/** File extensions we care about */
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.go', '.rs', '.java', '.kt', '.cs',
  '.json', '.yaml', '.yml', '.toml',
  '.env', '.env.local', '.env.example',
  '.md',
  '.sql',
  '.html', '.css', '.scss',
]);

/** Directories to always skip */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  '.cache', 'coverage', '__pycache__', '.venv', 'venv',
  '.turbo', '.vercel', '.netlify', 'target',
]);

/**
 * Walk the file tree and return all code files.
 * Respects common ignore patterns.
 */
export function walkFileTree(rootPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(entry) && !entry.startsWith('.')) {
            walk(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = extname(entry).toLowerCase();
          // Include files with recognized extensions OR no extension (Dockerfile, Makefile, etc.)
          if (CODE_EXTENSIONS.has(ext) || (!ext && stat.size < 50000)) {
            // Skip files larger than 100KB
            if (stat.size < 100000) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        continue; // Skip files we can't stat
      }
    }
  }

  walk(rootPath);
  return files;
}

// ─── Search and Rank ─────────────────────────────────────────────────────────

interface RankedFile {
  filePath: string;
  score: number;
  matchedTerms: string[];
  matchPositions: number[]; // Line numbers where matches occur
}

/**
 * Search files for keyword matches and rank by relevance.
 */
export function searchAndRank(
  files: string[],
  searchTerms: string[],
  _codebasePath: string,
): RankedFile[] {
  if (searchTerms.length === 0) return [];

  const results: RankedFile[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const contentLower = content.toLowerCase();
    const lines = content.split('\n');
    let score = 0;
    const matchedTerms: string[] = [];
    const matchPositions: number[] = [];

    for (const term of searchTerms) {
      const termLower = term.toLowerCase();

      // Check file name match (higher weight)
      const fileName = filePath.toLowerCase();
      if (fileName.includes(termLower)) {
        score += 3;
        matchedTerms.push(term);
      }

      // Check content matches
      let idx = 0;
      let termMatches = 0;
      while ((idx = contentLower.indexOf(termLower, idx)) !== -1) {
        termMatches++;
        // Find line number
        const lineNum = content.substring(0, idx).split('\n').length;
        if (!matchPositions.includes(lineNum)) {
          matchPositions.push(lineNum);
        }
        idx += termLower.length;
      }

      if (termMatches > 0) {
        score += Math.min(termMatches, 5); // Cap per-term score
        if (!matchedTerms.includes(term)) {
          matchedTerms.push(term);
        }
      }
    }

    // Bonus for matching multiple distinct terms
    if (matchedTerms.length > 1) {
      score += matchedTerms.length * 2;
    }

    if (score > 0) {
      results.push({ filePath, score, matchedTerms, matchPositions });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── Snippet Extraction ──────────────────────────────────────────────────────

/**
 * Extract code snippets around match positions.
 * Returns 20-50 line chunks centered on the most relevant matches.
 */
export function extractSnippets(
  rankedFiles: RankedFile[],
  searchTerms: string[],
  codebasePath: string,
): CodeSnippet[] {
  const snippets: CodeSnippet[] = [];
  const CONTEXT_LINES = 10; // Lines before and after a match
  const MAX_SNIPPET_LINES = 50;

  for (const file of rankedFiles) {
    let content: string;
    try {
      content = readFileSync(file.filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const ext = extname(file.filePath).replace('.', '') || 'text';

    if (file.matchPositions.length === 0) {
      // No specific positions — take the first 50 lines
      const snippetLines = lines.slice(0, MAX_SNIPPET_LINES);
      snippets.push({
        filePath: relative(codebasePath, file.filePath).replace(/\\/g, '/'),
        content: snippetLines.join('\n'),
        startLine: 1,
        endLine: snippetLines.length,
        language: mapExtToLanguage(ext),
      });
      continue;
    }

    // Group nearby match positions into ranges
    const sortedPositions = [...file.matchPositions].sort((a, b) => a - b);
    const ranges = mergePositions(sortedPositions, CONTEXT_LINES, lines.length);

    // Take the best range (most matches)
    const bestRange = ranges[0];
    if (bestRange) {
      const start = Math.max(0, bestRange.start - CONTEXT_LINES);
      const end = Math.min(lines.length, bestRange.end + CONTEXT_LINES);
      const snippetLines = lines.slice(start, Math.min(end, start + MAX_SNIPPET_LINES));

      snippets.push({
        filePath: relative(codebasePath, file.filePath).replace(/\\/g, '/'),
        content: snippetLines.join('\n'),
        startLine: start + 1,
        endLine: start + snippetLines.length,
        language: mapExtToLanguage(ext),
      });
    }
  }

  return snippets;
}

/**
 * Merge nearby positions into ranges.
 */
function mergePositions(
  positions: number[],
  contextLines: number,
  totalLines: number,
): { start: number; end: number; count: number }[] {
  if (positions.length === 0) return [];

  const ranges: { start: number; end: number; count: number }[] = [];
  let currentStart = positions[0];
  let currentEnd = positions[0];
  let currentCount = 1;

  for (let i = 1; i < positions.length; i++) {
    if (positions[i] - currentEnd <= contextLines * 2) {
      // Merge with current range
      currentEnd = positions[i];
      currentCount++;
    } else {
      // Start new range
      ranges.push({ start: currentStart, end: currentEnd, count: currentCount });
      currentStart = positions[i];
      currentEnd = positions[i];
      currentCount = 1;
    }
  }
  ranges.push({ start: currentStart, end: currentEnd, count: currentCount });

  // Sort by match count descending
  ranges.sort((a, b) => b.count - a.count);
  return ranges;
}

/**
 * Map file extension to language name for syntax highlighting.
 */
function mapExtToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python', pyw: 'python',
    go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', cs: 'csharp',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    sql: 'sql', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown',
  };
  return map[ext] || 'text';
}
