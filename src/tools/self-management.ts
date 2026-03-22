import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Restart the assistant
 */
export const restartTool: ToolDefinition = {
  name: 'restart_assistant',
  requiresConfirmation: true,
  description: 'Restart the assistant process (stops and restarts the running Node.js service).\n\nUse this when: asked to restart the assistant, or after config changes that require a restart to take effect.\nDo NOT use this when: you want to recompile TypeScript — use `build_assistant` to rebuild first, then restart.',
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
  requiresConfirmation: true,
  description: 'Update a specific field in the assistant configuration (config.yml) by key path.\n\nUse this when: asked to change a setting — name, persona, timezone, allowed shell commands, etc.\nDo NOT use this when: you only want to read the config — use `get_config` instead. Do NOT use this when: changing the AI model — use `switch_model` for that.',
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

      if (parts.length < 2 || parts.length > 3) {
        return {
          success: false,
          error: 'Section must be "section.key" or "section.subsection.key" (e.g., "llm.model" or "tools.files.enabled")'
        };
      }

      // Validate all parts are safe identifiers to prevent regex injection.
      if (!parts.every((p: string) => /^[a-zA-Z0-9_]+$/.test(p))) {
        return {
          success: false,
          error: 'Section path parts must contain only alphanumeric characters and underscores'
        };
      }

      // Strip newlines to prevent YAML structure injection.
      // Use a replacer function to avoid $1/$2 capture-group interpretation.
      const safeValue = value.replace(/[\r\n]/g, ' ');
      const replacer = (_: string, prefix: string) => `${prefix}${safeValue}`;

      let found = false;

      if (parts.length === 2) {
        const [sectionName, key] = parts;
        // Anchor to the section header at the start of a line (column 0) to
        // prevent matching the wrong section when two sections share a key name.
        // The lazy [\s\S]*? stops at the first occurrence of the key under this
        // section header. Because section headers are at column 0 and keys are
        // indented, the regex won't cross into the next top-level section.
        const regex = new RegExp(
          `(^${sectionName}:[\\s\\S]*?\\n[ \\t]+${key}:[ \\t]+)[^\\n]+`,
          'm'
        );
        if (!regex.test(configContent)) {
          return { success: false, error: `Could not find "${section}" in config file` };
        }
        configContent = configContent.replace(regex, replacer);
        found = true;
      } else {
        // 3-part path: section.subsection.key
        const [sectionName, subSection, key] = parts;
        const regex = new RegExp(
          `(^${sectionName}:[\\s\\S]*?\\n[ \\t]+${subSection}:[\\s\\S]*?\\n[ \\t]+${key}:[ \\t]+)[^\\n]+`,
          'm'
        );
        if (!regex.test(configContent)) {
          return { success: false, error: `Could not find "${section}" in config file` };
        }
        configContent = configContent.replace(regex, replacer);
        found = true;
      }

      if (!found) {
        return { success: false, error: `Could not find "${section}" in config file` };
      }
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
  requiresConfirmation: true,
  description: 'Install a Node.js package dependency into the assistant\'s project using npm.\n\nUse this when: a new feature requires a package that isn\'t installed yet.\nDo NOT use this when: the package is already installed — check first.',
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

    // Validate npm package name to prevent shell injection.
    // Allows scoped packages (@scope/name) and version specifiers (@version).
    const NPM_PACKAGE_RE = /^(@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*(@[\w\-._]+)?$/i;
    if (!NPM_PACKAGE_RE.test(String(packageName))) {
      return {
        success: false,
        error: `Invalid package name: "${packageName}". Must be a valid npm package name.`
      };
    }

    try {
      // Use execFile with argument array to avoid shell injection entirely.
      const args = dev
        ? ['install', '--save-dev', packageName]
        : ['install', packageName];

      console.log(`[Self-Management] Installing ${packageName}...`);

      const { stdout, stderr } = await execFileAsync('npm', args, {
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
  description: 'Recompile the assistant\'s TypeScript source code (runs `npm run build`).\n\nUse this when: TypeScript source files have been modified and need to be recompiled before restarting.\nDo NOT use this when: you just want to restart the running process — use `restart_assistant` for that.',
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
