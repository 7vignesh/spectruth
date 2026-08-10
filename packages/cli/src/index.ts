#!/usr/bin/env node

/**
 * SpecTruth CLI
 *
 * Kiro is the primary experience; this CLI is the deterministic engine the
 * paired task hooks and the Agent Skill call.
 *
 *   spectruth pre-task    Capture a snapshot before Kiro works on a task
 *   spectruth post-task   Audit the task that just became complete
 *   spectruth report      Print the most recent audit report
 *
 * Exit codes in hook mode: 0 for every domain outcome, including a BLOCKED
 * ship decision, so stdout reaches Kiro's context. Non-zero is reserved for
 * operational failures.
 */

import { Command } from 'commander';
import {
  formatHookSummary,
  readLatestReport,
  runPostTaskHook,
  runPreTaskHook,
  SpecTruthError,
  type HookResult,
} from '@spectruth/core';

const program = new Command();

program
  .name('spectruth')
  .description('Done Integrity ship gate for Kiro spec tasks')
  .version('0.1.0');

interface HookCommandOptions {
  spec?: string;
  code?: string;
  root: string;
  stdin?: boolean;
}

function hookOptions(command: Command): Command {
  return command
    .option('--spec <path>', 'Kiro spec directory (auto-detected when omitted)')
    .option('--code <path>', 'Codebase root (defaults to the project root)')
    .option('--root <path>', 'Project root for snapshots and reports', process.cwd())
    .option('--no-stdin', 'Skip reading the hook payload from stdin');
}

/**
 * Kiro delivers hook events as JSON on stdin. The payload is recorded for
 * inspection only, so a missing or unreadable payload is never fatal.
 */
async function readEventPayload(enabled: boolean): Promise<unknown> {
  if (!enabled || process.stdin.isTTY) return undefined;

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString('utf-8').trim();
    if (raw.length === 0) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return { unparsedPayload: raw.slice(0, 4000) };
    }
  } catch {
    return undefined;
  }
}

function emit(result: HookResult): never {
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exit(result.exitCode);
}

hookOptions(
  program
    .command('pre-task')
    .description('Capture a pre-task snapshot of task states, Git state, and file fingerprints'),
).action(async (options: HookCommandOptions) => {
  const event = await readEventPayload(options.stdin !== false);
  emit(runPreTaskHook({
    projectRoot: options.root,
    ...(options.spec ? { specDir: options.spec } : {}),
    ...(options.code ? { codePath: options.code } : {}),
    ...(event === undefined ? {} : { event }),
  }));
});

hookOptions(
  program
    .command('post-task')
    .description('Infer the completed task and audit its completion claim'),
).action(async (options: HookCommandOptions) => {
  const event = await readEventPayload(options.stdin !== false);
  emit(runPostTaskHook({
    projectRoot: options.root,
    ...(options.spec ? { specDir: options.spec } : {}),
    ...(options.code ? { codePath: options.code } : {}),
    ...(event === undefined ? {} : { event }),
  }));
});

program
  .command('report')
  .description('Print the most recent audit report')
  .option('--root <path>', 'Project root that holds the reports', process.cwd())
  .option('--json', 'Print the raw report JSON')
  .action((options: { root: string; json?: boolean }) => {
    try {
      const report = readLatestReport(options.root);
      process.stdout.write(
        options.json
          ? `${JSON.stringify(report, null, 2)}\n`
          : `${formatHookSummary(report)}\n`,
      );
      process.exit(0);
    } catch (error) {
      const message = error instanceof SpecTruthError
        ? `SpecTruth (${error.code}): ${error.message}.${error.hint ? ` ${error.hint}` : ''}`
        : `SpecTruth error: ${error instanceof Error ? error.message : String(error)}`;
      process.stderr.write(`${message}\n`);
      process.exit(1);
    }
  });

program.parse();
