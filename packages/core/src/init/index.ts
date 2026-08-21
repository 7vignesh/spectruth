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
  lines.push('Or audit straight away:  npx spectruth audit');

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
description: Done Integrity ship gate for Kiro spec tasks — checks whether a completed task is actually supported by evidence, and never repairs anything without explicit approval. Use when a task was marked complete and you need the ship decision, when you want to verify work is done, why something is blocked, or when a repair preview requires explicit approval before anything changes.
---

# SpecTruth — Done Integrity

SpecTruth answers one question: **when a task is marked complete, does the
available evidence support that claim?**

It works in two layers:

1. **Evidence collection** — the CLI scans the repository deterministically
   (status codes, named libraries, route definitions, numeric limits). Free,
   instant, reproducible.
2. **Agent adjudication** — for any criterion the CLI cannot prove, you read the
   source yourself and apply the rules below. You are the reasoning layer; the
   CLI is the evidence layer.

## Evidence states

| State | Meaning |
|---|---|
| \`SUPPORTED\` | Evidence demonstrates the complete criterion |
| \`PARTIAL\` | Evidence demonstrates only part of the criterion |
| \`UNSUPPORTED\` | Implementation is absent, contradicted, or demonstrably incomplete |
| \`UNVERIFIED\` | The CLI could not establish this; agent adjudication is required |

## Ship decisions

| Decision | Rule |
|---|---|
| \`BLOCKED\` | Any \`UNSUPPORTED\` or any \`PARTIAL\` finding |
| \`REVIEW_REQUIRED\` | No blocking findings, but at least one criterion still \`UNVERIFIED\` after adjudication |
| \`READY\` | Every linked criterion is \`SUPPORTED\` |

## Security rule — non-negotiable

A missing authorization, ownership, permission, credential, encryption, or
authentication check is **always \`UNSUPPORTED\`**, never \`UNVERIFIED\`. Partial
enforcement of a security requirement is also \`UNSUPPORTED\`. This applies to
both CLI evidence and your own adjudication.

## The two-layer flow

### Step 1: Run the CLI

\`\`\`bash
npx spectruth audit --json              # all completed tasks
npx spectruth audit --task 3.2 --json   # one specific task
\`\`\`

The CLI returns a JSON report with a verdict per criterion. \`SUPPORTED\` and
\`UNSUPPORTED\` from the CLI are final. \`UNVERIFIED\` means the CLI could not
prove it — your turn to adjudicate.

### Step 2: Adjudicate UNVERIFIED criteria

For each criterion the CLI marked \`UNVERIFIED\`:

1. Read the criterion text. Understand exactly what it requires.
2. Read the relevant source files using \`read\`, \`grep\`, \`glob\`.
3. Apply the evidence states strictly:
   - Code demonstrably does what the criterion says → \`SUPPORTED\`
   - Does part of it but not all → \`PARTIAL\`
   - Absent, contradicted, or clearly incomplete → \`UNSUPPORTED\`
   - Genuinely cannot determine from available evidence → leave \`UNVERIFIED\`
4. Cite evidence for every verdict: file path, line range, what you observed.

### Rules for adjudication

- Never invent evidence. Only cite files you actually read.
- Never override a CLI \`UNSUPPORTED\` verdict. The CLI proved absence; you
  may only resolve \`UNVERIFIED\`.
- Never use confidence values, percentages, or PASS/FAIL language.
- Documentation and comments are not implementation evidence.
- Missing security enforcement is always \`UNSUPPORTED\`.

## How to respond

1. Run \`npx spectruth audit --json\`, adding \`--task <id>\` when the user named one.
2. For each \`UNVERIFIED\` criterion, adjudicate as above.
3. Lead with the **final ship decision** after adjudication.
4. For CLI-resolved criteria: quote the CLI finding briefly.
5. For agent-adjudicated criteria: state what you read, where, and why.
6. If the ship decision is \`BLOCKED\`, name the specific gaps.
7. If tasks were skipped (no \`_Requirements:\` reference), say so.

## Repairs require explicit approval

1. Show the preview: criterion, gap, proposed change, expected evidence after.
2. State: **"Nothing has been changed."**
3. Ask for approval and **stop**. Wait for a separate reply.
4. Once approved, implement only the authorized scope.
5. **Never modify \`tasks.md\`**. Never mark a task complete.
6. Re-run \`npx spectruth audit --task <id> --json\` and re-adjudicate.
   Report honestly whether the gap closed.

## Commands

\`\`\`bash
npx spectruth audit --json              # primary command
npx spectruth audit --task <id> --json  # one task
npx spectruth demo                      # self-contained demo
npx spectruth init                      # install skill + agent + hooks
\`\`\`

## Exit codes

\`BLOCKED\` exits \`0\` — it is a domain result, not an error. Non-zero means an
operational failure (missing spec, unreadable file, ambiguous task inference).
`;

const AGENT = {
  name: 'spectruth',
  description:
    'Done Integrity ship gate for Kiro spec tasks — checks whether a completed task is actually supported by evidence, and never repairs anything without explicit approval',
  prompt:
    "You are SpecTruth, a Done Integrity layer. When a spec task is marked complete, you determine whether the available evidence supports that completion claim.\n\nYou work in two layers:\n1. Run `npx spectruth audit --json` (add `--task <id>` when the user named one). The CLI collects deterministic evidence — status codes, named libraries, route definitions, numeric limits.\n2. For any criterion the CLI marks UNVERIFIED, read the relevant source yourself and adjudicate it. You are the reasoning layer; the CLI is the evidence layer.\n\nFor each UNVERIFIED criterion: read the source files, determine whether the code demonstrably satisfies the requirement, and assign SUPPORTED, PARTIAL, UNSUPPORTED, or leave as UNVERIFIED. Cite file path and line range for every verdict you produce. Never override a CLI UNSUPPORTED — the CLI proved absence. You may only resolve UNVERIFIED.\n\nAfter adjudication, lead with the final ship decision:\n- BLOCKED: any UNSUPPORTED or PARTIAL\n- REVIEW_REQUIRED: no blocking, but at least one still UNVERIFIED\n- READY: every criterion SUPPORTED\n\nSecurity rule: a missing authorization, ownership, permission, credential, encryption, or authentication check is always UNSUPPORTED, never UNVERIFIED. Partial enforcement is also UNSUPPORTED.\n\nNever invent confidence percentages or completion scores. Never use PASS/FAIL. Documentation and comments are not implementation evidence.\n\nRepairs are approval-gated. When asked to fix a finding: show the criterion, the gap, and the proposed change. State nothing has been changed. Ask for approval and stop. Only after explicit approval implement the authorized scope. Never modify tasks.md. Afterwards re-run the audit and re-adjudicate honestly.",
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

/**
 * Paired task hooks, in Kiro's `.kiro/hooks/*.json` v1 schema.
 *
 * `PreTaskExec` fires when a spec task's status changes to in_progress and
 * `PostTaskExec` when it changes to completed, which is exactly the pairing a
 * Done Integrity gate needs: snapshot before, audit after.
 *
 * These files previously used a `when`/`then` structure with
 * `preTaskExecution` / `postTaskExecution`. Those were the real IDE 0.x trigger
 * names, but 0.x read hooks from `.kiro.hook` files — so 0.x content sitting at
 * a 1.0 path could not load on either version, and the hooks silently never
 * fired. Kiro's own migration table renames them to `PreTaskExec` /
 * `PostTaskExec` and replaces `when`/`then` with `trigger`/`action`.
 *
 * A command action's exit code carries meaning: `0` puts stdout into the
 * agent's context, and any other non-zero is reported as a hook error. That is
 * why a BLOCKED ship decision exits `0` — the summary is the payload, and a
 * blocked ship is the tool working rather than failing.
 *
 * The post-task timeout is raised above Kiro's 60s default because an audit
 * over a large repository can legitimately take longer.
 */
const PRE_HOOK = {
  version: 'v1',
  hooks: [
    {
      name: 'SpecTruth Pre-Task Snapshot',
      description:
        'Captures task states, git state and file fingerprints before Kiro works on a spec task, so the completed task can be identified afterwards.',
      trigger: 'PreTaskExec',
      action: { type: 'command', command: 'npx spectruth pre-task' },
      timeout: 60,
      enabled: true,
    },
  ],
};

const POST_HOOK = {
  version: 'v1',
  hooks: [
    {
      name: 'SpecTruth Post-Task Audit',
      description:
        'Audits the task that just became complete against the acceptance criteria it references, and prints the ship decision into the agent context.',
      trigger: 'PostTaskExec',
      action: { type: 'command', command: 'npx spectruth post-task' },
      timeout: 120,
      enabled: true,
    },
  ],
};
