import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { runInit } from '../init/index.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const KIRO = join(REPO_ROOT, '.kiro');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** One hook definition inside a `.kiro/hooks/*.json` file. */
interface HookDefinition {
  name: string;
  description?: string;
  trigger: string;
  matcher?: string;
  action: { type: string; command?: string; prompt?: string };
  timeout?: number;
  enabled?: boolean;
}

interface HookDocument {
  version: string;
  hooks: HookDefinition[];
}

/**
 * Every trigger name Kiro accepts. A hook naming anything else is inert: Kiro
 * loads the file, matches no trigger, and stays silent about it.
 */
const KIRO_TRIGGERS = new Set([
  'SessionStart',
  'Stop',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostFileCreate',
  'PostFileSave',
  'PostFileDelete',
  'PreTaskExec',
  'PostTaskExec',
]);

function readHookDocument(path: string): HookDocument {
  return JSON.parse(readFileSync(path, 'utf-8')) as HookDocument;
}

function onlyHook(document: HookDocument): HookDefinition {
  return document.hooks[0];
}

describe('paired Kiro task hooks', () => {
  const pre = readHookDocument(join(KIRO, 'hooks', 'spectruth-pre-task.json'));
  const post = readHookDocument(join(KIRO, 'hooks', 'spectruth-post-task.json'));

  it('removes the obsolete generic verification hook', () => {
    expect(existsSync(join(KIRO, 'hooks', 'spectruth-verify.json'))).toBe(false);
  });

  it('registers PreTaskExec for snapshot capture', () => {
    expect(onlyHook(pre).trigger).toBe('PreTaskExec');
    expect(onlyHook(pre).action.command).toMatch(/\bpre-task\b/);
  });

  it('registers PostTaskExec for the completion audit', () => {
    expect(onlyHook(post).trigger).toBe('PostTaskExec');
    expect(onlyHook(post).action.command).toMatch(/\bpost-task\b/);
  });

  it('invokes a command that resolves in this workspace', () => {
    for (const document of [pre, post]) {
      expect(onlyHook(document).action.command).toContain('node packages/cli/dist/index.js');
    }
  });

  it('references the CLI entry point that the build produces', () => {
    const entry = join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts');
    expect(existsSync(entry)).toBe(true);
  });

  it('uses the v1 hook schema Kiro documents', () => {
    for (const document of [pre, post]) {
      expect(document.version).toBe('v1');
      expect(Array.isArray(document.hooks)).toBe(true);
      expect(document.hooks.length).toBeGreaterThan(0);
      expect(onlyHook(document).action.type).toBe('command');
      expect(onlyHook(document).name.length).toBeGreaterThan(0);
    }
  });

  /**
   * These files once paired IDE 0.x content — a `when`/`then` structure with
   * `preTaskExecution` — with the 1.0 `.kiro/hooks/*.json` location. 0.x read
   * hooks from `.kiro.hook` files, so neither version could load them and the
   * hooks silently never fired while a passing test asserted the absence of the
   * `trigger` field. This test exists so that cannot recur quietly.
   */
  it('carries no trace of the legacy 0.x hook structure', () => {
    for (const document of [pre, post]) {
      expect(document).not.toHaveProperty('when');
      expect(document).not.toHaveProperty('then');
      expect(document.version).not.toBe('1.0.0');

      const serialized = JSON.stringify(document);
      expect(serialized).not.toContain('preTaskExecution');
      expect(serialized).not.toContain('postTaskExecution');
      expect(serialized).not.toContain('runCommand');
    }
  });

  it('names only triggers that exist in Kiro', () => {
    for (const document of [pre, post]) {
      const { trigger } = onlyHook(document);
      expect(KIRO_TRIGGERS.has(trigger), `unknown trigger: ${trigger}`).toBe(true);
    }
  });

  it('allows the post-task audit longer than Kiro default timeout', () => {
    // An audit over a large repository can exceed the 60s default; a snapshot
    // cannot, so only the post-task hook is raised.
    expect(onlyHook(post).timeout ?? 60).toBeGreaterThan(60);
  });

  it('does not run the obsolete verify command or glob a spec file', () => {
    for (const document of [pre, post]) {
      expect(onlyHook(document).action.command).not.toContain('verify');
      expect(onlyHook(document).action.command).not.toContain('*');
    }
  });
});

/**
 * The templates written into other people's projects and this repository's own
 * hooks drifted apart before, so they are compared rather than trusted.
 */
describe('shipped init hook templates', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'spectruth-init-hooks-'));
    runInit({ projectRoot: root });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes both task hooks', () => {
    for (const file of ['spectruth-pre-task.json', 'spectruth-post-task.json']) {
      expect(existsSync(join(root, '.kiro', 'hooks', file))).toBe(true);
    }
  });

  it('emits the same schema as this repository uses', () => {
    const scaffolded = [
      readHookDocument(join(root, '.kiro', 'hooks', 'spectruth-pre-task.json')),
      readHookDocument(join(root, '.kiro', 'hooks', 'spectruth-post-task.json')),
    ];

    for (const document of scaffolded) {
      expect(document.version).toBe('v1');
      expect(document.hooks.length).toBe(1);
      expect(onlyHook(document).action.type).toBe('command');
      expect(KIRO_TRIGGERS.has(onlyHook(document).trigger)).toBe(true);
      expect(document).not.toHaveProperty('when');
      expect(document).not.toHaveProperty('then');
    }

    expect(onlyHook(scaffolded[0]).trigger).toBe('PreTaskExec');
    expect(onlyHook(scaffolded[1]).trigger).toBe('PostTaskExec');
  });

  it('invokes the published package rather than a workspace path', () => {
    // A scaffolded project has no packages/cli/dist to run.
    const scaffolded = readHookDocument(join(root, '.kiro', 'hooks', 'spectruth-pre-task.json'));
    expect(onlyHook(scaffolded).action.command).toBe('npx spectruth pre-task');
  });
});

describe('SpecTruth agent skill', () => {
  const skillPath = join(KIRO, 'skills', 'spectruth', 'SKILL.md');
  const skill = readFileSync(skillPath, 'utf-8');

  it('starts with YAML frontmatter carrying name and description', () => {
    expect(skill.startsWith('---\n')).toBe(true);
    const frontmatter = skill.slice(4, skill.indexOf('\n---', 4));
    expect(frontmatter).toMatch(/^name:\s*spectruth$/m);
    expect(frontmatter).toMatch(/^description:\s*\S+/m);
  });

  it('documents exactly the four evidence states and three ship decisions', () => {
    for (const state of ['SUPPORTED', 'PARTIAL', 'UNSUPPORTED', 'UNVERIFIED']) {
      expect(skill).toContain(state);
    }
    for (const status of ['READY', 'REVIEW_REQUIRED', 'BLOCKED']) {
      expect(skill).toContain(status);
    }
  });

  it('documents the security-sensitive blocking rule', () => {
    expect(skill).toMatch(/authorization[\s\S]{0,200}UNSUPPORTED/i);
  });

  it('requires explicit approval before any repair', () => {
    expect(skill).toMatch(/nothing has been changed/i);
    expect(skill).toMatch(/never modify `tasks\.md`/i);
    expect(skill).toMatch(/re-run [^\n]*audit/i);
    expect(skill).toMatch(/ask for approval and \*\*stop\*\*/i);
  });

  it('documents the audit command as the primary entry point', () => {
    expect(skill).toMatch(/audit --json/);
    expect(skill).toMatch(/audit --task/);
  });

  it('documents the two-layer adjudication flow', () => {
    expect(skill).toMatch(/evidence collection/i);
    expect(skill).toMatch(/agent adjudication/i);
    expect(skill).toMatch(/UNVERIFIED.*adjudication is required/i);
    expect(skill).toMatch(/never override a CLI.*UNSUPPORTED/i);
  });

  it('documents that approval scope is limited', () => {
    expect(skill).toMatch(/one repair for one criterion/i);
  });

  it('documents the exit-code contract for a blocked decision', () => {
    expect(skill).toMatch(/domain result, not a/i);
    expect(skill).toMatch(/exits `0`/);
  });

  it('prohibits confidence scores and binary verdicts', () => {
    // The skill may mention these words only as prohibitions ("Never use...").
    // It must not instruct the agent to produce them.
    expect(skill).toMatch(/never use.*confidence/i);
    expect(skill).not.toMatch(/\b\d+%/);
    // The four states are SUPPORTED/PARTIAL/UNSUPPORTED/UNVERIFIED, never PASS/FAIL.
    expect(skill).toContain('SUPPORTED');
    expect(skill).not.toMatch(/state.*\bPASS\b/i);
    expect(skill).not.toMatch(/state.*\bFAIL\b/i);
  });
});

describe('SpecTruth custom agent', () => {
  const agent = readJson(join(KIRO, 'agents', 'spectruth.json'));

  it('loads the skill through an explicit skill:// resource', () => {
    const resources = agent.resources as string[];
    expect(resources).toContain('skill://.kiro/skills/spectruth/SKILL.md');
  });

  it('may write code for an approved repair but never auto-approves it', () => {
    const tools = agent.tools as string[];
    const allowed = agent.allowedTools as string[];

    expect(tools).toContain('write');
    expect(tools).toContain('read');
    expect(tools).toContain('shell');
    // Writing always requires a confirmation, so a repair cannot happen silently.
    expect(allowed).not.toContain('write');
    expect(allowed).not.toContain('shell');
  });

  it('forbids writing tasks.md so it cannot mark a task complete', () => {
    const settings = agent.toolsSettings as { write?: { deniedPaths?: string[] } };
    const denied = settings.write?.deniedPaths ?? [];
    expect(denied.some(path => path.includes('tasks.md'))).toBe(true);
  });

  it('auto-approves only read-only tools', () => {
    const allowed = agent.allowedTools as string[];
    expect(allowed).toEqual(expect.arrayContaining(['read', 'grep', 'glob']));
  });

  it('permits the audit, preview, and approve commands', () => {
    const settings = agent.toolsSettings as { shell: { allowedCommands: string[] } };
    const patterns = settings.shell.allowedCommands.join('\n');

    for (const command of ['audit', 'preview', 'approve']) {
      expect(patterns).toContain(command);
    }
  });

  it('restricts shell execution to spectruth commands', () => {
    const settings = agent.toolsSettings as { shell: { allowedCommands: string[] } };
    expect(settings.shell.allowedCommands.length).toBeGreaterThan(0);
    for (const pattern of settings.shell.allowedCommands) {
      expect(pattern).toMatch(/^(npx spectruth |node packages\/cli\/dist\/index\\?\.js )/);
    }
  });

  it('permits every CLI invocation its prompt tells it to use', () => {
    const settings = agent.toolsSettings as { shell: { allowedCommands: string[] } };
    const prompt = agent.prompt as string;
    const quoted = [...prompt.matchAll(/`([^`]*index\.js[^`]*)`/g)].map(match => match[1]);

    expect(quoted.length).toBeGreaterThan(0);
    for (const command of quoted) {
      const permitted = settings.shell.allowedCommands.some(pattern =>
        new RegExp(`^${pattern}$`).test(command),
      );
      expect(permitted, `prompt command not permitted: ${command}`).toBe(true);
    }
  });

  it('describes Done Integrity rather than generic conformance verdicts', () => {
    const prompt = agent.prompt as string;
    expect(prompt).toMatch(/Done Integrity/);
    expect(prompt).toMatch(/SUPPORTED|UNSUPPORTED/);
    expect(prompt).not.toMatch(/PASS\/FAIL/);
    // Confidence may only appear as a prohibition, never as an instruction to score.
    expect(prompt).toMatch(/Never invent confidence percentages or completion scores/);
  });

  it('states the approval-gated repair protocol in its prompt', () => {
    const prompt = agent.prompt as string;
    expect(prompt).toMatch(/approval/i);
    expect(prompt).toMatch(/never modify tasks\.md/i);
  });
});
