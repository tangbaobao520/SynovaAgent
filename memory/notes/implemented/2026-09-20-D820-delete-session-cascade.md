---
状态: implemented
日期: 2026-09-20
决策: D820 —— 删会话必须级联删掉该会话的诊断报告：新增 `diagnosis_checkpoints.origin_session_id` 归属链列（幂等迁移）；`deleteSession` 接上零调用者的 `deleteDiagnosisCheckpoints`（键=sessionId + 链=origin_session_id 双删）；`listDiagnosisReports` 的 total/rows 共用「会话存在性」谓词隐藏孤儿行；对话桥写侧（`src/routes/conversations.ts:307`）传 `originSessionId: sessionId`。**consult 路线不记链**（无 chat session 可链）→ GA 报告不随会话删。
理由: phase=5 归档行的 `session_id` 存的是 **reportId**（consult `diagnosis.ts:600-602`、对话桥 `conversations.ts:307-309` 两条路径一致），且该表**无 FK、无 CASCADE** ⇒ 「把既有的 `deleteDiagnosisCheckpoints` 接进 `deleteSession`」是**空操作**（按会话 id 删，一行都匹配不到），卡面验收必红。故修复的承重部分是**新增归属链列**，按 sessionId 键删的那一半只是防御性。读侧谓词**不能**是裸 `EXISTS(agent_sessions)`：consult 报告的 `session_id` 是 `rpt_xxx`，永无对应会话行 ⇒ 裸 EXISTS 会把**全部 GA 报告**从列表抹掉（比原缺陷更严重的回归）；故 `origin_session_id IS NULL` 的行（consult 报告 + 全部存量旧行）照旧列出，只隐藏「链到已不存在会话」的孤儿（纵深防御：老库/旧二进制删过会话的残留）。改动**不改归档键**（键=reportId 是 D593 承重语义，`diagnosis.ts:858` 冷读依赖它）。
---

## 落地（本卡执行面，逐文件）

| 文件 | 改动 |
|---|---|
| `src/store/session-store.ts` | ① `initSchema` 幂等 `ALTER TABLE diagnosis_checkpoints ADD COLUMN origin_session_id TEXT`；② `saveDiagnosisCheckpoint` 接受可选 `originSessionId` + `ON CONFLICT(session_id,phase) DO UPDATE ... COALESCE(excluded.origin_session_id, 原值)` 保链；③ `deleteSession` 调 `deleteDiagnosisCheckpoints(id)`；④ `deleteDiagnosisCheckpoints` 契约扩为双删（键 + 链）；⑤ `listDiagnosisReports` total/rows 共用 `PHASE5_LIST_PREDICATE`；⑥（折入）FTS 触发器修复 |
| `src/routes/conversations.ts` | 对话桥归档写点传 `originSessionId: sessionId`（唯一一处，队长授权的最小改动） |
| `tests/store/delete-session-cascade.test.ts` | 新建，8 用例穿真实入口（`POST /api/conversations` ×3 → `DELETE /api/sessions/:id` → `GET /api/diagnosis/reports`） |
| `tests/store/fts-sync-trigger.test.ts` | 新建，FTS 折入改动 5 条防回归 |

## 反向验收（两次原始输出见交付报告）

- **抽掉 A**（注释 `deleteSession` 里的级联调用）→ `Tests 4 failed | 3 passed`（用例 1/2/3/4 红）。
- **抽掉 B**（谓词还原为 `phase = 5`）→ 用例 8 红（`Tests 1 failed | 7 passed`）——**第一次抽 B 时全绿**，据此补了「存量孤儿归档行」用例，让纵深防御那一半也**可证伪**（否则谓词是没测试保护的装饰）。
- 两次还原后全绿：`Tests 8 passed (8)`。

## 相关

- 卡：`task-state/D820.json`；规格与批注：`.claude/task-briefs/2026-09-20-D820-delete-session-cascade.md`
- 折入的卡外缺陷：`memory/notes/implemented/2026-09-20-D820-fts-delete-trigger-broken.md`（原 `proposed/`，随 D820 进 `impl_done` 一并迁移）
- 只读回归门（**不在写集、不许改**）：`tests/routes/diagnosis-report-persistence.test.ts`（D593 用例 1/5/7a/8）、`tests/routes/conversations.test.ts`、`tests/orchestrator/session-manager-eventlog.test.ts` —— 全绿，证明「不误删 + 不 503 + 降级路径不变」。
- 遗留：consult 报告无会话链（设计决定）；FTS 表无租户列（D826 波2）；`src/routes/diagnosis.ts` 的 consult 路线若将来需随会话删，须单独派卡（扩写集请求已被队长驳回）。
