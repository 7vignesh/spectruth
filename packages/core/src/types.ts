/**
 * SpecTruth Core Types
 *
 * All shared interfaces for the spec conformance verification engine.
 */

// ─── Parsed Spec Types ───────────────────────────────────────────────────────

export interface ParsedSpec {
  title: string;
  introduction: string;
  requirements: Requirement[];
}

export interface Requirement {
  id: string;
  title: string;
  userStory: string;
  acceptanceCriteria: AcceptanceCriterion[];
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  keyword: CriterionKeyword;
}

export type CriterionKeyword = 'WHEN/THEN' | 'IF/THEN' | 'WHERE' | 'plain';

// ─── Code Retrieval Types ────────────────────────────────────────────────────

export interface CodeSnippet {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface RetrievalResult {
  criterion: AcceptanceCriterion;
  snippets: CodeSnippet[];
  searchTerms: string[];
}

// ─── Verification Types ──────────────────────────────────────────────────────

export type Verdict = 'PASS' | 'FAIL' | 'PARTIAL';

export interface Evidence {
  file: string;
  line: number;
  detail: string;
}

export interface CriterionResult {
  criterion: AcceptanceCriterion;
  verdict: Verdict;
  confidence: number;
  reason: string;
  evidence: Evidence;
  suggestion?: string;
}

export interface RequirementResult {
  requirement: Requirement;
  criteriaResults: CriterionResult[];
  overallVerdict: Verdict;
  score: string;
}

export interface VerificationReport {
  specTitle: string;
  timestamp: string;
  codebasePath: string;
  results: RequirementResult[];
  summary: {
    totalRequirements: number;
    passed: number;
    failed: number;
    partial: number;
    overallScore: string;
    overallVerdict: Verdict;
  };
}

// ─── LLM Provider Types ──────────────────────────────────────────────────────

export interface LLMProvider {
  name: string;
  verify(prompt: string): Promise<string>;
}

export interface LLMProviderConfig {
  provider: 'anthropic' | 'openai' | 'kiro';
  model?: string;
  apiKey?: string;
}

// ─── Configuration Types ─────────────────────────────────────────────────────

export interface SpecTruthConfig {
  specPath: string;
  codePath: string;
  output?: 'terminal' | 'json';
  provider?: 'anthropic' | 'openai' | 'kiro' | 'auto';
}
