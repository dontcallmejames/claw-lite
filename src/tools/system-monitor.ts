import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export const systemMonitorTool: ToolDefinition = {
  name: 'system_monitor',
  description: 'Monitor system resources: CPU usage, RAM usage, disk space, and running processes. Returns current system metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: ['cpu', 'memory', 'disk', 'gpu', 'vram', 'processes', 'all'],
        description: 'Which metric to check (cpu, memory, disk, gpu, vram, processes, or all)',
      },
      process_filter: {
        type: 'string',
        description: 'Optional: filter processes by name (only used when metric is "processes")',
      },
    },
    required: ['metric'],
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { metric, process_filter } = input;

    try {
      let output = '';

      if (metric === 'cpu' || metric === 'all') {
        const cpuUsage = await getCPUUsage();
        output += `CPU Usage: ${cpuUsage.toFixed(1)}%\n`;
        output += `CPU Cores: ${os.cpus().length}\n`;
        output += `CPU Model: ${os.cpus()[0].model}\n\n`;
      }

      if (metric === 'memory' || metric === 'all') {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsagePercent = (usedMem / totalMem) * 100;

        output += `Memory Usage: ${memUsagePercent.toFixed(1)}%\n`;
        output += `Used: ${formatBytes(usedMem)} / Total: ${formatBytes(totalMem)}\n`;
        output += `Free: ${formatBytes(freeMem)}\n\n`;
      }

      if (metric === 'disk' || metric === 'all') {
        try {
          // Windows disk space check
          const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
          output += `Disk Space:\n${stdout}\n`;
        } catch (error) {
          output += `Disk info not available\n\n`;
        }
      }

      if (metric === 'gpu' || metric === 'vram' || metric === 'all') {
        try {
          // Check if nvidia-smi is available
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

          // Show GPU processes with estimation
          try {
            const { stdout: pmonStdout } = await execAsync('nvidia-smi pmon -c 1');
            const pmonLines = pmonStdout.split('\n').filter(line =>
              line.trim() && !line.startsWith('#') && line.includes('0')
            );

            if (pmonLines.length > 0) {
              output += `GPU Processes:\n`;

              // Identify compute processes (these use most VRAM)
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
        } catch (error) {
          output += `GPU info not available (nvidia-smi not found)\n\n`;
        }
      }

      if (metric === 'processes') {
        try {
          const filter = process_filter ? `| findstr /i "${process_filter}"` : '';
          const { stdout } = await execAsync(`tasklist ${filter}`);
          output += `Running Processes:\n${stdout}\n`;
        } catch (error) {
          output += `Process list not available\n`;
        }
      }

      if (metric === 'all') {
        output += `System Uptime: ${formatUptime(os.uptime())}\n`;
        output += `Platform: ${os.platform()} ${os.release()}\n`;
        output += `Hostname: ${os.hostname()}\n`;
      }

      return {
        success: true,
        output: output.trim()
      };
    } catch (error) {
      return {
        success: false,
        error: `Error monitoring system: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

// Helper function to get CPU usage
async function getCPUUsage(): Promise<number> {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - (100 * idle / total);

  return usage;
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;

  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(2)} MB`;
}

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '0m';
}
