/**
 * Kiro spec directory loader.
 *
 * Reads `requirements.md`, `tasks.md`, and the optional `design.md` from a
 * Kiro spec folder and resolves cross-document links.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';
import type { KiroSpec, ParseDiagnostic, ParsedDesign } from '../types.js';
import { SpecTruthError } from '../errors.js';
import { parseSpec } from './index.js';
import { parseTasks } from './tasks.js';
import { parseDesign } from './design.js';
import { resolveTaskLinks } from './links.js';

export interface LoadKiroSpecOptions {
  /** Require tasks.md. Task audits need it; a plain spec audit does not. */
  requireTasks?: boolean;
}

export function loadKiroSpec(specDir: string, options: LoadKiroSpecOptions = {}): KiroSpec {
  const resolvedDir = resolve(specDir);

  if (!existsSync(resolvedDir) || !statSync(resolvedDir).isDirectory()) {
    throw new SpecTruthError(
      `Kiro spec directory not found: ${specDir}`,
      'SPEC_DIR_NOT_FOUND',
      'Point SpecTruth at a spec folder such as .kiro/specs/<name>.',
    );
  }

  const requirementsPath = join(resolvedDir, 'requirements.md');
  if (!existsSync(requirementsPath)) {
    throw new SpecTruthError(
      `requirements.md not found in ${specDir}`,
      'SPEC_NOT_FOUND',
      'A Kiro spec folder must contain requirements.md.',
    );
  }

  const requirements = parseSpec(readTextFile(requirementsPath));
  if (requirements.requirements.length === 0) {
    throw new SpecTruthError(
      `No requirements found in ${requirementsPath}`,
      'SPEC_NO_REQUIREMENTS',
      'Add "### Requirement N" sections with acceptance criteria.',
    );
  }

  const diagnostics: ParseDiagnostic[] = [];
  const tasksPath = join(resolvedDir, 'tasks.md');
  const hasTasks = existsSync(tasksPath);

  if (!hasTasks && options.requireTasks) {
    throw new SpecTruthError(
      `tasks.md not found in ${specDir}`,
      'TASKS_NOT_FOUND',
      'Task-scoped audits need the spec implementation plan in tasks.md.',
    );
  }

  const tasks = hasTasks
    ? parseTasks(readTextFile(tasksPath), tasksPath)
    : { title: requirements.title, tasks: [], diagnostics: [] };

  if (!hasTasks) {
    diagnostics.push({
      code: 'TASKS_MISSING',
      message: 'tasks.md is not present, so task-state evidence is unavailable.',
      location: { file: tasksPath, line: 1 },
    });
  }

  const designPath = join(resolvedDir, 'design.md');
  let design: ParsedDesign | undefined;
  if (existsSync(designPath)) {
    const designText = readTextFile(designPath);
    if (designText.trim().length === 0) {
      diagnostics.push({
        code: 'DESIGN_EMPTY',
        message: 'design.md is present but empty, so design evidence is unavailable.',
        location: { file: designPath, line: 1 },
      });
    } else {
      design = parseDesign(designText, designPath);
    }
  } else {
    diagnostics.push({
      code: 'DESIGN_MISSING',
      message: 'design.md is not present, so design evidence is unavailable.',
      location: { file: designPath, line: 1 },
    });
  }

  const resolved = resolveTaskLinks({ tasks: tasks.tasks, requirements, design });

  return {
    name: basename(resolvedDir),
    specPath: resolvedDir,
    requirements,
    tasks,
    ...(design ? { design } : {}),
    links: resolved.links,
    diagnostics: [...diagnostics, ...tasks.diagnostics, ...resolved.diagnostics],
  };
}

function readTextFile(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    throw new SpecTruthError(
      `Could not read ${path}`,
      'SPEC_UNREADABLE',
      'Check file permissions.',
    );
  }
}
