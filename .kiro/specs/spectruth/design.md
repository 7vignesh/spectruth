# SpecTruth — Design

## Overview
SpecTruth is built as a TypeScript monorepo with three packages sharing a core verification engine. The core engine handles spec parsing, code retrieval, LLM-based verification, and report generation. The CLI and web packages are thin wrappers around the core.

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  CLI Tool    │     │  Kiro Hook      │     │  Web UI     │
│  (standalone)│     │  (PostTaskExec) │     │  (demo)     │
└──────┬──────┘     └───────┬─────────┘     └──────┬──────┘
       │                    │                       │
       └────────────────────┼───────────────────────┘
                            ▼
              ┌──────────────────────────┐
              │      @spectruth/core      │
              │  Parser → Retriever →    │
              │  Verifier → Reporter     │
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │   LLM API (Claude/GPT)   │
              └──────────────────────────┘
```

## Components

### 1. Spec Parser (`packages/core/src/parser/`)
- Reads Kiro-format requirements.md
- Splits by `### Requirement` headings
- Extracts user stories and acceptance criteria
- Handles EARS notation (WHEN/THEN/SHALL/IF) and plain text
- Output: `ParsedSpec` typed object

### 2. Code Retriever (`packages/core/src/retriever/`)
- Extracts keywords from each acceptance criterion
- Walks file tree (respects .gitignore, skips node_modules/dist)
- Searches for keyword matches using string matching
- Ranks files by match density
- Returns top 3-5 code snippets (20-50 lines each)

### 3. LLM Verifier (`packages/core/src/verifier/`)
- Provider interface with Anthropic, OpenAI, and Kiro implementations
- Auto-detects available provider from environment
- Structured prompt: criterion + code → PASS/FAIL/PARTIAL + evidence
- Parallel execution across criteria (Promise.allSettled)
- Retry logic on failure (1 retry with backoff)

### 4. Report Generator (`packages/core/src/reporter/`)
- Terminal output: chalk-colored pass/fail with evidence
- JSON output: structured for programmatic use
- Aggregation: requirement passes only if ALL criteria pass

## LLM Provider Detection Order
1. Kiro session detected → use Kiro's model (no extra key needed)
2. `ANTHROPIC_API_KEY` in env → Anthropic Claude
3. `OPENAI_API_KEY` in env → OpenAI GPT-4
4. None found → error with setup instructions

## Data Flow
```
spec file (markdown)
  → Parser → ParsedSpec (structured JSON)
    → For each requirement:
      → For each criterion:
        → Retriever → CodeSnippet[] (relevant code)
        → Verifier → CriterionResult (verdict + evidence)
      → Aggregate → RequirementResult
    → Reporter → formatted output (terminal/JSON/HTML)
```

## Key Design Decisions
- **Stateless**: No database. Spec in, report out.
- **Parallel**: All criteria verified concurrently for speed.
- **Strict defaults**: "Close enough" is PARTIAL, not PASS.
- **Evidence required**: Every verdict must point to specific code or explain absence.
- **No heavy deps**: No LangChain, no tree-sitter. Direct SDK calls, string search.
