/**
 * On-demand audit.
 *
 * This is the entry point the Kiro agent calls when a user asks whether work is
 * actually done. Unlike the paired hooks it needs no prior snapshot: it audits
 * whichever tasks are marked complete right now.
 *
 * Because no transition was observed, the resulting evidence is explicitly
 * labelled `current-state` so the report never claims more than it saw.
 */

import type {
  AuditReport,
  CompletedTaskTransition,
  CriterionAudit,
  FileChange,
  KiroSpec,
  ParsedTask,
  TaskAuditReport,
} from '../types.js';
import { SpecTruthError } from '../errors.js';
import { loadKiroSpec } from '../parser/kiro-spec.js';
import { captureGitState } from '../snapshot/capture.js';
import { buildEvidenceBundle } from '../evidence/bundle.js';
import { adjudicateBundle } from '../evidence/adjudicate.js';
import { buildTaskAuditReport } from './task-report.js';
import { readReportForTask, saveReport } from '../report/store.js';
import { createProvider } from '../verifier/provider.js';
import { findSpecDirs, SPECS_DIR } from '../hooks/spec-discovery.js';

export interface AuditOptions {
  projectRoot: string;
  specDir: string;
  codePath?: string;
  /** Audit one task. When omitted, every completed task is audited. */
  taskId?: string;
  /** Skip LLM adjudication even when a provider is configured. */
  deterministicOnly?: boolean;
  now?: () => Date;
}

export interface TaskAuditOutcome {
  report: TaskAuditReport;
  reportPath: string;
  /** The previous report for this task, when one existed before this run. */
  previous?: AuditReport;
}

export interface AuditRunResult {
  spec: KiroSpec;
  outcomes: TaskAuditOutcome[];
  /** Completed tasks that reference no requirement, so nothing can be audited. */
  unlinkedTaskIds: string[];
}

export async function runAudit(options: AuditOptions): Promise<AuditRunResult> {
  const spec = loadKiroSpec(options.specDir, { requireTasks: true });
  const codePath = options.codePath ?? options.projectRoot;
  const targets = selectTasks(spec, options.taskId);
  const provider = options.deterministicOnly ? undefined : resolveOptionalProvider();
  const changedFiles = currentChangedFiles(codePath);

  const outcomes: TaskAuditOutcome[] = [];
  const unlinkedTaskIds: string[] = [];

  for (const task of targets) {
    const links = spec.links.find(link => link.taskId === task.id);
    if (!links || links.criteria.length === 0) {
      unlinkedTaskIds.push(task.id);
      continue;
    }

    const transition = synthesizeTransition(task, changedFiles);
    const bundle = await buildEvidenceBundle({ spec, transition, codebasePath: codePath });
    const criteria: CriterionAudit[] = await adjudicateBundle({ bundle, provider });

    const previous = readReportForTask(options.projectRoot, spec.name, task.id);
    const report = buildTaskAuditReport({
      spec,
      transition,
      criteria,
      codebasePath: codePath,
      adjudication: provider ? 'llm-assisted' : 'deterministic',
      ...(options.now ? { now: options.now } : {}),
    });
    const saved = saveReport(options.projectRoot, spec.name, report);

    outcomes.push({
      report,
      reportPath: saved.path,
      ...(previous ? { previous } : {}),
    });
  }

  if (targets.length === 0) {
    throw new SpecTruthError(
      options.taskId
        ? `Task ${options.taskId} is not marked complete, so there is no completion claim to audit.`
        : 'No completed tasks were found in this spec.',
      'NO_COMPLETED_TASKS',
      'Mark a task complete, or pass a task id that is complete.',
    );
  }

  return { spec, outcomes, unlinkedTaskIds };
}

export interface ProjectAuditOptions extends Omit<AuditOptions, 'specDir'> {
  /** Audit one spec. When omitted, every spec in the project is audited. */
  specDir?: string;
}

export interface SkippedSpec {
  specDir: string;
  reason: string;
}

export interface ProjectAuditResult {
  runs: AuditRunResult[];
  skipped: SkippedSpec[];
}

/**
 * Audit the whole project.
 *
 * An explicit user request should not fail merely because a repository holds
 * several specs, so every spec is audited when none is named. The stricter
 * refuse-to-guess rule stays on the hook path, where auditing the wrong task
 * would attach evidence to a claim it does not belong to.
 */
export async function auditProject(options: ProjectAuditOptions): Promise<ProjectAuditResult> {
  const specDirs = options.specDir
    ? [options.specDir]
    : findSpecDirs(options.projectRoot);

  if (specDirs.length === 0) {
    throw new SpecTruthError(
      `No Kiro specs found under ${SPECS_DIR}`,
      'SPEC_DIR_NOT_FOUND',
      'Open the project that contains .kiro/specs, or run `npx spectruth demo` to see a worked example.',
    );
  }

  const runs: AuditRunResult[] = [];
  const skipped: SkippedSpec[] = [];

  for (const specDir of specDirs) {
    try {
      runs.push(await runAudit({ ...options, specDir }));
    } catch (error) {
      if (isSkippable(error)) {
        skipped.push({ specDir, reason: (error as SpecTruthError).message });
        continue;
      }
      throw error;
    }
  }

  if (runs.length === 0) {
    throw new SpecTruthError(
      options.taskId
        ? `Task ${options.taskId} is not a completed task in any spec.`
        : 'No completed tasks were found in any spec, so there is no completion claim to audit.',
      'NO_COMPLETED_TASKS',
      'Mark a task complete, or run `npx spectruth demo` to see a worked example.',
    );
  }

  return { runs, skipped };
}

/** A spec with nothing to audit is skipped; anything else is a real failure. */
function isSkippable(error: unknown): boolean {
  return error instanceof SpecTruthError
    && (error.code === 'NO_COMPLETED_TASKS'
      || error.code === 'TASK_NOT_FOUND'
      || error.code === 'TASKS_NOT_FOUND');
}

function selectTasks(spec: KiroSpec, taskId?: string): ParsedTask[] {
  const completed = spec.tasks.tasks.filter(task => task.state === 'completed');
  if (!taskId) return completed;

  const requested = spec.tasks.tasks.find(task => task.id === taskId);
  if (!requested) {
    throw new SpecTruthError(
      `Task ${taskId} does not exist in this spec.`,
      'TASK_NOT_FOUND',
      `Known tasks: ${spec.tasks.tasks.map(task => task.id).join(', ')}`,
    );
  }
  return requested.state === 'completed' ? [requested] : [];
}

/**
 * Build a transition for a task that is simply marked complete. Provenance is
 * `current-state`, which keeps the evidence honest about what was observed.
 */
export function synthesizeTransition(
  task: ParsedTask,
  changedFiles: FileChange[],
): CompletedTaskTransition {
  return {
    taskId: task.id,
    title: task.title,
    previousState: 'not_started',
    currentState: 'completed',
    location: task.location,
    changedFiles,
    gitHeadChanged: false,
    inferredFrom: 'current-state',
  };
}

/** Uncommitted work is the best available signal for what this task touched. */
function currentChangedFiles(codePath: string): FileChange[] {
  const git = captureGitState(codePath);
  if (!git.available) return [];
  return git.dirtyFiles.map(path => ({ path, change: 'modified' as const }));
}

function resolveOptionalProvider() {
  try {
    return createProvider();
  } catch {
    return undefined;
  }
}
