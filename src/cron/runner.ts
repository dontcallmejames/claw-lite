import * as nodeCron from 'node-cron';
import fs from 'fs';

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  message: string;
  enabled: boolean;
  lastRun?: string;
  channel?: string;   // target channel: 'telegram', 'discord', or omit for all
  oneShot?: boolean;   // if true, disable after first fire
}

interface CronFile {
  jobs: CronJob[];
}

export class CronRunner {
  private cronPath: string;
  private tasks = new Map<string, ReturnType<typeof nodeCron.schedule>>();
  private running = new Set<string>();
  private watcher: fs.FSWatcher | null = null;
  private selfWriting = false;
  private onMessage: (message: string) => Promise<string>;
  private broadcast: (content: string, jobName: string, channel?: string) => void;

  constructor(
    cronPath: string,
    onMessage: (message: string) => Promise<string>,
    broadcast: (content: string, jobName: string, channel?: string) => void
  ) {
    this.cronPath = cronPath;
    this.onMessage = onMessage;
    this.broadcast = broadcast;
  }

  start(): void {
    this.schedule();
    // Watch for changes to crons.json — reschedule on update
    try {
      this.watcher = fs.watch(this.cronPath, () => {
        if (this.selfWriting) return;
        console.log('[Cron] crons.json changed — rescheduling');
        this.stopAllTasks();
        this.schedule();
      });
    } catch {
      // File may not exist yet — watcher will be null, jobs start when file appears
    }
    console.log('[Cron] Runner started');
  }

  stop(): void {
    this.stopAllTasks();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    console.log('[Cron] Runner stopped');
  }

  private stopAllTasks(): void {
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
  }

  private schedule(): void {
    let cronFile: CronFile;
    try {
      if (!fs.existsSync(this.cronPath)) return;
      cronFile = JSON.parse(fs.readFileSync(this.cronPath, 'utf-8'));
    } catch (err) {
      console.error('[Cron] Failed to read crons.json:', err);
      return;
    }

    const jobs = cronFile.jobs || [];
    let scheduled = 0;

    for (const job of jobs) {
      if (!job.enabled) continue;
      if (!nodeCron.validate(job.schedule)) {
        console.error(`[Cron] Invalid schedule for job "${job.name}": ${job.schedule} — skipping`);
        continue;
      }

      const task = nodeCron.schedule(job.schedule, () => {
        this.fireJob(job);
      });

      this.tasks.set(job.id, task);
      scheduled++;
      console.log(`[Cron] Scheduled "${job.name}" (${job.schedule})`);
    }

    console.log(`[Cron] ${scheduled} job(s) active`);
  }

  private async fireJob(job: CronJob): Promise<void> {
    if (this.running.has(job.id)) {
      console.warn(`[Cron] Job "${job.name}" still running from previous fire — skipping`);
      return;
    }

    this.running.add(job.id);
    console.log(`[Cron] Running job: ${job.name}`);

    try {
      const result = await this.onMessage(job.message);
      this.broadcast(result, job.name, job.channel);
      this.updateLastRun(job.id);

      // One-shot jobs disable after first fire
      if (job.oneShot) {
        this.disableJob(job.id);
        console.log(`[Cron] One-shot job "${job.name}" completed and disabled`);
      }
    } catch (err) {
      console.error(`[Cron] Job "${job.name}" failed:`, err);
      const message = err instanceof Error ? err.message : String(err);
      this.broadcast(`Job failed: ${message}`, job.name);
    } finally {
      this.running.delete(job.id);
    }
  }

  private disableJob(jobId: string): void {
    try {
      const cronFile: CronFile = JSON.parse(fs.readFileSync(this.cronPath, 'utf-8'));
      const job = cronFile.jobs.find(j => j.id === jobId);
      if (job) {
        job.enabled = false;
        this.selfWriting = true;
        fs.writeFileSync(this.cronPath, JSON.stringify(cronFile, null, 2), 'utf-8');
        this.selfWriting = false;
      }
      // Stop the task
      const task = this.tasks.get(jobId);
      if (task) { task.stop(); this.tasks.delete(jobId); }
    } catch (err) {
      this.selfWriting = false;
      console.error('[Cron] Failed to disable job:', err);
    }
  }

  private updateLastRun(jobId: string): void {
    try {
      const cronFile: CronFile = JSON.parse(fs.readFileSync(this.cronPath, 'utf-8'));
      const job = cronFile.jobs.find(j => j.id === jobId);
      if (job) {
        job.lastRun = new Date().toISOString();
        this.selfWriting = true;
        fs.writeFileSync(this.cronPath, JSON.stringify(cronFile, null, 2), 'utf-8');
        this.selfWriting = false;
      }
    } catch (err) {
      this.selfWriting = false;
      console.error('[Cron] Failed to update lastRun:', err);
    }
  }
}
