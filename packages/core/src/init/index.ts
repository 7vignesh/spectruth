/**
 * Project scaffolding.
 *
 * Writes the Kiro integration into a project: an Agent Skill, a custom agent,
 * and the paired task hooks. Commands are emitted as `npx spectruth ...` so the
 * configuration is portable to any project that has the package available.
 *
 * Existing files are never overwritten silently; they are reported as skipped.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export interface ScaffoldFile {
  path: string;
  status: 'created' | 'skipped';
}

export interface InitResult {
  projectRoot: string;
  files: ScaffoldFile[];
}

export interface InitOptions {
  projectRoot: string;
  /** Replace files that already exist. */
  force?: boolean;
}

export function runInit(options: InitOptions): InitResult {
  const root = resolve(options.projectRoot);
  const files: ScaffoldFile[] = [];

  for (const [relativePath, contents] of Object.entries(templates())) {
    const target = join(root, relativePath);

    if (existsSync(target) && !options.force) {
      files.push({ path: relativePath, status: 'skipped' });
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf-8');
    files.push({ path: relativePath, status: 'created' });
  }

  return { projectRoot: root, files };
}

export function formatInitResult(result: InitResult): string {
  const lines = ['SpecTruth — Kiro integration installed', ''];

  for (const file of result.files) {
    lines.push(`  ${file.status === 'created' ? 'created' : 'skipped'}  ${file.path}`);
  }

  const skipped = result.files.filter(file => file.status === 'skipped');
  if (skipped.length > 0) {
    lines.push('');
    lines.push('Skipped files already existed. Re-run with --force to replace them.');
  }

  lines.push('');
  lines.push('Next:');
  lines.push('  1. Reload Kiro so it picks up the skill and agent.');
  lines.push('  2. Ask the agent: "is my last completed task actually done?"');
  lines.push('');
  lines.push('Or audit straight away:  npx spectruth');

  return `${lines.join('\n')}\n`;
}

// ─── Templates ───────────────────────────────────────────────────────────────

function templates(): Record<string, string> {
  return {
    '.kiro/skills/spectruth/SKILL.md': SKILL,
    '.kiro/agents/spectruth.json': `${JSON.stringify(AGENT, null, 2)}\n`,
    '.kiro/hooks/spectruth-pre-task.json': `${JSON.stringify(PRE_HOOK, null, 2)}\n`,
    '.kiro/hooks/spectruth-post-task.json': `${JSON.stringify(POST_HOOK, null, 2)}\n`,
  };
}

const SKILL = `---
name: spectruth
description: Audits whether a completed Kiro spec task is actually supported by evidence. Use when the user asks if work is done, if a task is complete, why something is blocked, or asks for a fix that must be approved before anything changes.
---

# SpecTruth — Done Integrity

SpecTruth answers one question: **when a task is marked complete, does the
available evidence support that claim?**

It never edits \`tasks.md\`, never repairs code on its own, and never treats a
missing test suite as a failure.

## Evidence states

| State | Meaning |
|---|---|
| \`SUPPORTED\` | Evidence demonstrates the complete criterion |
| \`PARTIAL\` | Evidence demonstrates only part of the criterion |
| \`UNSUPPORTED\` | Implementation is absent, contradicted, or demonstrably incomplete |
| \`UNVERIFIED\` | Implementation may exist, but evidence cannot establish the behavior |

## Ship decisions

| Decision | Rule |
|---|---|
| \`BLOCKED\` | Any \`UNSUPPORTED\` or any \`PARTIAL\` finding |
| \`REVIEW_REQUIRED\` | No blocking findings, but at least one \`UNVERIFIED\` |
| \`READY\` | Every linked criterion is \`SUPPORTED\` |

A missing authorization, ownership, permission, credential, or encryption check
is \`UNSUPPORTED\` and therefore \`BLOCKED\`. It is never softened to
\`UNVERIFIED\`, and partial enforcement of a security requirement is not
enforcement.

## Commands

\`\`\`bash
npx spectruth audit --json              # audit every completed task
npx spectruth audit --task 3.2 --json   # audit one task
npx spectruth preview --report <id> --json
npx spectruth approve --report <id> --preview <id>
\`\`\`

## How to respond

1. Run \`npx spectruth audit --json\`, adding \`--task <id>\` when the user named one.
2. Lead with the ship decision and the task it applies to.
3. For each non-\`SUPPORTED\` criterion, state what was required, what was found,
   and what is missing. Cite file and line where the evidence has a location.
4. Never restate a finding as more certain than its state. \`UNVERIFIED\` means
   unproven, not failing.
5. If the audit skipped tasks that reference no requirement, say so plainly
   rather than implying they passed.

## Repairs require explicit approval

The audit already produces repair previews and changes nothing.

1. Show the preview: its id, the criterion, the gap, the proposed change, and
   the evidence expected afterwards.
2. Say plainly that nothing has been changed.
3. Ask for approval and **stop**. Wait for a separate reply.
4. Once approved, run \`npx spectruth approve\` and implement only that scope.
5. Never modify \`tasks.md\` and never mark a task complete.
6. Re-run \`npx spectruth audit --task <id>\` afterwards and report honestly
   whether the gap closed. If the criterion is still not \`SUPPORTED\`, say so.

An approval is bound to one preview, one report, and the files as they were when
it was granted. If any of those change, the approval is refused and you must ask
again.

## Exit codes

A \`BLOCKED\` decision is a domain result, not a tooling error, so the hooks exit
\`0\` and the summary reaches the agent's context. A non-zero exit means an
operational problem such as an unreadable spec or a missing snapshot.
`;

const AGENT = {
  name: 'spectruth',
  description:
    'Done Integrity ship gate for Kiro spec tasks — checks whether a completed task is actually supported by evidence, and never repairs anything without explicit approval',
  prompt:
    "You are SpecTruth, a Done Integrity layer. When a spec task is marked complete, you report whether the available evidence supports that completion claim.\n\nWhen the user asks whether work is done, whether a task is complete, or whether something is ready to ship, run `npx spectruth audit --json`, adding `--task <id>` when they named a task. Lead with the ship decision (READY, REVIEW_REQUIRED, or BLOCKED) and the task it applies to, then for each non-SUPPORTED criterion state what was required, what was found, and what is missing, citing file and line where the evidence has a location.\n\nUse only the four evidence states: SUPPORTED, PARTIAL, UNSUPPORTED, UNVERIFIED. Never invent confidence percentages or completion scores. Never describe a finding as more certain than its state; UNVERIFIED means unproven, not failing. A missing authorization, ownership, permission, credential, or encryption check is UNSUPPORTED and blocking.\n\nRepairs are approval-gated. The audit already produces repair previews and changes nothing. When asked to fix a finding, show the preview id, the criterion, the gap, the proposed change, and the evidence expected afterwards. State that nothing has been changed, ask for approval, and stop. Only after the user approves in a separate turn may you run `npx spectruth approve --report <id> --preview <id>` and implement exactly the authorized scope. Never modify tasks.md and never mark a task complete. Afterwards re-run `npx spectruth audit --task <id>` and report honestly whether the gap closed.",
  tools: ['read', 'grep', 'glob', 'shell', 'write'],
  allowedTools: ['read', 'grep', 'glob'],
  toolsSettings: {
    write: {
      deniedPaths: ['.kiro/specs/**/tasks.md'],
    },
    shell: {
      allowedCommands: [
        'npx spectruth audit.*',
        'npx spectruth preview.*',
        'npx spectruth approve.*',
        'npx spectruth report.*',
        'npx spectruth pre-task.*',
        'npx spectruth post-task.*',
      ],
      autoAllowReadonly: true,
    },
  },
  resources: [
    'skill://.kiro/skills/spectruth/SKILL.md',
    'file://.kiro/specs/**/requirements.md',
    'file://.kiro/specs/**/design.md',
    'file://.kiro/specs/**/tasks.md',
  ],
  welcomeMessage:
    "SpecTruth ready. Ask me whether a task is actually done and I'll audit the evidence behind the claim. Repairs always require your explicit approval.",
};

const PRE_HOOK = {
  name: 'SpecTruth Pre-Task Snapshot',
  version: '1.0.0',
  when: { type: 'preTaskExecution' },
  then: { type: 'runCommand', command: 'npx spectruth pre-task' },
};

const POST_HOOK = {
  name: 'SpecTruth Post-Task Audit',
  version: '1.0.0',
  when: { type: 'postTaskExecution' },
  then: { type: 'runCommand', command: 'npx spectruth post-task' },
};
