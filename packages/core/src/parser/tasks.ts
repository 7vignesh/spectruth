/**
 * Kiro tasks.md parser.
 *
 * Supports the standard Kiro implementation-plan format:
 *
 *   - [ ] 1. Set up the project
 *     - Create the directory layout
 *     - _Requirements: 1.1, 1.2_
 *   - [x] 2.1 Implement the model
 *
 * and the `Task N:` heading variant used by some specs:
 *
 *   - [x] Task 2: Spec parser
 *
 * Checkbox states map to `not_started`, `in_progress` (`- [-]`), and
 * `completed`. Malformed checkboxes are reported rather than silently
 * treated as complete, because a completion claim drives the ship gate.
 */

import type {
  ParseDiagnostic,
  ParsedTask,
  ParsedTasks,
  RequirementReference,
  TaskState,
} from '../types.js';

interface RawTask {
  indent: number;
  mark: string;
  text: string;
  line: number;
  description: string[];
  refs: RequirementReference[];
  malformedCheckbox: boolean;
}

const CHECKBOX_LINE = /^(\s*)[-*]\s*\[([^\]]*)\]\s*(.*)$/;
const REQUIREMENTS_LINE = /_?\s*Requirements?\s*:\s*([^_]+?)\s*_?\s*$/i;
const EXPLICIT_ID = /^(?:task\s+)?(\d+(?:\.\d+)*)\s*[.):]?\s+(.*)$/i;
const BARE_ID = /^(?:task\s+)?(\d+(?:\.\d+)*)\s*[.):]?\s*$/i;

export function parseTasks(markdown: string, filePath = 'tasks.md'): ParsedTasks {
  const lines = markdown.split(/\r?\n/);
  const diagnostics: ParseDiagnostic[] = [];
  const raw: RawTask[] = [];
  let current: RawTask | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;
    const checkbox = CHECKBOX_LINE.exec(line);

    if (checkbox) {
      const [, indentText, mark, text] = checkbox;
      const malformedCheckbox = !isKnownMark(mark);
      if (malformedCheckbox) {
        diagnostics.push({
          code: 'TASK_MALFORMED_CHECKBOX',
          message: `Unrecognized task checkbox "[${mark}]"; treating the task as not started.`,
          location: { file: filePath, line: lineNumber },
        });
      }
      current = {
        indent: expandIndent(indentText),
        mark,
        text: text.trim(),
        line: lineNumber,
        description: [],
        refs: [],
        malformedCheckbox,
      };
      raw.push(current);
      continue;
    }

    if (line.trim().length === 0) continue;

    if (/^#{1,6}\s/.test(line)) {
      current = null;
      continue;
    }

    if (!current) continue;

    // Continuation content must be indented further than its task bullet.
    const contentIndent = expandIndent(line.match(/^\s*/)?.[0] ?? '');
    if (contentIndent <= current.indent) {
      current = null;
      continue;
    }

    const body = line.trim().replace(/^[-*]\s*/, '').trim();
    const requirements = REQUIREMENTS_LINE.exec(body);
    if (requirements) {
      current.refs.push(...parseRequirementRefs(requirements[1]));
      continue;
    }
    if (body.length > 0) current.description.push(body);
  }

  const tasks = buildTasks(raw, filePath, diagnostics);

  if (raw.length === 0) {
    diagnostics.push({
      code: 'TASKS_EMPTY',
      message: 'No Kiro tasks were found in tasks.md.',
      location: { file: filePath, line: 1 },
    });
  }

  return { title: extractTitle(markdown), tasks, diagnostics };
}

function buildTasks(
  raw: RawTask[],
  filePath: string,
  diagnostics: ParseDiagnostic[],
): ParsedTask[] {
  const structuralIds = assignStructuralIds(raw);
  const used = new Map<string, number>();
  const tasks: ParsedTask[] = [];

  for (let index = 0; index < raw.length; index++) {
    const entry = raw[index];
    const explicit = EXPLICIT_ID.exec(entry.text) ?? BARE_ID.exec(entry.text);
    const explicitId = explicit?.[1];
    const title = (explicit && explicit[2] ? explicit[2] : explicitId ? '' : entry.text).trim();
    const baseId = explicitId ?? structuralIds[index];
    const id = uniqueId(baseId, used, filePath, entry.line, diagnostics);

    if (!title) {
      diagnostics.push({
        code: 'TASK_MISSING_TITLE',
        message: `Task ${id} has no descriptive title.`,
        location: { file: filePath, line: entry.line },
      });
    }
    if (entry.refs.length === 0) {
      diagnostics.push({
        code: 'TASK_NO_REQUIREMENT_REFS',
        message: `Task ${id} does not reference any requirement.`,
        location: { file: filePath, line: entry.line },
      });
    }

    tasks.push({
      id,
      title: title || `Task ${id}`,
      description: entry.description,
      state: entry.malformedCheckbox ? 'not_started' : markToState(entry.mark),
      depth: 0,
      childIds: [],
      requirementRefs: dedupeRefs(entry.refs),
      location: { file: filePath, line: entry.line },
    });
  }

  linkHierarchy(tasks, raw);
  return tasks;
}

/** Positional identifiers for tasks that carry no explicit number. */
function assignStructuralIds(raw: RawTask[]): string[] {
  const ids: string[] = [];
  const stack: Array<{ indent: number; id: string; children: number }> = [];
  let rootCount = 0;

  for (const entry of raw) {
    while (stack.length > 0 && entry.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    let id: string;
    if (parent) {
      parent.children += 1;
      id = `${parent.id}.${parent.children}`;
    } else {
      rootCount += 1;
      id = String(rootCount);
    }
    ids.push(id);
    stack.push({ indent: entry.indent, id, children: 0 });
  }

  return ids;
}

/**
 * Prefer dotted identifiers for hierarchy, since Kiro sub-tasks such as `2.1`
 * are frequently written at the same indentation as their parent.
 */
function linkHierarchy(tasks: ParsedTask[], raw: RawTask[]): void {
  const byId = new Map(tasks.map(task => [task.id, task]));

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    const segments = task.id.split('.');
    let parent: ParsedTask | undefined;

    if (segments.length > 1) {
      parent = byId.get(segments.slice(0, -1).join('.'));
    }
    if (!parent) {
      for (let previous = index - 1; previous >= 0; previous--) {
        if (raw[previous].indent < raw[index].indent) {
          parent = tasks[previous];
          break;
        }
      }
    }

    if (parent && parent.id !== task.id) {
      task.parentId = parent.id;
      task.depth = parent.depth + 1;
      parent.childIds.push(task.id);
    }
  }
}

function uniqueId(
  baseId: string,
  used: Map<string, number>,
  filePath: string,
  line: number,
  diagnostics: ParseDiagnostic[],
): string {
  const seen = used.get(baseId);
  if (seen === undefined) {
    used.set(baseId, 1);
    return baseId;
  }
  const occurrence = seen + 1;
  used.set(baseId, occurrence);
  const id = `${baseId}~${occurrence}`;
  diagnostics.push({
    code: 'TASK_DUPLICATE_ID',
    message: `Duplicate task identifier "${baseId}"; disambiguated as "${id}".`,
    location: { file: filePath, line },
  });
  return id;
}

/** `1.2` cites requirement 1 acceptance criterion 2; `1` cites the requirement. */
export function parseRequirementRefs(text: string): RequirementReference[] {
  const refs: RequirementReference[] = [];
  const tokens = text.split(/[,;]/).map(token => token.trim()).filter(Boolean);

  for (const token of tokens) {
    const match = /^(?:req(?:uirement)?[-–\s]*)?(\d+)(?:\.(\d+))?$/i.exec(token);
    if (!match) continue;
    const requirementId = `REQ-${match[1]}`;
    refs.push({
      raw: token,
      requirementId,
      ...(match[2] ? { criterionId: `${requirementId}-AC-${match[2]}` } : {}),
    });
  }

  return refs;
}

function dedupeRefs(refs: RequirementReference[]): RequirementReference[] {
  const seen = new Set<string>();
  return refs.filter(ref => {
    const key = `${ref.requirementId}|${ref.criterionId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isKnownMark(mark: string): boolean {
  return /^(\s*|x|X|-)$/.test(mark);
}

function markToState(mark: string): TaskState {
  const normalized = mark.trim().toLowerCase();
  if (normalized === 'x') return 'completed';
  if (normalized === '-') return 'in_progress';
  return 'not_started';
}

function expandIndent(indent: string): number {
  let width = 0;
  for (const char of indent) width += char === '\t' ? 4 : 1;
  return width;
}

function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+?)$/m);
  if (!match) return 'Untitled Tasks';
  return match[1].replace(/\s*[-—]\s*Tasks?$/i, '').trim();
}
