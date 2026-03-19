import type { Channel } from './base.js';

export class ChannelManager {
  private channels: Channel[] = [];

  register(channel: Channel): void {
    this.channels.push(channel);
    console.log(`[Channels] Registered: ${channel.name}`);
  }

  /**
   * Fan out a notification to all registered channels.
   * Label is prepended as a header: "[⏳ label]\n\ncontent"
   */
  async notify(content: string, label: string): Promise<void> {
    const payload = `[⏳ ${label}]\n\n${content}`;
    await Promise.allSettled(
      this.channels.map(ch =>
        ch.send('', payload).catch(err =>
          console.error(`[Channels] Failed to send on ${ch.name}:`, err)
        )
      )
    );
  }

  start(): void {
    for (const ch of this.channels) {
      try {
        ch.start();
      } catch (err) {
        console.error(`[Channels] Failed to start ${ch.name}:`, err);
      }
    }
  }

  stop(): void {
    for (const ch of this.channels) {
      try {
        ch.stop();
      } catch (err) {
        console.error(`[Channels] Failed to stop ${ch.name}:`, err);
      }
    }
  }
}
