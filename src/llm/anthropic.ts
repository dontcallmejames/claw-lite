import Anthropic from '@anthropic-ai/sdk';
import { getEnv, loadConfig } from '../config/loader.js';
import type { Message, Tool, ChatResponse, LLMProvider, ToolUse } from './types.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor() {
    const config = loadConfig();
    const apiKey = getEnv('ANTHROPIC_API_KEY');

    this.client = new Anthropic({ apiKey });
    this.model = config.llm.model;
    this.maxTokens = config.llm.maxTokens;
    this.temperature = config.llm.temperature;
  }

  async chat(messages: Message[], tools?: Tool[]): Promise<ChatResponse> {
    try {
      // Separate system messages from conversation
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const systemPrompt = systemMessages.length > 0
        ? systemMessages.map(m => m.content).join('\n\n')
        : undefined;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: conversationMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        tools: tools as any
      });

      // Extract text content
      const textContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      // Extract tool uses
      const toolUses: ToolUse[] = response.content
        .filter((block: any) => block.type === 'tool_use')
        .map((block: any) => ({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input
        }));

      return {
        content: textContent,
        toolUses: toolUses.length > 0 ? toolUses : undefined,
        stopReason: response.stop_reason as any
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw error;
    }
  }

  async *streamChat(messages: Message[], tools?: Tool[]): AsyncGenerator<string> {
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const systemPrompt = systemMessages.length > 0
      ? systemMessages.map(m => m.content).join('\n\n')
      : undefined;

    const stream = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages: conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      tools: tools as any,
      stream: true
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }
}
