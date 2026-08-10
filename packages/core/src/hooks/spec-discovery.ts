/**
 * Kiro spec discovery.
 *
 * IDE task events carry no spec or task identifier, so hooks that were not given
 * an explicit `--spec` must locate the spec themselves. More than one candidate
 * is reported rather than guessed.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { SpecTruthError } from '../errors.js';

export const SPECS_DIR = join('.kiro', 'specs');

export function findSpecDirs(projectRoot: string): string[] {
  const specsRoot = join(resolve(projectRoot), SPECS_DIR);
  if (!existsSync(specsRoot)) return [];

  let entries: string[];
  try {
    entries = readdirSync(specsRoot);
  } catch {
    return [];
  }

  return entries
    .map(entry => join(specsRoot, entry))
    .filter(candidate => {
      try {
        return statSync(candidate).isDirectory()
          && existsSync(join(candidate, 'requirements.md'));
      } catch {
        return false;
      }
    })
    .sort();
}

/** Resolve the single spec a hook should audit. */
export function resolveSingleSpecDir(projectRoot: string): string {
  const candidates = findSpecDirs(projectRoot);

  if (candidates.length === 0) {
    throw new SpecTruthError(
      `No Kiro specs found under ${SPECS_DIR}`,
      'SPEC_DIR_NOT_FOUND',
      'Create a Kiro spec, or pass --spec to point at one explicitly.',
    );
  }

  if (candidates.length > 1) {
    throw new SpecTruthError(
      `Multiple Kiro specs found: ${candidates.join(', ')}`,
      'SPEC_AMBIGUOUS',
      'Pass --spec to select which spec this hook should audit.',
    );
  }

  return candidates[0];
}
