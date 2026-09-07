/**
 * store/session-projection.ts — 会话投影注册表（D588，DSH 借鉴卡 B-07）
 *
 * 范式锚点（读源码自研，零代码依赖 — G1/G4，铁律 46）:
 *   D:/deepseek-harness/packages/session/session-projection/lib/index.js（0.1.1-rc.2，逐行读全文）
 *
 * 在 D500 事件流（session-store.ts appendEvent/getEvents，append-only）之上提供
 * 「从事件流派生可查询状态」的统一投影层：
 *   - registerProjection({key, stateVersion, init, apply}) 注册投影单元；
 *   - eager drive: 每个已提交事件跑每个单元的 apply（经 appendEvent 订阅缝自动驱动）；
 *   - checkpoint: 每单元一行 {ver, seq, val}，val 为分离副本（structuredClone）；
 *   - restoreFloor: 可用行 min(seq+1) 再减一位（one-below 锚点）——尾读可证明日志未缩短；
 *   - restore: 行可用三条件（ver 匹配 / seq>=baseSeq-1 / seq<=endSeq）→ 增量续读，
 *     不可用行且 baseSeq>0 → 抛错要求从 seq 0 全量重读（crash-repair 截断防线）；
 *   - whole-value 断言: wholeValue 单元的状态必须由事件完整携带（替换式），
 *     apply(前状态,e) 与 apply(init,e) 不一致 = 裸 delta = log.warn + 违规记录（铁律 24）。
 *
 * whole-value event rule（承重不变量，DSH 原文）: 状态承载的日志事件必须携带完整
 * post-change 状态，禁止裸 delta——保证每个单元 transition 廉价、每个值自描述。
 *
 * 订阅缝（dev doc 写集 1 新建 + 0 修改的唯一接线方案）: 模块加载时原型级 wrap
 * SessionStore.prototype.appendEvent——生产 8+ 构造点（synova-agent/cli/bootstrap/
 * im-inbound 等）零修改自动获得 drive，import 即接线。事件先落盘后驱动；drive 异常
 * 只降级不回滚（事件已持久化，投影可随时经 restore 重放重建，铁律 24/31）。
 *
 * 契约（铁律 47）:
 *   @input  — ProjectionDefinition（init 返回 plain JSON 初态；apply 纯函数、无变化时
 *             返回原引用——Object.is 变更门）；事件按 seq 提交序到达（appendEvent 单调保证）
 *   @output — stateOf/checkpoint/restore 派生态；checkpoint val 为分离副本，调用方可安全改写
 *   @degraded — drive 异常 → log.warn + driveFailures 计数（不阻断事件落盘）；
 *               日志 payload 解析失败 → toProjectionEvents 截断前缀 + degraded:true
 */
import { createLogger } from '@synova/logger';
import {
  SessionStore,
  type SessionEvent,
  type SessionEventType,
  type AppendEventResult,
} from './session-store';

const log = createLogger('store/session-projection');

// ═══ Types ═══

/** 投影单元消费的事件（payload 已解析；驱动缝直通 appendEvent 原始 payload） */
export interface ProjectionEvent {
  seq: number;
  eventType: SessionEventType;
  payload: unknown;
}

/**
 * 投影单元定义（DSH ProjectionDefinition 范式）。
 * stateVersion: 非负安全整数——状态形状版本。checkpoint 行 ver 与定义不一致时，
 * 该行不可用（restoreFloor 归零 → 全量重放），这是版本迁移的唯一机制。
 * wholeValue: 声明本单元状态由事件完整携带（替换式 apply）→ 注册表机械断言；
 * 计数器类历史依赖单元不声明（断言按定义逐单元启用，不全局假设）。
 */
export interface ProjectionDefinition<S> {
  key: string;
  stateVersion: number;
  init: () => S;
  apply: (state: S, event: ProjectionEvent) => S;
  wholeValue?: boolean;
}

/** checkpoint 行（持久化契约: (sessionId, key, ver, seq, val) 的 key→行 部分） */
export interface ProjectionCheckpointRow {
  ver: number;
  seq: number;
  val: unknown;
}

export type ProjectionCheckpoint = Record<string, ProjectionCheckpointRow>;

/** whole-value 断言违规记录（getViolations 可读，保留最近 MAX_VIOLATIONS 条） */
export interface WholeValueViolation {
  sessionId: string;
  key: string;
  seq: number;
  detail: string;
}

/** restore 结果: 快照切片（asOfSeq + 各单元状态） + 刷新后的 checkpoint 行（可回写） */
export interface RestoreResult {
  snapshot: { asOfSeq: number; values: Record<string, unknown> };
  checkpoint: ProjectionCheckpoint;
}

/** 内部擦除单元（S → unknown 擦除；registry 对具体状态形状无感知） */
interface ErasedUnit {
  key: string;
  stateVersion: number;
  init: () => unknown;
  apply: (state: unknown, event: ProjectionEvent) => unknown;
  wholeValue: boolean;
}

/** 单元格: 已派生态 + 观察水位（已吸收的最大事件 seq；-1 = 空 log） */
interface Cell {
  state: unknown;
  observedSeq: number;
}

/** 违规日志容量上限（防无限增长；超出淘汰最旧） */
const MAX_VIOLATIONS = 200;

/** plain JSON 深等价（状态按契约是 plain JSON，键序由同一 apply 构造路径决定） */
function plainJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 分离副本（checkpoint val 永不暴露活单元格引用——调用方改写不得污染注册表） */
function detachedClone(v: unknown): unknown {
  return structuredClone(v);
}

// ═══ Registry ═══

export class SessionProjectionRegistry {
  private units = new Map<string, ErasedUnit>();
  /** sessionId → key → cell（cells 按会话 id 键——所有 SessionStore 实例共享同一底层日志） */
  private cells = new Map<string, Map<string, Cell>>();
  private listeners = new Set<(sessionId: string, key: string, state: unknown, seq: number) => void>();
  private violationLog: WholeValueViolation[] = [];

  /** 铁律 31: drive 异常计数（事件已落盘，投影可经 restore 重放重建——降级不回滚） */
  driveFailures = 0;

  /**
   * 注册投影单元。
   * @throws stateVersion 非非负安全整数 / key 重复注册（同 key 换版本须新注册表实例——
   *         对应进程重启后重新注册的生命周期，旧 checkpoint 行经 ver 不匹配全量重放迁移）
   */
  register<S>(definition: ProjectionDefinition<S>): void {
    if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 0) {
      throw new Error(
        `session projection ${JSON.stringify(definition.key)} stateVersion must be a non-negative integer, got ${String(definition.stateVersion)}`,
      );
    }
    if (this.units.has(definition.key)) {
      throw new Error(
        `session projection key ${JSON.stringify(definition.key)} is already registered (stateVersion ${String(this.units.get(definition.key)?.stateVersion)})`,
      );
    }
    const unit: ErasedUnit = {
      key: definition.key,
      stateVersion: definition.stateVersion,
      init: () => definition.init(),
      apply: (state, event) => definition.apply(state as S, event),
      wholeValue: definition.wholeValue === true,
    };
    this.units.set(unit.key, unit);
  }

  /** 订阅变更通知（Object.is 变更门通过后逐单元触发）。返回精确退订函数。 */
  onChanged(listener: (sessionId: string, key: string, state: unknown, seq: number) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 读取 whole-value 违规记录（不带参 = 全部；带 sessionId = 过滤；容量上限 MAX_VIOLATIONS） */
  getViolations(sessionId?: string): WholeValueViolation[] {
    if (sessionId === undefined) return [...this.violationLog];
    return this.violationLog.filter((v) => v.sessionId === sessionId);
  }

  /**
   * 读一个单元当前状态（惰性首触: fold source 日志全量构建）。
   * key 未注册 → undefined（capability absence 语义）。返回值为活引用，调用方不得改写。
   */
  stateOf(source: SessionStore, sessionId: string, key: string): unknown {
    const unit = this.units.get(key);
    if (unit === undefined) return undefined;
    return this.cellFor(unit, source, sessionId).state;
  }

  /**
   * 状态级 checkpoint: 每注册单元一行 {ver, seq, val}，val 为分离副本。
   * 缺单元格惰性 fold 全量日志构建（写侧持久化投影缓存的产出契约）。
   */
  checkpoint(source: SessionStore, sessionId: string): ProjectionCheckpoint {
    const rows: ProjectionCheckpoint = {};
    for (const unit of this.units.values()) {
      const cell = this.cellFor(unit, source, sessionId);
      rows[unit.key] = { ver: unit.stateVersion, seq: cell.observedSeq, val: detachedClone(cell.state) };
    }
    return rows;
  }

  /**
   * restore 尾读应从哪个 seq 开始: 最低可用水位再低一位（one-below 锚点，DSH 原样）。
   * 行可用 = 存在且 ver 匹配（否则该 key 归 0——必须重折全量日志）。
   * 锚点承重: 尾读从 row.seq 起（重交付水位事件），证明日志仍延伸到水位——
   * restore 据此检出日志缩短（crash-repair 截断）而非把过期行当现值服务。
   * @returns 尾读起点 seq；无注册单元 → undefined（无需读日志）
   */
  restoreFloor(checkpoint: ProjectionCheckpoint): number | undefined {
    let floor: number | undefined;
    for (const unit of this.units.values()) {
      const row = checkpoint[unit.key];
      const need = row !== undefined && row.ver === unit.stateVersion ? Math.max(row.seq + 1, 0) : 0;
      floor = floor === undefined ? need : Math.min(floor, need);
    }
    return floor === undefined ? undefined : Math.max(floor - 1, 0);
  }

  /**
   * 冷读: 从存储日志尾读恢复各单元状态（缓存态 + 前向尾读重放 的一读配方）。
   * 行可用三条件（DSH 原样）: ver 匹配 且 seq >= baseSeq-1（不早于尾读起点）
   * 且 seq <= endSeq（不声称超过日志末端）。不可用行丢弃、从 init 重折——
   * 这只在全量日志上可靠，故 baseSeq > 0 时抛错要求调用方从 seq 0 重读
   * （日志缩短场景；与 restoreFloor 的 one-below 锚点配套）。
   * @param events    — 自 baseSeq 起的已解析事件（seq 升序）
   * @param baseSeq   — events 起始 seq（非空时即首事件 seq；空尾读 = 请求的起点）
   * @returns 快照切片（asOfSeq = 末端 seq，空尾读 = baseSeq-1）+ 刷新 checkpoint 行
   */
  restore(checkpoint: ProjectionCheckpoint, events: ProjectionEvent[], baseSeq: number): RestoreResult {
    const endSeq = events.length > 0 ? events[events.length - 1].seq : baseSeq - 1;
    const values: Record<string, unknown> = {};
    const refreshed: ProjectionCheckpoint = {};
    for (const unit of this.units.values()) {
      const row = checkpoint[unit.key];
      const usable =
        row !== undefined && row.ver === unit.stateVersion && row.seq >= baseSeq - 1 && row.seq <= endSeq;
      if (!usable && baseSeq > 0) {
        throw new Error(
          `session projection ${JSON.stringify(unit.key)} cannot restore from seq ${String(baseSeq)}: checkpoint row is missing, version-mismatched, or beyond the supplied log end; re-read from seq 0`,
        );
      }
      let state = usable ? detachedClone(row.val) : unit.init();
      const from = usable ? row.seq : baseSeq - 1;
      for (const event of events) {
        if (event.seq > from) state = unit.apply(state, event);
      }
      values[unit.key] = state;
      refreshed[unit.key] = { ver: unit.stateVersion, seq: endSeq, val: detachedClone(state) };
    }
    return { snapshot: { asOfSeq: endSeq, values }, checkpoint: refreshed };
  }

  /**
   * eager drive: 单个已提交事件过每个注册单元（订阅缝逐事件调用）。
   * 变更门 = Object.is（apply 无变化必须返回原引用）；变更触发通知。
   * wholeValue 单元变更时机械断言: apply(init, e) 必须与 apply(prev, e) 一致——
   * 不一致 = transition 依赖历史 = 事件未携带完整 post-change 状态（裸 delta）→
   * log.warn + 违规记录（状态仍前进: 可用性优先，restore 可随时重放修正）。
   */
  drive(source: SessionStore, sessionId: string, event: ProjectionEvent): void {
    for (const unit of this.units.values()) {
      const cell = this.cellForBefore(unit, source, sessionId, event.seq);
      if (event.seq <= cell.observedSeq) continue; // 已吸收（幂等防线，正常流不会发生）
      const next = unit.apply(cell.state, event);
      const changed = !Object.is(next, cell.state);
      if (unit.wholeValue && changed) {
        const fromInit = unit.apply(unit.init(), event);
        if (!plainJsonEqual(next, fromInit)) {
          const violation: WholeValueViolation = {
            sessionId,
            key: unit.key,
            seq: event.seq,
            detail: 'whole-value 断言失败——apply(前状态,e) 与 apply(init,e) 不一致，状态承载事件未携带完整 post-change 状态（裸 delta）',
          };
          this.violationLog.push(violation);
          if (this.violationLog.length > MAX_VIOLATIONS) this.violationLog.shift();
          log.warn({ sessionId, key: unit.key, seq: event.seq }, violation.detail);
        }
      }
      cell.state = next;
      cell.observedSeq = event.seq;
      if (changed && this.listeners.size > 0) {
        for (const listener of this.listeners) listener(sessionId, unit.key, next, event.seq);
      }
    }
  }

  // ═══ 内部 ═══

  /** 读（或惰性构建——fold 日志全量）一个单元的单元格 */
  private cellFor(unit: ErasedUnit, source: SessionStore, sessionId: string): Cell {
    let sessionCells = this.cells.get(sessionId);
    if (sessionCells === undefined) {
      sessionCells = new Map<string, Cell>();
      this.cells.set(sessionId, sessionCells);
    }
    let cell = sessionCells.get(unit.key);
    if (cell === undefined) {
      cell = this.buildCell(unit, toProjectionEvents(source.getEvents(sessionId)).events);
      sessionCells.set(unit.key, cell);
    }
    return cell;
  }

  /** drive 专用: 单元格缺失时 fold 日志中 seq 早于本次事件的已提交前缀（DSH slice(0, event.seq) 范式） */
  private cellForBefore(unit: ErasedUnit, source: SessionStore, sessionId: string, seq: number): Cell {
    let sessionCells = this.cells.get(sessionId);
    if (sessionCells === undefined) {
      sessionCells = new Map<string, Cell>();
      this.cells.set(sessionId, sessionCells);
    }
    let cell = sessionCells.get(unit.key);
    if (cell === undefined) {
      const prior = toProjectionEvents(source.getEvents(sessionId).filter((e) => e.seq < seq)).events;
      cell = this.buildCell(unit, prior);
      sessionCells.set(unit.key, cell);
    }
    return cell;
  }

  /** 从 init fold 事件序列，产出一个观察水位在末事件的单元格 */
  private buildCell(unit: ErasedUnit, events: ProjectionEvent[]): Cell {
    let state = unit.init();
    for (const event of events) state = unit.apply(state, event);
    return { state, observedSeq: events.length > 0 ? events[events.length - 1].seq : -1 };
  }
}

// ═══ 日志事件 → 投影事件（payload 解析边界，铁律 24） ═══

/**
 * SessionEvent[] → ProjectionEvent[]（payloadJson 解析）。
 * @degraded 半截事件（payload 非法 JSON）→ log.warn + 截断保留前缀 + degraded:true
 *           （与 deriveMessages 半截语义一致: 损坏点之后不前向派生）
 */
export function toProjectionEvents(events: SessionEvent[]): { events: ProjectionEvent[]; degraded: boolean } {
  const out: ProjectionEvent[] = [];
  for (const ev of events) {
    try {
      out.push({ seq: ev.seq, eventType: ev.eventType, payload: JSON.parse(ev.payloadJson) });
    } catch (err) {
      log.warn({ sessionId: ev.sessionId, seq: ev.seq, err }, '事件 payload 解析失败 — 投影截断（保留前缀）');
      return { events: out, degraded: true };
    }
  }
  return { events: out, degraded: false };
}

// ═══ 模块单例 + 订阅缝（import 即接线） ═══

/** 模块级注册表单例——appendEvent 订阅缝与内建投影挂载点 */
export const sessionProjections = new SessionProjectionRegistry();

/** 单例便捷入口（生产接线调用点: 内建投影与后续消费方经此注册） */
export function registerProjection<S>(definition: ProjectionDefinition<S>): void {
  sessionProjections.register(definition);
}

/** 内建投影 key: 会话活动统计（消息数/工具结果数/观察水位） */
export const SESSION_ACTIVITY_STATS_KEY = 'session_activity_stats';

interface SessionActivityStatsState {
  messageCount: number;
  toolResultCount: number;
  lastEventSeq: number;
}

/**
 * 内建投影（真实接线）: 会话活动统计——token 统计等消费方的第一个统一派生面。
 * 计数器型（历史依赖），不声明 wholeValue；seq<=水位时返回原引用（幂等 + Object.is 门）。
 */
registerProjection<SessionActivityStatsState>({
  key: SESSION_ACTIVITY_STATS_KEY,
  stateVersion: 1,
  init: () => ({ messageCount: 0, toolResultCount: 0, lastEventSeq: -1 }),
  apply: (state, event) => {
    if (event.seq <= state.lastEventSeq) return state;
    const next: SessionActivityStatsState = { ...state, lastEventSeq: event.seq };
    if (event.eventType === 'message') next.messageCount += 1;
    else if (event.eventType === 'tool_result') next.toolResultCount += 1;
    return next;
  },
});

/** 订阅缝幂等防线（ESM 模块单例只加载一次；防御双 specifier 边缘情形） */
let seamInstalled = false;

/**
 * 原型级订阅缝: wrap SessionStore.prototype.appendEvent——事件成功落盘后驱动注册表。
 * 写集 0 修改下唯一能让生产全部 SessionStore 构造点自动获得 drive 的方案（import 即安装）。
 * 事件先落盘后驱动；drive 异常只计数降级不回滚（日志是唯一事实源，投影可重建）。
 */
function installAppendEventSeam(registry: SessionProjectionRegistry): void {
  if (seamInstalled) return;
  seamInstalled = true;
  const originalAppendEvent = SessionStore.prototype.appendEvent;
  SessionStore.prototype.appendEvent = function (
    this: SessionStore,
    sessionId: string,
    eventType: SessionEventType,
    payload: unknown,
  ): AppendEventResult {
    const res = originalAppendEvent.call(this, sessionId, eventType, payload);
    if (res.ok) {
      try {
        registry.drive(this, sessionId, { seq: res.seq, eventType, payload });
      } catch (err) {
        registry.driveFailures += 1;
        log.warn(
          { sessionId, eventType, seq: res.seq, err },
          '投影 drive 失败 — degraded（事件已落盘，投影可经 restore 重放重建）',
        );
      }
    }
    return res;
  };
}

installAppendEventSeam(sessionProjections);
