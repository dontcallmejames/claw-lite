import { getEnv, reloadConfig } from '../config/loader.js';
import { getValidToken, isLoggedIn } from '../auth/oauth.js';
import type { Message, Tool, ChatResponse, LLMProvider, ToolUse } from './types.js';

// ── Responses API types (chatgpt.com/backend-api/codex) ──────────────────────

interface ResponsesInput {
  role?: string;
  content?: any;
  type?: string;
  call_id?: string;
  output?: string;
  id?: string;
  name?: string;
  arguments?: string;
}

interface ResponsesOutput {
  type: 'message' | 'function_call';
  id?: string;
  role?: string;
  content?: Array<{ type: string; text: string }>;
  name?: string;
  arguments?: string;
}

// ── Chat Completions API types (api.openai.com/v1) ───────────────────────────

interface CCMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: CCToolCall[];
  tool_call_id?: string;
}

interface CCToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface CCResponse {
  choices: Array<{
    message: { role: string; content: string | null; tool_calls?: CCToolCall[] };
    finish_reason: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = getEnv('OPENAI_API_KEY', '');

    if (isLoggedIn()) {
      console.log('[OpenAI] Using OAuth token → chatgpt.com/backend-api/codex (Responses API)');
    } else if (this.apiKey) {
      console.log('[OpenAI] Using API key → api.openai.com/v1 (Chat Completions)');
    } else {
      console.warn('[OpenAI] No credentials — run "npm run login" or set OPENAI_API_KEY');
    }
  }

  private async getAuth(): Promise<{ token: string; isOAuth: boolean }> {
    const oauthToken = await getValidToken();
    if (oauthToken) return { token: oauthToken, isOAuth: true };
    if (this.apiKey) return { token: this.apiKey, isOAuth: false };
    throw new Error(
      'No OpenAI credentials available.\n' +
      '  • Run "npm run login" to authenticate with your ChatGPT account\n' +
      '  • Or set OPENAI_API_KEY in your .env file'
    );
  }

  // ── Responses API (OAuth / chatgpt.com) ────────────────────────────────────

  private toResponsesInput(messages: Message[]): ResponsesInput[] {
    const input: ResponsesInput[] = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        // Skip tool results with no call_id — would cause a 400
        if (!m.tool_call_id) continue;
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id,
          output: m.content || '',
        });
      } else if (m.tool_calls && m.tool_calls.length > 0) {
        // Assistant triggered tool calls — Responses API uses call_id not id
        for (const tc of m.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          });
        }
        if (m.content) {
          input.push({ role: 'assistant', content: m.content });
        }
      } else {
        input.push({ role: m.role, content: m.content });
      }
    }
    return input;
  }

  private parseResponsesOutput(output: ResponsesOutput[]): { content: string; toolUses: ToolUse[] } {
    let content = '';
    const toolUses: ToolUse[] = [];
    for (const item of output) {
      if (item.type === 'message') {
        for (const c of item.content || []) {
          if (c.type === 'output_text' || c.type === 'text') content += c.text;
        }
      } else if (item.type === 'function_call') {
        try {
          toolUses.push({
            type: 'tool_use',
            id: item.id!,
            name: item.name!,
            input: JSON.parse(item.arguments!),
          });
        } catch (e) {
          console.error('[OpenAI] Failed to parse function_call arguments:', e);
        }
      }
    }
    return { content, toolUses };
  }

  private async chatWithResponsesAPI(
    token: string,
    messages: Message[],
    tools?: Tool[]
  ): Promise<ChatResponse> {
    const { model } = reloadConfig().llm;
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const input = this.toResponsesInput(nonSystemMessages);

    const body: any = {
      model,
      instructions: systemMsg?.content || 'You are a helpful assistant.',
      input,
      store: false,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: t.input_schema.properties,
          required: t.input_schema.required || [],
        },
      }));
    }

    const url = 'https://chatgpt.com/backend-api/codex/responses';
    console.log(`[OpenAI] POST ${url} model=${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Parse SSE stream and collect the final response object
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalOutput: ResponsesOutput[] = [];

    // Track streaming state for function calls
    const functionCallBuffers: Map<string, { name: string; args: string; id: string }> = new Map();
    let textContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          const type = event.type as string;

          if (type === 'response.output_text.delta') {
            textContent += event.delta || '';
          } else if (type === 'response.function_call_arguments.delta') {
            const callId = event.call_id || event.item_id;
            if (!functionCallBuffers.has(callId)) {
              functionCallBuffers.set(callId, { name: '', args: '', id: callId });
            }
            functionCallBuffers.get(callId)!.args += event.delta || '';
          } else if (type === 'response.output_item.added') {
            const item = event.item;
            if (item?.type === 'function_call') {
              functionCallBuffers.set(item.call_id || item.id, {
                name: item.name || '',
                args: item.arguments || '',
                id: item.call_id || item.id,
              });
            }
          } else if (type === 'response.completed' || type === 'response.done') {
            finalOutput = event.response?.output || [];
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    // If we got a final response object, use it; otherwise build from streamed parts
    if (finalOutput.length > 0) {
      const { content, toolUses } = this.parseResponsesOutput(finalOutput);
      return {
        content,
        toolUses: toolUses.length > 0 ? toolUses : undefined,
        stopReason: toolUses.length > 0 ? 'tool_use' : 'end_turn',
      };
    }

    // Build from streamed deltas
    const toolUses: ToolUse[] = [];
    for (const [, fc] of functionCallBuffers) {
      try {
        toolUses.push({
          type: 'tool_use',
          id: fc.id,
          name: fc.name,
          input: JSON.parse(fc.args || '{}'),
        });
      } catch (e) {
        console.error('[OpenAI] Failed to parse streamed function call args:', e);
      }
    }

    return {
      content: textContent,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      stopReason: toolUses.length > 0 ? 'tool_use' : 'end_turn',
    };
  }

  // ── Chat Completions API (API key / api.openai.com) ────────────────────────

  private toCCMessages(messages: Message[]): CCMessage[] {
    return messages.map(m => {
      const msg: CCMessage = {
        role: m.role as CCMessage['role'],
        content: m.content || null,
      };
      if (m.tool_calls && m.tool_calls.length > 0) {
        msg.tool_calls = m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }));
        msg.content = null;
      }
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      return msg;
    });
  }

  private async chatWithCompletions(
    token: string,
    messages: Message[],
    tools?: Tool[]
  ): Promise<ChatResponse> {
    const { model, maxTokens, temperature } = reloadConfig().llm;
    const baseUrl = getEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
    const body: any = {
      model,
      messages: this.toCCMessages(messages),
      temperature,
      max_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties: t.input_schema.properties,
            required: t.input_schema.required || [],
          },
        },
      }));
      body.tool_choice = 'auto';
    }

    const url = `${baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as CCResponse;
    const choice = data.choices[0];
    const content = choice.message.content || '';
    const toolUses: ToolUse[] = [];

    if (choice.message.tool_calls) {
      for (const call of choice.message.tool_calls) {
        try {
          toolUses.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            input: JSON.parse(call.function.arguments),
          });
        } catch (e) {
          console.error(`[OpenAI] Failed to parse tool call args for ${call.function.name}:`, e);
        }
      }
    }

    return {
      content,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
    };
  }

  // ── Public interface ───────────────────────────────────────────────────────

  async chat(messages: Message[], tools?: Tool[]): Promise<ChatResponse> {
    try {
      const { token, isOAuth } = await this.getAuth();
      if (isOAuth) {
        return await this.chatWithResponsesAPI(token, messages, tools);
      } else {
        return await this.chatWithCompletions(token, messages, tools);
      }
    } catch (error) {
      console.error('[OpenAI] Error:', error);
      throw error;
    }
  }

  async *streamChat(messages: Message[], tools?: Tool[]): AsyncGenerator<string> {
    // Responses API streaming is different — fall back to non-streaming for now
    const response = await this.chat(messages, tools);
    yield response.content;
  }
}
