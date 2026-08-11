# SpecTruth — Tasks

## Done Integrity Implementation Plan

- [x] 1. Project scaffolding and monorepo setup
  - pnpm workspace with core and cli packages, TypeScript strict, vitest, ESM
  - _Requirements: 5.4_

- [x] 2. Requirements parser with EARS notation
  - Parse requirements.md into structured requirements and acceptance criteria
  - _Requirements: 2.1_

- [x] 3. Code retriever with keyword ranking
  - Walk the file tree and extract source snippets relevant to a criterion
  - _Requirements: 2.2_

- [x] 4. Evidence-backed domain model
  - Four evidence states replacing pass and fail verdicts
  - Mandatory justification on every finding, rejected at runtime when empty
  - Deterministic ship policy over the three ship decisions
  - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.6_

- [x] 5. Kiro spec intelligence
  - Parse tasks.md with checkbox states and hierarchy, and design.md sections
  - Resolve task to requirement links from explicit references only
  - _Requirements: 2.1, 2.6_

- [x] 6. Snapshot capture and transition inference
  - Capture task states, Git state, and file fingerprints
  - Identify exactly one completed task, and refuse when ambiguous
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 7. Paired task hooks and concise summary
  - Pre-task snapshot and post-task audit with report persistence
  - A blocked decision exits zero so the summary reaches agent context
  - _Requirements: 5.2, 5.3_

- [x] 8. Task-scoped evidence bundles
  - Collect transition, changed files, diff hunks, source, and static evidence
  - Exclude documentation so prose cannot be cited as implementation
  - _Requirements: 2.2, 2.3_

- [x] 9. Bounded evidence adjudication
  - Deterministic checks decide first; a provider may refine within the bundle
  - Security-sensitive criteria without complete enforcement report unsupported
  - _Requirements: 2.4, 2.5, 3.4, 3.5_

- [x] 10. Approval-gated repair previews
  - Previews describe work without changing any file
  - Approval bound to one preview, one report, and the covered file contents
  - Re-audit after an approved repair, and never modify tasks.md
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 11. On-demand audit and installable entry points
  - Audit the current project with no subcommand and no prior snapshot
  - Self-contained demo, and init that scaffolds the Kiro integration
  - _Requirements: 1.3, 1.4, 5.1, 5.4, 5.5, 5.6_

- [ ] 12. Demo video and submission materials
  - Recorded walkthrough of the audit and repair loop
  - _Requirements: 5.5_
