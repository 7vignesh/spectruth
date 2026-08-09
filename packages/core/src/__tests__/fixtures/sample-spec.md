# Sample Feature — Requirements

## Introduction
A sample spec used by SpecTruth's own orchestration tests.

## Requirements

### Requirement 1
**User Story:** As a user, I want to register an account, so that I can sign in later.

#### Acceptance Criteria
1. WHEN a user provides valid email and password THEN the system SHALL create an account
2. WHEN a user provides a duplicate email THEN the system SHALL return a 409 error
