import { describe, expect, it } from 'vitest';
import { parseDesign } from '../design.js';
import { resolveTaskLinks } from '../links.js';
import { parseTasks } from '../tasks.js';
import type { ParsedSpec } from '../../types.js';

const DESIGN = `# Authentication — Design

## Overview
The auth module owns registration and login.

## Authorization service
Implements Requirement 3 by comparing ownerId with the caller.

### Ownership checks
Task 2.2 relies on this helper.

## Unrelated caching notes
No requirement is cited here.
`;

const REQUIREMENTS: ParsedSpec = {
  title: 'Authentication',
  introduction: '',
  requirements: [
    {
      id: 'REQ-2',
      title: 'register an account',
      userStory: '',
      acceptanceCriteria: [
        { id: 'REQ-2-AC-1', text: 'WHEN duplicate email THEN return 409', keyword: 'WHEN/THEN' },
        { id: 'REQ-2-AC-2', text: 'WHEN valid email THEN create account', keyword: 'WHEN/THEN' },
      ],
    },
    {
      id: 'REQ-3',
      title: 'own records',
      userStory: '',
      acceptanceCriteria: [
        { id: 'REQ-3-AC-1', text: 'WHEN caller is not owner THEN return 403', keyword: 'WHEN/THEN' },
      ],
    },
  ],
};

describe('parseDesign', () => {
  const design = parseDesign(DESIGN, 'design.md');

  it('extracts the design title without the suffix', () => {
    expect(design.title).toBe('Authentication');
  });

  it('captures sections with heading levels and locations', () => {
    expect(design.sections.map(section => section.heading)).toEqual([
      'Overview',
      'Authorization service',
      'Ownership checks',
      'Unrelated caching notes',
    ]);
    expect(design.sections[1].level).toBe(2);
    expect(design.sections[2].level).toBe(3);
    expect(design.sections[0].location).toEqual({ file: 'design.md', line: 3 });
  });

  it('captures section content', () => {
    expect(design.sections[1].content).toContain('comparing ownerId');
  });

  it('handles a design document with no headings', () => {
    const parsed = parseDesign('Just prose.\n', 'design.md');
    expect(parsed.sections).toEqual([]);
    expect(parsed.title).toBe('Untitled Design');
  });
});

describe('resolveTaskLinks', () => {
  const tasks = parseTasks(
    `- [ ] 2.1 Reject duplicates
  - _Requirements: 2.1_

- [ ] 2.2 Enforce ownership
  - _Requirements: 3_

- [ ] 4. Unknown link
  - _Requirements: 9.9_
`,
    'tasks.md',
  ).tasks;

  const design = parseDesign(DESIGN, 'design.md');
  const resolved = resolveTaskLinks({ tasks, requirements: REQUIREMENTS, design });

  it('resolves a criterion-level reference to one criterion', () => {
    const link = resolved.links.find(entry => entry.taskId === '2.1')!;
    expect(link.requirements.map(req => req.id)).toEqual(['REQ-2']);
    expect(link.criteria.map(criterion => criterion.id)).toEqual(['REQ-2-AC-1']);
  });

  it('expands a requirement-level reference to all of its criteria', () => {
    const link = resolved.links.find(entry => entry.taskId === '2.2')!;
    expect(link.criteria.map(criterion => criterion.id)).toEqual(['REQ-3-AC-1']);
  });

  it('reports unresolved references instead of guessing', () => {
    const link = resolved.links.find(entry => entry.taskId === '4')!;
    expect(link.requirements).toEqual([]);
    expect(link.criteria).toEqual([]);
    expect(link.unresolvedRefs).toEqual(['9.9']);
    expect(resolved.diagnostics.some(d => d.code === 'REQUIREMENT_REF_UNRESOLVED')).toBe(true);
  });

  it('links only design sections that explicitly cite the task or requirement', () => {
    const ownership = resolved.links.find(entry => entry.taskId === '2.2')!;
    const headings = ownership.designSections.map(section => section.heading);
    expect(headings).toContain('Authorization service');
    expect(headings).toContain('Ownership checks');
    expect(headings).not.toContain('Unrelated caching notes');
    expect(headings).not.toContain('Overview');
  });

  it('produces no design links when design is absent', () => {
    const withoutDesign = resolveTaskLinks({ tasks, requirements: REQUIREMENTS });
    expect(withoutDesign.links.every(link => link.designSections.length === 0)).toBe(true);
  });

  it('produces one link entry per task', () => {
    expect(resolved.links.map(link => link.taskId)).toEqual(['2.1', '2.2', '4']);
  });
});
