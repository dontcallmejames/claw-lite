#!/usr/bin/env node
import { getDmPairingManager } from './dm-pairing.js';

const args = process.argv.slice(2);
const command = args[0];
const code = args[1];

const manager = getDmPairingManager();

if (command === 'approve' && code) {
  const result = manager.approve(code);
  if (result.ok) {
    console.log(`Approved sender ${result.senderId} on ${result.channel}`);
  } else {
    console.error(`Code "${code}" not found or expired.`);
    process.exit(1);
  }
} else if (command === 'list') {
  const pending = manager.listPending();
  if (pending.length === 0) {
    console.log('No pending pairing codes.');
  } else {
    console.log('Pending pairing codes:');
    for (const p of pending) {
      const remaining = Math.round((p.expiresAt - Date.now()) / 1000);
      console.log(`  ${p.code} — ${p.channel}:${p.senderId} (${remaining}s remaining)`);
    }
  }
} else {
  console.log('Usage:');
  console.log('  npm run pairing approve <CODE>');
  console.log('  npm run pairing list');
  process.exit(1);
}
