import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const modelSwitchTool: ToolDefinition = {
  name: 'switch_model',
  description: 'Switch the active LLM provider and model at runtime without restarting the assistant.\n\nUse this when: asked to change the AI model or provider (e.g., "switch to GPT-4", "use Ollama instead").\nDo NOT use this when: you want to change other config settings — use `update_config` for general configuration changes.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'The model to switch to (e.g., "llama3.3", "deepseek-r1:14b", "qwen2.5")',
      },
      reason: {
        type: 'string',
        description: 'Optional reason for switching models',
      },
      auto_restart: {
        type: 'boolean',
        description: 'Automatically restart the assistant after switching (default: true)',
      },
    },
    required: ['model'],
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { model, reason, auto_restart = true } = input;

    try {
      // Models that don't support tool calling
      const noToolSupportModels = [
        'deepseek-r1',
        'deepseek-r1:14b',
        'deepseek-r1:32b',
        'deepseek-r1:70b',
      ];

      // Check if the model supports tools
      const modelLower = model.toLowerCase();
      const supportsTools = !noToolSupportModels.some(m => modelLower.includes(m.toLowerCase()));

      if (!supportsTools) {
        return {
          success: false,
          error: `Cannot switch to ${model}: This model does not support tool calling, which is required for the assistant to function. Try llama3.1:8b, qwen2.5:7b, or qwen2.5:14b instead.`
        };
      }

      // Read current config
      const configPath = path.join(__dirname, '..', '..', 'config.yml');
      let configContent = fs.readFileSync(configPath, 'utf-8');

      // Get current model — scope to the llm: section to avoid matching
      // commented-out lines or model: keys in other sections.
      const currentModelMatch = configContent.match(/^llm:[\s\S]*?\n[ \t]+model:[ \t]+(\S+)/m);
      const currentModel = currentModelMatch ? currentModelMatch[1] : 'unknown';

      if (currentModel === model) {
        return {
          success: true,
          output: `Already using ${model}. No switch needed.`
        };
      }

      // Update the model in config — scope to llm: section so that commented-out
      // model: lines or other sections with a model: key are not touched.
      configContent = configContent.replace(
        /(^llm:[\s\S]*?\n[ \t]+model:[ \t]+)\S+/m,
        `$1${model}`
      );

      // Adjust temperature based on model type
      if (model.includes('deepseek-r1')) {
        // Lower temp for reasoning models
        configContent = configContent.replace(
          /temperature:\s*[\d.]+/,
          'temperature: 0.7'
        );
      } else {
        // Higher temp for chat models
        configContent = configContent.replace(
          /temperature:\s*[\d.]+/,
          'temperature: 0.8'
        );
      }

      // Write updated config
      fs.writeFileSync(configPath, configContent, 'utf-8');

      // Keep IDENTITY.md in sync so the assistant knows its current model
      try {
        const identityPath = path.join(__dirname, '..', '..', 'IDENTITY.md');
        let identity = fs.readFileSync(identityPath, 'utf-8');
        identity = identity.replace(
          /- I run on local LLMs via Ollama \(.*?\)/,
          `- I run on local LLMs via Ollama (${model} is current)`
        );
        fs.writeFileSync(identityPath, identity, 'utf-8');
      } catch { /* non-fatal */ }

      const reasonText = reason ? ` (${reason})` : '';

      if (auto_restart) {
        // Schedule restart after a short delay to allow response to be sent
        setTimeout(() => {
          console.log(`\nRestarting with model: ${model}${reasonText}`);

          // Spawn new process
          const projectRoot = path.join(__dirname, '..', '..');
          const child = spawn('npm', ['start'], {
            cwd: projectRoot,
            detached: true,
            stdio: 'ignore',
            shell: true
          });

          child.unref();

          // Exit current process
          setTimeout(() => {
            process.exit(0);
          }, 500);
        }, 1000);

        return {
          success: true,
          output: `Switched from ${currentModel} to ${model}${reasonText}. Restarting now... (refresh your browser in a few seconds)`
        };
      }

      return {
        success: true,
        output: `Switched from ${currentModel} to ${model}${reasonText}. Please restart manually with 'npm start'`
      };
    } catch (error) {
      return {
        success: false,
        error: `Error switching model: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
