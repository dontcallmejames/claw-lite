import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types.js';
import type { ChannelManager } from '../channels/manager.js';

let channelManagerRef: ChannelManager | null = null;

/** Called by the gateway to give this tool access to the channel manager */
export function setChannelManager(manager: ChannelManager): void {
  channelManagerRef = manager;
}

export const sendMessageTool: ToolDefinition = {
  name: 'send_message',
  description: 'Send a message to a specific channel (telegram, discord). Use this when the user asks you to message them on Telegram, send a Discord message, or notify them on another channel.',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        enum: ['telegram', 'discord'],
        description: 'Which channel to send to.'
      },
      message: {
        type: 'string',
        description: 'The message content to send.'
      },
      target: {
        type: 'string',
        description: 'Optional: specific chat ID or channel ID. If omitted, sends to all configured recipients on that channel.'
      }
    },
    required: ['channel', 'message']
  },

  async execute(input: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { channel, message, target = '' } = input;

    if (!channelManagerRef) {
      return { success: false, error: 'Channel manager not available.' };
    }

    try {
      const sent = await channelManagerRef.sendTo(channel, target, message);
      if (!sent) {
        return {
          success: false,
          error: `Channel "${channel}" is not registered or not enabled. Check config.yml.`
        };
      }
      return {
        success: true,
        output: `Message sent to ${channel}${target ? ` (target: ${target})` : ''}.`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to send: ${error.message}`
      };
    }
  }
};
