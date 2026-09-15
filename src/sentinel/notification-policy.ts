/**
 * src/sentinel/notification-policy.ts — D716 状态驱动通知决策（纯函数）+ 通知状态表 + 升级队列
 *
 * 六态映射 = SYNOVA-IMPL-DSH-D716-D1-monitoring-contract-20260913.md §5.2-H（D-1 创始人裁定 §二）。
 * 决策顺序: resolved/dismissed（终态静默）→ 实质变化（恶化/新实体, 立刻打扰）→ acknowledged（静默转节奏）
 *   → 首次 → 抖动合并 → 24h 未回应提醒（一次）→ 7 天停滞进首页（一次）→ 默认静默。
 *
 * 行为等价性声明（spec §5.2-H）: 无契约/无工单/无状态行 → notify/first（与今天首次推送等价）;
 * 显式差异仅四条（①已认领不即时推 ②24h 提醒一次 ③7 天进首页 ④渠道/节奏/格式按契约）。
 *
 * 架构: L3 洞察层（决策纯函数 + L5 邻接状态表读写, 与 sentinel-events.ts 三件套同型）。
 */
import type Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';
import { loadMonitoringContract, contractForSentinel } from './monitoring-contract';
import type { ReportFormat, ResolvedContract } from './monitoring-contract';

const log = createLogger('sentinel/notification-policy');

// 单源 re-export（避免类型双源 — types.ts 不另定义）
export type { ResolvedContract, ReportFormat } from './monitoring-contract';
/** 决策函数的契约入参形态（= monitoring-contract.ResolvedContract 单源别名） */
export type ResolvedContractInput = ResolvedContract;

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 既有去重窗口缺省（抖动合并器 — runner.resolveNotificationDedupMs 同值; D-1 裁定 1: 只合并抖动, 不承担产品语义） */
const DEFAULT_JITTER_WINDOW_MS = 5 * 60 * 1000;

// ═══ Types ═══
// 值域形态: as const 值列表 + typeof 派生 — 单一事实源（同 monitoring-contract.ts 模式）。
// TicketStatus 值域与 runner.TicketStatus（D580 DDL CHECK 枚举）一致 — 本模块不 import runner
// 避免运行时环; 值域约束由 wiring 测试与 DDL CHECK 双重锚定。

const TICKET_STATUS_VALUES = ['open', 'acknowledged', 'resolved', 'dismissed'] as const;
/** 工单四态（值域与 runner.TicketStatus 一致） */
export type TicketStatusValue = typeof TICKET_STATUS_VALUES[number];

/** 通知状态表行（列名对齐 DDL） */
export interface NotificationStateRow {
  signal_id: string;
  sentinel_id: string;
  first_notified_ms: number;
  last_notified_ms: number;
  /** 变化检测基准（§5.2-H 行 5: rank 上升才打扰） */
  last_notified_severity: string;
  /** JSON 数组字符串（关联实体集指纹） */
  entities: string;
  notified_count: number;
  /** 24h 提醒已发（幂等锚 — 只提醒一次） */
  reminded_at_ms: number | null;
  /** 已进周报首页（幂等锚） */
  front_page_at_ms: number | null;
  resolved_at_ms: number | null;
}

/** decideNotification 输入 */
export interface DecideNotificationInput {
  sentinelId: string;
  signalId: string;
  severity: 'emergency' | 'critical' | 'warning' | 'info';
  /** 本次关联实体（指纹用 — 出现新增 = 实质变化） */
  entities: string[];
  /** 注入时钟（测试确定性） */
  nowMs: number;
  ticket?: { status: TicketStatusValue; created_at: string; resolved_at: string | null };
  /** 该 signal 的历史通知状态（无 = 首次） */
  state?: NotificationStateRow;
  /** 抖动合并窗口（缺省 5min = 既有去重窗口口径） */
  jitterWindowMs?: number;
}

/** 决策输出（§5.2-D 契约正文） */
export type NotifyAction =
  | { action: 'notify'; kind: 'first' | 'change'; channels: string[]; reason: string }
  | { action: 'remind'; kind: 'no_response'; channels: string[]; hoursSinceFirstNotify: number }
  | { action: 'front_page'; stalledDays: number; reason: string } // 不即时推送, 进周报首页队列
  | { action: 'silent'; reason: 'acknowledged' | 'dismissed' | 'resolved' | 'jitter_merge' | 'no_change' };

/** 升级队列项（spec §5.2-F — Mac → Win 的唯一接口面: 未回应/停滞清单） */
export interface EscalationQueueItem {
  signalId: string;
  sentinelId: string;
  severity: string;
  ticketId: string | null;
  ticketStatus: TicketStatusValue;
  stalledDays: number;
  reason: 'no_response' | 'stalled';
  channels: string[];
  format: ReportFormat;
}

// ═══ 通知状态表 DDL + 三件套（形态对齐 sentinel-events.ts: 建表 + 读 + 写） ═══

const NOTIFICATION_STATE_DDL = `
  CREATE TABLE IF NOT EXISTS sentinel_notification_state (
    signal_id              TEXT PRIMARY KEY,
    sentinel_id            TEXT NOT NULL,
    first_notified_ms      INTEGER NOT NULL,
    last_notified_ms       INTEGER NOT NULL,
    last_notified_severity TEXT NOT NULL,
    entities               TEXT NOT NULL DEFAULT '[]',
    notified_count         INTEGER NOT NULL DEFAULT 1,
    reminded_at_ms         INTEGER,
    front_page_at_ms       INTEGER,
    resolved_at_ms         INTEGER
  );
`;

/**
 * createNotificationStateTable — 通知状态表建表（幂等, runner.start() 调用 — 与既有两张表同址）
 * 契约:
 *   @input  — db: better-sqlite3 Database
 *   @output — void（表不存在则建, 存在则 no-op）
 *   @degraded — 建表失败 → log.error + 抛错（fail-closed; 调用方 runner.start catch + log.warn 降级 — 既有两张表同模式）
 *   @error  — db 不可用 / SQL 失败 → 抛
 */
export function createNotificationStateTable(db: Database.Database): void {
  try {
    db.exec(NOTIFICATION_STATE_DDL);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '[notification-state] 建表失败');
    throw err;
  }
}

/**
 * readNotificationState — 读某 signal 的通知状态
 * 契约:
 *   @input  — db; signalId
 *   @output — NotificationStateRow | null（无行/读失败 → null）
 *   @degraded — 表不存在/db 失败 → log.warn + 返回 null（**不**降级为"已通知过"——宁可多发一次, 不吞真实告警; spec §5.2-E）
 *   @error  — 不抛
 */
export function readNotificationState(db: Database.Database, signalId: string): NotificationStateRow | null {
  try {
    const row = db.prepare('SELECT * FROM sentinel_notification_state WHERE signal_id = ?').get(signalId);
    if (!row) return null;
    return row as NotificationStateRow;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, signalId, table: 'sentinel_notification_state' }, '[notification-state] 读取失败 — 按未通知处理（宁可多发, 不吞真告警）');
    return null;
  }
}

/**
 * upsertNotificationState — 状态行落账（幂等锚 reminded_at_ms / front_page_at_ms 由调用方构造后整行写入）
 * 契约:
 *   @input  — db; row: 全字段行
 *   @output — void
 *   @degraded — 写失败 → 抛（调用方 runner 派发点 catch + log.warn — 派发不被阻断, spec T11）
 *   @error  — 表不存在/db 失败 → 抛（fail-closed 暴露问题, 降级单点在调用方）
 */
export function upsertNotificationState(db: Database.Database, row: NotificationStateRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO sentinel_notification_state
     (signal_id, sentinel_id, first_notified_ms, last_notified_ms, last_notified_severity, entities, notified_count, reminded_at_ms, front_page_at_ms, resolved_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.signal_id, row.sentinel_id, row.first_notified_ms, row.last_notified_ms,
    row.last_notified_severity, row.entities, row.notified_count,
    row.reminded_at_ms, row.front_page_at_ms, row.resolved_at_ms,
  );
}

// ═══ 决策纯函数 ═══

/** severity 档位（info < warning < critical < emergency — 档位上升 = 实质变化） */
const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, critical: 2, emergency: 3 };

/** entities 变化检测: 新增实体出现 = 实质变化（parse 失败 → 视为变化, 宁可多发） */
function hasNewEntities(inputEntities: string[], stateEntitiesJson: string): boolean {
  let prev: string[];
  try {
    const parsed: unknown = JSON.parse(stateEntitiesJson);
    prev = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return true; // 状态损坏 → 视为变化（不吞真告警）
  }
  return inputEntities.some((e) => !prev.includes(e));
}

/**
 * decideNotification — 状态驱动的通知决策（D-1 六态映射, §5.2-H）
 * 契约:
 *   @input  — input: { sentinelId; signalId; severity; entities; nowMs（注入时钟）; ticket?; state?; jitterWindowMs? }
 *             contract: ResolvedContract（loadMonitoringContract + contractForSentinel 输出）
 *   @output — NotifyAction（纯函数, 无 IO, 无副作用）:
 *             notify/first（新发现）/ notify/change（实质变化: 档位上升或实体新增）
 *             remind/no_response（超 remind_after_hours 未回应且未提醒过, 一次）
 *             front_page（工单 open|acknowledged 停滞超 front_page_after_days 且未进过首页, 一次）
 *             silent/{acknowledged|dismissed|resolved|jitter_merge|no_change}
 *   @degraded — 无 IO 故无降级路径; 上游 loader 的 degraded 由调用方传播（不改动作语义, 只记日志）
 *   @error  — 不抛
 */
export function decideNotification(input: DecideNotificationInput, contract: ResolvedContract): NotifyAction {
  const { state, ticket } = input;
  const status = ticket?.status;

  // 行 7/8 终态: 已解决 / 明确不处理 → 永不推送（resolved 复验关闭; dismissed 沉默 ≠ 消失, 进每周回顾清单）
  if (status === 'resolved') return { action: 'silent', reason: 'resolved' };
  if (status === 'dismissed') return { action: 'silent', reason: 'dismissed' };

  // 行 5 有实质变化 → 立刻再告警（即使已认领 — 恶化配打扰; D-1 §二行 4）
  if (state) {
    const rankUp = (SEVERITY_RANK[input.severity] ?? 0) > (SEVERITY_RANK[state.last_notified_severity] ?? 0);
    const entityNew = hasNewEntities(input.entities, state.entities);
    if (rankUp || entityNew) {
      return { action: 'notify', kind: 'change', channels: contract.channels, reason: rankUp ? 'severity_rank_up' : 'entities_new' };
    }
  }

  // 行 4 已认领/处理中 → 停止重复, 转约定节奏（cadence 汇总, 不即时）
  if (status === 'acknowledged') return { action: 'silent', reason: 'acknowledged' };

  // 行 1 新发现 → 立刻告警（Win 侧在此挂「沟通请求」— kind='first' 即锚点）
  if (!state) {
    return { action: 'notify', kind: 'first', channels: contract.channels, reason: 'first_observation' };
  }

  // 抖动合并器（D-1 裁定 1: 5min 窗口只合并同 checker 数十秒重复, 不承担产品语义）
  const jitterMs = input.jitterWindowMs ?? DEFAULT_JITTER_WINDOW_MS;
  if (input.nowMs - state.last_notified_ms < jitterMs) {
    return { action: 'silent', reason: 'jitter_merge' };
  }

  // 行 3 未回应超时 → 提醒一次（落账 reminded_at_ms 后不再触发 — 幂等）
  const remindAfterMs = contract.escalation.remind_after_hours * HOUR_MS;
  if (status === 'open' && state.reminded_at_ms === null && input.nowMs - state.first_notified_ms >= remindAfterMs) {
    return {
      action: 'remind',
      kind: 'no_response',
      channels: contract.channels,
      hoursSinceFirstNotify: Math.floor((input.nowMs - state.first_notified_ms) / HOUR_MS),
    };
  }

  // 行 6 停滞超期 → 进周报首页队列（不即时推送; 落账 front_page_at_ms 后不再触发 — 幂等）
  if (ticket && (status === 'open' || status === 'acknowledged') && state.front_page_at_ms === null) {
    const createdMs = Date.parse(ticket.created_at);
    if (!Number.isNaN(createdMs)) {
      const stalledMs = input.nowMs - createdMs;
      if (stalledMs >= contract.escalation.front_page_after_days * DAY_MS) {
        return { action: 'front_page', stalledDays: Math.floor(stalledMs / DAY_MS), reason: 'stalled_over_threshold' };
      }
    }
  }

  // 行 2 已告知待回应（< remind 阈值, 无变化）→ 等老板表态（升级才打扰, 不重复）
  return { action: 'silent', reason: 'no_change' };
}

// ═══ 升级队列读接口（Mac → Win 唯一接口面, spec §5.2-F） ═══

/**
 * listEscalationQueue — 未回应 / 停滞问题清单（供 Win 周报"需要你关注的事"消费）
 * 契约:
 *   @input  — db; opts?: { nowMs?（缺省 Date.now）; minStalledDays?（额外停滞天数下限, 缺省 0） }
 *   @output — EscalationQueueItem[]（空集 → []）; reason: no_response（未回应, 优先）| stalled（停滞进首页）
 *   @degraded — 契约 loader 失败 → 内部已降级全默认（不影响队列产出）; db 不可用 → 抛（由 L2 调用方统一降级, 与 listSentinelTickets 同口径）
 *   @error  — 表不存在（start() 未调用）→ 抛出（同 listSentinelTickets）
 */
export function listEscalationQueue(
  db: Database.Database,
  opts?: { nowMs?: number; minStalledDays?: number },
): EscalationQueueItem[] {
  const now = opts?.nowMs ?? Date.now();
  const minStalledDays = opts?.minStalledDays ?? 0;
  const rows = db.prepare('SELECT * FROM sentinel_notification_state ORDER BY last_notified_ms DESC LIMIT 500').all() as NotificationStateRow[];
  const ticketStmt = db.prepare(
    'SELECT id, status, created_at FROM sentinel_tickets WHERE signal_id = ? ORDER BY created_at DESC LIMIT 1',
  );

  const contract = loadMonitoringContract(); // mtime 记忆化 — 低开销; 内部自降级不抛
  const out: EscalationQueueItem[] = [];
  for (const row of rows) {
    const ticket = ticketStmt.get(row.signal_id) as { id: string; status: TicketStatusValue; created_at: string } | undefined;
    if (!ticket) continue; // 无工单（数据不完整）→ 无法判停滞, 跳过
    const rc = contractForSentinel(contract, row.sentinel_id);
    const createdMs = Date.parse(ticket.created_at);
    const stalledDays = Number.isNaN(createdMs) ? 0 : Math.floor((now - createdMs) / DAY_MS);

    if (ticket.status === 'open' && row.reminded_at_ms === null
      && now - row.first_notified_ms >= rc.escalation.remind_after_hours * HOUR_MS) {
      out.push({
        signalId: row.signal_id, sentinelId: row.sentinel_id, severity: row.last_notified_severity,
        ticketId: ticket.id, ticketStatus: ticket.status, stalledDays,
        reason: 'no_response', channels: rc.channels, format: rc.format,
      });
    } else if ((ticket.status === 'open' || ticket.status === 'acknowledged') && row.front_page_at_ms === null
      && stalledDays >= Math.max(rc.escalation.front_page_after_days, minStalledDays)) {
      out.push({
        signalId: row.signal_id, sentinelId: row.sentinel_id, severity: row.last_notified_severity,
        ticketId: ticket.id, ticketStatus: ticket.status, stalledDays,
        reason: 'stalled', channels: rc.channels, format: rc.format,
      });
    }
  }
  return out;
}
