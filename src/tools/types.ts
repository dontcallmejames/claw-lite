export interface ToolExecutionContext {
  userId?: string;
  channelId?: string;
  requireApproval?: boolean;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (input: Record<string, any>, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

export interface ToolRegistry {
  registerTool(tool: ToolDefinition): void;
  getTool(name: string): ToolDefinition | undefined;
  getAllTools(): ToolDefinition[];
  executeTool(name: string, input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}
