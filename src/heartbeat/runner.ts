import * as nodeCron from 'node-cron';
import fs from 'fs';
import type { ChannelManager } from '../channels/manager.js';

export class HeartbeatRunner {
  private schedule: string;
  private heartbeatPath: string;
  private task: ReturnType<typeof nodeCron.schedule> | null = null;
  private running = false;
  private onMessage: (message: string) => Promise<string>;
  private channelManager: ChannelManager;

  constructor(
    schedule: string,
    heartbeatPath: string,
    onMessage: (message: string) => Promise<string>,
    channelManager: ChannelManager
  ) {
    this.schedule = schedule;
    this.heartbeatPath = heartbeatPath;
    this.onMessage = onMessage;
    this.channelManager = channelManager;
  }

  start(): void {
    if (!nodeCron.validate(this.schedule)) {
      console.error(`[Heartbeat] Invalid schedule: ${this.schedule} — not starting`);
      return;
    }
    this.task = nodeCron.schedule(this.schedule, () => {
      this.fire();
    });
    console.log(`[Heartbeat] Started (${this.schedule})`);
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    console.log('[Heartbeat] Stopped');
  }

  private async fire(): Promise<void> {
    if (this.running) {
      console.warn('[Heartbeat] Still running from previous tick — skipping');
      return;
    }
    this.running = true;

    try {
      if (!fs.existsSync(this.heartbeatPath)) {
        console.log('[Heartbeat] No HEARTBEAT.md found — skipping');
        return;
      }

      const content = fs.readFileSync(this.heartbeatPath, 'utf-8').trim();
      if (!content) {
        console.log('[Heartbeat] HEARTBEAT.md is empty — skipping');
        return;
      }

      const prompt = `Check your heartbeat tasks. Here is your checklist:\n\n${content}\n\nIf any item requires action right now, take action and report what you did. If nothing needs attention, respond with exactly: HEARTBEAT_OK`;

      console.log('[Heartbeat] Checking...');
      const response = await this.onMessage(prompt);

      if (response.trim() === 'HEARTBEAT_OK') {
        console.log('[Heartbeat] All clear');
        return;
      }

      console.log('[Heartbeat] Action taken — notifying');
      await this.channelManager.notify(response, 'Heartbeat');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Heartbeat] Error:', message);
    } finally {
      this.running = false;
    }
  }
}
