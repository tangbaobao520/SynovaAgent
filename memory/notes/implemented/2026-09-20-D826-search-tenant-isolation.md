---
状态: implemented
任务: D826
日期: 2026-09-20
决策: `SessionStore.search()` 签名收紧为 `search(query, orgId, limit=10)`（**orgId 必填**，编译期强制）；两条 SQL（LIKE 中文分支 / FTS5 英文分支）**各自**加 `AND s.org_id = ?`；FTS5 检索词一律**字面短语化**（`toFtsLiteralPhrase`）；路由侧新增**租户权威链**（`req.auth?.orgId` → 否则服务端实例 org `loadConfig().orgId`），**永不采信 `?orgId=` / `x-synova-token` 等调用方可控来源**；FTS5 语法类异常从 500 降为 **400**。
理由: ① `search()` 两条 SQL 都 `SELECT s.org_id` 却**都不过滤** —— 任一租户可召回全部租户的会话内容（`agent_messages` 无 org_id 列，只能经 `JOIN agent_sessions` 过滤）；② FTS5 `MATCH` 直接吃用户输入，实测 `q="` / `q=a"b` / `q=*` / `q=alpha AND` 均使 sqlite **抛异常** → 路由 `catch` 落 **500**，且 `a OR b` 被当**布尔算符**（误召回）；③ 路由对 `?orgId=` 若作租户来源 = **客户端自选受害租户**（"加了过滤却被入参指定租户" 比不修更危险）。**判据定位**：当前是 D590 单机本地信任模型，今天实际泄露风险 ≈ 0；本卡是**为"第 2 个客户接入"做纵深防御**（卡面锚点），**不宣称"当前正在泄露"**。
---

## 落地（本卡执行面，逐文件）

- **`src/store/session-store.ts`**：`search(query, orgId, limit = 10)`（**必填在前、默认值在后**——TS 不允许必填参数跟在可选参数后；漏改调用点会被 tsc 直接抓住）；LIKE 分支 `... WHERE m.content LIKE ? AND s.org_id = ?`；FTS5 分支 `... MATCH ? AND s.org_id = ?`；新增 `toFtsLiteralPhrase(query)`（`` `"${q.replace(/"/g,'""')}"` ``，JSDoc 契约）；**`agent_messages_fts` 建表段零改动**（A 的 FTS 修复保住的 `snippet()` 不能回退）。
- **`src/routes/sessions.ts`**：新增 `resolveSearchOrgId(req)` 权威链（`req.auth?.orgId` → `loadConfig().orgId` + `log.debug`）；客户端 `?orgId=` **一律忽略**，存在且 ≠ 权威 org → `log.warn({requestedOrgId, authoritativeOrgId, path})`（攻击尝试可见）；`limit` 收敛到 [1,50]；FTS5 语法类异常 → **400 `SEARCH_QUERY_INVALID`**。
- **调用点同步（编译期证明 tsc 零 error）**：`src/cli.ts:204`（`conv.getOrgId()`）、`src/tui-v2/lib/commands.ts:214`（会话 org；取不到则提示不搜）、`src/agent/builtin-tools.ts:108`（`getOrgId()`）；存量测试 `tests/session-store.test.ts`（3 处）、`tests/store/fts-sync-trigger.test.ts`（4 处）签名同步，**断言语义未改**。
- **测试**：`tests/store/search-tenant-isolation.test.ts`（新建 7 用例，真实路由 + 真实 `SessionStore(:memory:)` 同库两租户 + 真实 JWT 验签中间件）。
- **证据**：`docs/synova/product-lines/evidence/D826-search-tenant-isolation-20260920.json`、`.claude/task-briefs/2026-09-20-D826-search-tenant-isolation.md`（v3 规格 + 裁定记录）、`task-state/D826.json`。

## 依据（本单独立复现的物理事实，非转述派单）

- 独立复核 ①：`search` 实测位于 `src/store/session-store.ts:605`（卡面写 `:534`，**漂移 ~70-100 行**）；两条 SQL 各止于 `WHERE m.content LIKE ?` / `WHERE agent_messages_fts MATCH ?`，**均无 org 过滤**；`agent_messages` 建表 `:235-241` 无 org_id 列。
- 独立复核 ②（探针实测 8 例）：`MATCH "\""` → `THROW: unterminated string`；`MATCH "*"` → `THROW: unknown special query:`；`MATCH "alpha AND"` → `THROW: fts5: syntax error near ""`；`MATCH "alpha OR delta"` → 命中 2 行（**布尔语义**）。字面短语化后全部 OK 且 `alpha OR delta` → 0 行。
- 独立复核 ③：**原验收点 3「substr 按字节截断切半个汉字」是空判据** —— SQLite `instr`/`substr` 对 TEXT 是**字符级**（131 字中文串截 80 字符仍为原文字符级子串、无 U+FFFD）⇒ 一行不改也通过。队长独立复核后裁定删除并替换为两条真判据。
- 独立复核 ④（鉴权面）：`jwtAuthMiddleware` 对白名单**在解析 Authorization 之前早退**（`src/middleware/auth.ts:282-284`）；`/api/sessions` 在白名单（`:124`，D590 裁决①）⇒ 带合法 JWT 时 `req.auth` **仍为空**；而 `extractAuthFromRequest()` 的优先级 2 是 `x-synova-token`（`:401-402`，`orgId = parts[1]` **无签名校验**）。⇒ 队长据实把权威来源从 `extractAuthFromRequest()` 改为 **`req.auth` only**（裁定 B）。
- 反向判别力：**三半各自可证伪**（抽掉 LIKE 过滤 → D826-1 红/D826-2 绿；抽掉 FTS5 过滤 → D826-2 红/D826-1 绿；抽掉字面短语化 → D826-4 红）。**缺陷态同样绿的用例已标注**：D826-5（snippet 契约，非行为修复）、D826-7（limit 边界，弱）—— 不计入防护强度。

## 参考

- 派单/卡：board `task-5`（队长修正版，含行号修正与空判据作废）
- DSH 借鉴（①范式复用，不引包）：`dsh-session-query-sqlite/lib/index.js:106-116`（FTS5 + `UNINDEXED` 辅助列 + `tokenize='unicode61'`）→ **借鉴"可过滤元数据不进倒排索引"的范式；因硬约束（不得改 `agent_messages_fts` 列定义）本卡不新增 `org_id UNINDEXED` 列**，改用 JOIN 等价实现，并登记为性能优化候选（有理由地不采用）。
- 决策参考系（D333）：第一性原理（隔离必须在 L5 唯一真相点强制；**租户身份只能来自认证层，不能来自请求参数**）+ Anthropic 基线（编译期强制 > 运行时检查 > 文档约定）+ DSH 实证 → 收敛：**orgId 必填 + 两条 SQL 都过滤 + 字面短语化 + 400 化 + 权威链只取已验证身份**。

## 遗留（转下一单，非本卡范围）

1. **🔴 鉴权模型层缺陷（队长已升级处置；结论留 K3/CTO）**：白名单路由上 `req.auth` 恒空（`:282-284`），而 `extractAuthFromRequest()` 会落到**无签名**的 `x-synova-token`（`:401-402`）⇒ **白名单上本机调用方可自称任意租户**。影响前缀（`:124` 起）：`/api/sentinel/`、`/api/cockpit/`、`/api/diagnosis/consult`、`/api/diagnosis/reports`、`/api/conversations`、`/api/sessions`、`/api/notifications`、`/api/solutions`、`/api/ga/clients`、`/api/ga/switch`、`/api/ontology/graph/`、`/api/ontology/ingest`、`/api/knowledge/ask`。本卡**不引入鉴权、不修 header 校验**（D590 属创始人裁决 + 超写集）。
2. **`listSessions()` 无租户过滤**：`GET /api/sessions` 列表 = 同型泄露面（`src/routes/sessions.ts` 直接调）→ 建议另立卡（同判据 D）。
3. **`GET /api/sessions/:id` 无 org 校验**：任取 id 可读任意租户会话 → 同型泄露面，另立卡。
4. **多租户阶段需按施工图 §5.5 重构为会话级鉴权**；建议在 26 线验收点显式挂账。
5. **TUI 显示 `<mark>` 原文**（`src/tui-v2/lib/commands.ts:219`，cosmetic）→ 与 `src/cli.ts:209` 的 ANSI 着色对齐，另立卡。
6. **DSH `UNINDEXED org_id` 免 join 优化** → 性能卡候选。
7. **验证边界（禁 overclaim）**：本卡隔离断言在 store+路由层 + **模拟的已验证身份边界**上完成；因白名单早退，**本进程内无法用真实 JWT 中间件驱动租户身份** —— 交付里不得写成"穿真实 JWT 中间件的租户隔离"。
