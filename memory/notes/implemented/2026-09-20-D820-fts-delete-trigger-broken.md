---
状态: implemented
日期: 2026-09-20
决策: D820-FTS —— `agent_messages_fts` 的同步触发器改为「插入显式落 rowid ≡ `agent_messages.id`」+「删除用普通 `DELETE ... WHERE rowid = old.id`」，并对旧库做一次性幂等迁移（检出失效触发器才重建 + 全量索引对齐）。**保持普通 FTS5 表**（不 contentless）、**不改列定义**。
理由: 该表是**普通** FTS5 表（`src/store/session-store.ts:221-225`，无 `content=''`），但 `AFTER DELETE` 触发器用的是 **contentless 专用** 的 `('delete', session_id, content)` 命令 → SQLite（本机 3.53.2 / better-sqlite3 12.11.1）物理拒绝并抛 `SQL logic error`。后果两条：① 任何 `DELETE FROM agent_messages` 抛错 ⇒ `deleteSession` 全路径失败（`DELETE /api/sessions/:id` → 500），D820 卡面「建会话→落报告→删会话」在真实入口上物理走不通；② FTS 索引里残留已「删除」消息的**全文**，`search()` 仍可召回（一级隐私面，与 D820 同判据 D）。该缺陷**自初始提交 a6160381 存活至今**，既有测试未捕获是因为它们都不删「有消息的会话」（`tests/session-store.test.ts:76` 删的是刚建的空会话；`data-purger`/`im-inbound` 的测试用假 store）——即**「有机制在场 ≠ 机制工作」**：FTS 同步机制一直在，但从未真正工作过。修法须避开两条红线：不得改 contentless（`search()` 依赖 `snippet(agent_messages_fts, 1, ...)`，`:564`）、不得改列定义（D826 波2 的租户过滤 join 与 snippet 依赖 `session_id UNINDEXED, content`）。
---

## 触发场景

- 员工 A（批十四小队）在写 D820 e2e 时，`DELETE /api/sessions/:id` 返回 500（`routes/sessions` 日志 `err.code = SQLITE_ERROR`）。
- 逐语句二分定位：`DELETE FROM agent_messages WHERE session_id=?` 抛错、`DELETE FROM agent_messages_fts WHERE origin...` 正常 → 触发器是唯一嫌疑。
- 最小复现（**未改仓库任何文件**）：纯 FTS5 表（有/无 UNINDEXED、有/无 `tokenize='unicode61'` 三种 DDL）执行 `INSERT INTO t(t, rowid, a, b) VALUES('delete', 1, ...)` 全部 `SQL logic error`；同一张表 `DELETE FROM t WHERE rowid = 1` 正常。
- 基线复现证明与本批改动无关：按修复前顺序手工执行三条语句（不调用新代码）同样抛错。

## 落地（本折入改动的执行面）

- `src/store/session-store.ts` `initSchema`：
  - 插入触发器 `agent_msg_fts_insert` → `INSERT INTO agent_messages_fts(rowid, session_id, content) VALUES (new.id, ...)`。
  - 删除触发器 `agent_msg_fts_delete` → `DELETE FROM agent_messages_fts WHERE rowid = old.id`。
  - 幂等迁移：`sqlite_master` 检出旧触发器（delete 命令含 `'delete'`，或 insert 触发器未含 `rowid`）→ `DROP TRIGGER` + 重建 + **一次性全量索引对齐**（`DELETE FROM agent_messages_fts` + `INSERT ... SELECT id, session_id, content FROM agent_messages`），并以 `log.warn` 打出 `messages`/`ftsRowsBefore` 计数（写放大操作要可观测）。新库不触发重建（零开销）。
- 测试：`tests/store/fts-sync-trigger.test.ts`（5 条断言：删除可用 / 旧库触发器已换 / rowid 对齐 / 孤儿索引清除且不可召回 / 新库不重建）。

## 相关

- 落地提交：`98c24872 fix(D820): FTS5 删除触发器改普通 DELETE + rowid 对齐`（折入本批的独立 commit）

- 卡：`task-state/D820.json`（本改动为**卡外阻塞缺陷，经队长 2026-09-20 授权折入本批**，单独 commit，不混入 D820 主体 diff）。
- 上游发现：D820 e2e 穿真实入口时暴露（`tests/store/delete-session-cascade.test.ts`）。
- 影响面外溢：`src/l4/data-purger.ts:291`、`src/l1/im-inbound.ts:232`、`src/routes/sessions.ts:117` 三条 `deleteSession` 调用路径同源受害。
- 防回归：若有人改回 `('delete', ...)` 或去掉显式 rowid → `tests/store/fts-sync-trigger.test.ts` 全红。
- 遗留（不在本折入范围，登记隐患清单报 K3）：FTS 表无租户列、依赖 `JOIN agent_sessions`（D826 波2 处理）；`agent_messages_fts` 历史上曾长期累积孤儿明文，本迁移只在**有失效触发器的库**上清除。
