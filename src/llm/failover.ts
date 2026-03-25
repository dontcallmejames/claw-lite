import type { LLMProvider } from './types.js';
import type { Message, ChatResponse, Tool } from './types.js';
import { reloadConfig } from '../config/loader.js';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [1000, 3000];

function isRetryable(err: any): boolean {
  const msg = err?.message || String(err);
  // Check for HTTP status codes in error messages
  for (const code of RETRYABLE_STATUS) {
    if (msg.includes(String(code))) return true;
  }
  // Timeout / network errors
  if (/timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try the primary model, then fall back to alternatives on retryable errors.
 * Reads model candidates from config at call time but never mutates the shared
 * config singleton — the provider's own model setting is used for actual calls.
 */
export async function chatWithFailover(
  provider: LLMProvider,
  messages: Message[],
  tools?: Tool[]
): Promise<ChatResponse> {
  const cfg = reloadConfig();
  const primary = cfg.llm.model;
  const fallbacks: string[] = (cfg.llm as any).fallback ?? [];
  const candidates = [primary, ...fallbacks];

  let lastError: any;

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];

    if (model !== primary) {
      console.log(`[Failover] Trying fallback model: ${model}`);
    }

    try {
      const response = await provider.chat(messages, tools);
      return response;
    } catch (err: any) {
      lastError = err;
      console.error(`[Failover] ${model} failed: ${err.message}`);

      if (!isRetryable(err) || i === candidates.length - 1) {
        break;
      }

      // Backoff before trying next candidate
      const delay = BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)];
      console.log(`[Failover] Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}
