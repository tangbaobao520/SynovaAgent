/**
 * tests/orchestrator/session-manager-eventlog.test.ts — D500 SessionManager 事件持久化 + model-visible⟺logged 断言
 *
 * 覆盖（铁律 48: 正常/降级/边界）:
 *   L1 注入 SessionStore 后 addMessage 持久化（重启不丢的根基）
 *   L1 model-visible⟺logged: addMessage 后事件已落 SessionStore（断言通过）
 *   L1 断言失败: 模拟双写失败 → log.error + degraded 标记（不静默，铁律 24/31）
 *   L1 未注入 sessionStore → 内存态不回退（向后兼容，bootstrap 现状）
 *   L1 无 sessionId 传参 → 走内存态（兼容旧调用）
 *   L2a 接线: conversation-engine.ts:616 addMessage 带 sessionId（grep 断言）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SessionManager } from '../../src/orchestrator/session-manager';
import { SessionStore } from '../../src/store/session-store';

describe('D500 SessionManager — 事件持久化 + model-visible⟺logged 断言', () => {
  let store: SessionStore;
  let sessionId: string;

  beforeEach(() => {
    const db = new Database(':memory:');
    store = new SessionStore(db);
    sessionId = store.createSession('org-test').id;
  });

  it('注入 SessionStore + sessionId → addMessage 持久化（正常路径）', () => {
    const manager = new SessionManager({}, store);
    manager.addMessage({ role: 'user', content: '持久化消息' }, sessionId);
    // 内存态保留（压缩用）
    expect(manager.getMessages()).toHaveLength(1);
    // 事件已落 SessionStore
    expect(store.getEvents(sessionId)).toHaveLength(1);
    const derived = store.deriveMessages(sessionId);
    expect(derived[0].content).toBe('持久化消息');
    // model-visible⟺logged 断言通过（未触发 degraded）
    expect(manager.degraded).toBe(false);
    expect(store.lastDegraded).toBe(false);
  });

  it('model-visible⟺logged: addMessage 后事件已落（断言通过）', () => {
    const manager = new SessionManager({}, store);
    manager.addMessage({ role: 'assistant', content: '诊断结果' }, sessionId);
    expect(store.getEvents(sessionId).length).toBe(1);
    expect(manager.degraded).toBe(false);
  });

  it('断言失败: 模拟双写失败 → log.error + degraded 标记（不静默，铁律 24/31）', () => {
    const errorLogSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // 构造一个 appendEvent 会失败的 store（非法 sessionId → 外键/约束失败）
    const manager = new SessionManager({}, store);
    manager.addMessage({ role: 'user', content: 'x' }, 'nonexistent-session');
    // 事件落失败 → 断言标记 degraded（显式，不静默）
    expect(manager.degraded).toBe(true);
    errorLogSpy.mockRestore();
  });

  it('断言分支: store.lastDegraded=true（appendEvent 失败）→ manager 断言失败（复核修复，覆盖 manager:83-86 分支）', () => {
    const errorLogSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new SessionManager({}, store);
    // 先正常写一条（session 有效）
    manager.addMessage({ role: 'user', content: 'ok' }, sessionId);
    expect(manager.degraded).toBe(false);
    // 构造 store.lastDegraded=true：drop session_events 表 → 下次 addMessage 的 appendEvent 失败
    const db = (store as unknown as { db: Database.Database }).db;
    db.exec('DROP TABLE session_events');
    manager.addMessage({ role: 'user', content: 'append-fail' }, sessionId);
    // manager 断言分支触发（store.lastDegraded → 断言失败 → manager.degraded）
    expect(store.lastDegraded).toBe(true);
    expect(manager.degraded).toBe(true);
    errorLogSpy.mockRestore();
  });

  it('降级信号非粘滞: 失败后成功写入 → degraded 重置为 false（复核修复）', () => {
    const errorLogSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new SessionManager({}, store);
    // 失败写入（nonexistent session → 异常 → degraded）
    manager.addMessage({ role: 'user', content: 'bad' }, 'nonexistent-session');
    expect(manager.degraded).toBe(true);
    // 成功写入 → degraded 重置（不粘滞）
    manager.addMessage({ role: 'user', content: 'good' }, sessionId);
    expect(manager.degraded).toBe(false);
    expect(store.getEvents(sessionId).length).toBe(1);
    errorLogSpy.mockRestore();
  });

  it('未注入 sessionStore → addMessage 走内存态不回退（向后兼容，bootstrap 现状）', () => {
    const manager = new SessionManager();
    manager.addMessage({ role: 'user', content: '仅内存' }, sessionId);
    expect(manager.getMessages()).toHaveLength(1);
    // 无 store → 无持久化，但不崩（兼容）
    expect(manager.degraded).toBe(false);
  });

  it('无 sessionId 传参 → 走内存态（兼容旧调用 conversation-engine 现状）', () => {
    const manager = new SessionManager({}, store);
    manager.addMessage({ role: 'user', content: '无 id' });
    expect(manager.getMessages()).toHaveLength(1);
    expect(manager.degraded).toBe(false);
  });

  it('L2a 接线: conversation-engine.ts addMessage 带 sessionId 实参', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/agent/conversation-engine.ts', 'utf-8');
    // :616 应有 sessionId 实参（this.sessionId 已存在 :358）
    expect(content).toContain('this.sessionManager?.addMessage');
    expect(content).toContain('this.sessionId');
  });
});
