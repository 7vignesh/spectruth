/**
 * Spec Parser
 *
 * Parses Kiro-format requirements.md files into structured ParsedSpec objects.
 * Handles EARS notation (WHEN/THEN/SHALL/IF) and plain numbered lists.
 */

import type { ParsedSpec } from '../types.js';

export function parseSpec(_markdown: string): ParsedSpec {
  // Full implementation coming next
  return {
    title: '',
    introduction: '',
    requirements: [],
  };
}
