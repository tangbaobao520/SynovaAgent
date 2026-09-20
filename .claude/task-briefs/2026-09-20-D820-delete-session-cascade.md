# Task Brief: D820 删会话不删诊断报告（T-D3）+ 卡外 FTS 阻塞缺陷折入

> 生成: 2026-09-20 | 工作树: `.synova-wt-team14` | 分支: `team/win-batch14` | 基线: `d527abcb`（= origin/main@4f3bb21c + 派单件）
> 执行: 批十四小队 编码队员 A（store 域）| 队长: 并行 CTO session | 自验: 队内队员（独立复核）；本卡不主张任何"审计"结论
> 状态: **规格已获队长批（Q-A 批 / Q-C1 批）→ 编码中**

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
本卡只改 L5 存储层（`src/store/session-store.ts`）+ L1 路由层的一处写侧归属链（`src/routes/conversations.ts`，**队长显式授权、改动最小**），不改 L2/L3/L4，不动 `scripts/**`。

---

## 规格（一句话契约 — 铁律 47）

- **`saveDiagnosisCheckpoint(cp + { originSessionId?: string })`**：输入 = 检查点 + **可选来源会话 id**；输出 = void；降级 = 落库异常上抛，由调用方 `catch + log.warn`（现状保持）。同键重写时缺省**保留原链**（`COALESCE(excluded..., 原值)`）。
- **`deleteSession(id)`**：输出 = void，**真删**（物理 DELETE，无软删除/墓碑列）；契约扩展为「删该会话的全部诊断状态」= 键 `session_id = id` 的行（resume 型，**防御性一半**）+ 键 `origin_session_id = id` 的归档行（**真正干活的一半**）。
- **`listDiagnosisReports(opts)`**：输出不变；SQL 增加会话存在性谓词（`phase = 5 AND (origin_session_id IS NULL OR EXISTS(...))`），`total` 与 `rows` **共用同一条谓词**；行级 JSON 损坏跳过的降级路径不动。

### 为什么必须新增 `origin_session_id`（本卡最关键的事实）

phase=5 归档行的 `session_id` 存的是 **reportId**，不是 chat 会话 id —— 两条写路径都如此：

| 路线 | 写点 | `session_id` 实参 |
|---|---|---|
| consult | `src/routes/diagnosis.ts:600-602` | `reportIdForArchive`（= `rpt_xxx`） |
| 对话桥 | `src/routes/conversations.ts:307-309` | `conversationReportId`（= `rpt_xxx`） |

且 `diagnosis_checkpoints` **无 FK、无 CASCADE**（DDL `:265-271`；实测 `PRAGMA table_info` + 建表 SQL）。
⇒ 只把既有的 `deleteDiagnosisCheckpoints` 接进 `deleteSession` 是**空操作**（按 sessionId 删，一行都匹配不到），卡面验收「删会话 → 无残留」必红。故必须补归属链列。

### 为什么读侧谓词不能是裸 `EXISTS(agent_sessions)`

consult 报告的 `session_id` 是 `rpt_xxx`，**永无**对应 `agent_sessions` 行 ⇒ 裸 EXISTS 会把**全部 GA 报告**从列表抹掉（比原缺陷更严重的回归）。
故：`origin_session_id IS NULL` 的行（consult 报告 + 全部存量旧行）**照旧列出**；只有「链到已不存在会话」的行被隐藏（纵深防御：老库/旧二进制删过会话留下的孤儿）。

### 明确不做（边界，队长已批）

- **不给 consult 路线记 `originSessionId`**：该路线手上只有 `consultId`，**没有 chat sessionId 可链**（`src/routes/diagnosis.ts:598-601`）。→ GA consult 报告（键 = reportId，桌面 `currentReportId` 直接引用、`GET /consult/{reportId}/report` 冷读依据）**不随任何会话删除消失**，正是卡面验收⑤「不误删」保护的对象。**队长驳回扩写集到 `diagnosis.ts`。**
- 不给 `session_events` 补清理（FK `ON DELETE CASCADE`，实测 better-sqlite3 `foreign_keys=1`，父行删除后子行 0 残留）。
- 不改 `src/routes/sessions.ts`（波2 D826 写集）——本卡只**调用**其 `DELETE /api/sessions/:id` 入口。

---

## 卡外阻塞缺陷（折入本卡，**单独 commit**）

**FTS5 同步触发器失效**：`agent_messages_fts` 是普通 FTS5 表（`:221-225`，无 `content=''`），但 `AFTER DELETE` 触发器用 contentless 专用 `('delete', ...)` 命令 → SQLite 抛 `SQL logic error` ⇒ ① `DELETE FROM agent_messages` 抛错 → `deleteSession` 全路径失败（`DELETE /api/sessions/:id` → 500，**卡面验收入口物理走不通**）② FTS 索引残留已删消息全文（隐私面，判据 D）。
**经队长 2026-09-20 裁定 Q-C1（批）/ Q-C2（单独 commit，在 D820 commit 之前）/ Q-C3（写进隐患清单转 K3）**。
修法见 `memory/notes/proposed/2026-09-20-D820-fts-delete-trigger-broken.md`；5 条硬条件（不 contentless / 不改列定义 / 重建可观测 / 新库不重建 / 给四条原始输出）全部遵守。

---

## 实证证据（本工作树实测原始输出，非转述派单）

### 证据 1 · 删会话与报告残留（缺陷现场）

```
$ git show origin/main:src/store/session-store.ts | grep -n "deleteSession" -A 3
355:  deleteSession(id: string): void {
356:    this.db.prepare('DELETE FROM agent_messages WHERE session_id=?').run(id);
357:    this.db.prepare('DELETE FROM agent_sessions WHERE id=?').run(id);
358:  }
$ grep -rn "deleteDiagnosisCheckpoints" src/ tests/     # 修复前
src/store/session-store.ts:581:  deleteDiagnosisCheckpoints(sessionId: string): void {   ← 定义处，全仓零调用者
```

### 证据 2 · FTS 触发器失效（删会话 500 的根因，与本批改动无关）

```
$ node_modules/.bin/tsx -e "<旧库触发器形态：最小 repro>"       # 纯 FTS5 表
FAIL plain (a,b) -> SQL logic error
FAIL unindexed + tokenizer -> SQL logic error
$ node_modules/.bin/tsx -e "<同表：普通 DELETE 对比 delete 命令>"
plain DELETE by rowid     -> OK, rows now []
delete-command w/o rowid  -> FAIL SQL logic error
$ <baseline 形态：按修复前语句顺序逐条执行，不调用新代码>
FAIL BASELINE DELETE agent_messages -> SQL logic error
FAIL BASELINE DELETE agent_sessions -> SQL logic error
```

### 证据 3 · 修复后（FTS 修好 → D820 e2e 转绿）

```
$ node_modules/.bin/vitest run tests/store/delete-session-cascade.test.ts
 ✓ tests/store/delete-session-cascade.test.ts (7 tests) 1515ms
 Test Files  1 passed (1) | Tests  7 passed (7)
```

---

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = AI 诊断 Agent。本任务在 **L5 存储层**（`src/store/session-store.ts`，`SessionStore` = 会话/消息/事件流/诊断检查点的唯一持久层）+ **L1 路由层一处写侧**（`src/routes/conversations.ts:307` 对话桥归档写点）。既有覆盖：`diagnosis_checkpoints` 表 + `deleteDiagnosisCheckpoints`（**零调用者**）+ `listDiagnosisReports`（**无会话过滤**）→ 本卡为**扩展/接线**，非新建。
### b) 文件审计
`grep -rn "diagnosis_checkpoints" src/` → 写侧 3 处（`session-store.ts:546` 定义、`diagnosis.ts:600`、`conversations.ts:307`）、读侧 2 处（`session-store.ts:562` 单读、`:598` 列表）；`grep -rn "deleteSession" src/` → 定义 1 + 调用 3（`data-purger.ts:291` / `im-inbound.ts:232` / `sessions.ts:117`）。→ 复用既有表与函数，不新建表/不新建模块。
### c) 决策
已有覆盖 → 复用（补一列 + 接上零调用的清理函数 + 读侧谓词）。冲突 → 无（写集扫描见下）。
参考：第一性原理（删会话 = 删该会话的全部数据，含派生物）+ DSH 事件流口径（派生物必须有可物理匹配的归属键，不能靠运气）。

## Q1: 调研 — 决策链 + 执行约束

- **铁律 0-2（spec → test → impl → wire）**：本卡先规格报批（队长 Q-A 批），再写测试（穿真实入口），再实现。
- **铁律 24/31（降级显式）**：读侧谓词不改变既有降级路径（行级 JSON 损坏 → `log.warn` + `degraded: true` + 跳过该行，不 500）；旧库迁移失败 → `log.debug`（列已存在是正常态）。
- **铁律 47（契约优先）**：`saveDiagnosisCheckpoint` / `deleteSession` / `deleteDiagnosisCheckpoints` / `listDiagnosisReports` 四处 JSDoc 契约已按新语义重写（含 `sessionId` 双语义、级联范围、谓词语义、`total` 口径）。
- **铁律 38（类型安全）**：新增代码零 `as any` / `as never` / `as unknown as`。
- **历史教训**：D593（报告落盘/读回）刻意把归档键设为 reportId ⇒ 本卡**不改键**（改键会打断 `diagnosis.ts:858` 的 `getDiagnosisCheckpoint(reportId)` 冷读）；D500（事件流双写）的降级信号语义见 D822。

## Q2: 范围 — 正确的最简方案

做什么
- src/store/session-store.ts：① `diagnosis_checkpoints` 幂等补列 `origin_session_id` ② `saveDiagnosisCheckpoint` 接受可选 `originSessionId` + upsert 保链 ③ `deleteSession` 接上级联清理（`deleteDiagnosisCheckpoints`，使其脱离"零调用者"） ④ `deleteDiagnosisCheckpoints` 契约扩为「键=sessionId + 链=origin_session_id」双删 ⑤ `listDiagnosisReports` total/rows 共用会话存在性谓词 ⑥ **卡外 FTS 触发器修复 + 旧库一次性迁移**（单独 commit）
- src/routes/conversations.ts：对话桥归档写点传 `originSessionId: sessionId`（**唯一一处，队长授权、最小改动**）
- tests/store/delete-session-cascade.test.ts：新建（穿真实入口的 D820 e2e，见 Q3）
- tests/store/fts-sync-trigger.test.ts：新建（FTS 折入改动的 5 条专项防回归；队长 2026-09-20 批，写集已扩）
- task-state/D820.json：卡面状态/spec/owner/证据
- .claude/task-briefs/2026-09-20-D820-delete-session-cascade.md：本文件
- memory/notes/proposed/2026-09-20-D820-delete-session-cascade.md、memory/notes/proposed/2026-09-20-D820-fts-delete-trigger-broken.md：铁律 49 四态 Note

不做什么
- 不改 src/routes/diagnosis.ts（consult 路线无 chat session 可链；扩写集请求被队长驳回）
- 不改 src/routes/sessions.ts（波2 D826 写集；本卡只经 HTTP 调用其删除入口）
- 不改 src/store/session-projection.ts、src/init/engine-context.ts（波2 D827 写集）
- 不改 src/l4/temporal-baseline.ts（波2 D828 写集）
- 不改 src/l1/im-inbound.ts（B 卡 D823 写集）、packages/evolution/**、src/routes/ga-calibration.ts（C 卡 D829 写集）
- 不改 tests/routes/diagnosis-report-persistence.test.ts、tests/routes/conversations.test.ts、tests/orchestrator/session-manager-eventlog.test.ts（**不在写集，只作只读回归门**；若转红视为谓词/判定写错的信号，不许改它们来变绿）
- 不改 scripts/audit/**（K3 域）、scripts/control-tower/**（控制塔域）
- 不在 src/** 加任何"测试专用开关"（四条禁止之一）
- 不碰 `agent_messages_fts` 的列定义与 contentless 选项（D826 依赖 snippet + join）

#CRITERIA: D

## 写集

| 文件 | 归属（task/builtin + 理由） |
|---|---|
| `src/store/session-store.ts` | task — 实现主体（列/级联/谓词 + FTS 折入） |
| `src/routes/conversations.ts` | task — 归档写点传归属链（队长授权的最小改动，属 D820 提交） |
| `tests/store/delete-session-cascade.test.ts` | task — 新建，D820 e2e（穿真实入口） |
| `tests/store/fts-sync-trigger.test.ts` | task — 新建，FTS 折入改动防回归（队长 2026-09-20 批） |
| `task-state/D820.json` | task — 卡面状态/证据 |
| `.claude/task-briefs/2026-09-20-D820-delete-session-cascade.md` | task — 本文件 |
| `memory/notes/proposed/2026-09-20-D820-delete-session-cascade.md` | task — 铁律 49 四态 Note |
| `memory/notes/proposed/2026-09-20-D820-fts-delete-trigger-broken.md` | task — 折入改动的四态 Note |

### 写集冲突清单（M2 硬要求 — 逐文件，禁目录级模糊）

| 目标文件 | 未提交改动（本工作树 `git status`） | 声明该文件的其他卡 | 在飞分支/PR | 裁决 |
|---|---|---|---|---|
| `src/store/session-store.ts` | 仅本人（M） | `task-state/D826.json`（status=pending，**波2，被 task-1 阻塞**）、D487/D500/D563（已合 main） | 无在飞 PR 触碰 | ✅ A 独占；D820→D822 同人串行；D826 排波2 |
| `src/routes/conversations.ts` | 仅本人（M，1 处） | 无（D810/D817 已合） | 无 | ✅ A 独占 |
| `tests/store/delete-session-cascade.test.ts` | 本人新建 | 无 | 无 | ✅ A 独占 |
| `tests/store/fts-sync-trigger.test.ts` | 本人新建（队长批） | 无 | 无 | ✅ A 独占 |
| `task-state/D820.json` | 本人（M） | 仅 D820 | — | ✅ A 独占 |
| 两份 memory Note | 本人新建 | 无 | 无 | ✅ A 独占 |

**队内两两不相交复核**（读同队卡面 write_set）：B-D823 = `src/l1/**` + `tests/l1/**`；C-D829 = `packages/evolution/**` + `src/routes/ga-calibration.ts`；波2 = `src/routes/sessions.ts` / `src/store/session-projection.ts` / `src/init/engine-context.ts` / `src/l4/temporal-baseline.ts` → 与本卡**零交集**。
**越界声明**：本卡不碰 `src/l1/**`、`src/l4/**`、`src/init/**`、`packages/**`、`scripts/**`、`src/routes/ga-calibration.ts`、`src/routes/diagnosis.ts`。
**上游依赖不越界**：`DELETE /api/sessions/:id` 只**调用**不改（`src/routes/sessions.ts:117`）。

## Q3: 验收 — 入口 → 交互 → 结果

- **入口（从哪触发）**：
  - 建会话 + 落报告 = `POST /api/conversations` ×3（第 3 轮 `phaseComplete` → 对话桥落盘）
  - 删会话 = `DELETE /api/sessions/:id`（`src/routes/sessions.ts:110-118`）
  - 报告列表 = `GET /api/diagnosis/reports`（`src/routes/diagnosis.ts:935`）
- **处理（中间步骤）**：真 express + `app.listen(0)` + 真 `fetch` + 真 better-sqlite3 `:memory:` + `app.locals.sessionStore` 注入 + 真 `SessionStore`；mock 仅四处既有配置缝（providers / providers/detect / config / 诊断引擎工厂——与 `tests/routes/diagnosis-report-persistence.test.ts` 同型，**非本卡对象、不 mock 管线**）。
- **结果（最终展示）**：删会话后归档行**物理消失**（两个键都查零 + 无墓碑列）、列表 API **查不到**该报告、未删会话的报告与 consult 报告**照旧列出**。

| # | 用例 | 断言 |
|---|---|---|
| 1 | 建会话→落报告→删会话 | 归档行 `origin_session_id` = 会话 id；删后按 origin/reportId 两键查均 0；表结构无 `deleted_at`/`is_deleted`；`agent_sessions` 也无 |
| 2 | 列表 API | 删除前在列表；删除后不在列表；`total` 与 SQL 计数一致（同一谓词） |
| 3 | 反向·不误删 | 未删会话报告仍在；**consult 报告（origin NULL、session_id=rpt_xxx）仍在**；已删的不在；库内亦无残留 |
| 4 | 级联范围 | 键=sessionId 的 resume 检查点行（phase<5）一并清除 |
| 5 | 边界 | 删未知会话 → 404（不谎报成功） |
| 6 | 契约 | 同键重写不带来源 → 已有归属链被保留（COALESCE） |
| 7 | 旧库迁移 | 手搓无 `origin_session_id` 列的旧表（`tests/e2e/checkpoint-e2e.test.ts:14-21` 同型）→ `new SessionStore` 补列且 `listDiagnosisReports` 返回 `ok:true`（不 503）；存量旧行照旧列出 |

## 架构层: L5（存储层 src/store/session-store.ts；L1 路由层仅一处写侧归属链）

## Done 标准

- [ ] D820-1 删会话级联真删：建会话→落报告（断言 `origin_session_id` = 会话 id）→`DELETE /api/sessions/:id` 200→两键查零 + 无墓碑列 verify: `node_modules/.bin/vitest run tests/store/delete-session-cascade.test.ts -t "用例 1"`
- [ ] D820-2 列表 API 不再列出已删会话报告，且未删/consult 报告不被误删 verify: `node_modules/.bin/vitest run tests/store/delete-session-cascade.test.ts -t "用例 2"` 与 `-t "用例 3"`
- [ ] D820-3 旧库迁移不 fail-closed（无新列的老库 → 补列 + 列表 ok:true） verify: `node_modules/.bin/vitest run tests/store/delete-session-cascade.test.ts -t "用例 7"`
- [ ] D820-4 反向验收：抽掉级联（或抽掉谓词）→ 必红；还原 → 全绿（两次原始输出入交付报告） verify: `node_modules/.bin/vitest run tests/store/delete-session-cascade.test.ts`
- [ ] D820-5 FTS 折入改动的 5 条专项断言全绿（删除可用/触发器已换/rowid 对齐/孤儿清除不可召回/新库不重建） verify: `node_modules/.bin/vitest run tests/store/fts-sync-trigger.test.ts`
- [ ] D820-6 只读回归门全绿（不许改这三个文件）：D593 报告持久化 + 对话路由 + session-manager 事件日志 verify: `node_modules/.bin/vitest run tests/routes/diagnosis-report-persistence.test.ts tests/routes/conversations.test.ts tests/orchestrator/session-manager-eventlog.test.ts`
- [ ] D820-7 类型安全：本卡改动文件 `as any`/`as never`/`as unknown as` 零命中 verify: `bash -c '! grep -nE "as (any|never|unknown as)" src/store/session-store.ts src/routes/conversations.ts tests/store/delete-session-cascade.test.ts tests/store/fts-sync-trigger.test.ts'`
- [ ] D820-8 生产写链证明：`origin_session_id` 有**生产写入者**（非只有测试在写） verify: `grep -rn "originSessionId" src/routes/conversations.ts`

## 遗留 / 隐患（报队长 → 转 K3 登记台账）

1. **FTS 索引曾长期残留已删消息全文**（一级隐私面）：修复仅在「检出失效触发器的库」上做一次性对齐；若某库的触发器早已被别的路径换成新版但索引仍脏，本迁移不会清（判定条件只看触发器形态）。
2. **存量测试盲区**：`tests/session-store.test.ts:76` 删的是**无消息**的会话，`data-purger`/`im-inbound` 用假 store ⇒ 该 P0 缺陷自 `a6160381` 存活至今。**教训：有机制在场 ≠ 机制工作**——FTS 同步机制一直在，但从未真正工作过。
3. **FTS 表无租户列**，租户隔离靠 `JOIN agent_sessions`（D826 波2 处理）。
4. **本卡未给 consult 报告建会话链**（设计决定，非缺陷）：consult 路线无 chat session 可链；若未来要求「GA 报告随主体会话删」，需改 `src/routes/diagnosis.ts` 并单独派卡。
