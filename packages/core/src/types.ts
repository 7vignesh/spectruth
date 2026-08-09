/**
 * SpecTruth Core Types
 *
 * Shared interfaces for parsing Kiro specs and producing evidence-backed
 * Done Integrity audit reports.
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

// ─── Done Integrity Domain Types ─────────────────────────────────────────────

export type EvidenceState =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'UNSUPPORTED'
  | 'UNVERIFIED';

export type ShipStatus =
  | 'READY'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export type EvidenceSource =
  | 'requirement'
  | 'design'
  | 'task'
  | 'task-transition'
  | 'git-diff'
  | 'source-code'
  | 'static-check'
  | 'test-output';

export interface EvidenceLocation {
  file: string;
  line?: number;
}

export interface EvidenceItem {
  source: EvidenceSource;
  location?: EvidenceLocation;
  observation: string;
  supports: boolean;
}

export interface CriterionAudit {
  criterionId: string;
  criterionText: string;
  state: EvidenceState;
  justification: string;
  evidence: EvidenceItem[];
  gaps: string[];
  repairPreviewAvailable: boolean;
}

export interface RequirementAudit {
  requirement: Requirement;
  state: EvidenceState;
  criteria: CriterionAudit[];
}

export interface EvidenceStateCounts {
  supported: number;
  partial: number;
  unsupported: number;
  unverified: number;
}

export interface AuditSummary {
  totalRequirements: number;
  totalCriteria: number;
  states: EvidenceStateCounts;
  shipStatus: ShipStatus;
}

export interface SpecAuditScope {
  kind: 'spec';
}

export interface TaskAuditScope {
  kind: 'task';
  taskId: string;
  taskTitle?: string;
}

export interface SpecAuditReport {
  scope: SpecAuditScope;
  specTitle: string;
  timestamp: string;
  codebasePath: string;
  requirements: RequirementAudit[];
  summary: AuditSummary;
}

export interface TaskAuditReport {
  scope: TaskAuditScope;
  specTitle: string;
  timestamp: string;
  codebasePath: string;
  requirements: RequirementAudit[];
  summary: AuditSummary;
}

export type AuditReport = SpecAuditReport | TaskAuditReport;

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
