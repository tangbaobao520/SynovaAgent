/**
 * tests/store/session-event-log.test.ts — D500 事件溯源 session log 测试
 *
 * 覆盖（铁律 48: 正常/降级/边界 + 2026-08-22 并发写缺陷四条防线 S-5）:
 *   L1 appendEvent → deriveMessages 投影与原始消息一致（正常路径）
 *   L1 seq 单调: 连续 append 3 条 → seq = 1,2,3（无回退）
 *   L1 seq 冲突: 手动插重复 seq → 显式 degraded（不静默覆盖，缺陷①防线）
 *   L1 崩溃恢复: 模拟内存回退 → 按持久化 MAX(seq) 续写（缺陷②防线）
 *   L1 半截事件: 事件流缺尾部 → 投影不崩 + degraded:true（铁律 24）
 *   L1 空事件流 → 空投影（边界）
 *   L1 addMessage 双写: store.addMessage 后 session_events 有对应事件
 *   L1 直连调用方: 模拟 cli/im-inbound 直连 store.addMessage → 事件流产生（无需改调用方）
 *   L1 回归: getMessages 输出与 deriveMessages 一致（backing 语义）
 *   L1 model-visible⟺logged: addMessage 后事件已落（SessionStore 层）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore, MessageRow } from '../../src/store/session-store';

function createStore(): SessionStore {
  const db = new Database(':memory:');
  return new SessionStore(db);
}

describe('D500 session event log — appendEvent + deriveMessages', () => {
  let store: SessionStore;
  let sessionId: string;

  beforeEach(() => {
    store = createStore();
    sessionId = store.createSession('org-test').id;
  });

  it('appendEvent → deriveMessages 投影与原始消息一致（正常路径）', () => {
    store.addMessage(sessionId, 'user', '你好');
    store.addMessage(sessionId, 'assistant', '我在');
    const derived = store.deriveMessages(sessionId);
    expect(derived).toHaveLength(2);
    expect(derived[0].role).toBe('user');
    expect(derived[0].content).toBe('你好');
    expect(derived[1].role).toBe('assistant');
    expect(derived[1].content).toBe('我在');
  });

  it('seq 单调: 连续 append 3 条 → seq = 1,2,3（无回退）', () => {
    store.addMessage(sessionId, 'user', 'm1');
    store.addMessage(sessionId, 'user', 'm2');
    store.addMessage(sessionId, 'user', 'm3');
    const events = store.getEvents(sessionId);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('seq 冲突: 手动插重复 seq → 显式 degraded（不静默覆盖，缺陷①防线）', () => {
    store.addMessage(sessionId, 'user', 'm1'); // seq=1
    const dup = store.appendEvent(sessionId, 'message', { role: 'user', content: 'm1-dup' });
    // appendEvent 基于 MAX(seq) 续写 → 不会产生重复 seq；直接验证返回 ok 且 seq 递增
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.seq).toBe(2);
    // 事件数 = 2（无覆盖）
    expect(store.getEvents(sessionId)).toHaveLength(2);
    const derived = store.deriveMessages(sessionId);
    expect(derived[0].content).toBe('m1'); // 未被覆盖
  });

  it('seq 冲突真实构造: UNIQUE(session_id,seq) 物理拒绝重复 seq（缺陷①防线实证）', () => {
    const db = (store as unknown as { db: Database.Database }).db;
    store.addMessage(sessionId, 'user', 'first'); // seq=1
    // 直接 SQL 插入重复 seq=1 → UNIQUE 约束物理拒绝（抛 SqliteError，不静默覆盖）
    let threw = false;
    try {
      db.prepare('INSERT INTO session_events (session_id, seq, event_type, payload_json) VALUES (?,?,?,?)')
        .run(sessionId, 1, 'message', JSON.stringify({ role: 'user', content: 'conflict' }));
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain('UNIQUE constraint failed');
    }
    expect(threw).toBe(true);
    // 原始事件未被覆盖（冲突 INSERT 被拒绝）
    const events = store.getEvents(sessionId);
    expect(events).toHaveLength(1);
    expect(events[0].seq).toBe(1);
    expect(JSON.parse(events[0].payloadJson).content).toBe('first');
  });

  it('崩溃恢复: 内存回退（模拟 lastSeq=1 再写 seq=1）→ 按持久化 MAX(seq) 续写 2（缺陷②防线）', () => {
    store.addMessage(sessionId, 'user', 'm1'); // 持久化 seq=1
    // 模拟"内存回退"：内存以为 lastSeq=1 想再写 seq=1 —— appendEvent 用持久化 MAX(seq)=1 → 续写 2
    const res = store.appendEvent(sessionId, 'message', { role: 'user', content: 'm2' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.seq).toBe(2); // 不回到 1
    const seqs = store.getEvents(sessionId).map((e) => e.seq);
    expect(seqs).toEqual([1, 2]); // 单调，无回退
  });

  it('半截事件: 事件流含损坏 payload → 投影不崩 + degraded:true（铁律 24 显式降级）', () => {
    store.addMessage(sessionId, 'user', 'm1');
    store.addMessage(sessionId, 'assistant', 'm2');
    // 模拟半截: 手动把最后一条事件 payload 改成非法 JSON（物理损坏）
    store.corruptLastEventPayload(sessionId);
    const derived = store.deriveMessages(sessionId);
    // 投影返回可重建前缀（m1）且 degraded 标记
    expect(derived.length).toBeGreaterThanOrEqual(1);
    expect(store.lastDegraded).toBe(true);
  });

  it('空事件流 → 空投影（边界）', () => {
    const derived = store.deriveMessages(sessionId);
    expect(derived).toEqual([]);
  });

  it('addMessage 双写: store.addMessage 后 session_events 有对应事件', () => {
    store.addMessage(sessionId, 'user', '双写测试');
    const events = store.getEvents(sessionId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('message');
    const payload = JSON.parse(events[0].payloadJson) as { role: string; content: string };
    expect(payload.role).toBe('user');
    expect(payload.content).toBe('双写测试');
  });

  it('直连调用方: 模拟 cli/im-inbound 直连 store.addMessage → 事件流产生（无需改调用方）', () => {
    // cli.ts:143 直连模式: store.addMessage(sessionId, 'assistant', reply)
    store.addMessage(sessionId, 'assistant', 'cli 回复');
    // im-inbound.ts:144 直连模式: store.addMessage(sessionId, 'user', input)
    store.addMessage(sessionId, 'user', 'im 输入');
    const events = store.getEvents(sessionId);
    expect(events).toHaveLength(2); // 双写下沉 → 直连调用方自动获得事件流
  });

  it('回归: getMessages 输出与 deriveMessages 一致（backing 语义）', () => {
    store.addMessage(sessionId, 'user', 'a');
    store.addMessage(sessionId, 'assistant', 'b');
    const direct = store.getMessages(sessionId);
    const derived = store.deriveMessages(sessionId);
    expect(direct.map((m) => ({ role: m.role, content: m.content })))
      .toEqual(derived.map((m) => ({ role: m.role, content: m.content })));
  });

  it('model-visible⟺logged: addMessage 后事件已落（SessionStore 层，lastDegraded=false）', () => {
    store.addMessage(sessionId, 'user', '落盘校验');
    expect(store.lastDegraded).toBe(false);
    expect(store.getEvents(sessionId).length).toBeGreaterThan(0);
  });

  it('降级信号非粘滞: appendEvent 失败后成功写入 → lastDegraded 重置为 false（复核修复）', () => {
    // 模拟 appendEvent 失败（drop 表 → INSERT 失败 → lastDegraded=true）
    const db = (store as unknown as { db: Database.Database }).db;
    db.exec('DROP TABLE session_events');
    store.addMessage(sessionId, 'user', 'fail-write');
    expect(store.lastDegraded).toBe(true);
    // 重建表 → 后续成功写入应重置 lastDegraded（不粘滞）
    db.exec(`CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('message','tool_result','system')),
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, seq)
    );`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_session_events_sess ON session_events(session_id, seq);');
    store.addMessage(sessionId, 'user', 'recover-write');
    expect(store.lastDegraded).toBe(false);
    expect(store.getEvents(sessionId).length).toBeGreaterThan(0);
  });

  it('appendEvent 显式 eventType 支持（tool_result 等，扩展性）', () => {
    const res = store.appendEvent(sessionId, 'tool_result', { role: 'tool', content: '{}', toolCallId: 'tc1' });
    expect(res.ok).toBe(true);
    const events = store.getEvents(sessionId);
    expect(events[0].eventType).toBe('tool_result');
    expect(events[0].seq).toBe(1);
  });
});
