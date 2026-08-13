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
import { createLogger } from '@synova/logger';

const log = createLogger('store/session-store');

// ═══ Types ═══

/** Raw SQLite row (P1-02: 替代 `as-any`) */
type SqliteRow = Record<string, unknown>;

export interface SessionRow {
  id: string;
  orgId: string;
  phase: number;
  stateJson: string | null;
  title?: string;
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
        user_id TEXT,
        phase INTEGER DEFAULT 0,
        state_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      -- M1-Slice2: user_id migration for existing databases (idempotent via try-catch below)
      -- D251: title column migration (idempotent via try-catch)

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

    // 诊断检查点表
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS diagnosis_checkpoints (
        session_id TEXT NOT NULL, phase INTEGER DEFAULT 0,
        completed_modules TEXT DEFAULT '[]', partial_report TEXT DEFAULT 'null',
        saved_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, phase)
      )`);
    } catch (err) { log.debug({ err }, '会话表已存在 — 跳过创建'); }

    // M1-Slice2: 迁移旧数据库 (添加 user_id 列，幂等)
    try { this.db.exec('ALTER TABLE agent_sessions ADD COLUMN user_id TEXT'); } catch { log.debug('user_id 列已存在 — 跳过迁移'); }

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

  createSession(orgId: string, userId?: string): SessionRow {
    const id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; // nosec: nonce for session ID
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO agent_sessions (id, org_id, user_id, phase, created_at, updated_at) VALUES (?,?,?,0,?,?)')
      .run(id, orgId, userId || null, now, now);
    return this.getSession(id)!;
  }

  getSession(id: string): SessionRow | null {
    const row = this.db.prepare('SELECT * FROM agent_sessions WHERE id=?').get(id) as SqliteRow | undefined;
    if (!row) return null;
    return {
      id: row.id as string, orgId: row.org_id as string, phase: row.phase as number,
      stateJson: row.state_json as string | null, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    };
  }

  updateSession(id: string, updates: { phase?: number }): void {
    const now = new Date().toISOString();
    if (updates.phase !== undefined) {
      this.db.prepare('UPDATE agent_sessions SET phase=?, updated_at=? WHERE id=?')
        .run(updates.phase, now, id);
    }
  }

  /** D251: 重命名会话——设置 title。自动处理 ALTER TABLE 迁移。 */
  renameSession(id: string, title: string): boolean {
    try {
      // 安全迁移: 尝试添加 title 列 (已存在则忽略)
      try { this.db.exec("ALTER TABLE agent_sessions ADD COLUMN title TEXT DEFAULT ''"); } catch (err) {
        log.warn({ err }, 'title 列迁移 — 列已存在');
      }
      this.db.prepare('UPDATE agent_sessions SET title=?, updated_at=? WHERE id=?')
        .run(title, new Date().toISOString(), id);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id }, '重命名会话失败');
      return false;
    }
  }

  listSessions(limit = 20): SessionRow[] {
    const rows = this.db.prepare(
      'SELECT s.*, (SELECT COUNT(*) FROM agent_messages WHERE session_id=s.id) as msg_count FROM agent_sessions s ORDER BY s.updated_at DESC LIMIT ?'
    ).all(limit) as SqliteRow[];
    return rows.map(r => ({
      id: r.id as string, orgId: r.org_id as string, phase: r.phase as number,
      stateJson: r.state_json as string | null, title: r.title as string | undefined,
      createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    }));
  }

  /** 列出有诊断状态的会话 (state_json IS NOT NULL), Gear6 知识提取使用 */
  listSessionsWithState(limit = 10): SessionRow[] {
    const rows = this.db.prepare(
      'SELECT s.*, (SELECT COUNT(*) FROM agent_messages WHERE session_id=s.id) as msg_count FROM agent_sessions s WHERE s.state_json IS NOT NULL ORDER BY s.updated_at DESC LIMIT ?'
    ).all(limit) as SqliteRow[];
    return rows.map(r => ({
      id: r.id as string, orgId: r.org_id as string, phase: r.phase as number,
      stateJson: r.state_json as string | null, title: r.title as string | undefined,
      createdAt: r.created_at as string, updatedAt: r.updated_at as string,
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
    ).all(sessionId) as SqliteRow[];
    return rows.map(r => ({
      id: Number(r.id), sessionId: r.session_id as string, role: r.role as MessageRow['role'],
      content: r.content as string, timestamp: r.timestamp as string,
    }));
  }

  // ═══ State ═══

  saveState(sessionId: string, state: Record<string, unknown>): void {
    this.db.prepare('UPDATE agent_sessions SET state_json=?, phase=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(state), state.phase ?? 0, new Date().toISOString(), sessionId);
  }

  loadState(sessionId: string): ConversationState | null {
    const row = this.db.prepare('SELECT state_json FROM agent_sessions WHERE id=?').get(sessionId) as SqliteRow | undefined;
    if (!row?.state_json) return null;
    try {
      return JSON.parse(row.state_json as string);
    } catch (err) {
      log.warn({ err }, '会话状态反序列化失败');
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
      `).all(query, likePattern, limit) as SqliteRow[];
      return rows.map(r => ({
        sessionId: r.session_id as string, orgId: r.org_id as string,
        messageCount: Number(r.msg_count), snippet: r.snippet as string, updatedAt: r.updated_at as string,
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
    `).all(query, limit) as SqliteRow[];
    return rows.map(r => ({
      sessionId: r.session_id as string, orgId: r.org_id as string,
      messageCount: Number(r.msg_count), snippet: r.snippet as string, updatedAt: r.updated_at as string,
    }));
  }

  // ═══ 诊断检查点 — 崩溃恢复 ═══

  /** 保存诊断检查点 (每个 Phase 完成后调用) */
  saveDiagnosisCheckpoint(checkpoint: {
    sessionId: string; phase: number; completedModules: string[];
    partialReport: unknown; savedAt: string;
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO diagnosis_checkpoints (session_id, phase, completed_modules, partial_report, saved_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      checkpoint.sessionId, checkpoint.phase,
      JSON.stringify(checkpoint.completedModules),
      JSON.stringify(checkpoint.partialReport),
      checkpoint.savedAt,
    );
  }

  /** 获取最近的诊断检查点 */
  getDiagnosisCheckpoint(sessionId: string): {
    phase: number; completedModules: string[]; partialReport: unknown; savedAt: string;
  } | null {
    const row = this.db.prepare(`
      SELECT phase, completed_modules, partial_report, saved_at
      FROM diagnosis_checkpoints WHERE session_id = ? ORDER BY saved_at DESC LIMIT 1
    `).get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    try {
      return {
        phase: row.phase as number,
        completedModules: JSON.parse(row.completed_modules as string || '[]'),
        partialReport: JSON.parse(row.partial_report as string || 'null'),
        savedAt: row.saved_at as string,
      };
    } catch (err) { log.warn({ err }, '会话检查点解析失败'); return null; }
  }

  /** 删除会话的检查点 */
  deleteDiagnosisCheckpoints(sessionId: string): void {
    this.db.prepare('DELETE FROM diagnosis_checkpoints WHERE session_id = ?').run(sessionId);
  }
}
