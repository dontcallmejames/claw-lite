import TelegramBot from 'node-telegram-bot-api';
import type { Channel } from './base.js';
import { loadConfig } from '../config/loader.js';
import { chunkMessage } from '../utils/chunk.js';
import { getDmPairingManager } from '../security/dm-pairing.js';

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private bot: TelegramBot;
  private allowedChatIds: number[];
  private messageHandler?: (from: string, message: string) => Promise<string>;

  constructor(token: string, allowedChatIds: number[]) {
    this.bot = new TelegramBot(token, { polling: false });
    this.allowedChatIds = allowedChatIds;
  }

  onMessage(handler: (from: string, message: string) => Promise<string>): void {
    this.messageHandler = handler;
  }

  async send(_target: string, content: string): Promise<void> {
    const chunks = chunkMessage(content, 4096);
    await Promise.allSettled(
      this.allowedChatIds.flatMap(chatId =>
        chunks.map(chunk =>
          this.bot.sendMessage(chatId, chunk).catch(err =>
            console.error(`[Telegram] Failed to send to ${chatId}:`, err)
          )
        )
      )
    );
  }

  start(): void {
    this.bot.startPolling();
    console.log('[Telegram] Polling started');

    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      if (!this.allowedChatIds.includes(chatId)) {
        // DM pairing check for unknown senders
        const dmPolicy = loadConfig().security?.dmPolicy ?? 'open';
        if (dmPolicy === 'off') return;
        if (dmPolicy === 'pairing') {
          const pairing = getDmPairingManager();
          if (!pairing.isApproved(String(chatId))) {
            const code = pairing.generateCode(String(chatId), 'telegram');
            await this.bot.sendMessage(chatId,
              `I don't recognize you yet. To pair with me, ask my owner to run:\nnpm run pairing approve ${code}\n\nThis code expires in 5 minutes.`
            ).catch(() => {});
            return;
          }
        }
        // If 'open' or approved, fall through to processing
        if (dmPolicy !== 'open' && dmPolicy !== 'pairing') {
          console.warn(`[Telegram] Ignored message from unauthorized chat ${chatId}`);
          return;
        }
      }
      const text = msg.text?.trim();
      if (!text || !this.messageHandler) return;

      console.log(`[Telegram] Message from ${chatId}: "${text}"`);
      try {
        const response = await this.messageHandler(String(chatId), text);
        const chunks = chunkMessage(response, 4096);
        for (const chunk of chunks) {
          await this.bot.sendMessage(chatId, chunk);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.bot.sendMessage(chatId, `Error: ${message}`).catch(() => {});
      }
    });

    this.bot.on('polling_error', (err) => {
      console.error('[Telegram] Polling error:', err.message);
    });
  }

  stop(): void {
    this.bot.stopPolling();
    console.log('[Telegram] Polling stopped');
  }
}
