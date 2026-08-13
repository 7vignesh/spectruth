import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildEvidenceBundle } from '../bundle.js';
import { adjudicateBundle, buildAdjudicationPrompt } from '../adjudicate.js';
import { transitionToEvidence, diffHunksToEvidence, staticFindingsToEvidence, isImplementationFile } from '../collectors.js';
import { loadKiroSpec } from '../../parser/kiro-spec.js';
import { captureSnapshot, inferCompletedTaskForSpec, captureSpecSnapshot } from '../../snapshot/index.js';
import type { CompletedTaskTransition, LLMProvider, TaskEvidenceBundle } from '../../types.js';

const REQUIREMENTS = `# Records — Requirements

## Requirements

### Requirement 1
**User Story:** As a user, I want to delete my own records, so that my data stays private.

#### Acceptance Criteria
1. WHEN the caller owns the record THEN the system SHALL delete it
2. WHEN the caller is not the owner THEN the system SHALL return 403

### Requirement 2
**User Story:** As a user, I want pagination, so that large lists load quickly.

#### Acceptance Criteria
1. WHEN a list is requested THEN the system SHALL return at most 50 items
`;

const DESIGN = `# Records — Design

## Authorization service
Requirement 1 requires comparing ownerId with the authenticated caller.
`;

function tasksMarkdown(state: ' ' | 'x', taskRef = '1.2'): string {
  return `# Records — Tasks

- [x] 1. Add the delete route
  - _Requirements: 1.1_

- [${state}] 2. Enforce record ownership
  - _Requirements: ${taskRef}_
`;
}

let root: string;
let specDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spectruth evidence '));
  specDir = join(root, '.kiro', 'specs', 'records');
  mkdirSync(specDir, { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(specDir, 'requirements.md'), REQUIREMENTS, 'utf-8');
  writeFileSync(join(specDir, 'design.md'), DESIGN, 'utf-8');
  writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown(' '), 'utf-8');
  writeFileSync(join(root, 'src', 'records.ts'), 'export function remove(id) { return db.delete(id); }\n', 'utf-8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Capture a snapshot, complete the task, and produce the resulting bundle. */
async function bundleForCompletedTask(extraFiles: Record<string, string> = {}): Promise<TaskEvidenceBundle> {
  captureSpecSnapshot({ specDir, codePath: root, projectRoot: root });

  for (const [path, contents] of Object.entries(extraFiles)) {
    writeFileSync(join(root, path), contents, 'utf-8');
  }
  writeFileSync(join(specDir, 'tasks.md'), tasksMarkdown('x'), 'utf-8');

  const inferred = inferCompletedTaskForSpec({ specDir, codePath: root, projectRoot: root });
  if (!inferred.inference.ok) throw new Error('expected a transition');

  return buildEvidenceBundle({
    spec: inferred.spec,
    transition: inferred.inference.transition,
    codebasePath: root,
  });
}

function mockProvider(response: string): LLMProvider {
  return { name: 'mock', async verify() { return response; } };
}

describe('buildEvidenceBundle', () => {
  it('scopes the bundle to the completed task', async () => {
    const bundle = await bundleForCompletedTask();

    expect(bundle.taskId).toBe('2');
    expect(bundle.taskTitle).toBe('Enforce record ownership');
    expect(bundle.specName).toBe('records');
    expect(bundle.codebasePath).toBe(root);
  });

  it('includes only the criteria linked to the task', async () => {
    const bundle = await bundleForCompletedTask();

    expect(bundle.criteria.map(criterion => criterion.id)).toEqual(['REQ-1-AC-2']);
    expect(bundle.requirements.map(requirement => requirement.id)).toEqual(['REQ-1']);
  });

  it('excludes requirements the task does not reference', async () => {
    const bundle = await bundleForCompletedTask();
    const criterionIds = bundle.criteria.map(criterion => criterion.id);

    expect(criterionIds).not.toContain('REQ-2-AC-1');
    expect(criterionIds).not.toContain('REQ-1-AC-1');
  });

  it('carries the transition as evidence context', async () => {
    const bundle = await bundleForCompletedTask();

    expect(bundle.transition.taskId).toBe('2');
    expect(bundle.transition.previousState).toBe('not_started');
    expect(bundle.transition.currentState).toBe('completed');
  });

  it('includes explicitly cited design context', async () => {
    const bundle = await bundleForCompletedTask();

    expect(bundle.designContext.map(section => section.heading))
      .toContain('Authorization service');
  });

  it('records changed files from the transition', async () => {
    const bundle = await bundleForCompletedTask({
      'src/authorization.ts': 'export function assertOwner() {}\n',
    });

    expect(bundle.changedFiles.map(change => change.path))
      .toContain('src/authorization.ts');
  });

  it('produces diff hunks for changed files', async () => {
    const bundle = await bundleForCompletedTask({
      'src/authorization.ts': 'export function assertOwner(userId, record) {\n  return record.ownerId === userId;\n}\n',
    });

    const files = bundle.diffHunks.map(hunk => hunk.file);
    expect(files).toContain('src/authorization.ts');
  });

  it('runs static checks for the linked criteria', async () => {
    const bundle = await bundleForCompletedTask();

    expect(bundle.staticFindings.length).toBeGreaterThan(0);
    expect(bundle.staticFindings.every(finding => finding.criterionId === 'REQ-1-AC-2')).toBe(true);
  });

  it('handles a task with no linked requirement', async () => {
    captureSpecSnapshot({ specDir, codePath: root, projectRoot: root });
    writeFileSync(join(specDir, 'tasks.md'), '# T\n\n- [x] 1. Add the delete route\n  - _Requirements: 1.1_\n\n- [x] 2. Unlinked\n', 'utf-8');

    const inferred = inferCompletedTaskForSpec({ specDir, codePath: root, projectRoot: root });
    if (!inferred.inference.ok) throw new Error('expected transition');

    const bundle = await buildEvidenceBundle({
      spec: inferred.spec,
      transition: inferred.inference.transition,
      codebasePath: root,
    });

    expect(bundle.criteria).toEqual([]);
    expect(bundle.requirements).toEqual([]);
  });

  it('handles a transition with no file changes', async () => {
    const bundle = await bundleForCompletedTask();
    expect(Array.isArray(bundle.diffHunks)).toBe(true);
  });

  it('serializes without loss', async () => {
    const bundle = await bundleForCompletedTask();
    expect(JSON.parse(JSON.stringify(bundle)).taskId).toBe(bundle.taskId);
  });
});

describe('buildAdjudicationPrompt', () => {
  it('includes the criterion, task, and evidence sections', async () => {
    const bundle = await bundleForCompletedTask();
    const prompt = buildAdjudicationPrompt(bundle.criteria[0], bundle);

    expect(prompt).toContain('REQ-1-AC-2');
    expect(prompt).toContain('not the owner');
    expect(prompt).toContain('Enforce record ownership');
    expect(prompt).toContain('Static Evidence');
    expect(prompt).toContain('Source Code Evidence');
    expect(prompt).toContain('Git Diff Evidence');
  });

  it('requests the four evidence states and forbids scoring', async () => {
    const bundle = await bundleForCompletedTask();
    const prompt = buildAdjudicationPrompt(bundle.criteria[0], bundle);

    for (const state of ['SUPPORTED', 'PARTIAL', 'UNSUPPORTED', 'UNVERIFIED']) {
      expect(prompt).toContain(state);
    }
    expect(prompt).toContain('Do not use confidence values, percentages, or PASS/FAIL');
  });

  it('states the security-sensitive rule', async () => {
    const bundle = await bundleForCompletedTask();
    const prompt = buildAdjudicationPrompt(bundle.criteria[0], bundle);

    expect(prompt).toMatch(/authorization[\s\S]{0,200}UNSUPPORTED, never UNVERIFIED/i);
  });

  it('instructs the adjudicator to cite only bundle evidence', async () => {
    const bundle = await bundleForCompletedTask();
    const prompt = buildAdjudicationPrompt(bundle.criteria[0], bundle);

    expect(prompt).toMatch(/Only cite files and line numbers that appear in the evidence above/i);
  });
});

describe('isImplementationFile', () => {
  it('rejects documentation', () => {
    for (const path of ['README.md', 'docs/design.md', '.kiro/specs/x/tasks.md', 'notes.mdx']) {
      expect(isImplementationFile(path), path).toBe(false);
    }
  });

  /**
   * A changed .gitignore once lifted a missing rate limit from UNSUPPORTED to
   * UNVERIFIED, because any file change counted as implementation activity.
   */
  it('rejects repository metadata and dotfiles', () => {
    for (const path of ['.gitignore', '.env', '.npmrc', 'LICENSE', 'pnpm-lock.yaml', 'package-lock.json']) {
      expect(isImplementationFile(path), path).toBe(false);
    }
  });

  it('accepts source files', () => {
    for (const path of ['src/auth.ts', 'lib/handler.py', 'package.json', 'src/app/page.tsx']) {
      expect(isImplementationFile(path), path).toBe(true);
    }
  });
});

describe('adjudicateBundle — deterministic only', () => {
  it('blocks a security criterion with no enforcement evidence', async () => {
    const bundle = await bundleForCompletedTask();
    const [audit] = await adjudicateBundle({ bundle });

    expect(audit.state).toBe('UNSUPPORTED');
    expect(audit.justification).toMatch(/security-sensitive/i);
    expect(audit.repairPreviewAvailable).toBe(true);
  });

  it('produces one audit per linked criterion', async () => {
    const bundle = await bundleForCompletedTask();
    const audits = await adjudicateBundle({ bundle });

    expect(audits).toHaveLength(bundle.criteria.length);
    expect(audits[0].criterionId).toBe('REQ-1-AC-2');
  });

  it('always includes a non-empty justification', async () => {
    const bundle = await bundleForCompletedTask();
    const audits = await adjudicateBundle({ bundle });

    for (const audit of audits) {
      expect(audit.justification.trim().length).toBeGreaterThan(0);
    }
  });

  it('never emits confidence or percentage fields', async () => {
    const bundle = await bundleForCompletedTask();
    const audits = await adjudicateBundle({ bundle });

    for (const audit of audits) {
      expect(audit).not.toHaveProperty('confidence');
      expect(audit).not.toHaveProperty('score');
      expect(JSON.stringify(audit)).not.toMatch(/\b\d+%/);
    }
  });
});

describe('adjudicateBundle — with a provider', () => {
  it('accepts a well-formed supported adjudication', async () => {
    const bundle = await bundleForCompletedTask({
      'src/authorization.ts': 'export function assertOwner(u, r) { if (r.ownerId !== u) throw new Error("403"); }\n',
    });

    const provider = mockProvider(JSON.stringify({
      state: 'SUPPORTED',
      justification: 'assertOwner compares ownerId with the caller and rejects a mismatch.',
      evidence: [{
        source: 'source-code',
        location: { file: 'src/authorization.ts', line: 1 },
        observation: 'Ownership comparison present',
        supports: true,
      }],
      gaps: [],
    }));

    const [audit] = await adjudicateBundle({ bundle, provider });
    expect(audit.state).toBe('SUPPORTED');
    expect(audit.justification).toContain('assertOwner');
  });

  it('accepts partial and unsupported adjudications', async () => {
    const bundle = await bundleForCompletedTask();

    for (const state of ['PARTIAL', 'UNSUPPORTED', 'UNVERIFIED'] as const) {
      const provider = mockProvider(JSON.stringify({
        state,
        justification: `Adjudicated as ${state} from the bundle evidence.`,
        evidence: [],
        gaps: ['Something is missing'],
      }));
      const [audit] = await adjudicateBundle({ bundle, provider });
      expect(audit.state).toBe(state);
    }
  });

  it('parses a response wrapped in a markdown block', async () => {
    const bundle = await bundleForCompletedTask();
    const provider = mockProvider(
      '```json\n{"state":"UNSUPPORTED","justification":"No ownership check exists.","evidence":[],"gaps":["Missing check"]}\n```',
    );

    const [audit] = await adjudicateBundle({ bundle, provider });
    expect(audit.state).toBe('UNSUPPORTED');
    expect(audit.gaps).toContain('Missing check');
  });

  it('drops a citation to a file that is not in the bundle', async () => {
    const bundle = await bundleForCompletedTask();
    const provider = mockProvider(JSON.stringify({
      state: 'SUPPORTED',
      justification: 'Claims support from a file that was never collected.',
      evidence: [{
        source: 'source-code',
        location: { file: 'src/does-not-exist.ts', line: 42 },
        observation: 'Invented citation',
        supports: true,
      }],
      gaps: [],
    }));

    const [audit] = await adjudicateBundle({ bundle, provider });
    const invented = audit.evidence.find(item => item.observation === 'Invented citation');
    expect(invented).toBeDefined();
    expect(invented!.location).toBeUndefined();
  });

  it('replaces an empty justification with an explicit review note', async () => {
    const bundle = await bundleForCompletedTask();
    const provider = mockProvider(JSON.stringify({
      state: 'SUPPORTED',
      justification: '   ',
      evidence: [],
      gaps: [],
    }));

    const [audit] = await adjudicateBundle({ bundle, provider });
    expect(audit.justification.trim().length).toBeGreaterThan(0);
    expect(audit.gaps.join(' ')).toMatch(/empty justification/i);
  });

  it('falls back to deterministic evidence when the response is malformed', async () => {
    const bundle = await bundleForCompletedTask();
    const provider = mockProvider('not json at all');

    const [audit] = await adjudicateBundle({ bundle, provider });
    expect(audit.state).toBe('UNSUPPORTED');
    expect(audit.gaps.join(' ')).toMatch(/malformed/i);
  });

  it('falls back to deterministic evidence when the provider throws', async () => {
    const bundle = await bundleForCompletedTask();
    const provider: LLMProvider = {
      name: 'failing',
      async verify() { throw new Error('network down'); },
    };

    const [audit] = await adjudicateBundle({ bundle, provider });
    expect(audit.state).toBe('UNSUPPORTED');
    expect(audit.justification.trim().length).toBeGreaterThan(0);
  });

  it('defaults an unknown state conservatively for a security criterion', async () => {
    const bundle = await bundleForCompletedTask();
    const provider = mockProvider(JSON.stringify({
      state: 'DEFINITELY_FINE',
      justification: 'Bogus state supplied.',
      evidence: [],
      gaps: [],
    }));

    const [audit] = await adjudicateBundle({ bundle, provider });
    expect(audit.state).toBe('UNSUPPORTED');
  });
});

describe('evidence item builders', () => {
  const transition: CompletedTaskTransition = {
    taskId: '2',
    title: 'Enforce record ownership',
    previousState: 'not_started',
    currentState: 'completed',
    location: { file: 'tasks.md', line: 6 },
    changedFiles: [{ path: 'src/records.ts', change: 'modified' }],
    gitHeadChanged: false,
    inferredFrom: 'snapshot-pair',
  };

  it('marks transition evidence as non-supporting', () => {
    const item = transitionToEvidence(transition);
    expect(item.source).toBe('task-transition');
    expect(item.supports).toBe(false);
    expect(item.observation).toContain('transitioned from not_started to completed');
  });

  it('does not claim an observed transition for a current-state audit', () => {
    const item = transitionToEvidence({ ...transition, inferredFrom: 'current-state' });
    expect(item.observation).toContain('is currently marked complete');
    expect(item.observation).toContain('no transition was observed');
    expect(item.observation).not.toContain('transitioned from');
    expect(item.supports).toBe(false);
  });

  it('marks a deleted file as non-supporting diff evidence', () => {
    const [item] = diffHunksToEvidence([
      { file: 'src/gone.ts', startLine: 0, content: '(file deleted)', change: 'deleted' },
    ]);
    expect(item.source).toBe('git-diff');
    expect(item.supports).toBe(false);
    expect(item.observation).toContain('deleted');
  });

  it('reflects static findings support state', () => {
    const items = staticFindingsToEvidence([
      { criterionId: 'REQ-1-AC-2', found: true, detail: 'Status code 403 found', file: 'src/a.ts', line: 3 },
      { criterionId: 'REQ-1-AC-2', found: false, detail: 'Ownership check missing' },
    ]);

    expect(items[0].supports).toBe(true);
    expect(items[0].location).toEqual({ file: 'src/a.ts', line: 3 });
    expect(items[1].supports).toBe(false);
    expect(items[1].location).toBeUndefined();
  });
});
