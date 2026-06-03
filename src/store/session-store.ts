/**
 * store/session-store.ts — SQLite 会话持久化 (Era 1.3)
 *
 * 对标 Hermes hermes_state.py SessionDB:
 *   - sessions 表 + messages 表 + FTS5 全文搜索
 *   - Schema 自动创建 (幂等)
 *   - WAL 模式
 *
 * 设计决策: 独立的 SessionStore 实例，不与 engine-core 共享 DB 连接。
 * 会话数据属于 Agent 进程层，本体数据属于 engine-core 层。
 */
import Database from 'better-sqlite3';

// ═══ Types ═══

export interface SessionRow {
  id: string;
  orgId: string;
  phase: number;
  stateJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRow {
  id: number;
  sessionId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SearchResult {
  sessionId: string;
  orgId: string;
  messageCount: number;
  snippet: string;
  updatedAt: string;
}

export interface ConversationState {
  orgId: string;
  phase: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  startedAt: string;
}

// ═══ SessionStore ═══

export class SessionStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  // ═══ Schema ═══

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        phase INTEGER DEFAULT 0,
        state_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agent_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_agent_msg_session ON agent_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_session_org ON agent_sessions(org_id);

      -- FTS5 全文搜索 (支持中文)
      CREATE VIRTUAL TABLE IF NOT EXISTS agent_messages_fts USING fts5(
        session_id UNINDEXED,
        content,
        tokenize='unicode61'
      );
    `);

    // FTS5 同步触发器 (幂等——触发器已存在时报错忽略)
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS agent_msg_fts_insert AFTER INSERT ON agent_messages BEGIN
        INSERT INTO agent_messages_fts(session_id, content) VALUES (new.session_id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS agent_msg_fts_delete AFTER DELETE ON agent_messages BEGIN
        INSERT INTO agent_messages_fts(agent_messages_fts, session_id, content) VALUES ('delete', old.session_id, old.content);
      END;
    `);
  }

  // ═══ Sessions ═══

  createSession(orgId: string): SessionRow {
    const id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; // nosec: nonce for session ID
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO agent_sessions (id, org_id, phase, created_at, updated_at) VALUES (?,?,0,?,?)')
      .run(id, orgId, now, now);
    return this.getSession(id)!;
  }

  getSession(id: string): SessionRow | null {
    const row = this.db.prepare('SELECT * FROM agent_sessions WHERE id=?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id, orgId: row.org_id, phase: row.phase,
      stateJson: row.state_json, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  updateSession(id: string, updates: { phase?: number }): void {
    const now = new Date().toISOString();
    if (updates.phase !== undefined) {
      this.db.prepare('UPDATE agent_sessions SET phase=?, updated_at=? WHERE id=?')
        .run(updates.phase, now, id);
    }
  }

  listSessions(limit = 20): SessionRow[] {
    const rows = this.db.prepare(
      'SELECT s.*, (SELECT COUNT(*) FROM agent_messages WHERE session_id=s.id) as msg_count FROM agent_sessions s ORDER BY s.updated_at DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(r => ({
      id: r.id, orgId: r.org_id, phase: r.phase,
      stateJson: r.state_json, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM agent_messages WHERE session_id=?').run(id);
    this.db.prepare('DELETE FROM agent_sessions WHERE id=?').run(id);
  }

  // ═══ Messages ═══

  addMessage(sessionId: string, role: MessageRow['role'], content: string): void {
    this.db.prepare('INSERT INTO agent_messages (session_id, role, content) VALUES (?,?,?)')
      .run(sessionId, role, content);
    this.db.prepare('UPDATE agent_sessions SET updated_at=? WHERE id=?')
      .run(new Date().toISOString(), sessionId);
  }

  getMessages(sessionId: string): MessageRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM agent_messages WHERE session_id=? ORDER BY id ASC'
    ).all(sessionId) as any[];
    return rows.map(r => ({
      id: r.id, sessionId: r.session_id, role: r.role,
      content: r.content, timestamp: r.timestamp,
    }));
  }

  // ═══ State ═══

  saveState(sessionId: string, state: ConversationState): void {
    this.db.prepare('UPDATE agent_sessions SET state_json=?, phase=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(state), state.phase, new Date().toISOString(), sessionId);
  }

  loadState(sessionId: string): ConversationState | null {
    const row = this.db.prepare('SELECT state_json FROM agent_sessions WHERE id=?').get(sessionId) as any;
    if (!row?.state_json) return null;
    try {
      return JSON.parse(row.state_json);
    } catch {
      return null;
    }
  }

  // ═══ FTS5 Search ═══

  search(query: string, limit = 10): SearchResult[] {
    // FTS5 unicode61 对中文支持有限——使用 LIKE 作为 fallback
    const hasCJK = /[一-鿿]/.test(query);
    if (hasCJK) {
      const likePattern = `%${query}%`;
      const rows = this.db.prepare(`
        SELECT DISTINCT m.session_id, s.org_id, s.updated_at,
               (SELECT COUNT(*) FROM agent_messages WHERE session_id=m.session_id) as msg_count,
               substr(m.content, max(0, instr(m.content, ?) - 30), 80) as snippet
        FROM agent_messages m
        JOIN agent_sessions s ON s.id = m.session_id
        WHERE m.content LIKE ?
        ORDER BY s.updated_at DESC
        LIMIT ?
      `).all(query, likePattern, limit) as any[];
      return rows.map(r => ({
        sessionId: r.session_id, orgId: r.org_id,
        messageCount: r.msg_count, snippet: r.snippet, updatedAt: r.updated_at,
      }));
    }

    // English/ASCII → FTS5
    const rows = this.db.prepare(`
      SELECT f.session_id, s.org_id, s.updated_at,
             (SELECT COUNT(*) FROM agent_messages WHERE session_id=f.session_id) as msg_count,
             snippet(agent_messages_fts, 1, '<mark>', '</mark>', '...', 40) as snippet
      FROM agent_messages_fts f
      JOIN agent_sessions s ON s.id = f.session_id
      WHERE agent_messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as any[];
    return rows.map(r => ({
      sessionId: r.session_id, orgId: r.org_id,
      messageCount: r.msg_count, snippet: r.snippet, updatedAt: r.updated_at,
    }));
  }
}
