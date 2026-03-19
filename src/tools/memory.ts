import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import * as store from '../memory/store.js';

// ---- Key-Value Memory (backward compatible remember/recall) ----

export const memorySaveTool: ToolDefinition = {
  name: 'remember',
  description: 'Save information to long-term memory. Types: "preference" for user settings, "fact" for important info, "note" for free-form notes, "event" for dated events.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Identifier for this memory (e.g. "favorite_language"). Required for preference/fact.' },
      value: { type: 'string', description: 'The information to remember.' },
      type: { type: 'string', enum: ['preference', 'fact', 'note', 'event'], description: 'Type of memory.' },
      date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Only for events.' },
    },
    required: ['value', 'type'],
  },
  async execute(input): Promise<ToolExecutionResult> {
    const { key, value, type, date } = input;
    if (!value) return { success: false, error: 'value is required' };

    try {
      if ((type === 'preference' || type === 'fact') && !key) {
        return { success: false, error: 'key is required for preference/fact type' };
      }

      const memKey = key || `${type}_${Date.now()}`;
      store.kvSet(memKey, type, value, date);

      if (type === 'event') {
        return { success: true, output: `Event saved: ${date || new Date().toISOString().split('T')[0]} — ${value}` };
      }
      if (type === 'note') {
        return { success: true, output: `Note saved: ${value}` };
      }
      return { success: true, output: `Remembered: ${key} = ${value}` };
    } catch (error: any) {
      return { success: false, error: `Error saving memory: ${error.message}` };
    }
  }
};

export const memoryRecallTool: ToolDefinition = {
  name: 'recall',
  description: 'Retrieve information from long-term memory. Can recall by key, list by type, or list all.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Specific key to recall. If omitted, lists all.' },
      type: { type: 'string', enum: ['preference', 'fact', 'note', 'event', 'all'], description: 'Filter by type (default: all).' },
    },
  },
  async execute(input): Promise<ToolExecutionResult> {
    const { key, type = 'all' } = input;

    try {
      if (key) {
        const item = store.kvGet(key);
        if (item) return { success: true, output: `${item.category} "${key}": ${item.value}` };
        return { success: false, error: `No memory found for key: ${key}` };
      }

      const items = type === 'all' ? store.kvGetAll() : store.kvGetByCategory(type);
      if (items.length === 0) return { success: true, output: 'No memories stored yet.' };

      const output = items.map((i: any) => `  [${i.category}] ${i.key}: ${i.value}`).join('\n');
      return { success: true, output };
    } catch (error: any) {
      return { success: false, error: `Error recalling memory: ${error.message}` };
    }
  }
};

export const memoryForgetTool: ToolDefinition = {
  name: 'forget',
  description: 'Remove a specific memory by key.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'The key to forget.' },
    },
    required: ['key'],
  },
  async execute(input): Promise<ToolExecutionResult> {
    const { key } = input;
    try {
      const removed = store.kvDelete(key);
      if (!removed) return { success: false, error: `No memory found for key: ${key}` };
      return { success: true, output: `Forgot: ${key}` };
    } catch (error: any) {
      return { success: false, error: `Error forgetting memory: ${error.message}` };
    }
  }
};

// ---- New Lossless Memory Tools ----

export const memorySearchTool: ToolDefinition = {
  name: 'memory_search',
  description: 'Search conversation history using full-text search. Finds messages and summaries matching the query across all past conversations. Use this when asked about past discussions, decisions, or context.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search terms to find in conversation history.' },
      scope: { type: 'string', enum: ['messages', 'summaries', 'both'], description: 'Where to search (default: both).' },
      limit: { type: 'number', description: 'Max results to return (default: 10).' },
    },
    required: ['query'],
  },
  async execute(input): Promise<ToolExecutionResult> {
    const { query, scope = 'both', limit = 10 } = input;

    try {
      const results: string[] = [];

      if (scope === 'messages' || scope === 'both') {
        const msgs = store.searchMessages(query, undefined, limit);
        for (const m of msgs) {
          const preview = (m.content as string).length > 200
            ? (m.content as string).slice(0, 200) + '...'
            : m.content;
          results.push(`[Message] [${m.role}] (${m.created_at}): ${m.snippet || preview}`);
        }
      }

      if (scope === 'summaries' || scope === 'both') {
        const sums = store.searchSummaries(query, undefined, limit);
        for (const s of sums) {
          const preview = (s.content as string).length > 200
            ? (s.content as string).slice(0, 200) + '...'
            : s.content;
          results.push(`[Summary] (${s.kind} depth:${s.depth}, ${s.earliest_at}—${s.latest_at}, ${s.descendant_count} sources): ${preview}`);
        }
      }

      if (results.length === 0) {
        return { success: true, output: `No matches found for "${query}"` };
      }

      return { success: true, output: `Found ${results.length} result(s) for "${query}":\n\n${results.join('\n\n')}` };
    } catch (error: any) {
      return { success: false, error: `Search failed: ${error.message}` };
    }
  }
};

export const memoryDescribeTool: ToolDefinition = {
  name: 'memory_describe',
  description: 'Inspect a specific summary from conversation history. Shows the full content, source count, time range, and can drill into source messages or child summaries.',
  inputSchema: {
    type: 'object',
    properties: {
      summary_id: { type: 'string', description: 'The summary ID to inspect.' },
    },
    required: ['summary_id'],
  },
  async execute(input): Promise<ToolExecutionResult> {
    const { summary_id } = input;

    try {
      const summary = store.getSummaryById(summary_id);
      if (!summary) return { success: false, error: `Summary not found: ${summary_id}` };

      const parts: string[] = [
        `Summary: ${summary_id}`,
        `Kind: ${summary.kind} | Depth: ${summary.depth}`,
        `Tokens: ${summary.token_count} | Descendants: ${summary.descendant_count}`,
        `Time range: ${summary.earliest_at || '?'} — ${summary.latest_at || '?'}`,
        `Created: ${summary.created_at}`,
        '',
        '--- Content ---',
        summary.content,
      ];

      if (summary.kind === 'leaf') {
        const sources = store.getSummarySourceMessages(summary_id);
        if (sources.length > 0) {
          parts.push('', '--- Source Messages ---');
          for (const m of sources.slice(0, 10)) {
            const preview = (m.content as string).length > 100
              ? (m.content as string).slice(0, 100) + '...'
              : m.content;
            parts.push(`  [${m.role}] (msg #${m.seq}): ${preview}`);
          }
          if (sources.length > 10) parts.push(`  ... and ${sources.length - 10} more`);
        }
      } else {
        const children = store.getSummaryChildSummaries(summary_id);
        if (children.length > 0) {
          parts.push('', '--- Child Summaries ---');
          for (const c of children) {
            const preview = (c.content as string).length > 100
              ? (c.content as string).slice(0, 100) + '...'
              : c.content;
            parts.push(`  [${c.kind} depth:${c.depth}] ${c.id}: ${preview}`);
          }
        }
      }

      return { success: true, output: parts.join('\n') };
    } catch (error: any) {
      return { success: false, error: `Describe failed: ${error.message}` };
    }
  }
};

export const memoryQueryTool: ToolDefinition = {
  name: 'memory_query',
  description: 'Answer a specific question by searching conversation history and using the LLM to synthesize an answer. Use for complex questions about past work, decisions, or context that simple search might not answer directly.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to answer from conversation history.' },
      search_terms: { type: 'string', description: 'Keywords to search for in history (used to find relevant context).' },
    },
    required: ['question'],
  },
  async execute(input, context): Promise<ToolExecutionResult> {
    const { question, search_terms } = input;
    const searchQuery = search_terms || question;

    try {
      // Search both messages and summaries
      const msgs = store.searchMessages(searchQuery, undefined, 15);
      const sums = store.searchSummaries(searchQuery, undefined, 5);

      if (msgs.length === 0 && sums.length === 0) {
        return { success: true, output: `No relevant history found for: "${question}"` };
      }

      // Assemble context from search results
      const contextParts: string[] = [];
      for (const m of msgs) {
        contextParts.push(`[${m.role}] (${m.created_at}): ${m.content}`);
      }
      for (const s of sums) {
        contextParts.push(`[Summary, ${s.kind}]: ${s.content}`);
      }

      // Return the assembled context for the LLM to answer from
      // (The main agentic loop will use this output as tool result)
      return {
        success: true,
        output: `Question: ${question}\n\nRelevant conversation history (${msgs.length} messages, ${sums.length} summaries):\n\n${contextParts.join('\n\n---\n\n')}\n\nAnswer the question based on the above history.`
      };
    } catch (error: any) {
      return { success: false, error: `Query failed: ${error.message}` };
    }
  }
};
