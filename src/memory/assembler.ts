import type { Message } from '../llm/types.js';
import { getContextLimit } from '../llm/context-guard.js';
import * as store from './store.js';

const FRESH_TAIL = 8;  // recent items protected from eviction

/**
 * Assemble context for an LLM turn from the context_items table.
 * Returns messages array with summaries rendered as assistant context notes.
 */
export function assembleContext(
  conversationId: number,
  systemPrompt: string,
  model: string
): { messages: Message[]; estimatedTokens: number } {
  const items = store.getContextItems(conversationId);
  const tokenBudget = getContextLimit(model);

  // Start with system prompt
  const systemTokens = Math.ceil(systemPrompt.length / 4);
  let usedTokens = systemTokens;
  const messages: Message[] = [{ role: 'system', content: systemPrompt }];

  if (items.length === 0) {
    return { messages, estimatedTokens: usedTokens };
  }

  // Protect the fresh tail (most recent N items)
  const tailStart = Math.max(0, items.length - FRESH_TAIL);
  const freshTail = items.slice(tailStart);
  const evictable = items.slice(0, tailStart);

  // Calculate fresh tail tokens
  let tailTokens = 0;
  for (const item of freshTail) {
    tailTokens += item.token_count ?? 0;
  }

  // Fill remaining budget from evictable items (oldest first)
  const remainingBudget = tokenBudget - systemTokens - tailTokens;
  const includedEvictable: typeof evictable = [];
  let evictableTokens = 0;

  for (const item of evictable) {
    const itemTokens = item.token_count ?? 0;
    if (evictableTokens + itemTokens > remainingBudget) break;
    includedEvictable.push(item);
    evictableTokens += itemTokens;
  }

  // Build message array: included evictable + fresh tail
  const allIncluded = [...includedEvictable, ...freshTail];

  for (const item of allIncluded) {
    if (item.item_type === 'message' && item.content) {
      messages.push({
        role: (item.role as Message['role']) || 'user',
        content: item.content,
      });
      usedTokens += item.token_count ?? 0;
    } else if (item.item_type === 'summary' && item.content) {
      // Render summaries as context notes
      const depthLabel = (item.depth ?? 0) > 0
        ? ` (condensed, depth ${item.depth})`
        : '';
      const countLabel = item.descendant_count
        ? ` covering ${item.descendant_count} earlier messages`
        : '';

      messages.push({
        role: 'user',
        content: `[Context Summary${depthLabel}${countLabel}]\n\n${item.content}`,
      });
      usedTokens += item.token_count ?? 0;
    }
  }

  return { messages, estimatedTokens: usedTokens };
}
