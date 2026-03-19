import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'davos.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  console.log(`[Memory] SQLite database initialized at ${DB_PATH}`);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      seq INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(conversation_id, seq)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      kind TEXT NOT NULL CHECK (kind IN ('leaf','condensed')),
      depth INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      earliest_at TEXT,
      latest_at TEXT,
      descendant_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS summary_messages (
      summary_id TEXT NOT NULL REFERENCES summaries(id),
      message_id INTEGER NOT NULL REFERENCES messages(id),
      PRIMARY KEY (summary_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS summary_parents (
      summary_id TEXT NOT NULL REFERENCES summaries(id),
      parent_summary_id TEXT NOT NULL REFERENCES summaries(id),
      PRIMARY KEY (summary_id, parent_summary_id)
    );

    CREATE TABLE IF NOT EXISTS context_items (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      ordinal INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('message','summary')),
      message_id INTEGER REFERENCES messages(id),
      summary_id TEXT REFERENCES summaries(id),
      PRIMARY KEY (conversation_id, ordinal)
    );

    CREATE TABLE IF NOT EXISTS key_value_memory (
      key TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('preference','fact','note','event')),
      value TEXT NOT NULL,
      date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // FTS5 — wrapped in try/catch because some SQLite builds lack FTS5
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content, content=messages, content_rowid=id
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS summaries_fts USING fts5(
        content, content=summaries
      );
    `);
  } catch (err) {
    console.warn('[Memory] FTS5 not available — full-text search disabled');
  }

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_summaries_conversation ON summaries(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_context_items_conversation ON context_items(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
