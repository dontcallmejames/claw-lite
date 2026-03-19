import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import fs from 'fs';
import path from 'path';

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

export const scheduleMessageTool: ToolDefinition = {
  name: 'schedule_message',
  description: `Schedule a message or reminder for later delivery. Creates a cron job that fires on the given schedule and sends the result to a channel.

Examples:
- "Remind me at 3pm to check the deploy" → schedule: "0 15 * * *", oneShot: true
- "Every morning at 8am, send me a briefing on Telegram" → schedule: "0 8 * * *"
- "In 5 minutes, ping me on Discord" → calculate the cron for 5 minutes from now, oneShot: true

Cron format: minute hour day-of-month month day-of-week
Examples: "30 14 * * *" = 2:30 PM daily, "0 9 * * 1-5" = 9 AM weekdays`,
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

    // Validate cron expression (basic check)
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) {
      return {
        success: false,
        error: `Invalid cron schedule: "${schedule}". Must have 5 fields: minute hour day-of-month month day-of-week.`
      };
    }

    try {
      const cronFile = readCrons();
      const job = {
        id: Date.now().toString(),
        name,
        schedule,
        message,
        enabled: true,
        channel: channel === 'all' ? undefined : channel,
        oneShot,
      };

      cronFile.jobs.push(job);
      writeCrons(cronFile);

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
