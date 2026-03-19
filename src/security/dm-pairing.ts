import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const APPROVED_FILE = resolve(process.cwd(), 'approved-senders.json');

interface PendingCode {
  code: string;
  senderId: string;
  channel: string;
  expiresAt: number;
}

/**
 * DM Pairing — unknown senders must enter a pairing code
 * before they can interact with this assistant.
 */
export class DmPairingManager {
  private pendingCodes = new Map<string, PendingCode>();
  private approvedSenders: Set<string>;

  constructor() {
    this.approvedSenders = this.loadApproved();
  }

  private loadApproved(): Set<string> {
    try {
      if (existsSync(APPROVED_FILE)) {
        const data = JSON.parse(readFileSync(APPROVED_FILE, 'utf-8'));
        return new Set(data.approved ?? []);
      }
    } catch { /* ignore */ }
    return new Set();
  }

  private saveApproved(): void {
    writeFileSync(
      APPROVED_FILE,
      JSON.stringify({ approved: [...this.approvedSenders] }, null, 2),
      'utf-8'
    );
  }

  /** Check if a sender is approved */
  isApproved(senderId: string): boolean {
    return this.approvedSenders.has(senderId);
  }

  /** Generate a pairing code for an unknown sender */
  generateCode(senderId: string, channel: string): string {
    // Clean up expired codes
    const now = Date.now();
    for (const [key, pending] of this.pendingCodes) {
      if (pending.expiresAt < now) this.pendingCodes.delete(key);
    }

    // Check if there's already a pending code for this sender
    for (const [, pending] of this.pendingCodes) {
      if (pending.senderId === senderId && pending.channel === channel && pending.expiresAt > now) {
        return pending.code;
      }
    }

    const code = randomBytes(3).toString('hex').toUpperCase(); // 6-char hex
    this.pendingCodes.set(code, {
      code,
      senderId,
      channel,
      expiresAt: now + CODE_TTL_MS,
    });

    console.log(`[Pairing] Generated code ${code} for ${channel}:${senderId} (expires in 5m)`);
    return code;
  }

  /** Approve a sender by pairing code. Returns true if successful. */
  approve(code: string): { ok: boolean; senderId?: string; channel?: string } {
    const upper = code.toUpperCase();
    const pending = this.pendingCodes.get(upper);

    if (!pending) {
      return { ok: false };
    }

    if (pending.expiresAt < Date.now()) {
      this.pendingCodes.delete(upper);
      return { ok: false };
    }

    this.approvedSenders.add(pending.senderId);
    this.saveApproved();
    this.pendingCodes.delete(upper);

    console.log(`[Pairing] Approved ${pending.channel}:${pending.senderId}`);
    return { ok: true, senderId: pending.senderId, channel: pending.channel };
  }

  /** List pending pairing codes (for CLI display) */
  listPending(): PendingCode[] {
    const now = Date.now();
    return [...this.pendingCodes.values()].filter(p => p.expiresAt > now);
  }
}

// Singleton
let instance: DmPairingManager | null = null;
export function getDmPairingManager(): DmPairingManager {
  if (!instance) instance = new DmPairingManager();
  return instance;
}
