/**
 * tests/store/fts-sync-trigger.test.ts — D820-FTS 专项防回归（卡外阻塞缺陷，队长 2026-09-20 授权折入）
 *
 * 被修缺陷（自初始提交 a6160381 存活至今）:
 *   `agent_messages_fts` 是**普通** FTS5 表（`src/store/session-store.ts:221-225`，无 `content=''`），
 *   但 AFTER DELETE 触发器用的是 **contentless 专用** 的 `('delete', ...)` 命令 →
 *   SQLite 物理拒绝（"SQL logic error"）⇒
 *     ① 任何 `DELETE FROM agent_messages` 抛错 → `deleteSession` 全路径失败（DELETE /api/sessions/:id → 500）
 *     ② FTS 索引里残留已"删除"消息的**全文** → `search()` 仍可召回（一级隐私面）
 *
 * 修复: 插入触发器显式落 rowid ≡ `agent_messages.id`；删除触发器改普通 `DELETE ... WHERE rowid = old.id`；
 *       旧库幂等迁移（检出失效触发器 → 重建 + 一次性索引对齐）。**保持普通 FTS5 表**（`snippet()` 能力
 *       必须保留，D826 波2 依赖），**未改列定义**。
 *
 * 5 条断言（队长 2026-09-20 批）:
 *   ① 旧库迁移后触发器已换  ② rowid 已对齐  ③ 孤儿索引被清（不可召回）
 *   ④ 删除可成功（消息/会话）⑤ 新库不重建（未检出失效触发器时不动索引）
 *
 * 反例防线：若有人改回 `('delete', ...)` 或去掉显式 rowid，本文件全红。
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../../src/store/session-store';

interface FtsCount { c: number }

const count = (db: Database.Database, table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as FtsCount).c;

/** 手搓「旧世界」库：旧版失效触发器 + 未对齐 rowid + 一条孤儿索引（无对应 agent_messages 行） */
function createLegacyDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE agent_sessions (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT, phase INTEGER DEFAULT 0,
      state_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
      content TEXT NOT NULL, timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE VIRTUAL TABLE agent_messages_fts USING fts5(
      session_id UNINDEXED, content, tokenize='unicode61'
    );
    -- 旧版触发器（缺陷现场，逐字复刻修复前的 DDL）
    CREATE TRIGGER agent_msg_fts_insert AFTER INSERT ON agent_messages BEGIN
      INSERT INTO agent_messages_fts(session_id, content) VALUES (new.session_id, new.content);
    END;
    CREATE TRIGGER agent_msg_fts_delete AFTER DELETE ON agent_messages BEGIN
      INSERT INTO agent_messages_fts(agent_messages_fts, session_id, content) VALUES ('delete', old.session_id, old.content);
    END;
  `);
  db.prepare('INSERT INTO agent_sessions (id, org_id) VALUES (?,?)').run('sess-legacy', 'org-x');
  db.prepare("INSERT INTO agent_messages (session_id, role, content) VALUES (?,?,?)")
    .run('sess-legacy', 'user', 'legacy alpha message');
  db.prepare("INSERT INTO agent_messages (session_id, role, content) VALUES (?,?,?)")
    .run('sess-legacy', 'assistant', 'legacy beta message');
  // 孤儿索引：旧世界「删消息失败/索引未同步」留下的明文残留（无对应 agent_messages 行）
  db.prepare('INSERT INTO agent_messages_fts(session_id, content) VALUES (?,?)')
    .run('sess-ghost', 'orphan secret text');
  return db;
}

describe('D820-FTS: FTS5 同步触发器（删除可用 + 索引不残留消息全文）', () => {
  it('断言④ 正常路径: 有消息的会话删得掉，且索引同清（修复前 `DELETE FROM agent_messages` 抛 SQL logic error）', () => {
    const db = new Database(':memory:');
    const store = new SessionStore(db);
    const sid = store.createSession('org-x').id;
    store.addMessage(sid, 'user', 'customer concentration is too high');
    expect(count(db, 'agent_messages_fts'), '双写后索引应有 1 行').toBe(1);
    expect(store.search('customer', 5).map(r => r.sessionId), '删除前 FTS 可召回').toContain(sid);

    expect(() => store.deleteSession(sid), '删有消息的会话不得抛错（修复前 SQL logic error）').not.toThrow();
    expect(count(db, 'agent_messages'), '消息行真删').toBe(0);
    expect(count(db, 'agent_messages_fts'), '索引行真清（不是留孤儿）').toBe(0);
    expect(store.search('customer', 5), '删除后不得再召回已删会话内容（隐私面）').toEqual([]);
    db.close();
  });

  it('断言④b 单条消息删除: 删 agent_messages 行不抛错且同步删索引（触发器路径本身可用）', () => {
    const db = new Database(':memory:');
    const store = new SessionStore(db);
    const sid = store.createSession('org-x').id;
    store.addMessage(sid, 'user', 'first searchable token');
    const rowId = (db.prepare('SELECT id FROM agent_messages WHERE session_id=?').get(sid) as { id: number }).id;

    expect(() => db.prepare('DELETE FROM agent_messages WHERE rowid = ?').run(rowId)).not.toThrow();
    expect(count(db, 'agent_messages_fts')).toBe(0);
    expect(store.search('searchable', 5)).toEqual([]);
    db.close();
  });

  it('断言① 旧库迁移: 检出失效触发器 → 迁移后触发器已换（不再含 contentless 专用 delete 命令）', () => {
    const db = createLegacyDb();
    new SessionStore(db); // ← 迁移点

    const rows = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'agent_msg_fts%' ORDER BY name",
    ).all() as Array<{ name: string; sql: string }>;
    expect(rows.map(r => r.name)).toEqual(['agent_msg_fts_delete', 'agent_msg_fts_insert']);
    for (const r of rows) {
      expect(r.sql, `${r.name} 不得再用 contentless 专用 delete 命令`).not.toContain("'delete'");
    }
    const del = rows.find(r => r.name === 'agent_msg_fts_delete');
    const ins = rows.find(r => r.name === 'agent_msg_fts_insert');
    expect(del?.sql, '删除触发器改为按 rowid 的普通 DELETE').toContain('DELETE FROM agent_messages_fts WHERE rowid = old.id');
    expect(ins?.sql, '插入触发器显式落 rowid ≡ agent_messages.id').toContain('agent_messages_fts(rowid, session_id, content)');
    db.close();
  });

  it('断言②③ 旧库迁移: rowid 与 agent_messages.id 对齐 + 孤儿索引被清且不可召回', () => {
    const db = createLegacyDb();
    expect(ftsMatchCount(db, 'orphan'), '迁移前孤儿索引可召回（缺陷现场：索引里存着明文）').toBe(1);
    const store = new SessionStore(db); // ← 迁移点

    const aligned = db.prepare(
      'SELECT COUNT(*) AS c FROM agent_messages_fts f JOIN agent_messages m ON m.id = f.rowid',
    ).get() as FtsCount;
    expect(aligned.c, '每行索引都必须挂到同 id 的消息行上').toBe(count(db, 'agent_messages'));
    expect(count(db, 'agent_messages_fts'), '索引行数 = 消息行数（孤儿被清）').toBe(count(db, 'agent_messages'));
    expect(ftsMatchCount(db, 'orphan'), '孤儿索引明文必须已从索引中消失（隐私面，直查 FTS 不靠 join）').toBe(0);
    expect(store.search('orphan', 5), '经 API 也不得召回').toEqual([]);
    expect(ftsMatchCount(db, 'legacy'), '真实消息仍可召回（重建没把数据丢掉）').toBe(2);
    db.close();
  });

  it('断言⑤ 新库不重建: 未检出失效触发器时不动索引（连开两次 SessionStore，索引逐字节不变）', () => {
    const db = new Database(':memory:');
    new SessionStore(db); // 首建（新触发器）
    const sid = (new SessionStore(db)).createSession('org-x').id;
    new SessionStore(db).addMessage(sid, 'user', 'stable token');
    // 植入一条孤儿：若第二次构造触发了「重建」，它会被清掉 → 本断言即红
    db.prepare('INSERT INTO agent_messages_fts(session_id, content) VALUES (?,?)').run('sess-ghost', 'sentinel orphan');
    const before = count(db, 'agent_messages_fts');

    new SessionStore(db); // ← 不应重建
    expect(count(db, 'agent_messages_fts'), '新库路径不得触发全量重建').toBe(before);
    expect(ftsMatchCount(db, 'sentinel'), '孤儿仍在索引里 = 确未重建（新库零开销）').toBe(1);
    db.close();
  });
});

/** 直查 FTS 索引的召回数（绕开 search() 的 agent_sessions join —— 索引本身是否残留明文在此判定） */
function ftsMatchCount(db: Database.Database, term: string): number {
  const rows = db.prepare('SELECT rowid FROM agent_messages_fts WHERE agent_messages_fts MATCH ?').all(term) as Array<{ rowid: number }>;
  return rows.length;
}
