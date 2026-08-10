# SpecTruth — Tasks

## Done Integrity Implementation Plan

- [x] 1. Project scaffolding and monorepo setup
  - pnpm workspace with core, cli, web packages
  - TypeScript strict mode, vitest, ESM
  - _Requirements: 1_

- [x] 2. Requirements parser with EARS notation
  - Parse Kiro requirements.md into structured specs
  - Extract acceptance criteria with keyword detection
  - _Requirements: 2.1, 2.2_

- [x] 3. Code retriever with keyword ranking
  - Walk file tree respecting .gitignore
  - Extract and rank relevant snippets per criterion
  - _Requirements: 2.2, 2.3_

- [x] 4. Evidence-backed domain model
  - Replace PASS/FAIL/PARTIAL with SUPPORTED/PARTIAL/UNSUPPORTED/UNVERIFIED
  - Replace confidence percentages with mandatory justifications
  - Add typed evidence items with source, location, observation
  - Deterministic ship policy: READY/REVIEW_REQUIRED/BLOCKED
  - Security-sensitive absence defaults to UNSUPPORTED/BLOCKED
  - _Requirements: 1, 2, 3_

- [x] 5. Kiro spec intelligence
  - Parse tasks.md with checkbox states and hierarchy
  - Parse design.md sections with locations
  - Resolve task-to-requirement and requirement-to-design links
  - Load full Kiro spec directory with diagnostics
  - _Requirements: 2.1, 2.2_

- [x] 6. Snapshot and transition inference
  - Capture task states, Git state, and file fingerprints
  - Persist snapshots atomically
  - Infer exactly one completed task from paired snapshots
  - Reject ambiguous or missing transitions
  - _Requirements: 1.1, 1.2, 2.4_

- [x] 7. Paired hook adapters and CLI
  - Pre-task snapshot capture via CLI
  - Post-task audit with report persistence
  - Exit 0 for all domain outcomes including BLOCKED
  - Concise hook summary for Kiro context
  - Agent Skill with approval-gated repair protocol
  - _Requirements: 1, 3, 4_

- [ ] 8. Task-scoped evidence bundles
  - Collect only evidence relevant to the completed task
  - Include transition, Git diff, source, static checks
  - Scope retrieval toward linked criteria and changed files
  - _Requirements: 2.2, 2.3, 2.4_

- [ ] 9. Bounded evidence adjudication
  - Deterministic checks before LLM adjudication
  - Require citations to bundle evidence only
  - Distinguish structural, behavioral, and security criteria
  - Enforce security-sensitive absence as UNSUPPORTED
  - _Requirements: 2, 3_

- [ ] 10. Non-mutating repair previews
  - Generate previews from report gaps
  - Previews change nothing until explicit approval
  - Bind approval to report ID and preview scope
  - Automatic re-audit after approved repair
  - Never edit tasks.md
  - _Requirements: 4_

- [ ] 11. Golden demo scenario
  - Ownership check missing from delete route
  - SpecTruth reports UNSUPPORTED/BLOCKED
  - Repair preview offered
  - Explicit approval triggers fix
  - Re-audit reaches READY
  - _Requirements: 1, 2, 3, 4, 5_

- [ ] 12. Documentation and demo materials
  - README rewritten for Done Integrity
  - Architecture and workflow diagrams
  - Setup instructions and limitations
  - Recorded golden demo
  - _Requirements: 5_
