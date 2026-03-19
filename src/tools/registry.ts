import type { ToolDefinition, ToolRegistry, ToolExecutionContext, ToolExecutionResult } from './types.js';

class ToolRegistryImpl implements ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    console.log(`Registered tool: ${tool.name}`);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async executeTool(
    name: string,
    input: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.getTool(name);

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}`
      };
    }

    // Validate required fields before executing
    const required = tool.inputSchema.required || [];
    const missing = required.filter(field => input[field] === undefined || input[field] === null || input[field] === '');
    if (missing.length > 0) {
      return {
        success: false,
        error: `Tool "${name}" missing required field(s): ${missing.join(', ')}. Do not retry with the same arguments.`
      };
    }

    try {
      console.log(`Executing tool: ${name}`, input);
      const result = await tool.execute(input, context);
      console.log(`Tool ${name} completed:`, result.success ? 'success' : 'failed');
      return result;
    } catch (error: any) {
      console.error(`Tool ${name} threw error:`, error);
      return {
        success: false,
        error: `Tool execution failed: ${error.message}`
      };
    }
  }
}

let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistryImpl();
  }
  return registryInstance;
}

export function resetToolRegistry(): void {
  registryInstance = null;
}
