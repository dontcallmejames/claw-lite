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
  /**
   * If true, the registry will intercept calls that lack `confirmed: true` in
   * input and return a confirmation-request result. The LLM is expected to ask
   * the user, then retry with confirmed: true.
   */
  requiresConfirmation?: boolean;
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
