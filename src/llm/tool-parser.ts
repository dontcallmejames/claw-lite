/**
 * Tool Parser - Extracts tool calls from natural language responses
 * Works with any LLM, not just those with native function calling
 */

export interface ParsedToolCall {
  tool: string;
  input: Record<string, any>;
  confidence: number;
}

/**
 * Parse tool calls from model response using pattern matching
 */
export function parseToolCalls(response: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];

  // Try JSON format first (for models that support it)
  const jsonCalls = extractJsonToolCalls(response);
  if (jsonCalls.length > 0) {
    return jsonCalls;
  }

  // Pattern-based extraction for natural language
  const patterns = [
    // System monitor patterns - very broad matching
    {
      pattern: /(?:check|show|get|display|what'?s|how'?s|monitor|view|see)\s+(?:my|the|your|current)?\s*(?:cpu|processor|memory|ram|disk|system|gpu|vram|video\s+memory)/i,
      tool: 'system_monitor',
      extractor: (match: RegExpMatchArray) => {
        const text = match[0].toLowerCase();
        let metric = 'all';
        if (text.includes('cpu') || text.includes('processor')) metric = 'cpu';
        else if (text.includes('vram') || text.includes('video memory')) metric = 'vram';
        else if (text.includes('gpu')) metric = 'gpu';
        else if (text.includes('memory') || text.includes('ram')) metric = 'memory';
        else if (text.includes('disk')) metric = 'disk';
        return { metric };
      }
    },
    // Also match if user message (not response) contains these patterns
    {
      pattern: /cpu\s+usage|memory\s+usage|disk\s+space|vram\s+usage|gpu\s+usage/i,
      tool: 'system_monitor',
      extractor: (match: RegExpMatchArray) => {
        const text = match[0].toLowerCase();
        let metric = 'cpu';
        if (text.includes('vram')) metric = 'vram';
        else if (text.includes('gpu')) metric = 'gpu';
        else if (text.includes('memory')) metric = 'memory';
        else if (text.includes('disk')) metric = 'disk';
        return { metric };
      }
    },
    // What's using X patterns
    {
      pattern: /(?:what'?s|what\s+is|show\s+what'?s)\s+using\s+(?:my|the|all)?\s*(?:vram|gpu|memory|cpu)/i,
      tool: 'system_monitor',
      extractor: (match: RegExpMatchArray) => {
        const text = match[0].toLowerCase();
        let metric = 'vram';
        if (text.includes('vram') || text.includes('gpu')) metric = 'vram';
        else if (text.includes('memory')) metric = 'memory';
        else if (text.includes('cpu')) metric = 'cpu';
        return { metric };
      }
    },

    // Web scraping patterns
    {
      pattern: /(?:fetch|get|scrape|download|retrieve)\s+(?:the\s+)?(?:webpage|page|site|url|website|content)\s+(?:from|at)?\s*(https?:\/\/[^\s]+)/i,
      tool: 'fetch_webpage',
      extractor: (match: RegExpMatchArray) => {
        return { url: match[1] };
      }
    },
    {
      pattern: /(https?:\/\/[^\s]+)/i,
      tool: 'fetch_webpage',
      extractor: (match: RegExpMatchArray) => {
        // Only if the message seems to be about fetching
        const fullText = response.toLowerCase();
        if (fullText.includes('fetch') || fullText.includes('get') ||
            fullText.includes('show') || fullText.includes('read')) {
          return { url: match[1] };
        }
        return null;
      }
    },

    // Memory patterns
    {
      pattern: /(?:remember|save|store)\s+(?:that\s+)?(.+?)(?:as|is)\s+(.+)/i,
      tool: 'remember',
      extractor: (match: RegExpMatchArray) => {
        const key = match[1].trim().replace(/\s+/g, '_').toLowerCase();
        const value = match[2].trim();
        return { key, value, type: 'fact' };
      }
    },
    {
      pattern: /(?:recall|what|show)\s+(?:do you remember|did i tell you|have you saved)\s+about\s+(.+)/i,
      tool: 'recall',
      extractor: (match: RegExpMatchArray) => {
        const key = match[1].trim().replace(/\s+/g, '_').toLowerCase();
        return { key };
      }
    },
    {
      pattern: /(?:what|show)\s+(?:do you|can you)\s+remember/i,
      tool: 'recall',
      extractor: () => {
        return {};
      }
    },

    // File operations - reading (catch file first, then path)
    {
      pattern: /(?:read|show|cat|display|view)\s+(?:me\s+)?(?:the\s+)?file\s+([^\s]+(?:\.[a-zA-Z0-9]+)?)/i,
      tool: 'read_file',
      extractor: (match: RegExpMatchArray) => {
        let filepath = match[1].trim();
        // Remove trailing punctuation
        filepath = filepath.replace(/[,;:!?]+$/, '');
        // If it's just a filename, assume it's in the assistant directory
        if (!filepath.includes('\\') && !filepath.includes('/')) {
          filepath = `./${filepath}`;
        }
        return { path: filepath };
      }
    },
    // Show me your/my X file
    {
      pattern: /(?:show|read|display)\s+(?:me\s+)?(?:your|my|the)\s+(.+?)\s+(?:file|code|source)/i,
      tool: 'read_file',
      extractor: (match: RegExpMatchArray) => {
        const filename = match[1].trim();
        // Try to construct path for common files
        if (filename.includes('config')) {
          return { path: './config.yml' };
        } else if (filename.includes('system-monitor')) {
          return { path: './src\\tools\\system-monitor.ts' };
        } else if (filename.includes('index')) {
          return { path: './index.html' };
        }
        return { path: filename };
      }
    },
    {
      pattern: /(?:list|show|ls)\s+(?:files|contents?)\s+(?:in|of)\s+(.+)/i,
      tool: 'list_files',
      extractor: (match: RegExpMatchArray) => {
        return { path: match[1].trim() };
      }
    },
    // Edit file patterns
    {
      pattern: /(?:edit|modify|change|update)\s+(?:the\s+)?(?:file\s+)?(.+?)\s+(?:and\s+)?(?:change|replace|find)\s+"?([^"]+)"?\s+(?:to|with)\s+"?([^"]+)"?/i,
      tool: 'edit_file',
      extractor: (match: RegExpMatchArray) => {
        return {
          path: match[1].trim(),
          find: match[2].trim(),
          replace: match[3].trim()
        };
      }
    },
    // Create directory patterns
    {
      pattern: /(?:create|make|mkdir)\s+(?:a\s+)?(?:directory|folder|dir)\s+(?:called|named)?\s*([^\s?!.]+)/i,
      tool: 'create_directory',
      extractor: (match: RegExpMatchArray) => {
        let dirPath = match[1].trim();
        // Remove quotes and trailing punctuation if present
        dirPath = dirPath.replace(/^["']|["']$/g, '').replace(/[?!.,;:]+$/, '');
        return { path: dirPath };
      }
    },
    // Delete file patterns (with explicit file/directory keyword)
    {
      pattern: /(?:delete|remove|rm)\s+(?:the\s+)?(?:file|directory|folder|dir)\s+(.+)/i,
      tool: 'delete_file',
      extractor: (match: RegExpMatchArray) => {
        let filePath = match[1].trim();
        filePath = filePath.replace(/^["']|["']$/g, '').replace(/[?!.,;:]+$/, '');
        return { path: filePath };
      }
    },
    // Delete file patterns (without explicit keyword - more flexible)
    {
      pattern: /(?:delete|remove|rm)\s+(?:the\s+)?([^\s?!.]+)/i,
      tool: 'delete_file',
      extractor: (match: RegExpMatchArray) => {
        let filePath = match[1].trim();
        filePath = filePath.replace(/^["']|["']$/g, '').replace(/[?!.,;:]+$/, '');
        return { path: filePath };
      }
    },
    // Move/rename file patterns
    {
      pattern: /(?:move|rename|mv)\s+(?:the\s+)?(?:file|directory|folder)?\s*(.+?)\s+(?:to|into)\s+(.+)/i,
      tool: 'move_file',
      extractor: (match: RegExpMatchArray) => {
        let sourcePath = match[1].trim().replace(/^["']|["']$/g, '').replace(/[?!.,;:]+$/, '');
        let destPath = match[2].trim().replace(/^["']|["']$/g, '').replace(/[?!.,;:]+$/, '');
        return { source: sourcePath, destination: destPath };
      }
    }
  ];

  // Try each pattern
  const seenTools = new Set<string>();

  for (const { pattern, tool, extractor } of patterns) {
    const match = response.match(pattern);
    if (match) {
      const input = extractor(match);
      if (input !== null) {
        // Deduplicate - only add if we haven't seen this tool yet
        const toolKey = `${tool}:${JSON.stringify(input)}`;
        if (!seenTools.has(toolKey)) {
          seenTools.add(toolKey);
          toolCalls.push({
            tool,
            input,
            confidence: 0.8
          });
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Extract JSON-formatted tool calls (for models that support it)
 */
function extractJsonToolCalls(response: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];

  // Try to find JSON objects with "tool" and "input" fields
  const jsonPattern = /\{[^}]*"tool"[^}]*"input"[^}]*\}/g;
  const matches = response.match(jsonPattern);

  if (matches) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed.tool && parsed.input) {
          toolCalls.push({
            tool: parsed.tool,
            input: parsed.input,
            confidence: 1.0
          });
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }

  // Also try array format
  const arrayPattern = /\[[^\]]*"tool"[^\]]*\]/g;
  const arrayMatches = response.match(arrayPattern);

  if (arrayMatches) {
    for (const match of arrayMatches) {
      try {
        const parsed = JSON.parse(match);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.tool && item.input) {
              toolCalls.push({
                tool: item.tool,
                input: item.input,
                confidence: 1.0
              });
            }
          }
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }

  return toolCalls;
}
