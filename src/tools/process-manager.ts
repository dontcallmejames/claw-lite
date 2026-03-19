import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';

const execAsync = promisify(exec);

/**
 * List running processes
 */
export const processListTool: ToolDefinition = {
  name: 'process_list',
  description: 'List running processes on the system. Can filter by process name.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Optional filter to search for processes by name (case-insensitive)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of processes to return (default: 20)'
      }
    },
    required: []
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { filter, limit = 20 } = input;

    try {
      // Use tasklist on Windows to get process info
      const { stdout } = await execAsync('tasklist /FO CSV /NH');

      const lines = stdout.trim().split('\n');
      const processes: Array<{ name: string; pid: string; memory: string }> = [];

      for (const line of lines) {
        // Parse CSV format: "name","pid","session","session#","memory"
        const match = line.match(/"([^"]+)","([^"]+)","[^"]+","[^"]+","([^"]+)"/);
        if (match) {
          const name = match[1];
          const pid = match[2];
          const memory = match[3];

          // Apply filter if provided
          if (!filter || name.toLowerCase().includes(filter.toLowerCase())) {
            processes.push({ name, pid, memory });
          }
        }
      }

      // Limit results
      const limited = processes.slice(0, limit);

      if (limited.length === 0) {
        return {
          success: false,
          error: filter ? `No processes found matching "${filter}"` : 'No processes found'
        };
      }

      // Format output
      const output = limited.map(p => `${p.name} (PID: ${p.pid}) - Memory: ${p.memory}`).join('\n');

      return {
        success: true,
        output: `Found ${limited.length} process(es)${filter ? ` matching "${filter}"` : ''}:\n\n${output}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list processes: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

/**
 * Kill a process by PID or name
 */
export const processKillTool: ToolDefinition = {
  name: 'process_kill',
  description: 'Kill a process by its PID (process ID) or name. Use with caution.',
  inputSchema: {
    type: 'object',
    properties: {
      pid: {
        type: 'string',
        description: 'Process ID to kill'
      },
      name: {
        type: 'string',
        description: 'Process name to kill (will kill all matching processes)'
      },
      force: {
        type: 'boolean',
        description: 'Force kill the process (default: false)'
      }
    },
    required: []
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { pid, name, force = false } = input;

    if (!pid && !name) {
      return {
        success: false,
        error: 'Must provide either pid or name'
      };
    }

    try {
      let command: string;

      if (pid) {
        // Kill by PID
        command = force ? `taskkill /F /PID ${pid}` : `taskkill /PID ${pid}`;
      } else {
        // Kill by name
        command = force ? `taskkill /F /IM ${name}` : `taskkill /IM ${name}`;
      }

      const { stdout, stderr } = await execAsync(command);

      // taskkill outputs to stdout on success
      if (stdout.includes('SUCCESS')) {
        return {
          success: true,
          output: pid ? `Killed process PID ${pid}` : `Killed process(es) matching "${name}"`
        };
      }

      return {
        success: false,
        error: stderr || stdout || 'Failed to kill process'
      };
    } catch (error: any) {
      // taskkill returns non-zero exit code on failure
      return {
        success: false,
        error: error.stderr || error.message || 'Failed to kill process'
      };
    }
  }
};

/**
 * Get detailed info about a specific process
 */
export const processInfoTool: ToolDefinition = {
  name: 'process_info',
  description: 'Get detailed information about a specific process by PID or name.',
  inputSchema: {
    type: 'object',
    properties: {
      pid: {
        type: 'string',
        description: 'Process ID to query'
      },
      name: {
        type: 'string',
        description: 'Process name to query (will show first matching process)'
      }
    },
    required: []
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { pid, name } = input;

    if (!pid && !name) {
      return {
        success: false,
        error: 'Must provide either pid or name'
      };
    }

    try {
      let command: string;

      if (pid) {
        // Query by PID
        command = `wmic process where "ProcessId=${pid}" get Name,ProcessId,ThreadCount,HandleCount,WorkingSetSize,CommandLine /FORMAT:LIST`;
      } else {
        // Query by name (get first match)
        command = `wmic process where "Name='${name}'" get Name,ProcessId,ThreadCount,HandleCount,WorkingSetSize,CommandLine /FORMAT:LIST`;
      }

      const { stdout } = await execAsync(command);

      if (!stdout.trim()) {
        return {
          success: false,
          error: pid ? `Process PID ${pid} not found` : `Process "${name}" not found`
        };
      }

      // Parse WMIC output (key=value format)
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const info: Record<string, string> = {};

      for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          info[key.trim()] = valueParts.join('=').trim();
        }
      }

      // Format output
      const output = [
        `Process: ${info.Name || 'Unknown'}`,
        `PID: ${info.ProcessId || 'Unknown'}`,
        `Threads: ${info.ThreadCount || 'Unknown'}`,
        `Handles: ${info.HandleCount || 'Unknown'}`,
        `Memory: ${info.WorkingSetSize ? `${(parseInt(info.WorkingSetSize) / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}`,
        info.CommandLine ? `Command: ${info.CommandLine}` : ''
      ].filter(line => line).join('\n');

      return {
        success: true,
        output
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get process info: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
