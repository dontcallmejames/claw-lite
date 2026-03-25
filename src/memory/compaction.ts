import type { LLMProvider } from '../llm/types.js';
import { getContextLimit } from '../llm/context-guard.js';
import { reloadConfig } from '../config/loader.js';
import * as store from './store.js';

const FRESH_TAIL = 8;            // recent messages protected from compaction
const LEAF_CHUNK_SIZE = 8;       // max raw messages per leaf summary
const LEAF_CHUNK_TOKENS = 20_000; // max tokens per leaf chunk
const CONDENSED_MIN_FANOUT = 4;  // min adjacent summaries before condensing
const CONTEXT_THRESHOLD = 0.75;  // trigger compaction at 75% of model limit

const LEAF_PROMPT = `Summarize the following conversation messages into a concise summary.

PRESERVE exactly:
- All names, usernames, user IDs, bot IDs
- All file paths, URLs, repo names, branch names
- All decisions made and their reasoning
- All tool calls and their outcomes
- All errors encountered and how they were resolved
- All dates, times, deadlines mentioned

Be concise but complete. Use bullet points. Include temporal markers (e.g. "first...", "then...", "after that...").`;

const CONDENSED_PROMPT = `Combine these conversation summaries into a single higher-level summary.

PRESERVE exactly:
- All names, IDs, identifiers
- All decisions and reasoning
- Key outcomes and resolutions
- Temporal flow of events

Merge overlapping content. Remove redundancy. Keep the combined summary shorter than the individual summaries combined.`;

/**
 * Evaluate whether compaction is needed for this conversation.
 */
export function needsCompaction(conversationId: number): boolean {
  const { model } = reloadConfig().llm;
  const limit = getContextLimit(model);
  const currentTokens = store.getContextTokenCount(conversationId);
  return currentTokens > limit * CONTEXT_THRESHOLD;
}

/**
 * Run leaf compaction — summarize the oldest raw messages.
 * Returns true if a compaction was performed.
 */
export async function compactLeaf(
  conversationId: number,
  provider: LLMProvider
): Promise<boolean> {
  const items = store.getContextItems(conversationId);

  // Find raw messages (excluding the fresh tail)
  const messageItems = items.filter(i => i.item_type === 'message');
  const protectedCount = Math.min(FRESH_TAIL, messageItems.length);
  const compactable = messageItems.slice(0, messageItems.length - protectedCount);

  if (compactable.length < 2) return false;

  // Chunk the oldest messages
  let chunk: typeof compactable = [];
  let chunkTokens = 0;

  for (const item of compactable) {
    if (chunk.length >= LEAF_CHUNK_SIZE || chunkTokens >= LEAF_CHUNK_TOKENS) break;
    chunk.push(item);
    chunkTokens += item.token_count ?? 0;
  }

  if (chunk.length < 2) return false;

  // Build text to summarize
  const text = chunk
    .map(c => `[${c.role}]: ${c.content}`)
    .join('\n\n');

  console.log(`[Compaction] Leaf pass: ${chunk.length} messages, ~${chunkTokens} tokens`);

  try {
    const response = await provider.chat([
      { role: 'system', content: LEAF_PROMPT },
      { role: 'user', content: text },
    ]);

    const sourceMessageIds = chunk.map(c => c.message_id!).filter(Boolean);
    const earliestAt = chunk[0].created_at ?? undefined;
    const latestAt = chunk[chunk.length - 1].created_at ?? undefined;

    const summaryId = store.insertSummary(
      conversationId,
      'leaf',
      0,
      response.content,
      sourceMessageIds,
      [],
      earliestAt,
      latestAt
    );

    // Replace the messages in context_items with the summary
    const startOrdinal = chunk[0].ordinal;
    const endOrdinal = chunk[chunk.length - 1].ordinal;
    store.replaceContextRange(conversationId, startOrdinal, endOrdinal, summaryId);

    console.log(`[Compaction] Leaf summary created: ${summaryId} (${response.content.length} chars from ${chunk.length} messages)`);
    return true;
  } catch (err: any) {
    console.error(`[Compaction] Leaf pass failed: ${err.message}`);
    return false;
  }
}

/**
 * Run condensed compaction — merge adjacent leaf/condensed summaries.
 * Returns true if a compaction was performed.
 */
export async function compactCondensed(
  conversationId: number,
  provider: LLMProvider
): Promise<boolean> {
  const items = store.getContextItems(conversationId);

  // Find consecutive summary items at the same depth
  const summaryItems = items.filter(i => i.item_type === 'summary');
  if (summaryItems.length < CONDENSED_MIN_FANOUT) return false;

  // Group consecutive summaries by depth
  let group: typeof summaryItems = [];
  let groupDepth = -1;

  for (const item of summaryItems) {
    const depth = item.depth ?? 0;
    if (depth === groupDepth) {
      group.push(item);
    } else {
      if (group.length >= CONDENSED_MIN_FANOUT) break; // use this group
      group = [item];
      groupDepth = depth;
    }
  }

  if (group.length < CONDENSED_MIN_FANOUT) return false;

  // Build text to condense
  const text = group
    .map((s, i) => `[Summary ${i + 1} (depth ${s.depth})]: ${s.content}`)
    .join('\n\n---\n\n');

  console.log(`[Compaction] Condensed pass: ${group.length} summaries at depth ${groupDepth}`);

  try {
    const response = await provider.chat([
      { role: 'system', content: CONDENSED_PROMPT },
      { role: 'user', content: text },
    ]);

    const parentSummaryIds = group.map(g => g.summary_id!).filter(Boolean);

    const summaryId = store.insertSummary(
      conversationId,
      'condensed',
      groupDepth + 1,
      response.content,
      [],
      parentSummaryIds
    );

    const startOrdinal = group[0].ordinal;
    const endOrdinal = group[group.length - 1].ordinal;
    store.replaceContextRange(conversationId, startOrdinal, endOrdinal, summaryId);

    console.log(`[Compaction] Condensed summary created: ${summaryId} at depth ${groupDepth + 1}`);
    return true;
  } catch (err: any) {
    console.error(`[Compaction] Condensed pass failed: ${err.message}`);
    return false;
  }
}

/**
 * Run compaction passes until context is under threshold.
 * Alternates leaf and condensed passes.
 */
export async function runCompaction(
  conversationId: number,
  provider: LLMProvider,
  maxRounds = 5
): Promise<void> {
  for (let round = 0; round < maxRounds; round++) {
    if (!needsCompaction(conversationId)) {
      console.log(`[Compaction] Context within budget after ${round} round(s)`);
      return;
    }

    // Try leaf compaction first
    const leafDone = await compactLeaf(conversationId, provider);
    if (leafDone) continue;

    // If no leaf work, try condensed
    const condensedDone = await compactCondensed(conversationId, provider);
    if (!condensedDone) {
      console.log(`[Compaction] No more compaction candidates after ${round + 1} round(s)`);
      return;
    }
  }

  console.log(`[Compaction] Reached max rounds (${maxRounds})`);
}
