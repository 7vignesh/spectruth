/**
 * Spec Parser
 *
 * Parses Kiro-format requirements.md files into structured ParsedSpec objects.
 * Handles EARS notation (WHEN/THEN/SHALL/IF) and plain numbered lists.
 *
 * Supported formats:
 * - Kiro standard: ### Requirement N with #### Acceptance Criteria
 * - EARS notation: WHEN/THEN, IF/THEN, WHERE keywords
 * - Plain numbered lists: 1. Some requirement text
 */

import type { ParsedSpec, Requirement, AcceptanceCriterion, CriterionKeyword } from '../types.js';

/**
 * Parse a Kiro-format requirements.md string into a structured ParsedSpec.
 */
export function parseSpec(markdown: string): ParsedSpec {
  const title = extractTitle(markdown);
  const introduction = extractIntroduction(markdown);
  const requirements = extractRequirements(markdown);

  return { title, introduction, requirements };
}

/**
 * Extract the document title from the first H1 heading.
 */
function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+?)(?:\s*[-—]\s*Requirements)?$/m);
  return match ? match[1].trim() : 'Untitled Spec';
}

/**
 * Extract the introduction section (text between ## Introduction and first ## Requirements).
 */
function extractIntroduction(markdown: string): string {
  const introMatch = markdown.match(
    /##\s+Introduction\s*\n([\s\S]*?)(?=\n##\s+Requirements|\n###\s+Requirement)/
  );
  return introMatch ? introMatch[1].trim() : '';
}

/**
 * Extract all requirements from the markdown.
 * Splits on ### Requirement N headings.
 */
function extractRequirements(markdown: string): Requirement[] {
  const requirements: Requirement[] = [];

  // Match each requirement block: ### Requirement N ... (until next ### Requirement or end)
  const reqPattern = /###\s+Requirement\s+(\d+)\s*\n([\s\S]*?)(?=\n###\s+Requirement\s+\d+|$)/g;
  let match: RegExpExecArray | null;

  while ((match = reqPattern.exec(markdown)) !== null) {
    const reqNumber = match[1];
    const reqBody = match[2];

    const id = `REQ-${reqNumber}`;
    const title = extractRequirementTitle(reqBody);
    const userStory = extractUserStory(reqBody);
    const acceptanceCriteria = extractAcceptanceCriteria(reqBody, id);

    requirements.push({ id, title, userStory, acceptanceCriteria });
  }

  // Fallback: if no ### Requirement headings found, try to parse as a simple numbered list
  if (requirements.length === 0) {
    const fallbackReqs = parseFallbackFormat(markdown);
    requirements.push(...fallbackReqs);
  }

  return requirements;
}

/**
 * Extract the requirement title from the User Story or first bold text.
 */
function extractRequirementTitle(body: string): string {
  // Try to get title from **User Story:** line — extract the "I want [goal]" part
  const storyMatch = body.match(/\*\*User Story:\*\*\s*As .+?,\s*I want\s+(.+?),/);
  if (storyMatch) {
    return storyMatch[1].trim();
  }

  // Fallback: first bold text in the block
  const boldMatch = body.match(/\*\*(.+?)\*\*/);
  if (boldMatch && !boldMatch[1].includes('User Story')) {
    return boldMatch[1].trim();
  }

  return 'Untitled Requirement';
}

/**
 * Extract the user story text.
 */
function extractUserStory(body: string): string {
  const match = body.match(/\*\*User Story:\*\*\s*(.+)/);
  return match ? match[1].trim() : '';
}

/**
 * Extract acceptance criteria from a requirement body.
 * Looks for #### Acceptance Criteria section with numbered items.
 */
function extractAcceptanceCriteria(body: string, reqId: string): AcceptanceCriterion[] {
  const criteria: AcceptanceCriterion[] = [];

  // Find the Acceptance Criteria section
  const acSection = body.match(
    /####?\s+Acceptance Criteria\s*\n([\s\S]*?)(?=\n####?\s+|$)/
  );

  if (!acSection) {
    // Fallback: look for any numbered list in the body
    return parseNumberedList(body, reqId);
  }

  const acBody = acSection[1];

  // Parse numbered items (1. ..., 2. ..., etc.)
  const itemPattern = /^\s*\d+\.\s+(.+?)$/gm;
  let itemMatch: RegExpExecArray | null;
  let index = 1;

  while ((itemMatch = itemPattern.exec(acBody)) !== null) {
    const text = itemMatch[1].trim();
    const keyword = detectKeyword(text);
    const id = `${reqId}-AC-${index}`;

    criteria.push({ id, text, keyword });
    index++;
  }

  return criteria;
}

/**
 * Parse a numbered list as acceptance criteria (fallback for non-standard formats).
 */
function parseNumberedList(body: string, reqId: string): AcceptanceCriterion[] {
  const criteria: AcceptanceCriterion[] = [];
  const itemPattern = /^\s*\d+\.\s+(.+?)$/gm;
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = itemPattern.exec(body)) !== null) {
    const text = match[1].trim();
    const keyword = detectKeyword(text);
    const id = `${reqId}-AC-${index}`;

    criteria.push({ id, text, keyword });
    index++;
  }

  return criteria;
}

/**
 * Detect the EARS keyword pattern in a criterion text.
 */
function detectKeyword(text: string): CriterionKeyword {
  const upper = text.toUpperCase();

  if (upper.includes('WHEN') && upper.includes('THEN')) {
    return 'WHEN/THEN';
  }
  if (upper.includes('IF') && upper.includes('THEN')) {
    return 'IF/THEN';
  }
  if (upper.includes('WHERE')) {
    return 'WHERE';
  }

  return 'plain';
}

/**
 * Fallback parser for non-standard spec formats.
 * Handles plain markdown with ## or ### headings and numbered requirements.
 */
function parseFallbackFormat(markdown: string): Requirement[] {
  const requirements: Requirement[] = [];

  // Try ## headings as requirements
  const headingPattern = /^##\s+(?!Introduction|Requirements)(.+?)$/gm;
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = headingPattern.exec(markdown)) !== null) {
    const title = match[1].trim();
    const startIdx = match.index + match[0].length;

    // Find the body until next ## heading or end
    const nextHeading = markdown.indexOf('\n## ', startIdx);
    const body = nextHeading === -1
      ? markdown.slice(startIdx)
      : markdown.slice(startIdx, nextHeading);

    const id = `REQ-${index}`;
    const criteria = parseNumberedList(body, id);

    if (criteria.length > 0) {
      requirements.push({
        id,
        title,
        userStory: '',
        acceptanceCriteria: criteria,
      });
      index++;
    }
  }

  // Last fallback: treat the entire document as one requirement with a numbered list
  if (requirements.length === 0) {
    const criteria = parseNumberedList(markdown, 'REQ-1');
    if (criteria.length > 0) {
      requirements.push({
        id: 'REQ-1',
        title: extractTitle(markdown),
        userStory: '',
        acceptanceCriteria: criteria,
      });
    }
  }

  return requirements;
}
