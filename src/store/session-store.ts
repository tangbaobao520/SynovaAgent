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

// ═══ D563（CT-46/D489 验收返修）: 类型谓词导出 ═══

/**
 * better-sqlite3 Database 鸭子类型谓词 — unknown → Database.Database 窄化（替代 L1 侧 never 断言）。
 *
 * 架构位（铁律 39 + D563 返工）: 本谓词属 L5 存储层——数据库驱动类型只归 L5 所有；
 * L1（routes/diagnosis.ts）经既有动态 import 通道解构使用，不经行任何数据库层引用
 * （Architecture Check 1d: L1→L5 跨层引用零容忍，注释/消息字样同样计红）。
 *
 * 契约（铁律 47）:
 *   @input    — v: unknown（req.app.locals.orchestration.db 等运行时未类型化句柄）
 *   @output   — 类型谓词；true = 可安全传入 `new SessionStore(db)`（Database.Database）
 *   @degraded — false（非对象 / 缺关键方法）→ 调用方把谓词失败转译为 TypeError，
 *               走既有 try/catch log.warn 降级通道（铁律 24/31，行为零变化）
 *
 * 方法探测取 prepare/exec/pragma 三方法（better-sqlite3 Database 的最小读写面；
 * SessionStore.initSchema 实际只用 exec）。非断言——失败路径显式降级，不静默信任 unknown。
 */
export function isSqliteDatabase(v: unknown): v is Database.Database {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { prepare?: unknown; exec?: unknown; pragma?: unknown };
  return typeof o.prepare === 'function' && typeof o.exec === 'function' && typeof o.pragma === 'function';
}

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

// ═══ D500: 事件溯源类型 ═══

/**
 * 事件类型（surface 事件 = 投影到消息历史的；log-only 事件 = 仅审计）。
 * D487: 新增诊断事件三类——GA 诊断过程落 session_events 可回放；
 * deriveMessages 投影跳过（log-only，不污染消息历史）。
 */
export type SessionEventType =
  | 'message'
  | 'tool_result'
  | 'system'
  | 'diagnosis_phase'
  | 'diagnosis_module'
  | 'diagnosis_report';

/** session_events 表行 */
export interface SessionEvent {
  id: number;
  sessionId: string;
  seq: number;
  eventType: SessionEventType;
  payloadJson: string;
  createdAt: string;
}

/** appendEvent 结果契约（铁律 24/31: 失败显式降级） */
export type AppendEventResult =
  | { ok: true; seq: number }
  | { ok: false; degraded: true; error: string };

// ═══ SessionStore ═══

export class SessionStore {
  private db: Database.Database;

  /**
   * D500: 降级信号传播（铁律 31）——appendEvent 双写失败时置 true，
   * 调用方（SessionManager model-visible⟺logged 断言）检查。
   */
  lastDegraded = false;

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

      -- D500: 事件溯源 append-only 事件流（会话唯一事实源）
      -- seq 单调 + UNIQUE(session_id, seq) 物理防并发 seq 重复（2026-08-22 缺陷①防线）
      -- D487: CHECK 扩展诊断事件三类（旧库经下方表重建迁移升级，CREATE IF NOT EXISTS 不更新已有约束）
      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('message','tool_result','system','diagnosis_phase','diagnosis_module','diagnosis_report')),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(session_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_session_events_sess ON session_events(session_id, seq);
    `);

    // D487: 旧库 session_events CHECK 约束升级 — ALTER 不支持修改 CHECK，
    // 幂等表重建（仅当现有建表 SQL 缺 diagnosis_phase 时执行；BEGIN/COMMIT 保证原子）
    try {
      const tpl = this.db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='session_events'"
      ).get() as { sql?: string } | undefined;
      if (tpl?.sql && !tpl.sql.includes('diagnosis_phase')) {
        this.db.exec('BEGIN');
        try {
          this.db.exec(`
            CREATE TABLE session_events_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
              seq INTEGER NOT NULL,
              event_type TEXT NOT NULL CHECK(event_type IN ('message','tool_result','system','diagnosis_phase','diagnosis_module','diagnosis_report')),
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(session_id, seq)
            );
            INSERT INTO session_events_new (id, session_id, seq, event_type, payload_json, created_at)
              SELECT id, session_id, seq, event_type, payload_json, created_at FROM session_events;
            DROP TABLE session_events;
            ALTER TABLE session_events_new RENAME TO session_events;
            CREATE INDEX IF NOT EXISTS idx_session_events_sess ON session_events(session_id, seq);
          `);
          this.db.exec('COMMIT');
          log.info('session_events CHECK 约束已升级 — 诊断事件类型启用 (D487)');
        } catch (migErr) {
          this.db.exec('ROLLBACK');
          throw migErr;
        }
      }
    } catch (err) {
      log.warn({ err }, 'session_events 诊断事件约束迁移失败 — degraded（旧库继续用三事件类型）');
    }

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

  /**
   * D500: 消息写入（双写——agent_messages 兼容 + session_events 事件流下沉）。
   * 契约:
   *   @input  — sessionId, role, content
   *   @output — void（事件双写失败 → lastDegraded=true，铁律 31 降级信号传播）
   *   双写下沉决策（2026-08-22）: 8 处直连生产调用方（cli/im-inbound/graceful-shutdown/
   *     stuck-session-detector/restart-recovery）经本方法写入，自动获得事件流，
   *     无需逐个修改调用方。
   */
  addMessage(sessionId: string, role: MessageRow['role'], content: string): void {
    this.db.prepare('INSERT INTO agent_messages (session_id, role, content) VALUES (?,?,?)')
      .run(sessionId, role, content);
    // D500: 事件流双写（append-only，model-visible⟺logged 根基）
    // 2026-08-22 复核修正: 事件写入成功时重置 lastDegraded——降级信号反映"本次"结果，
    // 非历史粘滞（原实现一次失败后永久 true，transient 故障恢复后误报持续）
    const res = this.appendEvent(sessionId, 'message', { role, content });
    if (!res.ok) {
      log.error({ sessionId, role, error: res.error }, 'appendEvent 双写失败 — model-visible⟺logged 断裂');
      this.lastDegraded = true;
    } else {
      this.lastDegraded = false;
    }
    this.db.prepare('UPDATE agent_sessions SET updated_at=? WHERE id=?')
      .run(new Date().toISOString(), sessionId);
  }

  /**
   * D500: append-only 事件写入。
   * 契约（铁律 47 — 契约优先）:
   *   @input  — sessionId, eventType, payload（payload 序列化为 JSON 存 payload_json）
   *   @output — { ok: true, seq } | { ok: false, degraded: true, error }（写入失败显式降级，铁律 24/31）
   *   @error  — UNIQUE(session_id, seq) 冲突 → log.error + degraded（并发防线，seq 不重放）
   *   崩溃恢复: 续写基于 SELECT MAX(seq)（持久化 lastSeq），禁止内存 seq 回退（2026-08-22 缺陷②防线）
   *   seq 单调: 基于持久化 MAX(seq)+1，无内存计数器（缺陷①防线）
   */
  appendEvent(sessionId: string, eventType: SessionEventType, payload: unknown): AppendEventResult {
    try {
      // 持久化 lastSeq: 基于 MAX(seq) 续写，禁止内存回退（缺陷②防线）
      const row = this.db.prepare('SELECT MAX(seq) as max_seq FROM session_events WHERE session_id=?')
        .get(sessionId) as SqliteRow | undefined;
      const nextSeq = Number((row?.max_seq as number | null) ?? 0) + 1;
      this.db.prepare(
        'INSERT INTO session_events (session_id, seq, event_type, payload_json) VALUES (?,?,?,?)'
      ).run(sessionId, nextSeq, eventType, JSON.stringify(payload));
      return { ok: true, seq: nextSeq };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ sessionId, eventType, error: msg }, 'appendEvent 写入失败 — degraded');
      return { ok: false, degraded: true, error: msg };
    }
  }

  /** 读取某会话全部事件（按 seq 升序） */
  getEvents(sessionId: string): SessionEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM session_events WHERE session_id=? ORDER BY seq ASC'
    ).all(sessionId) as SqliteRow[];
    return rows.map((r) => ({
      id: Number(r.id), sessionId: r.session_id as string, seq: Number(r.seq),
      eventType: r.event_type as SessionEventType,
      payloadJson: r.payload_json as string, createdAt: r.created_at as string,
    }));
  }

  /**
   * D500: 从事件流投影消息历史（dsh-session deriveMessages 范式，B1）。
   * 契约:
   *   @input  — sessionId
   *   @output — MessageRow[]（按 seq 排序；投影 message/tool_result 两类 surface 事件，log-only 跳过）
   *   @degraded — 事件流含半截事件（缺尾部）→ log.warn + 返回可重建前缀 + lastDegraded=true（铁律 24）
   *   空事件流 → []（边界）
   *   model-visible ⟺ logged: 投影输出 = 模型看到的输入（不变量，测试断言）
   */
  deriveMessages(sessionId: string): MessageRow[] {
    const events = this.getEvents(sessionId);
    const messages: MessageRow[] = [];
    let truncated = false;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      try {
        const payload = JSON.parse(ev.payloadJson) as { role?: string; content?: string };
        if (ev.eventType !== 'message' && ev.eventType !== 'tool_result') continue; // log-only 跳过
        // tool_result 事件投影为 assistant 角色（2026-08-22 实测修正：Synova 消息契约
        // MessageRow.role = system|user|assistant，conversation-engine 用 assistant 承载工具结果；
        // 无独立 tool 角色——对齐现有模型，避免 MessageRow 类型膨胀）
        const role = ev.eventType === 'tool_result' ? 'assistant' : (payload.role as MessageRow['role']);
        if (role !== 'user' && role !== 'assistant' && role !== 'system') {
          log.warn({ sessionId, seq: ev.seq }, '事件 payload 角色非法 — 跳过');
          continue;
        }
        messages.push({
          id: Number(ev.seq), sessionId, role,
          content: payload.content ?? '', timestamp: ev.createdAt,
        });
      } catch (err) {
        // payload 非 JSON 或半截 → 截断检测
        truncated = true;
        log.warn({ sessionId, seq: ev.seq, err }, '事件 payload 解析失败 — 投影截断');
        break; // 半截事件: 停止投影（保留前缀），degraded
      }
    }
    if (truncated) {
      this.lastDegraded = true;
    }
    return messages;
  }

  /** D500 测试辅助: 把某会话最后一条事件 payload 改成非法 JSON（模拟物理半截/损坏） */
  corruptLastEventPayload(sessionId: string): void {
    this.db.prepare(
      "UPDATE session_events SET payload_json='{broken' WHERE session_id=? AND seq=(SELECT MAX(seq) FROM session_events WHERE session_id=?)"
    ).run(sessionId, sessionId);
  }

  getMessages(sessionId: string): MessageRow[] {
    // D500 复核修复: getMessages backing deriveMessages —— 消息真相统一从事件流派生
    // （dev doc §4.1 "deriveMessages backing getMessages" 字面意图）。
    // 原实现直接查 agent_messages（mutable 快照），缺陷 A 根源——事件流才是唯一事实源。
    // agent_messages 表保留为兼容 + FTS5 触发器源（双写下沉），但读取走事件派生。
    // data-exporter 等消费者只读 role/content，id 语义（seq vs 自增）不影响。
    return this.deriveMessages(sessionId);
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
