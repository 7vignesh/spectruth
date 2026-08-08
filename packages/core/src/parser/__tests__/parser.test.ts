import { describe, it, expect } from 'vitest';
import { parseSpec } from '../index.js';

// ─── Test: Standard Kiro Format (EARS notation) ──────────────────────────────

const KIRO_SPEC = `# User Authentication — Requirements

## Introduction
This feature implements a secure user authentication system.

## Requirements

### Requirement 1
**User Story:** As a new user, I want to create an account with email and password, so that I can access the application.

#### Acceptance Criteria
1. WHEN a user provides valid email and password THEN the system SHALL create a new user account
2. WHEN a user provides an email that already exists THEN the system SHALL return a 409 error
3. WHEN a user provides a weak password THEN the system SHALL reject the input
4. IF the email format is invalid THEN the system SHALL return a validation error

### Requirement 2
**User Story:** As a registered user, I want to log in with my credentials, so that I can access my account.

#### Acceptance Criteria
1. WHEN a user provides correct email and password THEN the system SHALL authenticate and create a session
2. WHEN a user provides incorrect credentials THEN the system SHALL return an authentication error
3. WHEN a user attempts multiple failed logins THEN the system SHALL implement rate limiting
`;

describe('parseSpec — Kiro standard format', () => {
  const result = parseSpec(KIRO_SPEC);

  it('extracts the title', () => {
    expect(result.title).toBe('User Authentication');
  });

  it('extracts the introduction', () => {
    expect(result.introduction).toContain('secure user authentication system');
  });

  it('extracts all requirements', () => {
    expect(result.requirements).toHaveLength(2);
  });

  it('extracts requirement IDs', () => {
    expect(result.requirements[0].id).toBe('REQ-1');
    expect(result.requirements[1].id).toBe('REQ-2');
  });

  it('extracts user stories', () => {
    expect(result.requirements[0].userStory).toContain('As a new user');
    expect(result.requirements[1].userStory).toContain('As a registered user');
  });

  it('extracts requirement titles from user stories', () => {
    expect(result.requirements[0].title).toContain('create an account');
  });

  it('extracts acceptance criteria', () => {
    expect(result.requirements[0].acceptanceCriteria).toHaveLength(4);
    expect(result.requirements[1].acceptanceCriteria).toHaveLength(3);
  });

  it('assigns criterion IDs correctly', () => {
    const criteria = result.requirements[0].acceptanceCriteria;
    expect(criteria[0].id).toBe('REQ-1-AC-1');
    expect(criteria[1].id).toBe('REQ-1-AC-2');
    expect(criteria[2].id).toBe('REQ-1-AC-3');
    expect(criteria[3].id).toBe('REQ-1-AC-4');
  });

  it('detects WHEN/THEN keywords', () => {
    const criteria = result.requirements[0].acceptanceCriteria;
    expect(criteria[0].keyword).toBe('WHEN/THEN');
    expect(criteria[1].keyword).toBe('WHEN/THEN');
  });

  it('detects IF/THEN keywords', () => {
    const criteria = result.requirements[0].acceptanceCriteria;
    expect(criteria[3].keyword).toBe('IF/THEN');
  });

  it('preserves criterion text', () => {
    const criteria = result.requirements[0].acceptanceCriteria;
    expect(criteria[0].text).toContain('valid email and password');
    expect(criteria[1].text).toContain('409 error');
  });
});

// ─── Test: Plain numbered list format (non-EARS) ─────────────────────────────

const PLAIN_SPEC = `# Todo App Requirements

## Introduction
A simple todo application with basic CRUD operations.

## Requirements

### Requirement 1
**User Story:** As a user, I want to manage my todos, so that I can track my tasks.

#### Acceptance Criteria
1. Users can create a new todo with a title
2. Users can mark a todo as complete
3. Users can delete a todo
4. Completed todos should be visually distinct from active ones
`;

describe('parseSpec — plain numbered list (no EARS keywords)', () => {
  const result = parseSpec(PLAIN_SPEC);

  it('parses plain format correctly', () => {
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].acceptanceCriteria).toHaveLength(4);
  });

  it('marks criteria without EARS keywords as plain', () => {
    const criteria = result.requirements[0].acceptanceCriteria;
    expect(criteria[0].keyword).toBe('plain');
    expect(criteria[1].keyword).toBe('plain');
  });

  it('preserves the criterion text', () => {
    const criteria = result.requirements[0].acceptanceCriteria;
    expect(criteria[0].text).toBe('Users can create a new todo with a title');
    expect(criteria[2].text).toBe('Users can delete a todo');
  });
});

// ─── Test: Fallback format (no ### Requirement headings) ─────────────────────

const MINIMAL_SPEC = `# API Requirements

1. The API should return JSON responses
2. All endpoints should require authentication
3. Rate limiting should be enforced at 100 req/min
4. Error responses should follow RFC 7807 format
`;

describe('parseSpec — minimal fallback format', () => {
  const result = parseSpec(MINIMAL_SPEC);

  it('parses a simple numbered list as one requirement', () => {
    expect(result.requirements).toHaveLength(1);
  });

  it('extracts all items as acceptance criteria', () => {
    expect(result.requirements[0].acceptanceCriteria).toHaveLength(4);
  });

  it('uses the document title as requirement title', () => {
    expect(result.requirements[0].title).toBe('API Requirements');
  });

  it('preserves criterion text correctly', () => {
    const criteria = result.requirements[0].acceptanceCriteria;
    expect(criteria[2].text).toContain('Rate limiting');
    expect(criteria[3].text).toContain('RFC 7807');
  });
});

// ─── Test: Edge cases ────────────────────────────────────────────────────────

describe('parseSpec — edge cases', () => {
  it('handles empty string', () => {
    const result = parseSpec('');
    expect(result.title).toBe('Untitled Spec');
    expect(result.requirements).toHaveLength(0);
  });

  it('handles spec with no acceptance criteria', () => {
    const spec = `# My Spec\n\n## Requirements\n\n### Requirement 1\n**User Story:** As a user, I want stuff.\n`;
    const result = parseSpec(spec);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].acceptanceCriteria).toHaveLength(0);
  });

  it('handles mixed EARS and plain criteria', () => {
    const spec = `# Mixed Spec

## Requirements

### Requirement 1
**User Story:** As a user, I want mixed criteria, so that I can test parsing.

#### Acceptance Criteria
1. WHEN the user clicks submit THEN the form SHALL be validated
2. The page should load in under 2 seconds
3. IF the session expires THEN the user SHALL be redirected to login
`;
    const result = parseSpec(spec);
    const criteria = result.requirements[0].acceptanceCriteria;

    expect(criteria).toHaveLength(3);
    expect(criteria[0].keyword).toBe('WHEN/THEN');
    expect(criteria[1].keyword).toBe('plain');
    expect(criteria[2].keyword).toBe('IF/THEN');
  });
});
