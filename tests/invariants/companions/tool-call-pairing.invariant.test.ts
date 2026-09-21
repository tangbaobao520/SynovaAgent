/**
 * tests/invariants/companions/tool-call-pairing.invariant.test.ts — 伴生②镜像单测（D865 组2）
 *
 * 镜像: src/invariants/companions/tool-call-pairing.invariant.ts（路径严格镜像，组2 硬要求）
 * 定位: INV-TOOL-CALL-PAIRING 的**自身违约面**（孤立 tool 消息 / 空 id 锚 / 孤立 tool_result）
 * 与写前 fail-closed 语义（违约事件不落盘）+ 原型级回滚。
 * 深度链路（真实 SessionStore 全链 + provider）留在 tests/sentinel/invariants.test.ts。
 *
 * 契约（铁律 47/48）:
 *   @input  — 检查点 = wrap SessionStore.prototype.appendEvent（写前校验）
 *   @output — 配对合法 → 原结果透传（事件落盘）；违约 → 抛 InvariantError（不落盘）
 *   @degraded — 无（配对状态纯内存，无 IO）
 *   @error  — tool 消息 tool_call_id 无前置配对 / assistant.tool_calls 含空 id → InvariantError
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../../../src/store/session-store';
import { InvariantRegistry, InvariantError } from '../../../src/invariants/registry';
import { onToolCallPairing } from '../../../src/invariants/companions/tool-call-pairing.invariant';

let registry: InvariantRegistry;
let db: Database.Database;
let store: SessionStore;

beforeEach(() => {
  registry = new InvariantRegistry();
  db = new Database(':memory:');
  store = new SessionStore(db);
});

afterEach(() => {
  registry.uninstallAll();
  db.close();
});

/** 该会话已落盘的 session_events 条数（验证"违约不落盘"） */
function eventCount(sessionId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM session_events WHERE session_id = ?').get(sessionId) as { n: number };
  return row.n;
}

describe('伴生元数据（总纲 §9.4 notChecked）', () => {
  it('code/owner 稳定 + notChecked 显式声明 D866 生产触发面=0', () => {
    expect(onToolCallPairing.code).toBe('INV-TOOL-CALL-PAIRING');
    expect(onToolCallPairing.owner).toBe('squad-b/coding');
    expect(onToolCallPairing.notChecked.length).toBeGreaterThanOrEqual(6);
    expect(onToolCallPairing.notChecked.join('\n')).toContain('D866');
    expect(onToolCallPairing.notChecked.join('\n')).toContain('tool_call_id');
  });
});

describe('正向：配对合法即放行', () => {
  it('assistant.tool_calls(id) → tool 消息配对 → 事件落盘且无违约', () => {
    registry.install(onToolCallPairing);
    const sid = store.createSession('org-unit').id;
    const res1 = store.appendEvent(sid, 'message', {
      role: 'assistant', content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't', arguments: '{}' } }],
    });
    expect(res1.ok).toBe(true);
    const res2 = store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'call_1', content: '{"r":1}' });
    expect(res2.ok).toBe(true);
    expect(eventCount(sid)).toBe(2);
    expect(registry.statusOf('INV-TOOL-CALL-PAIRING')?.lastFailure).toBeNull();
    expect(registry.statusOf('INV-TOOL-CALL-PAIRING')?.hitCount).toBe(2);
  });

  it('tool_result 事件带已配对 id → 放行（同一待配对集）', () => {
    registry.install(onToolCallPairing);
    const sid = store.createSession('org-unit').id;
    store.appendEvent(sid, 'message', {
      role: 'assistant', content: '',
      tool_calls: [{ id: 'call_9', type: 'function', function: { name: 't', arguments: '{}' } }],
    });
    const res = store.appendEvent(sid, 'tool_result', { tool_call_id: 'call_9', ok: true });
    expect(res.ok).toBe(true);
    expect(eventCount(sid)).toBe(2);
    expect(registry.statusOf('INV-TOOL-CALL-PAIRING')?.lastFailure).toBeNull();
  });
});

describe('违约面：结构断裂 fail-closed（写前拦截，违约数据不落盘）', () => {
  it('孤立 tool 消息（无前置 assistant.tool_calls）→ InvariantError 且不落盘', () => {
    registry.install(onToolCallPairing);
    const sid = store.createSession('org-unit').id;
    expect(() =>
      store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'orphan-1', content: '{}' }),
    ).toThrow(InvariantError);
    expect(eventCount(sid)).toBe(0);
    const failure = registry.statusOf('INV-TOOL-CALL-PAIRING')?.lastFailure;
    expect(failure).toContain('orphan-1');
    expect(failure).toContain(sid);
  });

  it('assistant.tool_calls 含空 id → InvariantError（配对锚缺失）', () => {
    registry.install(onToolCallPairing);
    const sid = store.createSession('org-unit').id;
    expect(() =>
      store.appendEvent(sid, 'message', { role: 'assistant', content: '', tool_calls: [{ id: '', type: 'function' }] }),
    ).toThrow(/空 id/);
    expect(eventCount(sid)).toBe(0);
    expect(registry.statusOf('INV-TOOL-CALL-PAIRING')?.lastFailure).toContain('空 id');
  });

  it('孤立 tool_result 事件（id 无出处）→ InvariantError 且不落盘', () => {
    registry.install(onToolCallPairing);
    const sid = store.createSession('org-unit').id;
    expect(() => store.appendEvent(sid, 'tool_result', { tool_call_id: 'ghost-1' })).toThrow(InvariantError);
    expect(eventCount(sid)).toBe(0);
    expect(registry.statusOf('INV-TOOL-CALL-PAIRING')?.lastFailure).toContain('ghost-1');
  });

  it('配对是逐条消费：同一 id 第二次使用 → 无待配对 → 违约', () => {
    registry.install(onToolCallPairing);
    const sid = store.createSession('org-unit').id;
    store.appendEvent(sid, 'message', {
      role: 'assistant', content: '',
      tool_calls: [{ id: 'call_dup', type: 'function', function: { name: 't', arguments: '{}' } }],
    });
    expect(store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'call_dup', content: '{}' }).ok).toBe(true);
    expect(() =>
      store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'call_dup', content: '{}' }),
    ).toThrow(InvariantError);
    expect(eventCount(sid)).toBe(2);
  });
});

describe('回滚面：原型级缝撤销', () => {
  it('uninstall 还原 SessionStore.prototype.appendEvent（无残留拦截）', () => {
    const before = SessionStore.prototype.appendEvent;
    registry.install(onToolCallPairing);
    expect(SessionStore.prototype.appendEvent).not.toBe(before);
    registry.uninstall('INV-TOOL-CALL-PAIRING');
    expect(SessionStore.prototype.appendEvent).toBe(before);
    // 撤销后孤立 tool 消息不再被拦（证明 wrap 真的摘掉了）
    const sid = store.createSession('org-unit').id;
    expect(() =>
      store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'orphan-after-rollback', content: '{}' }),
    ).not.toThrow();
    expect(eventCount(sid)).toBe(1);
  });
});
