import { Client, GatewayIntentBits, Events } from 'discord.js';
import type { Channel } from './base.js';
import { loadConfig, type DiscordConfig } from '../config/loader.js';
import { chunkMessage } from '../utils/chunk.js';
import { getDmPairingManager } from '../security/dm-pairing.js';

export class DiscordChannel implements Channel {
  readonly name = 'discord';
  private client: Client;
  private config: DiscordConfig;
  private messageHandler?: (from: string, message: string) => Promise<string>;

  constructor(config: DiscordConfig) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
    this.setupEventHandlers();
  }

  onMessage(handler: (from: string, message: string) => Promise<string>): void {
    this.messageHandler = handler;
  }

  async send(target: string, content: string): Promise<void> {
    if (target) {
      // Direct channel/DM send (e.g. reply context)
      try {
        const channel = await this.client.channels.fetch(target);
        if (channel && 'send' in channel) {
          const chunks = this.splitMessage(content, 2000);
          for (const chunk of chunks) {
            await (channel as any).send(chunk);
          }
        }
      } catch (err) {
        console.error(`[Discord] Failed to send to ${target}:`, err);
      }
    } else {
      // Cron notification — DM all allowedUsers
      if (this.config.allowedUsers.length === 0) return;
      await Promise.allSettled(
        this.config.allowedUsers.map(async (userId) => {
          try {
            const user = await this.client.users.fetch(userId);
            const chunks = this.splitMessage(content, 2000);
            for (const chunk of chunks) {
              await user.send(chunk);
            }
          } catch (err) {
            console.error(`[Discord] Failed to DM ${userId}:`, err);
          }
        })
      );
    }
  }

  start(): void {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      console.error('[Discord] DISCORD_BOT_TOKEN not set — channel disabled');
      return;
    }
    this.client.login(token).catch(err =>
      console.error('[Discord] Login failed:', err)
    );
  }

  stop(): void {
    this.client.destroy();
    console.log('[Discord] Stopped');
  }

  private setupEventHandlers(): void {
    this.client.on(Events.ClientReady, () => {
      console.log(`[Discord] Logged in as ${this.client.user?.tag}`);
    });

    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bots unless they're in allowedBots
      if (message.author.bot && !this.config.allowedBots.includes(message.author.id)) return;

      // Check allowed users (empty = allow all)
      if (this.config.allowedUsers.length > 0 &&
          !this.config.allowedUsers.includes(message.author.id)) {
        return;
      }

      // Check allowed channels (empty = allow all, DMs always allowed)
      const isDM = !message.guild;
      if (!isDM && this.config.allowedChannels.length > 0 &&
          !this.config.allowedChannels.includes(message.channelId)) {
        return;
      }

      // In guild channels, only respond when @mentioned (if requireMention is set)
      if (!isDM && this.config.requireMention && this.client.user && !message.mentions.has(this.client.user.id)) {
        return;
      }

      // Strip the @mention from the message text
      const text = message.content
        .replace(/<@!?\d+>/g, '')
        .trim();
      if (!text || !this.messageHandler) return;

      // DM pairing check — unknown senders get a pairing code
      const dmPolicy = loadConfig().security?.dmPolicy ?? 'open';
      if (dmPolicy !== 'open' && !message.author.bot) {
        const isOwner = this.config.allowedUsers.length > 0 &&
                        this.config.allowedUsers.includes(message.author.id);
        if (!isOwner) {
          const pairing = getDmPairingManager();
          if (!pairing.isApproved(message.author.id)) {
            if (dmPolicy === 'off') return; // silently ignore
            const code = pairing.generateCode(message.author.id, 'discord');
            await message.reply(
              `I don't recognize you yet. To pair with me, ask my owner to run:\n\`npm run pairing approve ${code}\`\n\nThis code expires in 5 minutes.`
            ).catch(() => {});
            return;
          }
        }
      }

      console.log(`[Discord] Message from ${message.author.id}: "${text}"`);

      // Typing indicator
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping().catch(() => {});
      }

      try {
        const response = await this.messageHandler(message.author.id, text);
        const chunks = this.splitMessage(response, 2000);
        for (let i = 0; i < chunks.length; i++) {
          if ('send' in message.channel) {
            // When replying to a bot, prepend @mention on first chunk so they receive it
            const content = (i === 0 && message.author.bot)
              ? `<@${message.author.id}> ${chunks[i]}`
              : chunks[i];
            await message.channel.send(content);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await message.reply(`Error: ${msg}`).catch(() => {});
      }
    });

    this.client.on(Events.Error, (err) => {
      console.error('[Discord] Client error:', err);
    });
  }

  private splitMessage(text: string, maxLength: number): string[] {
    return chunkMessage(text, maxLength);
  }
}
