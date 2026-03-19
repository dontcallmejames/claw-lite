export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolUse[];   // set on assistant messages that invoked tools
  tool_call_id?: string;    // set on tool result messages — links back to the tool call
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ChatResponse {
  content: string;
  toolUses?: ToolUse[];
  stopReason?: 'end_turn' | 'max_tokens' | 'tool_use';
}

export interface LLMProvider {
  chat(messages: Message[], tools?: Tool[]): Promise<ChatResponse>;
  streamChat?(messages: Message[], tools?: Tool[]): AsyncGenerator<string>;
}
