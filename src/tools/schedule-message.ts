import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import fs from 'fs';
import path from 'path';
import { sanitizeInjectionPatterns } from '../security/external-content.js';
import nodeCron from 'node-cron';

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


export const scheduleMessageTool: ToolDefinition = {
  name: 'schedule_message',
  requiresConfirmation: true,
  description: `Schedule a message to be sent at a specific future time.

Use this when: you are asked to send a reminder or message at a specific time in the future.
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

    // Validate cron expression using node-cron's authoritative validator.
    if (!nodeCron.validate(schedule)) {
      return {
        success: false,
        error: `Invalid cron schedule: "${schedule}". Must have 5 fields: minute hour day-of-month month day-of-week.`
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
