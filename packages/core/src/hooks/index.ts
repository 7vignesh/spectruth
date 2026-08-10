/**
 * Paired Kiro task lifecycle hook adapters.
 *
 * PreTaskExec captures a snapshot; PostTaskExec compares it with current state
 * and audits the single task that became complete.
 *
 * Exit-code contract:
 * - `0` for every domain outcome, including a BLOCKED ship decision, so that
 *   stdout reaches Kiro's context.
 * - `0` when no task completed, which is a benign no-op rather than a failure.
 * - non-zero only for operational failures: unreadable specs, a missing
 *   snapshot, or task inference that cannot identify exactly one task.
 */

import type { AuditReport, CriterionAudit, TransitionInference } from '../types.js';
import { SpecTruthError } from '../errors.js';
import { buildPendingCriteriaAudits, buildTaskAuditReport } from '../audit/task-report.js';
import { buildEvidenceBundle } from '../evidence/bundle.js';
import { adjudicateBundle } from '../evidence/adjudicate.js';
import { formatHookSummary, formatNoTransitionSummary } from '../reporter/hook.js';
import { saveReport } from '../report/store.js';
import { captureSpecSnapshot, inferCompletedTaskForSpec } from '../snapshot/index.js';
import { recordHookEvent } from './events.js';
import { resolveSingleSpecDir } from './spec-discovery.js';
import { createProvider } from '../verifier/provider.js';

export interface HookOptions {
  /** Project root; also the default codebase and snapshot location. */
  projectRoot: string;
  /** Explicit Kiro spec directory. Discovered when omitted. */
  specDir?: string;
  /** Codebase root for fingerprints and Git state. Defaults to projectRoot. */
  codePath?: string;
  /** Raw hook payload, recorded for inspection only. */
  event?: unknown;
  now?: () => Date;
}

export interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1;
  report?: AuditReport;
  reportPath?: string;
  eventPath?: string;
}

export function runPreTaskHook(options: HookOptions): HookResult {
  const eventPath = recordHookEvent(options.projectRoot, 'PreTaskExec', options.event, options.now);

  try {
    const specDir = options.specDir ?? resolveSingleSpecDir(options.projectRoot);
    const captured = captureSpecSnapshot({
      specDir,
      codePath: options.codePath ?? options.projectRoot,
      projectRoot: options.projectRoot,
      ...(options.now ? { now: options.now } : {}),
    });

    const pending = captured.snapshot.tasks.filter(task => task.state !== 'completed').length;
    const stdout = [
      'SpecTruth — Done Integrity',
      `Captured pre-task snapshot for spec "${captured.spec.name}".`,
      `Tasks tracked: ${captured.snapshot.tasks.length} (${pending} not yet complete).`,
    ].join('\n');

    return withEventPath({ stdout, stderr: '', exitCode: 0 }, eventPath);
  } catch (error) {
    return withEventPath(operationalFailure(error), eventPath);
  }
}

export async function runPostTaskHook(options: HookOptions): Promise<HookResult> {
  const eventPath = recordHookEvent(options.projectRoot, 'PostTaskExec', options.event, options.now);

  try {
    const specDir = options.specDir ?? resolveSingleSpecDir(options.projectRoot);
    const codePath = options.codePath ?? options.projectRoot;
    const result = inferCompletedTaskForSpec({
      specDir,
      codePath,
      projectRoot: options.projectRoot,
      ...(options.now ? { now: options.now } : {}),
    });

    if (!result.inference.ok) {
      return withEventPath(handleFailedInference(result.inference), eventPath);
    }

    const transition = result.inference.transition;
    const links = result.spec.links.find(link => link.taskId === transition.taskId);
    const criteria = links?.criteria ?? [];

    // Collect and adjudicate real evidence when possible
    let auditedCriteria: CriterionAudit[];
    if (criteria.length > 0) {
      const bundle = await buildEvidenceBundle({
        spec: result.spec,
        transition,
        codebasePath: codePath,
      });
      const provider = resolveOptionalProvider();
      auditedCriteria = await adjudicateBundle({ bundle, provider });
    } else {
      auditedCriteria = [];
    }

    const report = buildTaskAuditReport({
      spec: result.spec,
      transition,
      criteria: auditedCriteria,
      codebasePath: codePath,
      ...(options.now ? { now: options.now } : {}),
    });

    const saved = saveReport(options.projectRoot, result.spec.name, report);
    const stdout = report.summary.totalCriteria === 0
      ? [
          formatHookSummary(report, { reportPath: saved.path }),
          `Task ${transition.taskId} references no requirement, so there is nothing to audit.`,
        ].join('\n')
      : formatHookSummary(report, { reportPath: saved.path });

    return withEventPath(
      { stdout, stderr: '', exitCode: 0, report, reportPath: saved.path },
      eventPath,
    );
  } catch (error) {
    return withEventPath(operationalFailure(error), eventPath);
  }
}

/**
 * A missing transition is benign; genuine ambiguity is operational because
 * auditing the wrong task would fabricate evidence.
 */
function handleFailedInference(
  inference: Extract<TransitionInference, { ok: false }>,
): HookResult {
  if (inference.code === 'NO_COMPLETED_TRANSITION') {
    return {
      stdout: formatNoTransitionSummary(inference.message),
      stderr: '',
      exitCode: 0,
    };
  }

  const hint = inference.candidateTaskIds.length > 0
    ? ` Candidate tasks: ${inference.candidateTaskIds.join(', ')}.`
    : '';

  return {
    stdout: '',
    stderr:
      `SpecTruth could not identify the completed task (${inference.code}). `
      + `${inference.message}${hint}`,
    exitCode: 1,
  };
}

function operationalFailure(error: unknown): HookResult {
  if (error instanceof SpecTruthError) {
    const hint = error.hint ? ` ${error.hint}` : '';
    return {
      stdout: '',
      stderr: `SpecTruth operational error (${error.code}): ${error.message}.${hint}`,
      exitCode: 1,
    };
  }

  return {
    stdout: '',
    stderr: `SpecTruth operational error: ${error instanceof Error ? error.message : String(error)}`,
    exitCode: 1,
  };
}

function withEventPath(result: HookResult, eventPath: string | undefined): HookResult {
  return eventPath ? { ...result, eventPath } : result;
}

/** Best-effort provider resolution — returns undefined when no LLM is configured. */
function resolveOptionalProvider() {
  try {
    return createProvider();
  } catch {
    return undefined;
  }
}
