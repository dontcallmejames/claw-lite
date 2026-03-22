import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import fs from 'fs';
import path from 'path';
import { sanitizeInjectionPatterns } from '../security/external-content.js';

const CRONS_PATH = path.resolve(process.cwd(), 'crons.json');

function readCrons(): { jobs: any[] } {
  try {
    if (fs.existsSync(CRONS_PATH)) {
      return JSON.parse(fs.readFileSync(CRONS_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { jobs: [] };
}

function writeCrons(data: { jobs: any[] }): void {
  fs.writeFileSync(CRONS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// In-process write lock: serialises concurrent schedule_message calls so the
// read→modify→write sequence is never interleaved, preventing job loss.
let writeLock: Promise<void> = Promise.resolve();

function withWriteLock(fn: () => void): Promise<void> {
  writeLock = writeLock.then(fn);
  return writeLock;
}

/**
 * Validate a single cron field against its allowed numeric range.
 * Accepts '*' and step expressions (*\/N) as always valid.
 */
function validateCronField(value: string, min: number, max: number): boolean {
  if (value === '*') return true;
  if (value.startsWith('*/')) {
    // Step value must be a positive integer in a sensible range.
    // */0 is meaningless; */999 is technically parseable but nonsensical.
    const step = parseInt(value.slice(2), 10);
    return !isNaN(step) && step > 0 && step <= 60;
  }
  const n = parseInt(value, 10);
  return !isNaN(n) && String(n) === value && n >= min && n <= max;
}

export const scheduleMessageTool: ToolDefinition = {
  name: 'schedule_message',
  requiresConfirmation: true,
  description: `Schedule a message to be sent to the user at a specific future time.

Use this when: the user asks you to remind them of something later, or when you want to send a message at a specific time in the future.
Do NOT use this when: the message should go out immediately — use \`send_message\` instead.`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Short name for this reminder/job (e.g. "Deploy check reminder")'
      },
      schedule: {
        type: 'string',
        description: 'Cron expression (5 fields: min hour dom month dow). E.g. "0 15 * * *" for 3pm daily.'
      },
      message: {
        type: 'string',
        description: 'The message or prompt to execute when the schedule fires. This gets processed by the LLM, so it can be a question or instruction.'
      },
      channel: {
        type: 'string',
        enum: ['telegram', 'discord', 'all'],
        description: 'Which channel to deliver to. "all" broadcasts to every channel. Default: all.'
      },
      oneShot: {
        type: 'boolean',
        description: 'If true, the job fires once and then disables itself. Use for one-time reminders. Default: false.'
      }
    },
    required: ['name', 'schedule', 'message']
  },

  async execute(input: Record<string, any>): Promise<ToolExecutionResult> {
    const { name, schedule, message, channel, oneShot = false } = input;

    // Validate cron expression — field count and numeric ranges.
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) {
      return {
        success: false,
        error: `Invalid cron schedule: "${schedule}". Must have 5 fields: minute hour day-of-month month day-of-week.`
      };
    }
    const [cronMin, cronHour, cronDom, cronMonth, cronDow] = parts;
    const rangeErrors: string[] = [];
    if (!validateCronField(cronMin,   0,  59)) rangeErrors.push(`minute must be 0-59 (got "${cronMin}")`);
    if (!validateCronField(cronHour,  0,  23)) rangeErrors.push(`hour must be 0-23 (got "${cronHour}")`);
    if (!validateCronField(cronDom,   1,  31)) rangeErrors.push(`day-of-month must be 1-31 (got "${cronDom}")`);
    if (!validateCronField(cronMonth, 1,  12)) rangeErrors.push(`month must be 1-12 (got "${cronMonth}")`);
    if (!validateCronField(cronDow,   0,   7)) rangeErrors.push(`day-of-week must be 0-7 (got "${cronDow}")`);
    if (rangeErrors.length > 0) {
      return {
        success: false,
        error: `Invalid cron schedule "${schedule}": ${rangeErrors.join('; ')}`
      };
    }

    try {
      const job = {
        id: Date.now().toString(),
        name,
        schedule,
        message: sanitizeInjectionPatterns(message),
        enabled: true,
        channel: channel === 'all' ? undefined : channel,
        oneShot,
      };

      // Use write lock to prevent concurrent calls from losing jobs via
      // interleaved read→modify→write sequences.
      await withWriteLock(() => {
        const cronFile = readCrons();
        cronFile.jobs.push(job);
        writeCrons(cronFile);
      });

      const channelLabel = channel && channel !== 'all' ? ` → ${channel}` : ' → all channels';
      const shotLabel = oneShot ? ' (one-time)' : ' (recurring)';

      return {
        success: true,
        output: `Scheduled "${name}"${shotLabel}${channelLabel}\nCron: ${schedule}\nMessage: ${message}\n\nThe cron runner will pick this up automatically.`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to schedule: ${error.message}`
      };
    }
  }
};
