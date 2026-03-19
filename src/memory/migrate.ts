#!/usr/bin/env node
/**
 * One-time migration: memory.json → SQLite key_value_memory table.
 * Run with: npx tsx src/memory/migrate.ts
 *
 * Safe to run multiple times — uses INSERT OR IGNORE.
 */
import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';
import * as store from './store.js';

const MEMORY_FILE = path.resolve(process.cwd(), 'memory.json');

export function migrateMemoryJson(): void {
  if (!fs.existsSync(MEMORY_FILE)) {
    console.log('[Migration] No memory.json found — nothing to migrate');
    return;
  }

  const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  const db = getDb();
  let count = 0;

  // Migrate preferences
  if (memory.preferences) {
    for (const [key, value] of Object.entries(memory.preferences)) {
      try {
        store.kvSet(key, 'preference', String(value));
        count++;
      } catch { /* duplicate key */ }
    }
  }

  // Migrate facts (handle nested objects)
  if (memory.facts) {
    function flattenFacts(obj: Record<string, any>, prefix = ''): void {
      for (const [k, v] of Object.entries(obj)) {
        if (!v) continue;
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'object' && !Array.isArray(v)) {
          flattenFacts(v, key);
        } else {
          try {
            store.kvSet(key, 'fact', String(v));
            count++;
          } catch { /* duplicate key */ }
        }
      }
    }
    flattenFacts(memory.facts);
  }

  // Migrate notes
  if (Array.isArray(memory.notes)) {
    for (const note of memory.notes) {
      const key = `note_${note.id || Date.now()}`;
      try {
        store.kvSet(key, 'note', note.content);
        count++;
      } catch { /* duplicate key */ }
    }
  }

  // Migrate events
  if (Array.isArray(memory.events)) {
    for (const event of memory.events) {
      const key = `event_${event.id || Date.now()}`;
      try {
        store.kvSet(key, 'event', event.description, event.date);
        count++;
      } catch { /* duplicate key */ }
    }
  }

  console.log(`[Migration] Migrated ${count} entries from memory.json to SQLite`);
}

// Run if called directly
const isMain = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');
if (isMain) {
  migrateMemoryJson();
  console.log('Migration complete.');
  process.exit(0);
}
