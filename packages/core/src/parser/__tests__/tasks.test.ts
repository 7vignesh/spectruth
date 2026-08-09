import { describe, expect, it } from 'vitest';
import { parseRequirementRefs, parseTasks } from '../tasks.js';

const KIRO_STANDARD = `# Authentication — Tasks

## Implementation Plan

- [x] 1. Set up the auth module
  - Create the directory layout
  - Add the router entry point
  - _Requirements: 1.1, 1.2_

- [ ] 2. Implement registration
  - _Requirements: 2_

- [-] 2.1 Reject duplicate email
  - Return HTTP 409 for an existing address
  - _Requirements: 2.1, 2.2_

- [ ] 2.2 Enforce record ownership
  - _Requirements: 3.1_
`;

const TASK_PREFIX_FORMAT = `# SpecTruth — Tasks

## Implementation Tasks

- [x] Task 1: Project scaffolding + monorepo setup
- [ ] Task 2: Spec parser — markdown to structured JSON
`;

describe('parseTasks — standard Kiro format', () => {
  const parsed = parseTasks(KIRO_STANDARD, 'tasks.md');

  it('extracts the document title', () => {
    expect(parsed.title).toBe('Authentication');
  });

  it('parses every task', () => {
    expect(parsed.tasks.map(task => task.id)).toEqual(['1', '2', '2.1', '2.2']);
  });

  it('maps all three checkbox states', () => {
    expect(parsed.tasks[0].state).toBe('completed');
    expect(parsed.tasks[1].state).toBe('not_started');
    expect(parsed.tasks[2].state).toBe('in_progress');
  });

  it('extracts titles without the identifier prefix', () => {
    expect(parsed.tasks[0].title).toBe('Set up the auth module');
    expect(parsed.tasks[2].title).toBe('Reject duplicate email');
  });

  it('collects multi-line descriptions excluding requirement footers', () => {
    expect(parsed.tasks[0].description).toEqual([
      'Create the directory layout',
      'Add the router entry point',
    ]);
    expect(parsed.tasks[0].description.join(' ')).not.toContain('Requirements');
  });

  it('records source locations', () => {
    expect(parsed.tasks[0].location).toEqual({ file: 'tasks.md', line: 5 });
    expect(parsed.tasks[1].location.line).toBeGreaterThan(parsed.tasks[0].location.line);
  });

  it('resolves dotted hierarchy', () => {
    const child = parsed.tasks.find(task => task.id === '2.1')!;
    const parent = parsed.tasks.find(task => task.id === '2')!;
    expect(child.parentId).toBe('2');
    expect(child.depth).toBe(1);
    expect(parent.depth).toBe(0);
    expect(parent.childIds).toEqual(['2.1', '2.2']);
  });

  it('parses multiple requirement references', () => {
    expect(parsed.tasks[0].requirementRefs).toEqual([
      { raw: '1.1', requirementId: 'REQ-1', criterionId: 'REQ-1-AC-1' },
      { raw: '1.2', requirementId: 'REQ-1', criterionId: 'REQ-1-AC-2' },
    ]);
  });

  it('parses a requirement-level reference without a criterion', () => {
    expect(parsed.tasks[1].requirementRefs).toEqual([
      { raw: '2', requirementId: 'REQ-2' },
    ]);
  });

  it('serializes and deserializes without loss', () => {
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });
});

describe('parseTasks — Task N: format', () => {
  const parsed = parseTasks(TASK_PREFIX_FORMAT, 'tasks.md');

  it('extracts identifiers and titles', () => {
    expect(parsed.tasks.map(task => task.id)).toEqual(['1', '2']);
    expect(parsed.tasks[0].title).toBe('Project scaffolding + monorepo setup');
    expect(parsed.tasks[1].title).toBe('Spec parser — markdown to structured JSON');
  });

  it('parses mixed completion states', () => {
    expect(parsed.tasks[0].state).toBe('completed');
    expect(parsed.tasks[1].state).toBe('not_started');
  });

  it('reports tasks with no requirement references', () => {
    expect(parsed.diagnostics.some(d => d.code === 'TASK_NO_REQUIREMENT_REFS')).toBe(true);
  });
});

describe('parseTasks — diagnostics and edge cases', () => {
  it('reports a malformed checkbox and does not treat it as completed', () => {
    const parsed = parseTasks('- [y] 1. Ambiguous task\n', 'tasks.md');
    expect(parsed.tasks[0].state).toBe('not_started');
    expect(parsed.diagnostics.some(d => d.code === 'TASK_MALFORMED_CHECKBOX')).toBe(true);
  });

  it('assigns positional identifiers when tasks are unnumbered', () => {
    const parsed = parseTasks('- [ ] Do the thing\n  - [ ] Do the nested thing\n', 'tasks.md');
    expect(parsed.tasks.map(task => task.id)).toEqual(['1', '1.1']);
    expect(parsed.tasks[1].parentId).toBe('1');
  });

  it('disambiguates duplicate identifiers', () => {
    const parsed = parseTasks('- [ ] 1. First\n- [ ] 1. Second\n', 'tasks.md');
    expect(parsed.tasks.map(task => task.id)).toEqual(['1', '1~2']);
    expect(parsed.diagnostics.some(d => d.code === 'TASK_DUPLICATE_ID')).toBe(true);
  });

  it('reports an empty implementation plan', () => {
    const parsed = parseTasks('# Tasks\n\nNothing here yet.\n', 'tasks.md');
    expect(parsed.tasks).toEqual([]);
    expect(parsed.diagnostics.some(d => d.code === 'TASKS_EMPTY')).toBe(true);
  });

  it('ignores content that is not indented under a task', () => {
    const parsed = parseTasks('- [ ] 1. Task one\nUnrelated paragraph\n', 'tasks.md');
    expect(parsed.tasks[0].description).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const parsed = parseTasks('- [x] 1. Windows task\r\n  - _Requirements: 1.1_\r\n', 'tasks.md');
    expect(parsed.tasks[0].state).toBe('completed');
    expect(parsed.tasks[0].requirementRefs[0].criterionId).toBe('REQ-1-AC-1');
  });

  it('supports tab indentation for nesting', () => {
    const parsed = parseTasks('- [ ] 1. Parent\n\t- [ ] Child\n', 'tasks.md');
    expect(parsed.tasks[1].parentId).toBe('1');
  });
});

describe('parseRequirementRefs', () => {
  it('parses criterion and requirement references', () => {
    expect(parseRequirementRefs('1.1, 2, REQ-3')).toEqual([
      { raw: '1.1', requirementId: 'REQ-1', criterionId: 'REQ-1-AC-1' },
      { raw: '2', requirementId: 'REQ-2' },
      { raw: 'REQ-3', requirementId: 'REQ-3' },
    ]);
  });

  it('ignores unparseable tokens', () => {
    expect(parseRequirementRefs('see design, TBD')).toEqual([]);
  });
});
