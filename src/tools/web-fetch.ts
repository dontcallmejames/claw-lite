import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { wrapExternalContent } from '../security/external-content.js';
import { validateUrl } from '../security/ssrf.js';

/**
 * Fetch a URL with full control over headers and method
 */
export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch and return the content of a web page or URL.\n\nUse this when: you have a specific URL and need to read its content; opening a link the user shared; reading documentation, articles, or API responses at a known URL.\nDo NOT use this when: you need to find URLs first — use `web_search` to discover relevant pages, then `web_fetch` to read them.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch'
      },
      method: {
        type: 'string',
        description: 'HTTP method (GET, POST, PUT, DELETE, etc.). Default: GET'
      },
      headers: {
        type: 'object',
        description: 'Optional HTTP headers as key-value pairs'
      },
      body: {
        type: 'string',
        description: 'Optional request body (for POST, PUT, etc.)'
      },
      format: {
        type: 'string',
        description: 'Expected response format: "text", "json", or "auto" (default: auto)'
      }
    },
    required: ['url']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      format = 'auto'
    } = input;

    try {
      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return { success: false, error: 'Invalid URL format' };
      }

      // SSRF protection — block private/internal URLs
      const ssrf = await validateUrl(url);
      if (!ssrf.ok) {
        return { success: false, error: `Blocked: ${ssrf.reason}` };
      }

      // Prepare fetch options — 30s timeout prevents indefinite hangs on slow hosts
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...headers
        },
        signal: AbortSignal.timeout(30000)
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        fetchOptions.body = body;
      }

      // Make request
      const response = await fetch(url, fetchOptions);

      // Get response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Determine content type
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json') || format === 'json';
      const isText = contentType.includes('text/') || format === 'text';

      // Parse response body — always consume as text first so the stream is not
      // exhausted before the JSON fallback path can read it.
      let responseBody: any;
      let bodyPreview: string;

      const rawText = await response.text();
      if (isJson || (format === 'auto' && contentType.includes('json'))) {
        try {
          responseBody = JSON.parse(rawText);
          bodyPreview = JSON.stringify(responseBody, null, 2);
        } catch {
          // Server claimed JSON but body isn't — return raw text
          responseBody = rawText;
          bodyPreview = rawText;
        }
      } else {
        responseBody = rawText;
        bodyPreview = rawText;
      }

      // Truncate very long responses
      const maxLength = 5000;
      if (bodyPreview.length > maxLength) {
        bodyPreview = bodyPreview.substring(0, maxLength) + `\n\n... (truncated, total length: ${bodyPreview.length} characters)`;
      }

      // Format output
      const output = [
        `URL: ${url}`,
        `Status: ${response.status} ${response.statusText}`,
        `Content-Type: ${contentType || 'unknown'}`,
        '',
        'Headers:',
        ...Object.entries(responseHeaders).map(([key, value]) => `  ${key}: ${value}`),
        '',
        'Body:',
        bodyPreview
      ].join('\n');

      return {
        success: true,
        output: wrapExternalContent(output, url)
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
