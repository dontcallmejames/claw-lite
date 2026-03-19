import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';

export const webScraperTool: ToolDefinition = {
  name: 'fetch_webpage',
  description: 'Fetch and extract text content from a webpage. Returns the main text content, useful for reading articles, documentation, or gathering information from websites.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch (must start with http:// or https://)',
      },
      extract_links: {
        type: 'boolean',
        description: 'Whether to also extract links from the page (default: false)',
      },
      max_length: {
        type: 'number',
        description: 'Maximum content length in characters (default: 10000)',
      },
    },
    required: ['url'],
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { url, extract_links = false, max_length = 10000 } = input;

    try {
      // Validate URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return {
          success: false,
          error: 'URL must start with http:// or https://'
        };
      }

      // Fetch the webpage
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const html = await response.text();

      // Extract text content (simple approach - remove HTML tags)
      let textContent = html
        // Remove script and style tags with their content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        // Remove HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();

      // Truncate if too long
      if (textContent.length > max_length) {
        textContent = textContent.substring(0, max_length) + '... [truncated]';
      }

      let output = `Content from ${url}:\n\n${textContent}`;

      // Extract links if requested
      if (extract_links) {
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
        const links: string[] = [];
        let match;

        while ((match = linkRegex.exec(html)) !== null && links.length < 20) {
          const href = match[1];
          const text = match[2].replace(/<[^>]+>/g, '').trim();
          if (href && !href.startsWith('#')) {
            links.push(`${text || href}: ${href}`);
          }
        }

        if (links.length > 0) {
          output += `\n\nLinks found (showing first ${links.length}):\n${links.join('\n')}`;
        }
      }

      return {
        success: true,
        output
      };
    } catch (error) {
      return {
        success: false,
        error: `Error fetching webpage: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
