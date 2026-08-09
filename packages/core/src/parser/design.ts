/**
 * Kiro design.md parser.
 *
 * Design documents are free-form, so the parser only captures headings,
 * their content, and source locations. Interpretation is left to evidence
 * adjudication rather than guessed here.
 */

import type { DesignSection, ParsedDesign } from '../types.js';

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

export function parseDesign(markdown: string, filePath = 'design.md'): ParsedDesign {
  const lines = markdown.split(/\r?\n/);
  const sections: DesignSection[] = [];
  let title = 'Untitled Design';
  let currentTitleSeen = false;
  let current: { section: DesignSection; body: string[] } | null = null;

  const flush = (): void => {
    if (!current) return;
    current.section.content = current.body.join('\n').trim();
    sections.push(current.section);
    current = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = HEADING.exec(line);

    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();

      if (level === 1 && !currentTitleSeen) {
        title = text.replace(/\s*[-—]\s*Design$/i, '').trim();
        currentTitleSeen = true;
        flush();
        continue;
      }

      flush();
      current = {
        section: {
          heading: text,
          level,
          content: '',
          location: { file: filePath, line: index + 1 },
        },
        body: [],
      };
      continue;
    }

    if (current) current.body.push(line);
  }

  flush();
  return { title, sections };
}
