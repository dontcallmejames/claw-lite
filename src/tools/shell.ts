import { execSync } from 'child_process';
import { loadConfig } from '../config/loader.js';
import type { ToolDefinition } from './types.js';

/** Commands that are always safe to run without approval */
const SAFE_COMMANDS = new Set([
  'ls', 'dir', 'pwd', 'echo', 'cat', 'type', 'date', 'whoami',
  'hostname', 'uname', 'which', 'where', 'node', 'npm', 'git',
]);

/** Commands that are never allowed regardless of config */
const BLOCKED_COMMANDS = new Set([
  'rm', 'del', 'rmdir', 'format', 'shutdown', 'reboot',
  'mkfs', 'dd', 'kill', 'taskkill', 'net', 'reg',
]);

export const shellTool: ToolDefinition = {
  name: 'execute_shell',
  description: 'Execute a shell command. Safe commands (ls, pwd, echo, cat, date, git, etc.) run immediately. Dangerous commands are blocked. Other commands must be in the allowed list.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute'
      }
    },
    required: ['command']
  },
  async execute(input, context) {
    const config = loadConfig();

    if (!config.tools.shell.enabled) {
      return { success: false, error: 'Shell tool is disabled in configuration' };
    }

    const command = input.command as string;
    const commandName = command.split(/\s+/)[0].toLowerCase();

    // Always block dangerous commands
    if (BLOCKED_COMMANDS.has(commandName)) {
      return {
        success: false,
        error: `Command '${commandName}' is blocked for safety. This cannot be overridden.`
      };
    }

    // Allow safe commands and configured allowed commands
    const allowedCommands = config.tools.shell.allowedCommands.map(c => c.toLowerCase());
    if (!SAFE_COMMANDS.has(commandName) && !allowedCommands.includes(commandName)) {
      return {
        success: false,
        error: `Command '${commandName}' requires approval. It is not in the safe list or allowed commands.\nAllowed: ${[...SAFE_COMMANDS, ...allowedCommands].join(', ')}\nAsk Jim to add it to config.yml tools.shell.allowedCommands if needed.`
      };
    }

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 10_000, // 10 second timeout
        maxBuffer: 1024 * 1024,
      });

      return { success: true, output: output.trim() };
    } catch (error: any) {
      return { success: false, error: `Command failed: ${error.message}` };
    }
  }
};
