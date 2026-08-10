import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const KIRO = join(REPO_ROOT, '.kiro');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

interface HookDocument {
  name: string;
  version: string;
  when: { type: string };
  then: { type: string; command: string };
}

describe('paired Kiro task hooks', () => {
  const pre = readJson(join(KIRO, 'hooks', 'spectruth-pre-task.json')) as unknown as HookDocument;
  const post = readJson(join(KIRO, 'hooks', 'spectruth-post-task.json')) as unknown as HookDocument;

  it('removes the obsolete generic verification hook', () => {
    expect(existsSync(join(KIRO, 'hooks', 'spectruth-verify.json'))).toBe(false);
  });

  it('registers preTaskExecution for snapshot capture', () => {
    expect(pre.when.type).toBe('preTaskExecution');
    expect(pre.then.command).toMatch(/\bpre-task\b/);
  });

  it('registers postTaskExecution for the completion audit', () => {
    expect(post.when.type).toBe('postTaskExecution');
    expect(post.then.command).toMatch(/\bpost-task\b/);
  });

  it('invokes a command that resolves in this workspace', () => {
    for (const document of [pre, post]) {
      expect(document.then.command).toContain('node packages/cli/dist/index.js');
    }
  });

  it('references the CLI entry point that the build produces', () => {
    const entry = join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts');
    expect(existsSync(entry)).toBe(true);
  });

  it('uses the correct Kiro hook schema with when/then', () => {
    for (const document of [pre, post]) {
      expect(document.version).toBe('1.0.0');
      expect(document.then.type).toBe('runCommand');
      expect(document).not.toHaveProperty('hooks');
      expect(document).not.toHaveProperty('trigger');
    }
  });

  it('does not run the obsolete verify command or glob a spec file', () => {
    for (const document of [pre, post]) {
      expect(document.then.command).not.toContain('verify');
      expect(document.then.command).not.toContain('*');
    }
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

  it('requires explicit approval in a separate turn before any repair', () => {
    expect(skill).toMatch(/explicit approval in a separate turn/i);
    expect(skill).toMatch(/nothing has been changed/i);
    expect(skill).toMatch(/never modify `tasks\.md`/i);
    expect(skill).toMatch(/re-run [^\n]*post-task/i);
  });

  it('documents the exit-code contract for a blocked decision', () => {
    expect(skill).toMatch(/is a domain result, not a tooling error/i);
    expect(skill).toMatch(/exit `0`/);
  });

  it('carries no confidence or completion-score language', () => {
    expect(skill).not.toMatch(/confidence/i);
    expect(skill).not.toMatch(/\b\d+%/);
    expect(skill).not.toMatch(/\bPASS\b|\bFAIL\b/);
  });
});

describe('SpecTruth custom agent', () => {
  const agent = readJson(join(KIRO, 'agents', 'spectruth.json'));

  it('loads the skill through an explicit skill:// resource', () => {
    const resources = agent.resources as string[];
    expect(resources).toContain('skill://.kiro/skills/spectruth/SKILL.md');
  });

  it('cannot write files, so it cannot repair without approval', () => {
    const tools = agent.tools as string[];
    expect(tools).not.toContain('write');
    expect(tools).toContain('read');
    expect(tools).toContain('shell');
  });

  it('auto-approves only read-only tools', () => {
    const allowed = agent.allowedTools as string[];
    expect(allowed).toEqual(expect.arrayContaining(['read', 'grep', 'glob']));
    expect(allowed).not.toContain('shell');
    expect(allowed).not.toContain('write');
  });

  it('restricts shell execution to spectruth commands', () => {
    const settings = agent.toolsSettings as { shell: { allowedCommands: string[] } };
    expect(settings.shell.allowedCommands.length).toBeGreaterThan(0);
    for (const pattern of settings.shell.allowedCommands) {
      expect(pattern).toMatch(/^(npx spectruth |node packages\/cli\/dist\/index\\?\.js )/);
    }
  });

  it('permits the CLI invocation its prompt tells it to use', () => {
    const settings = agent.toolsSettings as { shell: { allowedCommands: string[] } };
    const prompt = agent.prompt as string;
    const promptCommand = prompt.match(/`([^`]*index\.js report[^`]*)`/)?.[1];

    expect(promptCommand).toBeDefined();
    const permitted = settings.shell.allowedCommands.some(pattern =>
      new RegExp(`^${pattern}$`).test(promptCommand!),
    );
    expect(permitted).toBe(true);
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
