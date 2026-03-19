import { getEnv, loadConfig } from '../config/loader.js';
import type { Message, Tool, ChatResponse, LLMProvider, ToolUse } from './types.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor() {
    const config = loadConfig();

    // Ollama defaults to localhost:11434
    this.baseUrl = getEnv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434');
    this.model = config.llm.model;
    this.maxTokens = config.llm.maxTokens;
    this.temperature = config.llm.temperature;
  }

  /**
   * Filter response to enforce assistant identity from system prompt
   * This overrides model's default identity responses
   */
  private filterIdentityResponse(content: string, systemPrompt: string): string {
    // Extract assistant name from system prompt
    const nameMatch = systemPrompt.match(/You are (\w+)/);
    const assistantName = nameMatch ? nameMatch[1] : 'Assistant';

    const lowerContent = content.toLowerCase();

    // Check if this is an identity response from any model
    // Only trigger on very specific identity patterns, not general text
    const isIdentityResponse =
      // Specific model identity claims
      /\bi'?m (a |an )?deepseek\b/i.test(content) ||
      /\bi am deepseek\b/i.test(content) ||
      /\bcreated by deepseek\b/i.test(content) ||
      /\bmy name is deepseek\b/i.test(content) ||
      /\bi'?m (a |an )?llama\b/i.test(content) ||
      /\bcreated by meta\b/i.test(content) ||
      /\bi'?m claude\b/i.test(content) ||
      /\bcreated by anthropic\b/i.test(content) ||
      /\bi'?m chatgpt\b/i.test(content) ||
      /\bcreated by openai\b/i.test(content) ||
      /\bi'?m kimi\b/i.test(content) ||
      /\bcreated by moonshot\b/i.test(content) ||
      // Generic identity patterns - only at start of response
      (/^i'?m (a |an )?(?:large )?language model/i.test(content.trim())) ||
      (/^my name is (?!davos)/i.test(content.trim()));

    if (isIdentityResponse) {
      // Replace with identity from system prompt
      const identityResponseMatch = systemPrompt.match(/When asked (?:who|what) (?:are |)you(?:\?|:) "([^"]+)"/);
      if (identityResponseMatch) {
        return identityResponseMatch[1];
      }
      // Fallback identity response
      return `I'm ${assistantName}. I'm here to help you get things done.`;
    }

    return content;
  }

  /**
   * Extract balanced JSON blocks from text by scanning for { } and [ ] pairs.
   * Handles extra whitespace, nested objects, and fenced code blocks.
   */
  private extractJsonCandidates(text: string): Array<string> {
    const results: string[] = [];
    // Strip code fences first
    const stripped = text.replace(/```(?:json)?/g, '').replace(/```/g, '');

    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i];
      if (ch !== '{' && ch !== '[') continue;
      const close = ch === '{' ? '}' : ']';
      let depth = 0;
      for (let j = i; j < stripped.length; j++) {
        if (stripped[j] === ch) depth++;
        else if (stripped[j] === close) {
          depth--;
          if (depth === 0) {
            results.push(stripped.slice(i, j + 1));
            i = j;
            break;
          }
        }
      }
    }
    return results;
  }

  /**
   * Some models print tool calls as JSON text instead of using native tool_calls.
   * This extracts them and converts to real tool uses.
   */
  private extractTextToolCalls(
    content: string,
    tools: Tool[]
  ): { toolUses: ToolUse[]; remainingContent: string } {
    const toolNames = new Set(tools.map(t => t.name));
    const toolUses: ToolUse[] = [];
    let remaining = content;

    const candidates = this.extractJsonCandidates(content);

    for (const json of candidates) {
      try {
        const parsed = JSON.parse(json);
        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
          const name: string = item.name || item.tool;
          const args: any = item.arguments ?? item.parameters ?? item.input ?? {};

          if (name && toolNames.has(name)) {
            toolUses.push({
              type: 'tool_use',
              id: `ollama_text_${Date.now()}_${toolUses.length}`,
              name,
              input: typeof args === 'string' ? JSON.parse(args) : args,
            });
            // Strip the blob and any surrounding code fences from visible content
            remaining = remaining
              .replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '')
              .replace(json, '')
              .trim();
          }
        }
      } catch {
        // Not valid JSON or not a tool call shape — skip
      }
    }

    return { toolUses, remainingContent: remaining };
  }

  async chat(messages: Message[], tools?: Tool[]): Promise<ChatResponse> {
    try {
      // Collect system messages
      const systemMessages = messages.filter(m => m.role === 'system');
      const systemPrompt = systemMessages.length > 0
        ? systemMessages.map(m => m.content).join('\n\n')
        : '';

      // Convert messages to Ollama format - system role must be first message
      const ollamaMessages: OllamaMessage[] = [];
      if (systemPrompt) {
        ollamaMessages.push({ role: 'system', content: systemPrompt });
      }
      messages
        .filter(m => m.role !== 'system')
        .forEach(m => {
          const msg: OllamaMessage = {
            role: m.role as 'user' | 'assistant' | 'tool',
            content: m.content,
          };
          // Preserve tool_calls on assistant messages so Ollama knows what was called
          if (m.tool_calls && m.tool_calls.length > 0) {
            msg.tool_calls = m.tool_calls.map(tc => ({
              function: {
                name: tc.name,
                arguments: tc.input,
              },
            }));
          }
          // Preserve tool_call_id on tool result messages
          if (m.tool_call_id) {
            msg.tool_call_id = m.tool_call_id;
          }
          ollamaMessages.push(msg);
        });

      // Convert tools to Ollama's native format
      const ollamaTools: OllamaTool[] | undefined = tools && tools.length > 0
        ? tools.map(tool => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: {
                type: 'object' as const,
                properties: tool.input_schema.properties,
                required: tool.input_schema.required || []
              }
            }
          }))
        : undefined;

      if (ollamaTools) {
        console.log(`[Ollama] Sending ${ollamaTools.length} tools to model:`, ollamaTools.map(t => t.function.name).join(', '));
      }

      const requestBody: any = {
        model: this.model,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: this.temperature,
          num_predict: this.maxTokens,
        }
      };

      // Only add tools if they exist
      if (ollamaTools && ollamaTools.length > 0) {
        requestBody.tools = ollamaTools;
      }

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Ollama] Error response:`, errorText);
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as OllamaResponse;
      let content = data.message.content || '';

      // Apply identity filter
      content = this.filterIdentityResponse(content, systemPrompt);

      // Parse tool calls from Ollama's native response
      const toolUses: ToolUse[] = [];

      if (data.message.tool_calls && data.message.tool_calls.length > 0) {
        console.log(`[Ollama] Received ${data.message.tool_calls.length} native tool calls from model`);

        data.message.tool_calls.forEach((call, idx) => {
          try {
            const args = typeof call.function.arguments === 'string'
              ? JSON.parse(call.function.arguments)
              : call.function.arguments;

            console.log(`[Ollama] Tool call ${idx + 1}: ${call.function.name}`, args);

            toolUses.push({
              type: 'tool_use',
              id: `ollama_${Date.now()}_${idx}`,
              name: call.function.name,
              input: args
            });
          } catch (error) {
            console.error(`[Ollama] Failed to parse tool call arguments:`, error);
          }
        });
      }

      // Fallback: model printed tool call as text instead of using native tool_calls.
      // Catches both ```json { "name": "...", "arguments": {...} } ``` and bare JSON.
      if (toolUses.length === 0 && tools && tools.length > 0 && content) {
        const extracted = this.extractTextToolCalls(content, tools);
        if (extracted.toolUses.length > 0) {
          console.log(`[Ollama] Extracted ${extracted.toolUses.length} text-format tool call(s) from content`);
          // Strip the JSON blob from content so it isn't shown to the user
          content = extracted.remainingContent;
          toolUses.push(...extracted.toolUses);
        }
      }

      return {
        content: content,
        toolUses: toolUses.length > 0 ? toolUses : undefined,
        stopReason: 'end_turn'
      };
    } catch (error) {
      console.error('Ollama API error:', error);
      throw error;
    }
  }

  async *streamChat(messages: Message[], tools?: Tool[]): AsyncGenerator<string> {
    // Convert messages to Ollama format
    const ollamaMessages: OllamaMessage[] = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    // Add system message
    const systemMessages = messages.filter(m => m.role === 'system');
    const systemPrompt = systemMessages.length > 0
      ? systemMessages.map(m => m.content).join('\n\n')
      : '';

    // Add tools to system prompt if available
    let fullSystemPrompt = systemPrompt;
    if (tools && tools.length > 0) {
      fullSystemPrompt += '\n\nYou have access to these tools:\n';
      fullSystemPrompt += tools.map(t =>
        `- ${t.name}: ${t.description}`
      ).join('\n');
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: true,
        options: {
          temperature: this.temperature,
          num_predict: this.maxTokens,
        },
        system: fullSystemPrompt
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data: OllamaResponse = JSON.parse(line);
            if (data.message?.content) {
              yield data.message.content;
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    }
  }
}
