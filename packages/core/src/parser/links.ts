/**
 * Link resolution between tasks, requirements, and design sections.
 *
 * Links come from explicit references only. Weak semantic similarity is not
 * treated as a link, because a fabricated link would later become fabricated
 * audit evidence.
 */

import type {
  AcceptanceCriterion,
  DesignSection,
  ParseDiagnostic,
  ParsedDesign,
  ParsedSpec,
  ParsedTask,
  Requirement,
  TaskLinks,
} from '../types.js';

export interface ResolveLinksInput {
  tasks: ParsedTask[];
  requirements: ParsedSpec;
  design?: ParsedDesign;
}

export interface ResolveLinksResult {
  links: TaskLinks[];
  diagnostics: ParseDiagnostic[];
}

export function resolveTaskLinks(input: ResolveLinksInput): ResolveLinksResult {
  const { tasks, requirements, design } = input;
  const requirementsById = new Map(requirements.requirements.map(req => [req.id, req]));
  const criteriaById = new Map<string, AcceptanceCriterion>();
  for (const requirement of requirements.requirements) {
    for (const criterion of requirement.acceptanceCriteria) {
      criteriaById.set(criterion.id, criterion);
    }
  }

  const diagnostics: ParseDiagnostic[] = [];
  const links: TaskLinks[] = tasks.map(task => {
    const resolvedRequirements: Requirement[] = [];
    const resolvedCriteria: AcceptanceCriterion[] = [];
    const unresolvedRefs: string[] = [];

    for (const ref of task.requirementRefs) {
      const requirement = requirementsById.get(ref.requirementId);
      if (!requirement) {
        unresolvedRefs.push(ref.raw);
        diagnostics.push({
          code: 'REQUIREMENT_REF_UNRESOLVED',
          message: `Task ${task.id} references "${ref.raw}", which does not exist in requirements.md.`,
          location: task.location,
        });
        continue;
      }

      if (!resolvedRequirements.some(existing => existing.id === requirement.id)) {
        resolvedRequirements.push(requirement);
      }

      if (ref.criterionId) {
        const criterion = criteriaById.get(ref.criterionId);
        if (!criterion) {
          unresolvedRefs.push(ref.raw);
          diagnostics.push({
            code: 'REQUIREMENT_REF_UNRESOLVED',
            message: `Task ${task.id} references criterion "${ref.raw}", which does not exist in ${requirement.id}.`,
            location: task.location,
          });
          continue;
        }
        if (!resolvedCriteria.some(existing => existing.id === criterion.id)) {
          resolvedCriteria.push(criterion);
        }
        continue;
      }

      // A requirement-level reference covers every criterion it owns.
      for (const criterion of requirement.acceptanceCriteria) {
        if (!resolvedCriteria.some(existing => existing.id === criterion.id)) {
          resolvedCriteria.push(criterion);
        }
      }
    }

    return {
      taskId: task.id,
      requirements: resolvedRequirements,
      criteria: resolvedCriteria,
      designSections: design
        ? findCitedDesignSections(design.sections, task, resolvedRequirements)
        : [],
      unresolvedRefs,
    };
  });

  return { links, diagnostics };
}

/**
 * A design section is linked only when it explicitly cites the task or one of
 * its requirements.
 */
function findCitedDesignSections(
  sections: DesignSection[],
  task: ParsedTask,
  requirements: Requirement[],
): DesignSection[] {
  const patterns: RegExp[] = [
    new RegExp(`\\btask\\s+${escapeRegExp(task.id)}\\b`, 'i'),
  ];

  for (const requirement of requirements) {
    const number = requirement.id.replace(/^REQ-/, '');
    patterns.push(new RegExp(`\\b${escapeRegExp(requirement.id)}\\b`, 'i'));
    patterns.push(new RegExp(`\\brequirement\\s+${escapeRegExp(number)}\\b`, 'i'));
  }

  return sections.filter(section => {
    const haystack = `${section.heading}\n${section.content}`;
    return patterns.some(pattern => pattern.test(haystack));
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
