# Records API — Requirements

## Introduction

A small records service used to demonstrate SpecTruth. The delete endpoint is
the interesting part: the spec requires an ownership check, and the agent that
"completed" the task never wrote one.

## Requirements

### Requirement 1
**User Story:** As a signed-in user, I want to delete a record I own, so that I can remove my own data.

#### Acceptance Criteria
1. WHEN a user requests to delete a record they own THEN the system SHALL delete the record and return 204
2. WHEN a user requests to delete a record they do not own THEN the system SHALL refuse and return 403

### Requirement 2
**User Story:** As an operator, I want record listings paginated, so that large accounts stay responsive.

#### Acceptance Criteria
1. WHEN a user requests the record list THEN the system SHALL return at most 50 records per page
