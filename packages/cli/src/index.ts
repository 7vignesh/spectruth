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
  approveRepair,
  auditProject,
  buildRepairPreviews,
  formatDemo,
  formatHookSummary,
  formatInitResult,
  readLatestReport,
  readPreviews,
  runDemo,
  runInit,
  runPostTaskHook,
  runPreTaskHook,
  savePreviews,
  SpecTruthError,
  type HookResult,
} from 'spectruth-core';

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
  emit(await runPostTaskHook({
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
      fail(error);
    }
  });

// ─── Agent-facing commands ───────────────────────────────────────────────────

interface AuditCommandOptions {
  spec?: string;
  task?: string;
  code?: string;
  root: string;
  deterministic?: boolean;
  json?: boolean;
}

/**
 * The primary action. Runs for `spectruth audit` and for a bare `spectruth`,
 * so a first-time user needs no subcommand at all.
 */
async function executeAudit(options: AuditCommandOptions): Promise<never> {
  try {
    const result = await auditProject({
      projectRoot: options.root,
      ...(options.spec ? { specDir: options.spec } : {}),
      ...(options.code ? { codePath: options.code } : {}),
      ...(options.task ? { taskId: options.task } : {}),
      ...(options.deterministic ? { deterministicOnly: true } : {}),
    });

    const sections: string[] = [];
    const jsonPayload: unknown[] = [];

    for (const run of result.runs) {
      for (const outcome of run.outcomes) {
        // Previews are recorded alongside the audit but change nothing.
        const previews = buildRepairPreviews(outcome.report);
        if (previews.length > 0) {
          savePreviews(options.root, outcome.report.reportId, previews);
        }

        if (options.json) {
          jsonPayload.push({ spec: run.spec.name, report: outcome.report, previews });
        } else {
          sections.push(formatHookSummary(outcome.report, {
            reportPath: outcome.reportPath,
            previewIds: previews.map(preview => preview.previewId),
          }));
        }
      }

      if (!options.json && run.unlinkedTaskIds.length > 0) {
        sections.push(
          `Skipped in ${run.spec.name}: task(s) ${run.unlinkedTaskIds.join(', ')} reference no requirement, so nothing could be audited.`,
        );
      }
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify({
        audits: jsonPayload,
        skippedSpecs: result.skipped,
        unlinkedTasks: result.runs.flatMap(run =>
          run.unlinkedTaskIds.map(taskId => ({ spec: run.spec.name, taskId })),
        ),
      }, null, 2)}\n`);
    } else {
      process.stdout.write(`${sections.join(`\n\n${'─'.repeat(72)}\n\n`)}\n`);
    }

    process.exit(0);
  } catch (error) {
    fail(error);
  }
}

function auditOptions(command: Command): Command {
  return command
    .option('--spec <path>', 'Kiro spec directory (all specs are audited when omitted)')
    .option('--task <id>', 'Audit one task instead of every completed task')
    .option('--code <path>', 'Codebase root (defaults to the project root)')
    .option('--root <path>', 'Project root for reports and previews', process.cwd())
    .option('--deterministic', 'Skip LLM adjudication and use static evidence only')
    .option('--json', 'Emit structured JSON for an agent to consume');
}

auditOptions(
  program
    .command('audit', { isDefault: true })
    .description('Audit the completion claims of tasks that are marked complete'),
).action(executeAudit);

program
  .command('demo')
  .description('Run a self-contained demonstration; needs no spec, key, or network')
  .option('--keep', 'Leave the scratch project on disk for inspection')
  .action(async (options: { keep?: boolean }) => {
    try {
      const result = await runDemo(options.keep ? { keepFiles: true } : {});
      process.stdout.write(formatDemo(result));
      process.exit(0);
    } catch (error) {
      fail(error);
    }
  });

program
  .command('init')
  .description('Install the Kiro integration into this project')
  .option('--root <path>', 'Project root to scaffold into', process.cwd())
  .option('--force', 'Replace files that already exist')
  .action((options: { root: string; force?: boolean }) => {
    try {
      const result = runInit({
        projectRoot: options.root,
        ...(options.force ? { force: true } : {}),
      });
      process.stdout.write(formatInitResult(result));
      process.exit(0);
    } catch (error) {
      fail(error);
    }
  });

program
  .command('preview')
  .description('List the repair previews recorded for a report')
  .requiredOption('--report <id>', 'Report id the previews belong to')
  .option('--root <path>', 'Project root that holds the previews', process.cwd())
  .option('--json', 'Print the raw preview JSON')
  .action((options: { report: string; root: string; json?: boolean }) => {
    const previews = readPreviews(options.root, options.report);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(previews, null, 2)}\n`);
      process.exit(0);
    }

    if (previews.length === 0) {
      process.stdout.write(`No repair previews recorded for report ${options.report}.\n`);
      process.exit(0);
    }

    const lines = previews.flatMap(preview => [
      `${preview.previewId} — ${preview.criterionId} [${preview.currentState}]`,
      `  gap: ${preview.gap}`,
      `  proposed: ${preview.proposedChange}`,
      `  expected afterwards: ${preview.expectedEvidence}`,
      preview.likelyFiles.length > 0 ? `  likely files: ${preview.likelyFiles.join(', ')}` : '',
    ].filter(Boolean));

    lines.push('', 'Nothing has been changed. Approve a preview id to authorize that repair.');
    process.stdout.write(`${lines.join('\n')}\n`);
    process.exit(0);
  });

/**
 * Records explicit consent for one preview. This is expected to run only after
 * the user has seen the preview and approved it in a separate turn.
 */
program
  .command('approve')
  .description('Record explicit approval for one repair preview')
  .requiredOption('--preview <id>', 'Preview id being approved')
  .requiredOption('--report <id>', 'Report id the preview belongs to')
  .option('--code <path>', 'Codebase root (defaults to the project root)')
  .option('--root <path>', 'Project root that holds the previews', process.cwd())
  .action((options: { preview: string; report: string; code?: string; root: string }) => {
    try {
      const approval = approveRepair({
        projectRoot: options.root,
        reportId: options.report,
        previewId: options.preview,
        ...(options.code ? { codePath: options.code } : {}),
      });

      process.stdout.write([
        `Approved repair ${approval.previewId} for ${approval.criterionId}.`,
        `Authorized scope: ${approval.approvedChange}`,
        'Only this change is authorized. tasks.md must not be edited, and the task',
        'must not be marked complete by the repair.',
        `Re-audit with: audit --task ${approval.taskId}`,
      ].join('\n') + '\n');
      process.exit(0);
    } catch (error) {
      fail(error);
    }
  });

function fail(error: unknown): never {
  const message = error instanceof SpecTruthError
    ? `SpecTruth (${error.code}): ${error.message}${error.hint ? ` ${error.hint}` : ''}`
    : `SpecTruth error: ${error instanceof Error ? error.message : String(error)}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

program.parse();
