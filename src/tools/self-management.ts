import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';

const execAsync = promisify(exec);

/**
 * Restart the assistant
 */
export const restartTool: ToolDefinition = {
  name: 'restart_assistant',
  description: 'Restart the assistant process. Useful after making configuration changes or installing new dependencies.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Optional reason for the restart'
      }
    },
    required: []
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { reason } = input;

    try {
      console.log(`[Self-Management] Restarting assistant${reason ? `: ${reason}` : ''}`);

      // Schedule restart after a short delay to allow response to be sent
      setTimeout(() => {
        process.exit(0); // Exit cleanly - assumes you have a process manager that will restart
      }, 1000);

      return {
        success: true,
        output: `Restarting assistant${reason ? ` (${reason})` : ''}... The assistant will be back shortly.`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to restart: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

/**
 * Update configuration file
 */
export const updateConfigTool: ToolDefinition = {
  name: 'update_config',
  description: 'Update the assistant configuration file (config.yml). Can change settings like model, temperature, tools, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Config section to update (e.g., "llm.model", "llm.temperature", "tools.files.enabled")'
      },
      value: {
        type: 'string',
        description: 'New value for the setting'
      },
      restart: {
        type: 'boolean',
        description: 'Automatically restart after updating config (default: false)'
      }
    },
    required: ['section', 'value']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { section, value, restart = false } = input;

    try {
      const configPath = resolve(process.cwd(), 'config.yml');
      let configContent = readFileSync(configPath, 'utf-8');

      // Parse the section path (e.g., "llm.model" -> ["llm", "model"])
      const parts = section.split('.');

      if (parts.length !== 2) {
        return {
          success: false,
          error: 'Section must be in format "section.key" (e.g., "llm.model")'
        };
      }

      // Simple YAML update - find and replace the line
      // This is a basic implementation; for complex configs, use a proper YAML parser
      const [sectionName, key] = parts;

      // Match the pattern: "  key: value" under the section
      const regex = new RegExp(
        `(${sectionName}:[\\s\\S]*?\\n\\s+${key}:\\s+)([^\\n]+)`,
        'i'
      );

      const match = configContent.match(regex);
      if (!match) {
        return {
          success: false,
          error: `Could not find "${section}" in config file`
        };
      }

      configContent = configContent.replace(regex, `$1${value}`);
      writeFileSync(configPath, configContent, 'utf-8');

      const message = `Updated ${section} to "${value}"`;

      if (restart) {
        // Schedule restart
        setTimeout(() => {
          process.exit(0);
        }, 1000);

        return {
          success: true,
          output: `${message}. Restarting assistant...`
        };
      }

      return {
        success: true,
        output: `${message}. Restart the assistant for changes to take effect.`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update config: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

/**
 * Install npm dependencies
 */
export const installDependencyTool: ToolDefinition = {
  name: 'install_dependency',
  description: 'Install a new npm package dependency for the assistant. Useful for adding new functionality.',
  inputSchema: {
    type: 'object',
    properties: {
      package: {
        type: 'string',
        description: 'Package name to install (e.g., "axios", "cheerio")'
      },
      dev: {
        type: 'boolean',
        description: 'Install as dev dependency (default: false)'
      }
    },
    required: ['package']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { package: packageName, dev = false } = input;

    try {
      const command = dev
        ? `npm install --save-dev ${packageName}`
        : `npm install ${packageName}`;

      console.log(`[Self-Management] Installing ${packageName}...`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout: 60000 // 60 second timeout
      });

      if (stderr && !stderr.includes('npm WARN')) {
        return {
          success: false,
          error: stderr
        };
      }

      return {
        success: true,
        output: `Successfully installed ${packageName}. ${stdout.trim()}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to install ${packageName}: ${error.message || String(error)}`
      };
    }
  }
};

/**
 * Build the assistant (run TypeScript compiler)
 */
export const buildTool: ToolDefinition = {
  name: 'build_assistant',
  description: 'Build the assistant by compiling TypeScript files. Required after modifying source code.',
  inputSchema: {
    type: 'object',
    properties: {
      restart: {
        type: 'boolean',
        description: 'Automatically restart after building (default: false)'
      }
    },
    required: []
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { restart = false } = input;

    try {
      console.log('[Self-Management] Building assistant...');

      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: process.cwd(),
        timeout: 30000 // 30 second timeout
      });

      // Check for TypeScript errors
      if (stderr && stderr.includes('error TS')) {
        return {
          success: false,
          error: `Build failed with TypeScript errors:\n${stderr}`
        };
      }

      const message = 'Successfully built assistant.';

      if (restart) {
        setTimeout(() => {
          process.exit(0);
        }, 1000);

        return {
          success: true,
          output: `${message} Restarting...`
        };
      }

      return {
        success: true,
        output: `${message} ${stdout.trim()}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Build failed: ${error.message || String(error)}`
      };
    }
  }
};
