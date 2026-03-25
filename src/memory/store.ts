import { randomUUID } from 'crypto';
import { getDb } from './db.js';

// ---- Row types ----

export interface MessageRow {
  id: number;
  conversation_id: number;
  seq: number;
  role: string;
  content: string;
  token_count: number;
  created_at: string;
}

export interface SummaryRow {
  id: string;
  conversation_id: number;
  kind: 'leaf' | 'condensed';
  depth: number;
  content: string;
  token_count: number;
  earliest_at: string | null;
  latest_at: string | null;
  descendant_count: number;
  created_at: string;
}

export interface SearchMessageRow {
  id: number;
  role: string;
  content: string;
  created_at: string;
  conversation_id: number;
  snippet?: string;
}

export interface SearchSummaryRow {
  id: string;
  kind: string;
  depth: number;
  content: string;
  earliest_at: string | null;
  latest_at: string | null;
  descendant_count: number;
  created_at: string;
}

export interface KvRow {
  key: string;
  category: string;
  value: string;
  date: string | null;
}

// ---- Conversations ----

export function getOrCreateConversation(sessionId: string): number {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM conversations WHERE session_id = ?').get(sessionId) as any;
  if (existing) return existing.id;

  const result = db.prepare('INSERT INTO conversations (session_id) VALUES (?)').run(sessionId);
  return result.lastInsertRowid as number;
}

// ---- Messages ----

export function getNextSeq(conversationId: number): number {
  const db = getDb();
  const row = db.prepare('SELECT MAX(seq) as maxSeq FROM messages WHERE conversation_id = ?').get(conversationId) as any;
  return (row?.maxSeq ?? 0) + 1;
}

export function insertMessage(
  conversationId: number,
  role: string,
  content: string
): number {
  const db = getDb();
  const seq = getNextSeq(conversationId);
  const tokenCount = Math.ceil(content.length / 4);

  const result = db.prepare(
    'INSERT INTO messages (conversation_id, seq, role, content, token_count) VALUES (?, ?, ?, ?, ?)'
  ).run(conversationId, seq, role, content, tokenCount);

  const messageId = result.lastInsertRowid as number;

  // Add to context_items
  const maxOrdinal = db.prepare(
    'SELECT MAX(ordinal) as mx FROM context_items WHERE conversation_id = ?'
  ).get(conversationId) as any;
  const nextOrdinal = (maxOrdinal?.mx ?? 0) + 1;

  db.prepare(
    'INSERT INTO context_items (conversation_id, ordinal, item_type, message_id) VALUES (?, ?, ?, ?)'
  ).run(conversationId, nextOrdinal, 'message', messageId);

  // Sync FTS
  try {
    db.prepare('INSERT INTO messages_fts (rowid, content) VALUES (?, ?)').run(messageId, content);
  } catch { /* FTS5 not available */ }

  return messageId;
}

export function getMessageById(messageId: number): MessageRow | undefined {
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as MessageRow | undefined;
}

// ---- Summaries ----

export function insertSummary(
  conversationId: number,
  kind: 'leaf' | 'condensed',
  depth: number,
  content: string,
  sourceMessageIds: number[],
  parentSummaryIds: string[],
  earliestAt?: string,
  latestAt?: string
): string {
  const db = getDb();
  const id = randomUUID();
  const tokenCount = Math.ceil(content.length / 4);
  const descendantCount = sourceMessageIds.length + parentSummaryIds.length;

  db.prepare(`
    INSERT INTO summaries (id, conversation_id, kind, depth, content, token_count, earliest_at, latest_at, descendant_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, kind, depth, content, tokenCount, earliestAt ?? null, latestAt ?? null, descendantCount);

  // Link source messages
  const insertMsgLink = db.prepare('INSERT INTO summary_messages (summary_id, message_id) VALUES (?, ?)');
  for (const msgId of sourceMessageIds) {
    insertMsgLink.run(id, msgId);
  }

  // Link parent summaries
  const insertParentLink = db.prepare('INSERT INTO summary_parents (summary_id, parent_summary_id) VALUES (?, ?)');
  for (const parentId of parentSummaryIds) {
    insertParentLink.run(id, parentId);
  }

  // Sync FTS
  try {
    db.prepare('INSERT INTO summaries_fts (content) VALUES (?)').run(content);
  } catch { /* FTS5 not available */ }

  return id;
}

export function getSummaryById(summaryId: string): SummaryRow | undefined {
  return getDb().prepare('SELECT * FROM summaries WHERE id = ?').get(summaryId) as SummaryRow | undefined;
}

export function getSummarySourceMessages(summaryId: string): MessageRow[] {
  return getDb().prepare(`
    SELECT m.* FROM messages m
    JOIN summary_messages sm ON sm.message_id = m.id
    WHERE sm.summary_id = ?
    ORDER BY m.seq
  `).all(summaryId) as MessageRow[];
}

export function getSummaryChildSummaries(summaryId: string): SummaryRow[] {
  return getDb().prepare(`
    SELECT s.* FROM summaries s
    JOIN summary_parents sp ON sp.parent_summary_id = s.id
    WHERE sp.summary_id = ?
    ORDER BY s.created_at
  `).all(summaryId) as SummaryRow[];
}

// ---- Context Items ----

export interface ContextItem {
  ordinal: number;
  item_type: 'message' | 'summary';
  message_id: number | null;
  summary_id: string | null;
  // Resolved content
  role?: string;
  content?: string;
  token_count?: number;
  kind?: string;
  depth?: number;
  descendant_count?: number;
  created_at?: string;
}

export function getContextItems(conversationId: number): ContextItem[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      ci.ordinal, ci.item_type, ci.message_id, ci.summary_id,
      m.role, COALESCE(m.content, s.content) as content,
      COALESCE(m.token_count, s.token_count) as token_count,
      s.kind, s.depth, s.descendant_count,
      COALESCE(m.created_at, s.created_at) as created_at
    FROM context_items ci
    LEFT JOIN messages m ON ci.message_id = m.id
    LEFT JOIN summaries s ON ci.summary_id = s.id
    WHERE ci.conversation_id = ?
    ORDER BY ci.ordinal
  `).all(conversationId) as ContextItem[];
}

export function getContextTokenCount(conversationId: number): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT SUM(COALESCE(m.token_count, s.token_count, 0)) as total
    FROM context_items ci
    LEFT JOIN messages m ON ci.message_id = m.id
    LEFT JOIN summaries s ON ci.summary_id = s.id
    WHERE ci.conversation_id = ?
  `).get(conversationId) as any;
  return row?.total ?? 0;
}

/**
 * Replace a range of context_items ordinals with a single summary.
 * Used after compaction to swap raw messages/summaries for a new summary.
 */
export function replaceContextRange(
  conversationId: number,
  startOrdinal: number,
  endOrdinal: number,
  summaryId: string
): void {
  const db = getDb();

  db.transaction(() => {
    // Delete the old items in the range
    db.prepare(
      'DELETE FROM context_items WHERE conversation_id = ? AND ordinal >= ? AND ordinal <= ?'
    ).run(conversationId, startOrdinal, endOrdinal);

    // Insert the summary at the start ordinal
    db.prepare(
      'INSERT INTO context_items (conversation_id, ordinal, item_type, summary_id) VALUES (?, ?, ?, ?)'
    ).run(conversationId, startOrdinal, 'summary', summaryId);

    // Re-number remaining items to close gaps
    const remaining = db.prepare(
      'SELECT rowid, ordinal FROM context_items WHERE conversation_id = ? ORDER BY ordinal'
    ).all(conversationId) as any[];

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].ordinal !== i + 1) {
        db.prepare(
          'UPDATE context_items SET ordinal = ? WHERE conversation_id = ? AND ordinal = ?'
        ).run(i + 1, conversationId, remaining[i].ordinal);
      }
    }
  })();
}

// ---- Search ----

export function searchMessages(query: string, conversationId?: number, limit = 10): SearchMessageRow[] {
  const db = getDb();
  try {
    if (conversationId) {
      return db.prepare(`
        SELECT m.id, m.role, m.content, m.created_at, m.conversation_id,
               snippet(messages_fts, 0, '>>>', '<<<', '...', 40) as snippet
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        WHERE messages_fts MATCH ? AND m.conversation_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(query, conversationId, limit) as SearchMessageRow[];
    }
    return db.prepare(`
      SELECT m.id, m.role, m.content, m.created_at, m.conversation_id,
             snippet(messages_fts, 0, '>>>', '<<<', '...', 40) as snippet
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.rowid
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as SearchMessageRow[];
  } catch {
    // FTS5 fallback: LIKE search
    const pattern = `%${query}%`;
    if (conversationId) {
      return db.prepare(
        'SELECT id, role, content, created_at, conversation_id FROM messages WHERE content LIKE ? AND conversation_id = ? LIMIT ?'
      ).all(pattern, conversationId, limit) as SearchMessageRow[];
    }
    return db.prepare(
      'SELECT id, role, content, created_at, conversation_id FROM messages WHERE content LIKE ? LIMIT ?'
    ).all(pattern, limit) as SearchMessageRow[];
  }
}

export function searchSummaries(query: string, conversationId?: number, limit = 10): SearchSummaryRow[] {
  const db = getDb();
  try {
    const baseQuery = conversationId
      ? `SELECT s.id, s.kind, s.depth, s.content, s.earliest_at, s.latest_at, s.descendant_count, s.created_at
         FROM summaries_fts
         JOIN summaries s ON s.rowid = summaries_fts.rowid
         WHERE summaries_fts MATCH ? AND s.conversation_id = ?
         ORDER BY rank LIMIT ?`
      : `SELECT s.id, s.kind, s.depth, s.content, s.earliest_at, s.latest_at, s.descendant_count, s.created_at
         FROM summaries_fts
         JOIN summaries s ON s.rowid = summaries_fts.rowid
         WHERE summaries_fts MATCH ?
         ORDER BY rank LIMIT ?`;

    return conversationId
      ? db.prepare(baseQuery).all(query, conversationId, limit) as SearchSummaryRow[]
      : db.prepare(baseQuery).all(query, limit) as SearchSummaryRow[];
  } catch {
    const pattern = `%${query}%`;
    return db.prepare(
      'SELECT id, kind, depth, content, earliest_at, latest_at, descendant_count, created_at FROM summaries WHERE content LIKE ? LIMIT ?'
    ).all(pattern, limit) as SearchSummaryRow[];
  }
}

// ---- Key-Value Memory (backward compat) ----

export function kvSet(key: string, category: string, value: string, date?: string): void {
  getDb().prepare(`
    INSERT INTO key_value_memory (key, category, value, date) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, date = excluded.date
  `).run(key, category, value, date ?? null);
}

export function kvGet(key: string): KvRow | undefined {
  return getDb().prepare('SELECT * FROM key_value_memory WHERE key = ?').get(key) as KvRow | undefined;
}

export function kvGetByCategory(category: string): KvRow[] {
  return getDb().prepare('SELECT * FROM key_value_memory WHERE category = ?').all(category) as KvRow[];
}

export function kvDelete(key: string): boolean {
  const result = getDb().prepare('DELETE FROM key_value_memory WHERE key = ?').run(key);
  return result.changes > 0;
}

export function kvGetAll(): KvRow[] {
  return getDb().prepare('SELECT * FROM key_value_memory ORDER BY category, key').all() as KvRow[];
}
