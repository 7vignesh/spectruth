/**
 * LLM Provider
 *
 * Abstraction layer for LLM providers (Anthropic, OpenAI, Kiro).
 * Auto-detects the available provider from environment.
 */

import type { LLMProvider } from '../types.js';

// ─── Anthropic Provider ──────────────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = model || 'claude-sonnet-4-20250514';
  }

  async verify(prompt: string): Promise<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        { role: 'user', content: prompt },
      ],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }
}

// ─── OpenAI Provider ─────────────────────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model || 'gpt-4o';
  }

  async verify(prompt: string): Promise<string> {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: 'You are a spec conformance verifier. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
    });

    return response.choices[0]?.message?.content || '';
  }
}

// ─── Kiro Provider ───────────────────────────────────────────────────────────

export class KiroProvider implements LLMProvider {
  name = 'kiro';

  async verify(prompt: string): Promise<string> {
    // Kiro headless mode: execute a prompt via the Kiro CLI
    const { execSync } = await import('child_process');

    try {
      const result = execSync(
        `kiro --headless --prompt "${prompt.replace(/"/g, '\\"').substring(0, 4000)}"`,
        { encoding: 'utf-8', timeout: 60000 }
      );
      return result;
    } catch (error) {
      throw new Error(
        'Kiro headless mode failed. Make sure Kiro CLI is installed and authenticated.'
      );
    }
  }
}

// ─── Provider Factory ────────────────────────────────────────────────────────

/**
 * Check if we're running inside a Kiro session.
 */
export function isKiroSession(): boolean {
  return !!(
    process.env.KIRO_SESSION ||
    process.env.KIRO_HOME ||
    process.env.KIRO_API_KEY
  );
}

/**
 * Auto-detect and create the appropriate LLM provider.
 *
 * Priority:
 * 1. Kiro session detected → KiroProvider
 * 2. ANTHROPIC_API_KEY set → AnthropicProvider
 * 3. OPENAI_API_KEY set → OpenAIProvider
 * 4. None → throw with helpful error
 */
export function createProvider(preferred?: string): LLMProvider {
  // If user explicitly requested a provider
  if (preferred && preferred !== 'auto') {
    switch (preferred) {
      case 'anthropic':
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not set. Get one at https://console.anthropic.com');
        }
        return new AnthropicProvider();
      case 'openai':
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY not set. Get one at https://platform.openai.com');
        }
        return new OpenAIProvider();
      case 'kiro':
        return new KiroProvider();
      default:
        throw new Error(`Unknown provider: ${preferred}`);
    }
  }

  // Auto-detect
  if (isKiroSession()) {
    return new KiroProvider();
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider();
  }

  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }

  throw new Error(
    'No LLM provider detected.\n\n' +
    'Options:\n' +
    '  • Run inside Kiro (uses your Kiro credits automatically)\n' +
    '  • Set ANTHROPIC_API_KEY (get one at https://console.anthropic.com)\n' +
    '  • Set OPENAI_API_KEY (get one at https://platform.openai.com)\n'
  );
}
