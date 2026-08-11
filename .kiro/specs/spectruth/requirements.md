# SpecTruth — Requirements

## Introduction

SpecTruth is a Done Integrity ship gate for spec-driven agentic development. When
an agent marks a spec task complete, that is a claim. SpecTruth audits the claim
against the acceptance criteria the task references and produces a ship decision
backed by evidence.

It is not a code reviewer and not a test runner. Its input is the completion
claim, which is why it can detect work that was never done rather than only work
that was done badly.

## Requirements

### Requirement 1
**User Story:** As a developer who delegates tasks to an agent, I want the tool to know which task was completed, so that evidence is attributed to the right claim.

#### Acceptance Criteria
1. WHEN a task changes from an incomplete state to complete between two snapshots THEN the system SHALL identify exactly that one task as the audited claim
2. IF more than one task completed between snapshots THEN the system SHALL refuse to audit and report the candidates rather than attributing evidence to a guessed task
3. WHEN a user asks whether work is done THEN the system SHALL audit the tasks currently marked complete without requiring a prior snapshot
4. WHEN no completed task exists in a spec THEN the system SHALL report that there is no completion claim to audit
5. WHERE a task was identified from current state rather than an observed transition THEN the system SHALL record that distinction in the evidence

### Requirement 2
**User Story:** As a developer, I want each acceptance criterion judged against real evidence, so that a verdict can be traced to something concrete.

#### Acceptance Criteria
1. WHEN auditing a completed task THEN the system SHALL resolve the acceptance criteria that the task references and audit only those
2. WHEN adjudicating a criterion THEN the system SHALL collect evidence from the task transition, changed files, source code, and deterministic static checks
3. IF documentation describes required behavior THEN the system SHALL NOT cite that documentation as evidence that the behavior is implemented
4. WHEN a finding is produced THEN it SHALL carry exactly one of SUPPORTED, PARTIAL, UNSUPPORTED, or UNVERIFIED together with a non-empty justification
5. IF no implementation evidence is found for a criterion THEN the system SHALL report UNSUPPORTED rather than assuming the work was done
6. WHEN a task references no requirement THEN the system SHALL report it as skipped rather than implying it passed

### Requirement 3
**User Story:** As an engineer deciding whether to ship, I want a decision rather than a score, so that I know what action to take.

#### Acceptance Criteria
1. WHEN any criterion is UNSUPPORTED or PARTIAL THEN the ship decision SHALL be BLOCKED
2. WHEN no criterion blocks and at least one is UNVERIFIED THEN the ship decision SHALL be REVIEW_REQUIRED
3. WHEN every audited criterion is SUPPORTED THEN the ship decision SHALL be READY
4. IF a security-sensitive criterion lacks complete enforcement evidence THEN the system SHALL report UNSUPPORTED and block the ship
5. WHEN no model provider is configured THEN the system SHALL still produce a verdict from static evidence alone and state that no model was used
6. WHERE a verdict is reported THEN the system SHALL NOT include confidence values, fidelity percentages, or completion scores

### Requirement 4
**User Story:** As a developer, I want repairs proposed rather than performed, so that nothing changes without my explicit consent.

#### Acceptance Criteria
1. WHEN a finding is not SUPPORTED THEN the system SHALL offer a repair preview describing the gap, the proposed change, and the evidence expected afterwards
2. WHEN a repair preview is generated THEN the working tree SHALL remain unchanged
3. IF a repair is attempted without a recorded approval THEN the system SHALL refuse it
4. WHEN approval is granted THEN it SHALL be bound to one preview, one report, and the contents of the files it would touch
5. IF the report findings or the covered files change after approval THEN the system SHALL refuse the stale approval and require a new one
6. WHEN an approved repair has been applied THEN the system SHALL re-audit and report whether that specific gap closed
7. WHERE any repair is authorized THEN the system SHALL NOT modify tasks.md or mark a task complete

### Requirement 5
**User Story:** As a Kiro user, I want to ask the agent whether work is done, so that auditing needs no separate tool or manual command.

#### Acceptance Criteria
1. WHEN a user asks the agent whether a task is complete THEN the agent SHALL run the audit and explain the ship decision, the required behavior, what was found, and what is missing
2. WHEN the audit runs as a task hook THEN a BLOCKED decision SHALL exit zero so that the summary reaches the agent's context
3. IF an operational failure occurs, such as an unreadable spec or a missing snapshot THEN the system SHALL exit non-zero
4. WHEN a user runs init THEN the system SHALL scaffold the agent skill, custom agent, and paired task hooks into the project
5. WHEN a user runs demo THEN the system SHALL demonstrate the full audit and repair loop without requiring a spec, an API key, or network access
6. WHEN a user runs the tool with no arguments THEN it SHALL audit the current project without needing a subcommand
