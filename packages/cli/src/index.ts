#!/usr/bin/env node

/**
 * SpecTruth CLI
 *
 * Spec conformance verifier — independently checks if AI-generated code
 * satisfies your Kiro specs.
 *
 * Usage:
 *   spectruth verify --spec ./requirements.md --code ./src
 *   spectruth init    (scaffold .kiro hook + agent into a project)
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('spectruth')
  .description('Spec conformance verifier — checks if your code satisfies the spec')
  .version('0.1.0');

program
  .command('verify')
  .description('Verify code against a spec')
  .requiredOption('--spec <path>', 'Path to requirements.md spec file')
  .requiredOption('--code <path>', 'Path to codebase directory')
  .option('--output <format>', 'Output format: terminal or json', 'terminal')
  .option('--provider <name>', 'LLM provider: auto, anthropic, openai, kiro', 'auto')
  .action(async (options) => {
    // Will be implemented in Day 3 (Task 6)
    console.log('SpecTruth verify —', options);
    console.log('⚠️  Verification engine not yet connected. Coming soon.');
  });

program
  .command('init')
  .description('Add SpecTruth hook + agent config to your project')
  .action(async () => {
    // Will be implemented in Day 5 (Task 7)
    console.log('⚠️  Init command coming soon.');
  });

program.parse();
