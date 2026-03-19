import type { ToolDefinition, ToolExecutionResult } from './types.js';
import { reloadConfig } from '../config/loader.js';

/**
 * Read the current live configuration (always fresh from disk).
 * Use this when asked what model is running, what temperature is set, etc.
 */
export const getConfigTool: ToolDefinition = {
  name: 'get_config',
  description: 'Read the current assistant configuration from disk. Use this to answer questions about what model is running, the current temperature, provider, port, etc. Always reads fresh from disk so it reflects any recent changes.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  async execute(_input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const config = reloadConfig();
      const output = [
        `model: ${config.llm.model}`,
        `provider: ${config.llm.provider}`,
        `temperature: ${config.llm.temperature}`,
        `maxTokens: ${config.llm.maxTokens}`,
        `gateway port: ${config.gateway.port}`,
      ].join('\n');

      return { success: true, output };
    } catch (err: any) {
      return { success: false, error: `Could not read config: ${err.message}` };
    }
  }
};
