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

// ═══ D593: 报告归档行（diagnosis_checkpoints phase=5）类型与结构守卫 ═══

/**
 * D593: 报告归档行 partial_report 的窄化结果类型——consult/对话桥两路线写侧的同一形状
 * （spec §5.2-A）。report 为**消费面子集内联类型**（本仓库读侧只消费 summary + 透传 +
 * onePager 渲染入口；完整 L3 DiagnosisReport 形状守卫归 L1 渲染边界——铁律 39 层内自洽，
 * 对齐 conversations.ts isEngineStateLike 只验消费字段的哲学）。
 */
export interface DiagnosisReportArchive {
  /** 归档键 = reportId（rpt_xxx，与 checkpoint session_id 同值） */
  reportId: string;
  teamId: string;
  /** 诊断完成时刻（ISO，读侧展示用；SQL 排序键为 saved_at） */
  completedAt: string;
  /** consult 路线附带（对话桥路线无该概念，spec §5.2-A） */
  consultId?: string;
  /** 落盘来源路线（'consult' | 'conversation'） */
  source?: string;
  /** 完成时渲染的一页纸；raw 深度/渲染失败为 null/缺省 → GET 按需补渲染 */
  onePager?: string | null;
  /** 完整报告对象（读侧验证 summary 消费字段；其余字段透传渲染层自查） */
  report: { summary: string } & Record<string, unknown>;
}

/**
 * D593: checkpoint partial_report 报告归档行结构守卫——JSON.parse 结果不盲信
 * （铁律 38：类型守卫替代断言，对齐 conversations.ts isEngineStateLike 形态）。
 *
 * 架构位（铁律 39 + D563 先例）: 本谓词属 L5 存储层——checkpoint 行内容归存储层解释；
 * L1（routes/diagnosis.ts 列表端点 / GET report 冷读 fallback）经既有动态 import 通道
 * 解构使用，不经行任何 L5 静态引用。
 *
 * 契约（铁律 47）:
 *   @input    — v: unknown（JSON.parse(partial_report) 结果，形状不可信）
 *   @output   — 类型谓词；true = 可安全作为 DiagnosisReportArchive 消费（读侧消费字段已验证）
 *   @degraded — false（非对象/缺关键字段/字段类型不符）→ 调用方 log.warn + 跳过该行或 404
 *              （诚实降级，不静默，铁律 24）
 */
export function isDiagnosisReportArchive(v: unknown): v is DiagnosisReportArchive {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.reportId !== 'string' || o.reportId.length === 0) return false;
  if (typeof o.teamId !== 'string') return false;
  if (typeof o.completedAt !== 'string') return false;
  if (o.consultId !== undefined && typeof o.consultId !== 'string') return false;
  if (o.source !== undefined && typeof o.source !== 'string') return false;
  if (o.onePager !== undefined && o.onePager !== null && typeof o.onePager !== 'string') return false;
  // report 对象：读侧消费字段 = summary（列表/降级文案）；其余字段由渲染层完整形状守卫把关
  const r = o.report;
  if (typeof r !== 'object' || r === null) return false;
  if (typeof (r as Record<string, unknown>).summary !== 'string') return false;
  return true;
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

/**
 * D820: 报告列表的「会话存在性」谓词（total 与 rows 共用同一条，防两套口径）。
 *
 * 语义：只隐藏**链到已不存在会话**的归档行（删会话的纵深防御——级联删除已覆盖主路径，
 * 本谓词兜住旧库/旧二进制删过会话留下的孤儿）。
 *
 * ⚠️ 为什么不是裸 `EXISTS (SELECT 1 FROM agent_sessions ...)`：phase=5 归档行的 session_id
 * 存的是 **reportId**（consult 路线 diagnosis.ts:600-602、对话桥 conversations.ts:307-309），
 * 永无对应 agent_sessions 行 → 裸 EXISTS 会把**全部 GA 报告**从列表抹掉（比原缺陷更严重）。
 * 故 `origin_session_id IS NULL`（consult 报告 + 全部存量旧行）一律照旧列出。
 */
const PHASE5_LIST_PREDICATE =
  'phase = 5 AND (origin_session_id IS NULL OR EXISTS (SELECT 1 FROM agent_sessions s WHERE s.id = diagnosis_checkpoints.origin_session_id))';

// ═══ SessionStore ═══

export class SessionStore {
  private db: Database.Database;

  /**
   * D500: 降级信号传播（铁律 31）——appendEvent 双写失败时置 true，
   * 调用方（SessionManager model-visible⟺logged 断言）检查。
   *
   * D822 语义澄清：本字段 = **最近一次** appendEvent 的结果（成功即复位 false），
   * 故它是**逐条**断言语义（`session-manager.ts:86` 每写一条 msg 就断言一次），
   * **不能**用来回答"这一轮有没有失败过"——同一轮"失败→成功"会把失败事实抹掉
   * （D822 缺陷：路由层据此判定 ⇒ STORE_DEGRADED 帧漏发）。
   * 需要"本轮发生过失败"的调用方请用 `addMessage` 的返回值逐条判定，
   * 或读累计计数 `appendFailureCount`。
   */
  lastDegraded = false;

  /**
   * D822: appendEvent 双写失败**累计**计数（本实例生命周期内只增不减）。
   *
   * 为什么需要它（范式来源：`@deepseek-ai/dsh-session-stats/lib/index.js:11,103,129`——
   * 事件流逐条累计落账，`steps: state.steps + 1` / `llmMs: state.llmMs + ...`，
   * **每个事件独立入账、不被后续事件覆盖**；其 step/end 放在 `finally` 里，
   * 所以 completed/failed/cancelled/max-tokens 四种结束都留一条）：
   * 本项目原实现用一个**会被后续成功重置的瞬时布尔**（`lastDegraded`）承载降级事实，
   * 一旦"同一轮内先失败后成功"，失败事实即消失——这正是 D822 的缺陷本体。
   * 修法是把失败**累加**下来，而不是**覆盖**掉。
   *
   * 消费者（防死代码，铁律 37）:
   *   ① 本卡两处测试真断言它：`tests/store/degraded-signal-not-masked.test.ts`、
   *      `tests/store/session-event-log.test.ts`（"失败不因后续成功消失"用例）；
   *   ② **D831（P-2 不变量机制）断言③「降级信号不被后续成功写入抹掉」的物理探针面**
   *      （`task-state/D831.json` 验收点 6 原文；队长 2026-09-20 批 Q-B 条件）。
   */
  appendFailureCount = 0;

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

    // D820: 归档行 → 来源会话链（幂等迁移，同 :275 user_id idiom；旧库自动补列）
    // 必要性：phase=5 行的 session_id 存的是 **reportId**（consult 路线 diagnosis.ts:600-602、
    // 对话桥路线 conversations.ts:307-309），**不是** chat 会话 id，且该表无 FK/无 CASCADE →
    // 删会话时按 session_id 删匹配不到任何行。本列是「删会话 → 报告真删」的物理依据。
    try { this.db.exec('ALTER TABLE diagnosis_checkpoints ADD COLUMN origin_session_id TEXT'); } catch { log.debug('origin_session_id 列已存在 — 跳过迁移'); }

    // M1-Slice2: 迁移旧数据库 (添加 user_id 列，幂等)
    try { this.db.exec('ALTER TABLE agent_sessions ADD COLUMN user_id TEXT'); } catch { log.debug('user_id 列已存在 — 跳过迁移'); }

    // ═══ FTS5 同步触发器 ═══
    // D820-FTS（**卡外阻塞缺陷，经队长 2026-09-20 授权折入本批**，单独 commit）:
    //   旧实现的 AFTER DELETE 触发器用了 **contentless 专用** 的 ('delete', ...) 命令，而本表是
    //   普通 FTS5 表（:221-225，无 content=''）→ SQLite 3.53 物理拒绝 → 任何
    //   `DELETE FROM agent_messages` 抛 "SQL logic error" → deleteSession 全路径失败
    //   （DELETE /api/sessions/:id → 500），且 FTS 索引里残留已"删除"消息的**全文**（隐私面）。
    //   修法（不动列定义、不改 contentless —— snippet() 能力必须保持，D826 波2 依赖）:
    //     插入显式落 rowid ≡ agent_messages.id；删除改普通 DELETE ... WHERE rowid = old.id。
    const ftsTriggerRows = this.db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name IN ('agent_msg_fts_insert','agent_msg_fts_delete')",
    ).all() as Array<{ name: string; sql: string | null }>;
    const hasLegacyDeleteTrigger = ftsTriggerRows.some(r => (r.sql ?? '').includes("'delete'"));
    const hasLegacyInsertTrigger = ftsTriggerRows.some(r => r.name === 'agent_msg_fts_insert' && !(r.sql ?? '').includes('rowid'));
    const needsFtsTriggerRepair = hasLegacyDeleteTrigger || hasLegacyInsertTrigger;
    if (needsFtsTriggerRepair) {
      log.warn({ hasLegacyDeleteTrigger, hasLegacyInsertTrigger },
        'D820-FTS: 检出失效的 FTS 同步触发器 — 重建（旧库迁移路径）');
      this.db.exec('DROP TRIGGER IF EXISTS agent_msg_fts_insert; DROP TRIGGER IF EXISTS agent_msg_fts_delete;');
    }
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS agent_msg_fts_insert AFTER INSERT ON agent_messages BEGIN
        INSERT INTO agent_messages_fts(rowid, session_id, content) VALUES (new.id, new.session_id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS agent_msg_fts_delete AFTER DELETE ON agent_messages BEGIN
        DELETE FROM agent_messages_fts WHERE rowid = old.id;
      END;
    `);
    if (needsFtsTriggerRepair) {
      // 一次性索引对齐（仅旧库、仅本分支一次；新库不跑）：旧插入触发器未显式落 rowid，
      // FTS rowid 可能与 agent_messages.id 漂移 → 按 rowid 删会漏（残留消息全文）。
      // 写放大操作，故 log 出来（可观测，铁律 24/31 精神）。
      const messagesBefore = Number((this.db.prepare('SELECT COUNT(*) AS c FROM agent_messages').get() as { c: number }).c);
      const ftsRowsBefore = Number((this.db.prepare('SELECT COUNT(*) AS c FROM agent_messages_fts').get() as { c: number }).c);
      this.db.exec('DELETE FROM agent_messages_fts');
      this.db.exec('INSERT INTO agent_messages_fts(rowid, session_id, content) SELECT id, session_id, content FROM agent_messages');
      log.warn({ messages: messagesBefore, ftsRowsBefore },
        'D820-FTS: FTS 索引按 agent_messages.id 全量重建完成（对齐 rowid + 清掉已删消息的残留索引）');
    }
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

  /**
   * D820: 删除会话（级联——会话的**全部**数据，含诊断检查点/报告归档行）。
   * 契约（铁律 47 — 契约优先）:
   *   @input  — id: 会话 id
   *   @output — void；**真删**（物理 DELETE，无软删除、无 deleted_at 列）
   *   @cascade — ① agent_messages（兼容表，FTS 由触发器同步）
   *              ② diagnosis_checkpoints：键=sessionId 的 resume 行（phase<5，launcher 用 chat
   *                 sessionId 写）+ 键=reportId 但 origin_session_id=id 的 phase=5 归档行
   *              ③ session_events（FK ON DELETE CASCADE，better-sqlite3 实测 foreign_keys=1）
   *              ④ agent_sessions 本体
   *   @note D820 修复前只删 ①④ → 删会话后诊断报告仍可经 GET /api/diagnosis/reports 列出
   *         （客户数据资产/隐私面，判据 D）。
   */
  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM agent_messages WHERE session_id=?').run(id);
    this.deleteDiagnosisCheckpoints(id);
    this.db.prepare('DELETE FROM agent_sessions WHERE id=?').run(id);
  }

  // ═══ Messages ═══

  /**
   * D500: 消息写入（双写——agent_messages 兼容 + session_events 事件流下沉）。
   * 契约（铁律 47 — 契约优先；D822 修订输出面）:
   *   @input  — sessionId, role, content
   *   @output — **AppendEventResult（透传 appendEvent 结果）**：
   *             `{ ok: true, seq }` = 双写都成功；`{ ok: false, degraded: true, error }` = 事件流写入失败
   *             （兼容表 agent_messages 可能已写成功 → 这正是 model-visible⟺logged 断裂）。
   *             **调用方必须按本次返回值判定本轮是否降级**，不得只看 `lastDegraded`
   *             （后者是"最近一次写"的瞬时标志，同一轮"失败→成功"会把失败抹掉 —— D822 缺陷）。
   *   @degraded — 写入失败：log.error + lastDegraded=true（逐条语义）+ appendFailureCount += 1（累计，只增不减）
   *   双写下沉决策（2026-08-22）: 8 处直连生产调用方（cli/im-inbound/graceful-shutdown/
   *     stuck-session-detector/restart-recovery）经本方法写入，自动获得事件流，
   *     无需逐个修改调用方。返回类型由 void 改为结果对象对既有调用方**向后兼容**
   *     （TS 下 `(...) => void` 窄接口接受有返回值的实现，故各 SessionStoreLike 无需改）。
   */
  addMessage(sessionId: string, role: MessageRow['role'], content: string): AppendEventResult {
    this.db.prepare('INSERT INTO agent_messages (session_id, role, content) VALUES (?,?,?)')
      .run(sessionId, role, content);
    // D500: 事件流双写（append-only，model-visible⟺logged 根基）
    // 2026-08-22 复核修正: 事件写入成功时重置 lastDegraded——降级信号反映"本次"结果，
    // 非历史粘滞（原实现一次失败后永久 true，transient 故障恢复后误报持续）。
    // D822: 该"复位"只限 lastDegraded（逐条断言语义）；失败事实本身由 appendFailureCount 累计承载，
    //        调用方按返回值逐条判定本轮是否发生失败。
    const res = this.appendEvent(sessionId, 'message', { role, content });
    if (!res.ok) {
      log.error({ sessionId, role, error: res.error }, 'appendEvent 双写失败 — model-visible⟺logged 断裂');
      this.lastDegraded = true;
    } else {
      this.lastDegraded = false;
    }
    this.db.prepare('UPDATE agent_sessions SET updated_at=? WHERE id=?')
      .run(new Date().toISOString(), sessionId);
    return res;
  }

  /**
   * D500: append-only 事件写入。
   * 契约（铁律 47 — 契约优先）:
   *   @input  — sessionId, eventType, payload（payload 序列化为 JSON 存 payload_json）
   *   @output — { ok: true, seq } | { ok: false, degraded: true, error }（写入失败显式降级，铁律 24/31）
   *   @error  — UNIQUE(session_id, seq) 冲突 → log.error + degraded（并发防线，seq 不重放）
   *   @degraded — 失败同时 `appendFailureCount += 1`（D822：失败**累加**入账，不被后续成功覆盖）
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
      this.appendFailureCount += 1; // D822: 累计入账（只增不减）——见字段 JSDoc
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

  /**
   * 保存诊断检查点 (每个 Phase 完成后调用)。
   *
   * 契约（铁律 47 — 契约优先）:
   *   @input  — checkpoint: { sessionId, phase, completedModules, partialReport, savedAt,
   *             originSessionId? }。**sessionId 语义分两种**（如实记录，勿混）：
   *             · phase<5 resume 行（diagnosis-launcher.ts:166）→ sessionId = chat 会话 id
   *             · phase=5 归档行（diagnosis.ts:600 / conversations.ts:307）→ sessionId = **reportId**
   *             originSessionId（D820 新增，可选）— 该归档行**归属的会话 id**；对话桥路线
   *             记 chat sessionId，consult 路线无 chat 会话可链 → 不传（列表侧照旧可见）。
   *   @output — void（落库；PK = (session_id, phase)）
   *   @upsert — 同键重写时 originSessionId 缺省**保留原链**（COALESCE），
   *             防「后一次不携带来源的写」把归因抹掉（键=reportId 的两路线并存场景）。
   *   @error  — 落库异常上抛，调用方 catch + log.warn + degraded
   *             （conversations.ts:320-322 / diagnosis.ts:615-617 既有语义，不改）。
   */
  saveDiagnosisCheckpoint(checkpoint: {
    sessionId: string; phase: number; completedModules: string[];
    partialReport: unknown; savedAt: string;
    /** D820: 归档行归属的会话 id（可选；缺省不覆盖已有链） */
    originSessionId?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO diagnosis_checkpoints (session_id, phase, completed_modules, partial_report, saved_at, origin_session_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, phase) DO UPDATE SET
        completed_modules = excluded.completed_modules,
        partial_report = excluded.partial_report,
        saved_at = excluded.saved_at,
        origin_session_id = COALESCE(excluded.origin_session_id, diagnosis_checkpoints.origin_session_id)
    `).run(
      checkpoint.sessionId, checkpoint.phase,
      JSON.stringify(checkpoint.completedModules),
      JSON.stringify(checkpoint.partialReport),
      checkpoint.savedAt,
      checkpoint.originSessionId ?? null,
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

  /**
   * D820: 删除某会话的**全部**诊断检查点（会话清理的级联入口；调用方 = deleteSession）。
   * 契约:
   *   @input  — sessionId（chat 会话 id）
   *   @output — void
   *   @scope  — ① 键=sessionId 的行（phase<5 resume 检查点，launcher 用 chat sessionId 写）
   *             ② 键=reportId 但 origin_session_id=sessionId 的归档行（对话桥 phase=5 报告）
   *   @note   修复前本方法全仓零调用者（D820 基线实证）→ 删会话不删报告。
   */
  deleteDiagnosisCheckpoints(sessionId: string): void {
    this.db.prepare('DELETE FROM diagnosis_checkpoints WHERE session_id = ?').run(sessionId);
    this.db.prepare('DELETE FROM diagnosis_checkpoints WHERE origin_session_id = ?').run(sessionId);
  }

  /**
   * D593: 诊断报告列表读（报告归档行 = diagnosis_checkpoints phase=5，键=reportId）。
   *
   * 契约（铁律 47 — 契约优先，spec §5.2-C）:
   *   @input    — opts: { limit: number, offset: number }（路由层已夹取；本方法再防御性
   *               夹取 limit 1..200、offset >= 0，sentinel findings 同款 idiom）
   *   @output   — { ok: true, total, degraded, reports: Array<{ reportId, teamId, completedAt,
   *               summary: string | null, onePagerAvailable: boolean }> }，按 saved_at DESC
   *               （rowid DESC 决同刻稳定序：后写先出）
   *   @filter（D820）— 会话存在性谓词（见 PHASE5_LIST_PREDICATE）：**已删会话的归档行不列出**
   *               （清单 API ≠ 库内残留）；`origin_session_id IS NULL` 的 consult 报告与存量
   *               旧行照旧列出（不误删）。total 与 rows 共用同一条谓词，口径一致。
   *   @degraded — 行级 partial_report JSON 损坏/形状非法 → log.warn + 跳过该行 + degraded: true
   *               （不 500，铁律 24）；total 恒为**过滤后** phase=5 行计数（不因跳过缩水）
   *   @error    — 查询异常 → { ok: false, degraded: true, error }（调用方路由映射 503 fail-closed）
   */
  listDiagnosisReports(opts: { limit: number; offset: number }):
    | { ok: true; total: number; degraded: boolean; reports: Array<{ reportId: string; teamId: string; completedAt: string; summary: string | null; onePagerAvailable: boolean }> }
    | { ok: false; degraded: true; error: string } {
    try {
      const limit = Math.min(Math.max(Math.trunc(opts.limit) || 0, 1), 200);
      const offset = Math.max(Math.trunc(opts.offset) || 0, 0);
      const totalRow = this.db.prepare(`SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE ${PHASE5_LIST_PREDICATE}`).get() as { c: number } | undefined;
      const total = Number(totalRow?.c ?? 0);
      const rows = this.db.prepare(
        `SELECT session_id, partial_report FROM diagnosis_checkpoints WHERE ${PHASE5_LIST_PREDICATE} ORDER BY saved_at DESC, rowid DESC LIMIT ? OFFSET ?`,
      ).all(limit, offset) as SqliteRow[];
      const reports: Array<{ reportId: string; teamId: string; completedAt: string; summary: string | null; onePagerAvailable: boolean }> = [];
      let degraded = false;
      for (const row of rows) {
        const sessionId = typeof row.session_id === 'string' ? row.session_id : '';
        try {
          const partial: unknown = JSON.parse(typeof row.partial_report === 'string' ? row.partial_report : 'null');
          if (!isDiagnosisReportArchive(partial)) {
            // 形状不合规（损坏/非归档行误标 phase=5）→ 诚实跳过，不 500、不静默（铁律 24）
            log.warn({ sessionId }, 'listDiagnosisReports: partial_report 形状非法 — 跳过该行（degraded）');
            degraded = true;
            continue;
          }
          reports.push({
            reportId: partial.reportId,
            teamId: partial.teamId,
            completedAt: partial.completedAt,
            summary: partial.report.summary,
            onePagerAvailable: typeof partial.onePager === 'string' && partial.onePager.length > 0,
          });
        } catch (err) {
          log.warn({ err, sessionId }, 'listDiagnosisReports: partial_report JSON 损坏 — 跳过该行（degraded）');
          degraded = true;
        }
      }
      return { ok: true, total, degraded, reports };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg }, 'listDiagnosisReports 查询失败 — fail-closed');
      return { ok: false, degraded: true, error: msg };
    }
  }
}
