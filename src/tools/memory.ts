import type { ToolDefinition, ToolExecutionResult } from './types.js';
import * as store from '../memory/store.js';
import { wrapExternalContent, sanitizeInjectionPatterns } from '../security/external-content.js';

export const memoryTool: ToolDefinition = {
  name: 'memory',
  description: `Save, retrieve, search, and manage the assistant's persistent long-term memory.

Use this when: storing a fact, preference, note, or event to remember later; looking up something stored previously; searching past conversation history.
Do NOT use this when: the answer is already in the current conversation — only reach for memory tools when you need to look something up or store something for future sessions.

Actions:
- save: Store a fact, preference, note, or event. Facts and preferences require a key. Notes and events do not.
- recall: Retrieve a stored value by key, or list all stored values (optionally filtered by type: preference, fact, note, event).
- search: Full-text search across past conversation messages and summaries. Use when asked about past discussions.
- describe: Inspect a specific summary by ID — shows content, source count, time range, child summaries.
- query: Answer a complex question from conversation history. Searches history and returns context for the model to synthesize.
- delete: Remove a stored fact or note by key.`,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['save', 'recall', 'search', 'describe', 'query', 'delete'],
        description: 'The memory operation to perform'
      },
      key: {
        type: 'string',
        description: 'Identifier for save (required for preference/fact type) or key to recall/delete. Example: "favorite_language"'
      },
      value: {
        type: 'string',
        description: 'The information to store (save action)'
      },
      type: {
        type: 'string',
        enum: ['preference', 'fact', 'note', 'event'],
        description: 'Memory category (save action): preference=user settings, fact=important info, note=free-form text, event=dated occurrence'
      },
      date: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD for event type (save action)'
      },
      filter_type: {
        type: 'string',
        enum: ['preference', 'fact', 'note', 'event', 'all'],
        description: 'Filter by type when listing (recall action, default: all)'
      },
      query: {
        type: 'string',
        description: 'Search terms (search action)'
      },
      scope: {
        type: 'string',
        enum: ['messages', 'summaries', 'both'],
        description: 'Where to search (search action, default: both)'
      },
      limit: {
        type: 'number',
        description: 'Max results (search action, default: 10)'
      },
      summary_id: {
        type: 'string',
        description: 'Summary ID to inspect (describe action)'
      },
      question: {
        type: 'string',
        description: 'Question to answer from history (query action)'
      },
      search_terms: {
        type: 'string',
        description: 'Keywords to find relevant context (query action, defaults to question if omitted)'
      }
    },
    required: ['action']
  },

  async execute(input): Promise<ToolExecutionResult> {
    const action = input.action as string;

    // --- save ---
    if (action === 'save') {
      const { key, value, type, date } = input as Record<string, string>;
      if (!value) return { success: false, error: 'value is required for save' };
      if (!type) return { success: false, error: 'type is required for save (preference, fact, note, event)' };
      if ((type === 'preference' || type === 'fact') && !key) {
        return { success: false, error: 'key is required for preference/fact type' };
      }
      try {
        const memKey = key || `${type}_${Date.now()}`;
        const safeValue = sanitizeInjectionPatterns(value);
        store.kvSet(memKey, type, safeValue, date);
        if (type === 'event') return { success: true, output: `Event saved: ${date || new Date().toISOString().split('T')[0]} — ${safeValue}` };
        if (type === 'note') return { success: true, output: `Note saved: ${safeValue}` };
        return { success: true, output: `Remembered: ${key} = ${safeValue}` };
      } catch (e: any) {
        return { success: false, error: `Save failed: ${e.message}` };
      }
    }

    // --- recall ---
    if (action === 'recall') {
      const { key, filter_type = 'all' } = input as { key?: string; filter_type?: string };
      try {
        if (key) {
          const item = store.kvGet(key);
          if (item) return { success: true, output: wrapExternalContent(`${item.category} "${key}": ${item.value}`, 'memory-store') };
          return { success: false, error: `No memory found for key: ${key}` };
        }
        const items = filter_type === 'all' ? store.kvGetAll() : store.kvGetByCategory(filter_type);
        if (items.length === 0) return { success: true, output: 'No memories stored yet.' };
        return { success: true, output: wrapExternalContent(items.map((i: any) => `  [${i.category}] ${i.key}: ${i.value}`).join('\n'), 'memory-store') };
      } catch (e: any) {
        return { success: false, error: `Recall failed: ${e.message}` };
      }
    }

    // --- search ---
    if (action === 'search') {
      const { query, scope = 'both', limit = 10 } = input as { query: string; scope?: string; limit?: number };
      if (!query) return { success: false, error: 'query is required for search' };
      try {
        const results: string[] = [];
        if (scope === 'messages' || scope === 'both') {
          const msgs = store.searchMessages(query, undefined, limit);
          for (const m of msgs) {
            const preview = (m.content as string).length > 200 ? (m.content as string).slice(0, 200) + '...' : m.content;
            results.push(`[Message] [${m.role}] (${m.created_at}): ${m.snippet || preview}`);
          }
        }
        if (scope === 'summaries' || scope === 'both') {
          const sums = store.searchSummaries(query, undefined, limit);
          for (const s of sums) {
            const preview = (s.content as string).length > 200 ? (s.content as string).slice(0, 200) + '...' : s.content;
            results.push(`[Summary] (${s.kind} depth:${s.depth}, ${s.earliest_at}—${s.latest_at}): ${preview}`);
          }
        }
        if (results.length === 0) return { success: true, output: `No matches for "${query}"` };
        return { success: true, output: wrapExternalContent(`${results.length} result(s) for "${query}":\n\n${results.join('\n\n')}`, 'memory-store') };
      } catch (e: any) {
        return { success: false, error: `Search failed: ${e.message}` };
      }
    }

    // --- describe ---
    if (action === 'describe') {
      const { summary_id } = input as { summary_id: string };
      if (!summary_id) return { success: false, error: 'summary_id is required for describe' };
      try {
        const summary = store.getSummaryById(summary_id);
        if (!summary) return { success: false, error: `Summary not found: ${summary_id}` };
        const parts = [
          `Summary: ${summary_id}`,
          `Kind: ${summary.kind} | Depth: ${summary.depth}`,
          `Tokens: ${summary.token_count} | Descendants: ${summary.descendant_count}`,
          `Time range: ${summary.earliest_at || '?'} — ${summary.latest_at || '?'}`,
          '', '--- Content ---', summary.content,
        ];
        if (summary.kind === 'leaf') {
          const sources = store.getSummarySourceMessages(summary_id);
          if (sources.length > 0) {
            parts.push('', '--- Source Messages ---');
            for (const m of sources.slice(0, 10)) {
              parts.push(`  [${m.role}] (msg #${m.seq}): ${(m.content as string).slice(0, 100)}${(m.content as string).length > 100 ? '...' : ''}`);
            }
            if (sources.length > 10) parts.push(`  ... and ${sources.length - 10} more`);
          }
        } else {
          const children = store.getSummaryChildSummaries(summary_id);
          if (children.length > 0) {
            parts.push('', '--- Child Summaries ---');
            for (const c of children) {
              parts.push(`  [${c.kind} depth:${c.depth}] ${c.id}: ${(c.content as string).slice(0, 100)}`);
            }
          }
        }
        return { success: true, output: wrapExternalContent(parts.join('\n'), 'memory-store') };
      } catch (e: any) {
        return { success: false, error: `Describe failed: ${e.message}` };
      }
    }

    // --- query ---
    if (action === 'query') {
      const { question, search_terms } = input as { question: string; search_terms?: string };
      if (!question) return { success: false, error: 'question is required for query' };
      const searchQuery = search_terms || question;
      try {
        const msgs = store.searchMessages(searchQuery, undefined, 15);
        const sums = store.searchSummaries(searchQuery, undefined, 5);
        if (msgs.length === 0 && sums.length === 0) return { success: true, output: `No relevant history for: "${question}"` };
        const contextParts = [
          ...msgs.map((m: any) => `[${m.role}] (${m.created_at}): ${m.content}`),
          ...sums.map((s: any) => `[Summary, ${s.kind}]: ${s.content}`),
        ];
        const wrappedHistory = wrapExternalContent(
          `Relevant history (${msgs.length} messages, ${sums.length} summaries):\n\n${contextParts.join('\n\n---\n\n')}`,
          'memory-store'
        );
        return { success: true, output: `Question: ${question}\n\n${wrappedHistory}\n\nAnswer the question based on the above history.` };
      } catch (e: any) {
        return { success: false, error: `Query failed: ${e.message}` };
      }
    }

    // --- delete ---
    if (action === 'delete') {
      const { key } = input as { key: string };
      if (!key) return { success: false, error: 'key is required for delete' };
      try {
        const removed = store.kvDelete(key);
        if (!removed) return { success: false, error: `No memory found for key: ${key}` };
        return { success: true, output: `Deleted: ${key}` };
      } catch (e: any) {
        return { success: false, error: `Delete failed: ${e.message}` };
      }
    }

    return { success: false, error: `Unknown action: ${action}` };
  }
};
