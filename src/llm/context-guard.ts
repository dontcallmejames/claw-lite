import type { Message } from './types.js';

/** Known context window sizes (tokens) */
const MODEL_LIMITS: Record<string, number> = {
  'gpt-5.4': 128_000,
  'gpt-5.3-codex': 128_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-3-opus': 200_000,
  'claude-3-sonnet': 200_000,
  'qwen2.5:14b': 32_768,
  'qwen2.5:32b': 32_768,
  'qwen2.5-coder:14b': 32_768,
  'qwen3.5:9b': 32_768,
};

const DEFAULT_LIMIT = 32_768;

/** Rough token estimate: ~4 chars per token */
export function estimateTokens(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) / 4
  );
}

/** Look up context window for a model, with fuzzy prefix matching */
export function getContextLimit(model: string): number {
  if (MODEL_LIMITS[model]) return MODEL_LIMITS[model];
  // Try prefix match (e.g. "gpt-5.4-turbo" matches "gpt-5.4")
  for (const [key, limit] of Object.entries(MODEL_LIMITS)) {
    if (model.startsWith(key)) return limit;
  }
  return DEFAULT_LIMIT;
}

export interface GuardResult {
  messages: Message[];
  warned: boolean;
  trimmed: boolean;
  estimatedTokens: number;
  contextLimit: number;
}

/**
 * Guard against context window overflow.
 * - At 80%: log warning
 * - At 90%: trim oldest non-system messages until under 75%
 */
export function guardContext(messages: Message[], model: string): GuardResult {
  const limit = getContextLimit(model);
  let tokens = estimateTokens(messages);
  let warned = false;
  let trimmed = false;

  if (tokens > limit * 0.8) {
    warned = true;
    console.warn(`[Context] Warning: ~${tokens} tokens used of ${limit} limit (${Math.round(tokens / limit * 100)}%)`);
  }

  if (tokens > limit * 0.9) {
    // Trim oldest non-system messages until under 75%
    const target = limit * 0.75;
    const result = [...messages];
    let i = 0;
    while (tokens > target && i < result.length) {
      if (result[i].role !== 'system') {
        tokens -= Math.ceil((result[i].content?.length ?? 0) / 4);
        result.splice(i, 1);
        trimmed = true;
      } else {
        i++;
      }
    }
    console.warn(`[Context] Trimmed to ~${tokens} tokens (target: ${target})`);
    return { messages: result, warned, trimmed, estimatedTokens: tokens, contextLimit: limit };
  }

  return { messages, warned, trimmed, estimatedTokens: tokens, contextLimit: limit };
}
