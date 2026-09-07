/**
 * tests/store/session-projection.test.ts — D588 会话投影注册表（DSH 借鉴卡 B-07）
 *
 * 范式锚点: D:/deepseek-harness/packages/session/session-projection/lib/index.js（逐行读全文自研，零代码依赖）
 *
 * 覆盖（铁律 48: 正常/降级/边界，每用例 ≥3 expect）:
 *   L1 增量 apply: drive 逐事件派生 + Object.is 变更门 + onChanged 通知（正常路径）
 *   L1 双投影 stateVersion 版本化 + checkpoint → restore 重放一致（≥2 投影）
 *   L1 ver 不匹配 → restoreFloor 归零 + restore 全量重放（DSH one-below 锚点）
 *   L1 日志缩短（crash-repair truncation）→ restore 拒绝并要求从 seq 0 重读
 *   L1 空 log 边界: init 态 + checkpoint seq=-1 + restoreFloor 边界 + checkpoint 值分离（detached clone）
 *   L1 whole-value 断言: whole 携带零报警；裸 delta 消费 → 报警记录（铁律 24 log.warn + 违规可见）
 *   L1 内建投影真实接线: SessionStore.appendEvent 订阅缝 → session_activity_stats 自动派生（DS1）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../../src/store/session-store';
import {
  SessionProjectionRegistry,
  registerProjection,
  sessionProjections,
  toProjectionEvents,
  SESSION_ACTIVITY_STATS_KEY,
  type ProjectionDefinition,
  type ProjectionEvent,
} from '../../src/store/session-projection';

// ═══ 测试用投影定义 ═══

/** 计数投影（历史依赖型——非 whole-value，验证增量 apply 与重放） */
function counterDef(key: string, version: number): ProjectionDefinition<{ count: number; lastSeq: number }> {
  return {
    key,
    stateVersion: version,
    init: () => ({ count: 0, lastSeq: -1 }),
    apply: (state, event) => {
      if (event.seq <= state.lastSeq) return state; // 无变化返回原引用（Object.is 变更门契约）
      return { count: state.count + 1, lastSeq: event.seq };
    },
  };
}

/** 报告投影（whole-value 型——状态由事件完整携带，替换式 apply） */
function reportDef(version: number): ProjectionDefinition<{ report: { status: string; score: number } | null }> {
  return {
    key: 'p-report',
    stateVersion: version,
    init: () => ({ report: null }),
    apply: (state, event) => {
      const p = event.payload as { report?: { status: string; score: number } } | null;
      if (p && typeof p === 'object' && p.report) return { report: p.report };
      return state;
    },
    wholeValue: true,
  };
}

/** 裸 delta 消费投影（违规定义——apply 依赖前状态，whole-value 断言应报警） */
const deltaDef: ProjectionDefinition<{ score: number }> = {
  key: 'p-delta',
  stateVersion: 1,
  init: () => ({ score: 0 }),
  apply: (state, event) => {
    const p = event.payload as { score?: number; delta?: number } | null;
    if (p && typeof p === 'object' && typeof p.score === 'number') return { score: p.score }; // whole 携带（合规形态）
    if (p && typeof p === 'object' && typeof p.delta === 'number') return { score: state.score + p.delta }; // 裸 delta（违规形态）
    return state;
  },
  wholeValue: true,
};

function createStore(): SessionStore {
  const db = new Database(':memory:');
  return new SessionStore(db);
}

/** 事件先落盘（appendEvent 真实持久化 + 单例订阅缝），再驱动隔离注册表（模拟其自身订阅） */
function appendAndDrive(
  store: SessionStore,
  sessionId: string,
  registry: SessionProjectionRegistry,
  events: ProjectionEvent[],
): void {
  for (const event of events) {
    const res = store.appendEvent(sessionId, event.eventType, event.payload);
    expect(res.ok).toBe(true);
    registry.drive(store, sessionId, event);
  }
}

describe('D588 会话投影注册表 — 增量 apply / checkpoint / restore / whole-value', () => {
  let store: SessionStore;
  let sessionId: string;

  beforeEach(() => {
    store = createStore();
    sessionId = store.createSession('org-d588').id;
  });

  it('增量 apply: drive 逐事件派生 + onChanged 变更通知（正常路径）', () => {
    const registry = new SessionProjectionRegistry();
    registry.register(counterDef('p-counter', 1));
    const notified: Array<{ key: string; seq: number; count: number }> = [];
    registry.onChanged((sid, key, state, seq) => {
      expect(sid).toBe(sessionId);
      const s = state as { count: number };
      notified.push({ key, seq, count: s.count });
    });
    registry.drive(store, sessionId, { seq: 1, eventType: 'message', payload: { role: 'user', content: 'a' } });
    registry.drive(store, sessionId, { seq: 2, eventType: 'tool_result', payload: { content: 'b' } });
    registry.drive(store, sessionId, { seq: 3, eventType: 'message', payload: { role: 'user', content: 'c' } });
    // 状态 = 三事件增量派生
    expect(registry.stateOf(store, sessionId, 'p-counter')).toEqual({ count: 3, lastSeq: 3 });
    // 变更通知 = 每次变更一条，seq 递增
    expect(notified.map((n) => n.seq)).toEqual([1, 2, 3]);
    expect(notified.map((n) => n.count)).toEqual([1, 2, 3]);
    // 未注册 key → undefined（capability absence 语义）
    expect(registry.stateOf(store, sessionId, 'no-such-key')).toBeUndefined();
  });

  it('双投影 stateVersion 版本化 + checkpoint → restore 重放一致 + 惰性冷构建', () => {
    const r1 = new SessionProjectionRegistry();
    r1.register(counterDef('p-a', 1));
    r1.register(reportDef(3));
    appendAndDrive(store, sessionId, r1, [
      { seq: 1, eventType: 'message', payload: { role: 'user', content: 'x' } },
      { seq: 2, eventType: 'diagnosis_report', payload: { report: { status: 'ok', score: 9 } } },
      { seq: 3, eventType: 'message', payload: { role: 'assistant', content: 'y' } },
    ]);
    // checkpoint: 每 key 一行 {ver, seq, val}
    const cp = r1.checkpoint(store, sessionId);
    expect(cp['p-a']).toEqual({ ver: 1, seq: 3, val: { count: 3, lastSeq: 3 } });
    expect(cp['p-report']).toEqual({ ver: 3, seq: 3, val: { report: { status: 'ok', score: 9 } } });
    // restore: 同版本行可用 → 增量续读（baseSeq=0 全量尾读），重放结果与 eager drive 一致
    const log = toProjectionEvents(store.getEvents(sessionId));
    expect(log.degraded).toBe(false);
    const restored = r1.restore(cp, log.events, 0);
    expect(restored.snapshot.asOfSeq).toBe(3);
    expect(restored.snapshot.values['p-a']).toEqual({ count: 3, lastSeq: 3 });
    expect(restored.snapshot.values['p-report']).toEqual({ report: { status: 'ok', score: 9 } });
    // restore 返回的 checkpoint 行可直接回写（ver/seq 对齐）
    expect(restored.checkpoint['p-a'].ver).toBe(1);
    expect(restored.checkpoint['p-a'].seq).toBe(3);
    // 惰性冷构建: 全新注册表零 drive，首触 stateOf 直接 fold 全量日志
    const cold = new SessionProjectionRegistry();
    cold.register(counterDef('p-a', 1));
    expect(cold.stateOf(store, sessionId, 'p-a')).toEqual({ count: 3, lastSeq: 3 });
  });

  it('ver 不匹配 → restoreFloor 归零 + restore 从 init 全量重放（one-below 锚点）', () => {
    const r1 = new SessionProjectionRegistry();
    r1.register(counterDef('p-ver', 1));
    const five: ProjectionEvent[] = [];
    for (let seq = 1; seq <= 5; seq++) {
      five.push({ seq, eventType: 'message', payload: { role: 'user', content: `m${seq}` } });
    }
    appendAndDrive(store, sessionId, r1, five);
    const cp = r1.checkpoint(store, sessionId);
    expect(cp['p-ver']).toEqual({ ver: 1, seq: 5, val: { count: 5, lastSeq: 5 } });
    // 可用行 → restoreFloor = one-below 锚点: min(row.seq+1) - 1 = 5（尾读从 5 起，证明日志未缩短）
    expect(r1.restoreFloor(cp)).toBe(5);
    // 版本升级: 同 key 定义 stateVersion 1 → 2（新注册表——进程重启后重新注册的生命周期）
    const r2 = new SessionProjectionRegistry();
    r2.register(counterDef('p-ver', 2));
    // 旧版本行不可用 → floor 归 0（该 key 必须重折全量日志）
    expect(r2.restoreFloor(cp)).toBe(0);
    const log = toProjectionEvents(store.getEvents(sessionId));
    const restored = r2.restore(cp, log.events, 0);
    // 从 init 全量重放 → 与 eager drive 逐事件结果一致
    expect(restored.snapshot.values['p-ver']).toEqual({ count: 5, lastSeq: 5 });
    // 刷新后的 checkpoint 行已是新版本
    expect(restored.checkpoint['p-ver']).toEqual({ ver: 2, seq: 5, val: { count: 5, lastSeq: 5 } });
  });

  it('日志缩短（crash-repair truncation）→ restore 拒绝并要求从 seq 0 重读', () => {
    const r1 = new SessionProjectionRegistry();
    r1.register(counterDef('p-shrink', 1));
    const three: ProjectionEvent[] = [];
    for (let seq = 1; seq <= 3; seq++) {
      three.push({ seq, eventType: 'message', payload: { role: 'user', content: 'm' } });
    }
    appendAndDrive(store, sessionId, r1, three);
    const cp = r1.checkpoint(store, sessionId);
    expect(cp['p-shrink'].seq).toBe(3);
    // 模拟日志缩短: 只提供 seq 1..2 的尾读（baseSeq=1, endSeq=2 < 行水位 3）
    const partial = toProjectionEvents(store.getEvents(sessionId).filter((e) => e.seq <= 2));
    expect(partial.events).toHaveLength(2);
    // 行 seq=3 > endSeq=2 → 不可用 且 baseSeq>0 → 抛错（拒绝把过期行当现值服务）
    expect(() => r1.restore(cp, partial.events, 1)).toThrow(/seq 0/);
  });

  it('空 log 边界: init 态 + checkpoint seq=-1 + restoreFloor 边界 + checkpoint 值分离', () => {
    const registry = new SessionProjectionRegistry();
    registry.register(counterDef('p-empty', 1));
    // 空事件流: 首触惰性 fold 空 log → init 态
    expect(registry.stateOf(store, sessionId, 'p-empty')).toEqual({ count: 0, lastSeq: -1 });
    // checkpoint: 观察水位 -1（DSH buildCell: events.at(-1)?.seq ?? -1）
    const cp = registry.checkpoint(store, sessionId);
    expect(cp['p-empty']).toEqual({ ver: 1, seq: -1, val: { count: 0, lastSeq: -1 } });
    // checkpoint 值为分离副本: 改写返回值不影响活单元格
    (cp['p-empty'].val as { count: number }).count = 999;
    expect(registry.stateOf(store, sessionId, 'p-empty')).toEqual({ count: 0, lastSeq: -1 });
    // 空 checkpoint 行 → floor 0；无注册 → undefined（无需读日志）
    expect(registry.restoreFloor({})).toBe(0);
    expect(new SessionProjectionRegistry().restoreFloor({})).toBeUndefined();
  });

  it('whole-value 断言: whole 携带零报警；裸 delta 消费 → log.warn + 违规记录', () => {
    const registry = new SessionProjectionRegistry();
    registry.register(reportDef(1));
    // 合规形态: 状态由事件完整携带（替换式）→ 零违规
    registry.drive(store, sessionId, { seq: 1, eventType: 'diagnosis_report', payload: { report: { status: 'ok', score: 8 } } });
    registry.drive(store, sessionId, { seq: 2, eventType: 'message', payload: { role: 'user', content: '无关事件' } });
    expect(registry.getViolations()).toEqual([]);
    expect(registry.stateOf(store, sessionId, 'p-report')).toEqual({ report: { status: 'ok', score: 8 } });
    // 违规形态: 裸 delta 消费——apply(前状态,e) ≠ apply(init,e) → 断言报警
    const violRegistry = new SessionProjectionRegistry();
    violRegistry.register(deltaDef);
    violRegistry.drive(store, sessionId, { seq: 1, eventType: 'system', payload: { score: 5 } }); // whole 携带，合规
    expect(violRegistry.getViolations()).toEqual([]);
    violRegistry.drive(store, sessionId, { seq: 2, eventType: 'system', payload: { delta: 2 } }); // 裸 delta
    const violations = violRegistry.getViolations();
    expect(violations).toHaveLength(1);
    expect(violations[0].key).toBe('p-delta');
    expect(violations[0].seq).toBe(2);
    // 状态仍前进（可用性优先——报警不阻断派生，restore 可随时重放修正）
    expect(violRegistry.stateOf(store, sessionId, 'p-delta')).toEqual({ score: 7 });
  });

  it('内建投影真实接线: appendEvent 订阅缝 → session_activity_stats 自动派生（DS1）', () => {
    // 模块加载即安装订阅缝: 生产 8+ 构造点零修改获得 drive（import 即接线）
    store.addMessage(sessionId, 'user', '第一条');
    store.addMessage(sessionId, 'assistant', '回复');
    store.appendEvent(sessionId, 'tool_result', { content: 'tool-out' });
    const stats = sessionProjections.stateOf(store, sessionId, SESSION_ACTIVITY_STATS_KEY) as {
      messageCount: number; toolResultCount: number; lastEventSeq: number;
    };
    expect(stats.messageCount).toBe(2);
    expect(stats.toolResultCount).toBe(1);
    expect(stats.lastEventSeq).toBe(3);
    // 生产级 appendEvent 语义不被缝破坏: 返回值原样透传
    const res = store.appendEvent(sessionId, 'diagnosis_phase', { phase: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.seq).toBe(4);
    // registerProjection 单例便捷入口 = 生产接线调用点（模块内建投影经此注册）
    expect(typeof registerProjection).toBe('function');
  });
});
