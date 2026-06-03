/**
 * session-store.test.ts — 会话持久化测试 (Era 1.3, iron law 0-2 Step 2)
 *
 * 验证: SessionStore CRUD + FTS5 搜索 + 会话恢复 + 消息完整性
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../src/store/session-store';
import * as fs from 'fs';

let db: Database.Database;
let store: SessionStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new SessionStore(db);
});

afterEach(() => { db.close(); });

// ═══ CRUD ═══

describe('SessionStore — CRUD', () => {
  it('Given new store, When createSession, Then returns session with id', () => {
    const s = store.createSession('test-org');
    expect(s.id).toBeTruthy();
    expect(s.orgId).toBe('test-org');
    expect(s.phase).toBe(0);
    expect(s.createdAt).toBeTruthy();
  });

  it('Given session with messages, When retrieved, Then messages are intact', () => {
    const s = store.createSession('test-org');
    store.addMessage(s.id, 'user', '你好');
    store.addMessage(s.id, 'assistant', '你好！请告诉我你的组织情况。');
    store.addMessage(s.id, 'user', '我们是30人的SaaS公司');

    const msgs = store.getMessages(s.id);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('你好');
    expect(msgs[1].role).toBe('assistant');
  });

  it('Given session, When updated, Then phase changes', () => {
    const s = store.createSession('test-org');
    expect(s.phase).toBe(0);
    store.updateSession(s.id, { phase: 2 });
    const updated = store.getSession(s.id);
    expect(updated!.phase).toBe(2);
  });

  it('Given multiple sessions, When listed, Then returns all sorted by date', () => {
    store.createSession('org-A');
    store.createSession('org-B');
    store.createSession('org-C');
    const list = store.listSessions();
    expect(list).toHaveLength(3);
    // Most recent first
    expect(new Date(list[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(list[2].createdAt).getTime(),
    );
  });

  it('Given session with state, When saved and loaded, Then state is preserved', () => {
    const s = store.createSession('test-org');
    store.saveState(s.id, { phase: 3, orgId: 'test-org', messages: [], startedAt: new Date().toISOString() });
    const state = store.loadState(s.id);
    expect(state).not.toBeNull();
    expect(state!.phase).toBe(3);
    expect(state!.orgId).toBe('test-org');
  });

  it('Given deleted session, When retrieved, Then returns null', () => {
    const s = store.createSession('test-org');
    store.deleteSession(s.id);
    expect(store.getSession(s.id)).toBeNull();
    expect(store.getMessages(s.id)).toHaveLength(0);
  });
});

// ═══ FTS5 Search ═══

describe('SessionStore — FTS5 search', () => {
  it('Given messages with Chinese text, When searched, Then finds matching sessions', () => {
    const s1 = store.createSession('org-A');
    store.addMessage(s1.id, 'user', '我们的团队协作效率很低');
    store.addMessage(s1.id, 'assistant', '了解。团队有多少人？');

    const s2 = store.createSession('org-B');
    store.addMessage(s2.id, 'user', '公司营收下滑严重');
    store.addMessage(s2.id, 'assistant', '从什么时候开始的？');

    const results = store.search('协作效率');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sessionId).toBe(s1.id);
  });

  it('Given no matching text, When searched, Then returns empty', () => {
    const s = store.createSession('test');
    store.addMessage(s.id, 'user', 'hello');
    const results = store.search('不存在的关键词xyz');
    expect(results).toHaveLength(0);
  });

  it('Given search by message content, When searched, Then finds matching content', () => {
    const s = store.createSession('acme-corp');
    store.addMessage(s.id, 'user', '我们需要提升营收');
    const results = store.search('营收');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].orgId).toBe('acme-corp');
  });
});

// ═══ Conversation Integration ═══

describe('SessionStore — conversation integration', () => {
  it('Given conversation serialized, When saved, Then can be restored into new conversation', () => {
    const s = store.createSession('test-org');
    const state = { orgId: 'test-org', phase: 2, messages: [
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: 'hi' },
    ], startedAt: new Date().toISOString() };

    store.saveState(s.id, state);
    const restored = store.loadState(s.id);
    expect(restored!.phase).toBe(2);
    expect(restored!.messages).toHaveLength(3);
    expect(restored!.messages[1].content).toBe('hello');
  });
});
