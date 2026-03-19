import type { Message, LLMProvider } from '../llm/types.js';

const COMPACTION_THRESHOLD = 30;  // messages before compaction triggers
const COMPACT_BATCH = 20;         // how many old messages to summarize
const KEEP_RECENT = 10;           // how many recent messages to preserve

const COMPACTION_PROMPT = `Summarize the following conversation history into a concise context summary.
Preserve:
- Active task descriptions and goals
- Key names, IDs, URLs, file paths, and identifiers
- Recent decisions and their reasoning
- Any pending work or open questions

Be concise but complete. Format as bullet points under relevant headings.`;

/**
 * LLM-powered session compaction.
 * When conversation grows too long, summarizes older messages
 * and keeps recent ones intact.
 */
export async function compactHistory(
  messages: Message[],
  provider: LLMProvider
): Promise<Message[]> {
  // Only system + non-system messages
  const systemMsg = messages.find(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  if (nonSystem.length <= COMPACTION_THRESHOLD) {
    return messages;
  }

  console.log(`[Compaction] ${nonSystem.length} messages — summarizing oldest ${COMPACT_BATCH}`);

  const toSummarize = nonSystem.slice(0, COMPACT_BATCH);
  const toKeep = nonSystem.slice(COMPACT_BATCH);

  // Build the text to summarize
  const historyText = toSummarize
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n\n');

  try {
    const response = await provider.chat([
      { role: 'system', content: COMPACTION_PROMPT },
      { role: 'user', content: historyText },
    ]);

    const summary: Message = {
      role: 'assistant',
      content: `[Context Summary — ${COMPACT_BATCH} earlier messages compacted]\n\n${response.content}`,
    };

    console.log(`[Compaction] Summarized ${COMPACT_BATCH} messages → ${response.content.length} chars`);

    const result: Message[] = [];
    if (systemMsg) result.push(systemMsg);
    result.push(summary);
    result.push(...toKeep);
    return result;
  } catch (err: any) {
    console.error(`[Compaction] Failed: ${err.message} — falling back to truncation`);
    // Fallback: just keep recent messages
    const result: Message[] = [];
    if (systemMsg) result.push(systemMsg);
    result.push(...nonSystem.slice(-KEEP_RECENT));
    return result;
  }
}
