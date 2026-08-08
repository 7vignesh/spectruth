# SpecTruth — Requirements

## Introduction
SpecTruth is a spec conformance verifier that independently checks whether AI-generated code satisfies the requirements defined in a Kiro spec. It parses structured specs, analyzes codebases, and produces pass/fail reports with evidence.

## Requirements

### Requirement 1
**User Story:** As a developer using Kiro, I want SpecTruth to automatically verify my spec after a task completes, so that I know immediately if requirements were missed without manual review.

#### Acceptance Criteria
1. WHEN a Kiro spec task completes THEN SpecTruth SHALL automatically trigger via PostTaskExec hook
2. WHEN SpecTruth runs THEN it SHALL parse the spec's requirements.md and extract all acceptance criteria
3. WHEN verification completes THEN SpecTruth SHALL output a pass/fail report to the terminal
4. IF no LLM provider is configured THEN SpecTruth SHALL display a clear error with setup instructions

### Requirement 2
**User Story:** As a developer, I want SpecTruth to verify each acceptance criterion independently against my codebase, so that I get granular feedback on what's implemented and what's missing.

#### Acceptance Criteria
1. WHEN given a spec with multiple requirements THEN SpecTruth SHALL verify each acceptance criterion separately
2. WHEN verifying a criterion THEN SpecTruth SHALL search the codebase for relevant code snippets
3. WHEN relevant code is found THEN SpecTruth SHALL send the criterion + code to an LLM for judgment
4. WHEN the LLM responds THEN SpecTruth SHALL return a verdict of PASS, FAIL, or PARTIAL with evidence
5. IF no relevant code is found for a criterion THEN SpecTruth SHALL report FAIL with "No implementation evidence found"

### Requirement 3
**User Story:** As a developer not using Kiro, I want to run SpecTruth as a standalone CLI tool with my own API key, so that I can verify specs regardless of my IDE.

#### Acceptance Criteria
1. WHEN a user runs `spectruth verify --spec <path> --code <path>` THEN the tool SHALL verify and report results
2. WHEN ANTHROPIC_API_KEY is set in environment THEN SpecTruth SHALL use the Anthropic provider
3. WHEN OPENAI_API_KEY is set in environment THEN SpecTruth SHALL use the OpenAI provider
4. WHEN neither key is available and not in Kiro THEN SpecTruth SHALL exit with a helpful error message
5. WHEN --output json flag is provided THEN SpecTruth SHALL output structured JSON instead of terminal colors

### Requirement 4
**User Story:** As a developer, I want SpecTruth to produce clear, actionable reports that show exactly what passed and what failed with evidence, so that I can quickly fix missing implementations.

#### Acceptance Criteria
1. WHEN verification completes THEN the report SHALL show an overall score (e.g., "8/11 criteria satisfied")
2. WHEN a criterion passes THEN the report SHALL show the file and line number as evidence
3. WHEN a criterion fails THEN the report SHALL explain what's missing and suggest what to implement
4. WHEN a criterion is partially met THEN the report SHALL explain what's done and what's remaining
5. WHEN the CLI runs THEN it SHALL exit with code 0 on full pass and code 1 on any failure

### Requirement 5
**User Story:** As a developer, I want to add SpecTruth to any project with a single command, so that setup is frictionless.

#### Acceptance Criteria
1. WHEN a user runs `spectruth init` THEN the tool SHALL create .kiro/hooks/spectruth-verify.json in the project
2. WHEN a user runs `spectruth init` THEN the tool SHALL create .kiro/agents/spectruth.json in the project
3. WHEN the hook file is created THEN it SHALL be configured with PostTaskExec trigger
4. WHEN init completes THEN the tool SHALL display a success message with usage instructions
