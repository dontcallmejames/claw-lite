import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { loadConfig } from '../config/loader.js';
import type { ToolDefinition } from './types.js';

const execFileAsync = promisify(execFile);

// Shell metacharacters that could be used for injection when the command
// string is passed directly to the shell.
const SHELL_METACHAR_RE = /[&|;<>`$()!{}\[\]"'\\]/;

/**
 * Validate a process name is safe for interpolation into wmic / taskkill.
 * Process names on Windows are alphanumeric with dots, hyphens, underscores,
 * and spaces only.
 */
function validateProcessName(name: string): boolean {
  return /^[\w.\- ]+$/.test(name);
}

/**
 * Validate a PID is a plain decimal integer.
 */
function validatePid(pid: string): boolean {
  return /^\d+$/.test(pid);
}

const execAsync = promisify(exec);

const SAFE_COMMANDS = new Set([
  'ls', 'dir', 'pwd', 'echo', 'cat', 'type', 'date', 'whoami',
  'hostname', 'uname', 'which', 'where', 'git',
]);

const BLOCKED_COMMANDS = new Set([
  'rm', 'del', 'rmdir', 'format', 'shutdown', 'reboot',
  'mkfs', 'dd', 'kill', 'taskkill', 'net', 'reg',
]);

async function getCPUUsage(): Promise<number> {
  // Two-snapshot diff: measures CPU activity over a 100ms window rather than
  // the all-time average since boot (which always reads near 0%).
  const sample = () => {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
      for (const t of Object.values(cpu.times)) total += t;
      idle += cpu.times.idle;
    }
    return { idle, total };
  };
  const s1 = sample();
  await new Promise<void>(r => setTimeout(r, 100));
  const s2 = sample();
  const idleDelta = s2.idle - s1.idle;
  const totalDelta = s2.total - s1.total;
  return totalDelta === 0 ? 0 : 100 - (100 * idleDelta / totalDelta);
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
}

function formatUptime(seconds: number): string {
  const parts = [];
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '0m';
}

export const systemTool: ToolDefinition = {
  name: 'system',
  description: `Monitor system resources, run shell commands, and manage processes on this machine.

Use this when: checking CPU/RAM/disk usage, running a terminal command, listing or killing processes.
Do NOT use this when: you need to read or write files — use the \`file\` tool instead.

Actions:
- monitor: Get CPU, memory, disk, GPU/VRAM usage, and uptime. Pass metric="all" for everything or metric="cpu"|"memory"|"disk"|"gpu" for specific stats.
- shell: Execute a shell command. SAFE commands (ls, dir, pwd, cat, git, echo, date, whoami, hostname) always run. BLOCKED commands (rm, del, rmdir, format, shutdown, reboot, kill, taskkill) are always denied. Other commands (including node, npm) must be in config.yml tools.shell.allowedCommands — tell Jim to add them if needed.
- list_processes: List running processes, optionally filtered by name
- process_info: Get detailed info about a specific process (name or PID)
- kill_process: Terminate a process by PID or name`,

  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['monitor', 'shell', 'list_processes', 'process_info', 'kill_process'],
        description: 'The system operation to perform'
      },
      metric: {
        type: 'string',
        enum: ['cpu', 'memory', 'disk', 'gpu', 'vram', 'processes', 'all'],
        description: 'Which metric to check (monitor action only, default: all)'
      },
      command: {
        type: 'string',
        description: 'Shell command to execute (shell action only). Example: "git status" or "npm run build"'
      },
      filter: {
        type: 'string',
        description: 'Filter processes by name, case-insensitive (list_processes action only)'
      },
      limit: {
        type: 'number',
        description: 'Max processes to return (list_processes only, default: 20)'
      },
      pid: {
        type: 'string',
        description: 'Process ID (process_info and kill_process actions)'
      },
      name: {
        type: 'string',
        description: 'Process name (process_info and kill_process actions)'
      },
      force: {
        type: 'boolean',
        description: 'Force-kill the process (kill_process action only, default: false)'
      }
    },
    required: ['action']
  },

  async execute(input, context) {
    const action = input.action as string;

    // --- monitor ---
    if (action === 'monitor') {
      const metric = (input.metric as string) || 'all';
      try {
        let output = '';
        if (metric === 'cpu' || metric === 'all') {
          const cpuUsage = await getCPUUsage();
          output += `CPU Usage: ${cpuUsage.toFixed(1)}%\nCPU Cores: ${os.cpus().length}\nCPU Model: ${os.cpus()[0].model}\n\n`;
        }
        if (metric === 'memory' || metric === 'all') {
          const total = os.totalmem(), free = os.freemem(), used = total - free;
          output += `Memory: ${((used / total) * 100).toFixed(1)}% used\nUsed: ${formatBytes(used)} / ${formatBytes(total)}\nFree: ${formatBytes(free)}\n\n`;
        }
        if (metric === 'disk' || metric === 'all') {
          try {
            const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
            output += `Disk Space:\n${stdout}\n`;
          } catch { output += `Disk info not available\n\n`; }
        }
        if (metric === 'gpu' || metric === 'vram' || metric === 'all') {
          try {
            const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits');
            const lines = stdout.trim().split('\n');
            if (lines.length > 0) {
              output += `GPU Information:\n`;
              lines.forEach((line, idx) => {
                const [name, memUsed, memTotal, utilization, temp] = line.split(',').map(s => s.trim());
                output += `\nGPU ${idx}:\n`;
                output += `  Name: ${name}\n`;
                output += `  VRAM: ${memUsed} MB / ${memTotal} MB (${((parseFloat(memUsed) / parseFloat(memTotal)) * 100).toFixed(1)}% used)\n`;
                output += `  Utilization: ${utilization}%\n`;
                output += `  Temperature: ${temp}°C\n`;
              });
              output += '\n';
            }
            try {
              const { stdout: pmonStdout } = await execAsync('nvidia-smi pmon -c 1');
              // Filter to GPU index 0 by checking the first whitespace-separated
              // field, not line.includes('0') which matches any line with a '0'
              // anywhere (process names, PIDs, etc.).
              const pmonLines = pmonStdout.split('\n').filter(line => {
                if (!line.trim() || line.startsWith('#')) return false;
                const firstField = line.trim().split(/\s+/)[0];
                return firstField === '0';
              });
              if (pmonLines.length > 0) {
                output += `GPU Processes:\n`;
                const computeProcs = pmonLines.filter(line => line.includes('C') && !line.includes('C+G'));
                const graphicsProcs = pmonLines.filter(line => line.includes('C+G') || (line.includes('G') && !line.includes('C')));
                if (computeProcs.length > 0) {
                  output += `\nCompute (AI/ML - High VRAM usage):\n`;
                  computeProcs.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 10) {
                      const pid = parts[1];
                      const name = parts[9];
                      output += `  PID ${pid}: ${name} (estimated 4-6 GB)\n`;
                    }
                  });
                }
                if (graphicsProcs.length > 0 && graphicsProcs.length <= 10) {
                  output += `\nGraphics (UI/Display - Low VRAM usage):\n`;
                  output += `  ${graphicsProcs.length} processes using ~${Math.ceil(graphicsProcs.length * 0.05)}-${Math.ceil(graphicsProcs.length * 0.1)} GB total\n`;
                  output += `  (Windows UI, browsers, desktop apps)\n`;
                } else if (graphicsProcs.length > 10) {
                  output += `\nGraphics: ${graphicsProcs.length} processes (~1-2 GB total)\n`;
                }
                output += `\nNote: Windows doesn't report exact VRAM per process.\n`;
                output += `Compute processes (Ollama/AI models) typically use most VRAM.\n`;
                output += '\n';
              }
            } catch (e) {
              output += `\nNote: Unable to get detailed process information.\n`;
              output += `Total VRAM usage shown above. Most is likely from Ollama if running.\n\n`;
            }
          } catch { output += `GPU info not available (nvidia-smi not found)\n\n`; }
        }
        if (metric === 'all') {
          output += `Uptime: ${formatUptime(os.uptime())}\nPlatform: ${os.platform()} ${os.release()}\nHostname: ${os.hostname()}\n`;
        }
        return { success: true, output: output.trim() };
      } catch (e: any) {
        return { success: false, error: `Monitor failed: ${e.message}` };
      }
    }

    // --- shell ---
    if (action === 'shell') {
      const config = loadConfig();
      if (!config.tools.shell.enabled) return { success: false, error: 'Shell is disabled in configuration' };
      const command = input.command as string;
      if (!command) return { success: false, error: 'command is required for shell action' };
      const commandName = command.split(/\s+/)[0].toLowerCase();
      if (BLOCKED_COMMANDS.has(commandName)) {
        return { success: false, error: `Command '${commandName}' is blocked for safety and cannot be overridden.` };
      }
      const allowedCommands = config.tools.shell.allowedCommands.map((c: string) => c.toLowerCase());
      if (!SAFE_COMMANDS.has(commandName) && !allowedCommands.includes(commandName)) {
        return {
          success: false,
          error: `Command '${commandName}' is not in the safe or allowed list.\nAllowed: ${[...SAFE_COMMANDS, ...allowedCommands].join(', ')}\nAsk the owner to add it to config.yml tools.shell.allowedCommands.`
        };
      }
      // Reject commands containing shell metacharacters to prevent injection.
      // SAFE_COMMANDS are still checked above — this prevents argument injection
      // via operators like &, |, ;, >, <, backtick, $(), etc.
      if (SHELL_METACHAR_RE.test(command)) {
        return {
          success: false,
          error: `Command rejected: shell metacharacters are not permitted. Use only plain arguments.`
        };
      }
      try {
        // Use async exec to avoid blocking the Node.js event loop for up to 10 seconds.
        const { stdout } = await execAsync(command, { timeout: 10_000, maxBuffer: 1024 * 1024 });
        return { success: true, output: stdout.trim() };
      } catch (e: any) {
        return { success: false, error: `Command failed: ${e.message}` };
      }
    }

    // --- list_processes ---
    if (action === 'list_processes') {
      const filter = input.filter as string | undefined;
      const limit = (input.limit as number) || 20;
      try {
        const { stdout } = await execAsync('tasklist /FO CSV /NH');
        const processes: Array<{ name: string; pid: string; memory: string }> = [];
        for (const line of stdout.trim().split('\n')) {
          const match = line.match(/"([^"]+)","([^"]+)","[^"]+","[^"]+","([^"]+)"/);
          if (match && (!filter || match[1].toLowerCase().includes(filter.toLowerCase()))) {
            processes.push({ name: match[1], pid: match[2], memory: match[3] });
          }
        }
        const limited = processes.slice(0, limit);
        if (limited.length === 0) return { success: false, error: filter ? `No processes matching "${filter}"` : 'No processes found' };
        return { success: true, output: `Found ${limited.length} process(es)${filter ? ` matching "${filter}"` : ''}:\n\n${limited.map(p => `${p.name} (PID: ${p.pid}) - Memory: ${p.memory}`).join('\n')}` };
      } catch (e: any) {
        return { success: false, error: `Failed to list processes: ${e.message}` };
      }
    }

    // --- process_info ---
    if (action === 'process_info') {
      const { pid, name } = input as { pid?: string; name?: string };
      if (!pid && !name) return { success: false, error: 'pid or name is required for process_info' };
      // Validate inputs before interpolation to prevent injection.
      if (pid && !validatePid(pid)) {
        return { success: false, error: 'pid must be a numeric process ID' };
      }
      if (name && !validateProcessName(name)) {
        return { success: false, error: 'name contains invalid characters' };
      }
      try {
        const cmd = pid
          ? `wmic process where "ProcessId=${pid}" get Name,ProcessId,ThreadCount,HandleCount,WorkingSetSize,CommandLine /FORMAT:LIST`
          : `wmic process where "Name='${name}'" get Name,ProcessId,ThreadCount,HandleCount,WorkingSetSize,CommandLine /FORMAT:LIST`;
        const { stdout } = await execAsync(cmd);
        if (!stdout.trim()) return { success: false, error: pid ? `Process PID ${pid} not found` : `Process "${name}" not found` };
        const info: Record<string, string> = {};
        for (const line of stdout.trim().split('\n').filter(l => l.trim())) {
          const [k, ...v] = line.split('=');
          if (k && v.length) info[k.trim()] = v.join('=').trim();
        }
        return { success: true, output: [
          `Process: ${info.Name || '?'}`,
          `PID: ${info.ProcessId || '?'}`,
          `Threads: ${info.ThreadCount || '?'}`,
          `Handles: ${info.HandleCount || '?'}`,
          `Memory: ${info.WorkingSetSize ? `${(parseInt(info.WorkingSetSize) / 1024 / 1024).toFixed(2)} MB` : '?'}`,
          info.CommandLine ? `Command: ${info.CommandLine}` : ''
        ].filter(Boolean).join('\n') };
      } catch (e: any) {
        return { success: false, error: `Failed to get process info: ${e.message}` };
      }
    }

    // --- kill_process ---
    if (action === 'kill_process') {
      const { pid, name, force = false } = input as { pid?: string; name?: string; force?: boolean };
      if (!pid && !name) return { success: false, error: 'pid or name is required for kill_process' };
      // Validate inputs before interpolation to prevent shell injection.
      if (pid && !validatePid(pid)) {
        return { success: false, error: 'pid must be a numeric process ID' };
      }
      if (name && !validateProcessName(name)) {
        return { success: false, error: 'name contains invalid characters' };
      }
      try {
        const cmd = pid
          ? (force ? `taskkill /F /PID ${pid}` : `taskkill /PID ${pid}`)
          : (force ? `taskkill /F /IM ${name}` : `taskkill /IM ${name}`);
        // execAsync rejects on non-zero exit code, so reaching here means
        // taskkill succeeded regardless of locale-specific stdout wording.
        await execAsync(cmd);
        return { success: true, output: pid ? `Killed process PID ${pid}` : `Killed process(es) matching "${name}"` };
      } catch (e: any) {
        return { success: false, error: e.stderr || e.message };
      }
    }

    return { success: false, error: `Unknown action: ${action}` };
  }
};
