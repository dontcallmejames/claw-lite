import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { wrapExternalContent } from '../security/external-content.js';
import { validateUrl } from '../security/ssrf.js';

/**
 * Fetch a URL with full control over headers and method
 */
export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch a URL with full HTTP control. Returns response body, headers, and status code. Useful for APIs, JSON endpoints, or when you need more control than web scraping.',
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

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...headers
        }
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

      // Parse response body
      let responseBody: any;
      let bodyPreview: string;

      try {
        if (isJson || (format === 'auto' && contentType.includes('json'))) {
          responseBody = await response.json();
          bodyPreview = JSON.stringify(responseBody, null, 2);
        } else {
          responseBody = await response.text();
          bodyPreview = responseBody;
        }
      } catch (parseError) {
        // If parsing fails, fall back to text
        responseBody = await response.text();
        bodyPreview = responseBody;
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
