import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { wrapExternalContent } from '../security/external-content.js';

/**
 * Search the web using Brave Search API.
 * Requires BRAVE_SEARCH_API_KEY in .env
 */
export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for information by query and return a list of relevant results with titles and URLs.\n\nUse this when: answering questions that require current information or facts not in training data; researching a topic; finding URLs to websites or pages.\nDo NOT use this when: you already have a URL and want the page content — use `web_fetch` to retrieve it directly.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10)'
      }
    },
    required: ['query']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { query, max_results = 5 } = input;
    const maxResults = Math.min(max_results, 10);

    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey || apiKey === 'your-brave-api-key-here') {
      return {
        success: false,
        error: 'BRAVE_SEARCH_API_KEY not set in .env'
      };
    }

    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}&text_decorations=false`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Brave Search API error: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json() as any;
      const webResults = data?.web?.results ?? [];

      if (webResults.length === 0) {
        return {
          success: false,
          error: 'No search results found'
        };
      }

      const output = webResults.slice(0, maxResults).map((r: any, idx: number) => {
        const snippet = r.description ?? r.extra_snippets?.[0] ?? '';
        return `${idx + 1}. ${r.title}\n   URL: ${r.url}\n   ${snippet}`;
      }).join('\n\n');

      return {
        success: true,
        output: wrapExternalContent(`Search results for "${query}":\n\n${output}`, 'Brave Search')
      };

    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
