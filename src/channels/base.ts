/**
 * Channel adapter interface.
 * Each channel (WebSocket, Telegram, Discord, ...) implements this.
 */
export interface Channel {
  /** Human-readable name used in logs */
  readonly name: string;

  /**
   * Send a message to this channel.
   * @param target  Channel-specific target (e.g. chat ID). Pass '' when not applicable.
   * @param content Plain text content to send.
   */
  send(target: string, content: string): Promise<void>;

  /** Start the channel (begin polling, open connections, etc.) */
  start(): void;

  /** Stop the channel cleanly */
  stop(): void;

  /**
   * Register a handler for inbound messages.
   * Not all channels support inbound — omit if one-way.
   * @param handler  Called with (from, message) where `from` is a channel-specific sender ID.
   *                 Should return the reply string.
   */
  onMessage?(handler: (from: string, message: string) => Promise<string>): void;
}
