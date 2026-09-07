/**
 * tests/store/retry-projection.test.ts — D593 重试计数投影（D500 事件流可回放）
 *
 * 覆盖（铁律 48: 正常/降级/边界，每用例 ≥3 expect）:
 *   - appendRetryEvent 落盘 + 内建注册表 import 即接线自动派生（总量/按 provider/按 code）
 *   - 非 llm_retry 的 system 事件与 message 事件不计入
 *   - seq 幂等: 同一事件重复 drive 不重复计数
 *   - restore 回放一致: 冷读重建 = eager drive 现值 + checkpoint 行 ver/seq 对齐
 *   - 非法 payload → degraded（ok:false + 显式 error，铁律 24/31），状态不变
 *   - retryProjectionDefinition() 工厂: 多注册表实例复用注册（cell 缓存按 sessionId 键）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../../src/store/session-store';
import { SessionProjectionRegistry, sessionProjections, toProjectionEvents } from '../../src/store/session-projection';
import {
  RETRY_PROJECTION_KEY,
  RETRY_EVENT_KIND,
  retryProjectionDefinition,
  appendRetryEvent,
  type RetryStatsState,
} from '../../src/store/retry-projection';

function createStore(): SessionStore {
  const db = new Database(':memory:');
  return new SessionStore(db);
}

function statsOf(registry: SessionProjectionRegistry, store: SessionStore, sessionId: string): RetryStatsState {
  return registry.stateOf(store, sessionId, RETRY_PROJECTION_KEY) as RetryStatsState;
}

describe('D593 重试计数投影 — D500 事件流自动派生 + 回放', () => {
  let store: SessionStore;
  let sessionId: string;

  beforeEach(() => {
    store = createStore();
    sessionId = store.createSession('org-d593').id;
  });

  it('appendRetryEvent 落盘 + 内建注册表自动派生（import 即接线）', () => {
    const r1 = appendRetryEvent(store, sessionId, { provider: 'deepseek', code: 'RATE_LIMITED', attempt: 0, delayMs: 800 });
    expect(r1.ok).toBe(true);
    const r2 = appendRetryEvent(store, sessionId, { provider: 'openai', code: 'EMPTY_RESPONSE', attempt: 0, delayMs: 950 });
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.seq).toBe(r1.seq + 1);
    }
    // 事件载荷形态: kind = llm_retry（DSH llm/retry 语义通道）
    const raw = JSON.parse(store.getEvents(sessionId)[0].payloadJson) as { kind?: string; provider?: string };
    expect(raw.kind).toBe(RETRY_EVENT_KIND);
    expect(raw.provider).toBe('deepseek');
    // 单例注册表: appendEvent 订阅缝已自动 drive
    const stats = statsOf(sessionProjections, store, sessionId);
    expect(stats.totalRetries).toBe(2);
    expect(stats.byProvider).toEqual({ deepseek: 1, openai: 1 });
    expect(stats.byCode).toEqual({ RATE_LIMITED: 1, EMPTY_RESPONSE: 1 });
    expect(stats.lastSeq).toBe(2);
  });

  it('非 llm_retry 事件不计入: 其它 system 事件 / message / tool_result 全部忽略', () => {
    store.addMessage(sessionId, 'user', '普通消息');
    store.appendEvent(sessionId, 'system', { kind: 'other_kind', provider: 'x', code: 'Y' });
    store.appendEvent(sessionId, 'system', { note: '无 kind 字段' });
    store.appendEvent(sessionId, 'tool_result', { content: 'tool' });
    const stats = statsOf(sessionProjections, store, sessionId);
    expect(stats.totalRetries).toBe(0);
    expect(stats.byProvider).toEqual({});
    expect(stats.byCode).toEqual({});
    expect(stats.lastSeq).toBe(-1);
  });

  it('seq 幂等: 同一事件重复 drive 不重复计数（水位防线）', () => {
    const first = appendRetryEvent(store, sessionId, { provider: 'deepseek', code: 'TIMEOUT', attempt: 1, delayMs: 100 });
    const second = appendRetryEvent(store, sessionId, { provider: 'deepseek', code: 'TIMEOUT', attempt: 2, delayMs: 200 });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const eager = statsOf(sessionProjections, store, sessionId);
    expect(eager.totalRetries).toBe(2);
    // 隔离注册表重放全量日志 = 2；再重复 drive 末事件 → 仍 2（seq<=水位返回原引用）
    const isolated = new SessionProjectionRegistry();
    isolated.register(retryProjectionDefinition());
    const log = toProjectionEvents(store.getEvents(sessionId));
    expect(log.degraded).toBe(false);
    for (const event of log.events) isolated.drive(store, sessionId, event);
    expect((isolated.stateOf(store, sessionId, RETRY_PROJECTION_KEY) as RetryStatsState).totalRetries).toBe(2);
    isolated.drive(store, sessionId, log.events[log.events.length - 1]);
    const after = isolated.stateOf(store, sessionId, RETRY_PROJECTION_KEY) as RetryStatsState;
    expect(after.totalRetries).toBe(2);
    expect(after.lastSeq).toBe(eager.lastSeq);
  });

  it('restore 回放一致: 冷读重建 = eager 现值，checkpoint 行 ver/seq 对齐', () => {
    appendRetryEvent(store, sessionId, { provider: 'deepseek', code: 'RATE_LIMITED', attempt: 0, delayMs: 10 });
    appendRetryEvent(store, sessionId, { provider: 'gateway', code: 'SERVER_ERROR', attempt: 0, delayMs: 20 });
    appendRetryEvent(store, sessionId, { provider: 'deepseek', code: 'RATE_LIMITED', attempt: 1, delayMs: 30 });
    const eager = statsOf(sessionProjections, store, sessionId);
    expect(eager.totalRetries).toBe(3);
    expect(eager.byProvider).toEqual({ deepseek: 2, gateway: 1 });
    // 全新注册表（模拟进程重启）: restore 从 seq 0 全量回放
    const cold = new SessionProjectionRegistry();
    cold.register(retryProjectionDefinition());
    const log = toProjectionEvents(store.getEvents(sessionId));
    const restored = cold.restore({}, log.events, 0);
    const replayed = restored.snapshot.values[RETRY_PROJECTION_KEY] as RetryStatsState;
    expect(replayed).toEqual(eager);
    expect(restored.checkpoint[RETRY_PROJECTION_KEY].ver).toBe(1);
    expect(restored.checkpoint[RETRY_PROJECTION_KEY].seq).toBe(eager.lastSeq);
    // 冷读惰性 stateOf 与 eager 一致（cell 缓存按 sessionId 键，跨注册表可重建）
    expect(statsOf(cold, store, sessionId)).toEqual(eager);
  });

  it('非法 payload → degraded（显式 error 不静默），状态不变', () => {
    const badProvider = appendRetryEvent(store, sessionId, { provider: '', code: 'TIMEOUT' });
    expect(badProvider.ok).toBe(false);
    if (!badProvider.ok) {
      expect(badProvider.degraded).toBe(true);
      expect(badProvider.error.length).toBeGreaterThan(0);
    }
    const badCode = appendRetryEvent(store, sessionId, { provider: 'deepseek', code: '' });
    expect(badCode.ok).toBe(false);
    const missing = appendRetryEvent(store, sessionId, {} as { provider: string; code: string });
    expect(missing.ok).toBe(false);
    const stats = statsOf(sessionProjections, store, sessionId);
    expect(stats.totalRetries).toBe(0);
    expect(store.getEvents(sessionId)).toHaveLength(0);
  });

  it('retryProjectionDefinition() 工厂可复用: 多注册表实例各自注册不冲突', () => {
    const a = new SessionProjectionRegistry();
    const b = new SessionProjectionRegistry();
    expect(() => {
      a.register(retryProjectionDefinition());
      b.register(retryProjectionDefinition());
    }).not.toThrow();
    appendRetryEvent(store, sessionId, { provider: 'deepseek', code: 'NETWORK', attempt: 0, delayMs: 5 });
    expect(statsOf(a, store, sessionId).totalRetries).toBe(1);
    expect(statsOf(b, store, sessionId).totalRetries).toBe(1);
    expect(a.stateOf(store, sessionId, RETRY_PROJECTION_KEY)).not.toBe(b.stateOf(store, sessionId, RETRY_PROJECTION_KEY));
  });
});
