# Task Brief: D826 search() 租户隔离（两条 SQL + 注入面 + HTML 面结论）

> 生成: 2026-09-20 | 工作树: `.synova-wt-team14` | 分支: `team/win-batch14` | 基线: HEAD（含 A 的 D820 `8e89f357`）
> 执行: 批十四小队 编码队员 B | 队长: 并行 CTO session | 卡: board `task-5`（修正版，以此为准）
> 状态: **规格 v2（已按队长预审修正 org 解析链；待批）**
> v1 → v2 变更：删除客户端可控的 `?orgId=` 租户来源（队长预审意见，安全面必改）；调用点清单正式登记进写集；新增一处**需队长一句话裁定**的白名单细节（§裁定点）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是驻扎企业的组织诊断 Agent（诊断是手段，增长是目的）。本卡属**多租户隔离**（判据 D：跨租户泄露面；锚点 = 第 2 个客户接入前必须修）。不涉及产品方向；属技术决策（隔离强制点选在 L5 存储层）。

---

## 规格（一句话契约 — 铁律 47）

- **输入**：`SessionStore.search(query: string, limit: number, orgId: string)` —— `orgId` **必填**（编译期强制：少传 = tsc 报错，铁律 35）。HTTP 面：`GET /api/sessions/search?q=&limit=` —— **不接受任何形式的目标租户入参**。
- **输出**：`SearchResult[]`，**只含调用者所属租户**的会话行（`SearchResult.orgId` 恒等权威 org）。现状返回**全部租户**（`WHERE` 只有 `m.content LIKE ?` / `agent_messages_fts MATCH ?`，两条 SQL 都 **SELECT 了 `s.org_id` 却不过滤**）。
- **org 权威链（v3 — 队长裁定 B，纯已验证身份）**：
  1. **`req.auth?.orgId`** —— 唯一可作租户权威的来源（JWT 经中间件验签后才存在）；
  2. `req.auth` 缺失 → **服务端实例 org** `loadConfig().orgId`（= `SYNOVA_ORG_ID`，默认 `'default'`）+ `log.debug` 记账；
  3. **永不**把 `?orgId=` / `x-synova-token` / 任何其他 header 或 query 当租户来源；
  4. 不变量：**任何路径都必须带 org 过滤**（不允许"不过滤"分支）。
  **为什么不用 `extractAuthFromRequest()`**：该 helper 优先级 2 是 `x-synova-token`（`src/middleware/auth.ts:401-402`，`orgId: parts[1]` **无签名校验**）；而 `/api/sessions` 在 JWT 白名单内（`:124`）→ 中间件在白名单上**早退、不验签**（`:282-284`）→ `req.auth` 恒空 ⇒ 走该 helper 等于把租户权威交给**未验证的 header**（换汤不换药，且更隐蔽）。裁定 B 直接取 `req.auth`，把修复放在正确位置：**将来该路径移出白名单即自动获得按 JWT 的租户隔离，无需再改本卡代码**。
  5. 客户端 `?orgId=` 仍然**一律忽略**；若存在且 ≠ 权威 org → `log.warn({ requestedOrgId, authoritativeOrgId, path })` 留审计线索（攻击尝试可见，不静默）。
- **降级**（铁律 24/31，全部显式）：
  1. **FTS5 语法非法**（`q="`、`q=a"b`、`q=*`、`q=alpha AND` 实测均 **THROW** → 现状经路由 `catch` 落 **500**）→ 修复为**字面短语化**（`"` + 内容内 `"`→`""` + `"`）；若仍出现未预期异常 → **400** `SEARCH_QUERY_INVALID`（不是 500）+ `log.warn`；
  2. LIKE 分支（CJK）保持参数化 `%q%`（无语法注入面）；
  3. `agent_messages_fts` **schema 零改动**（不得 contentless、不得改列定义 —— A 的 FTS 修复 `98c24872` 刚保住 `snippet()`）；snippet 的 `<mark>` 是 **CLI 既有契约**，不删。

### 裁定记录（已闭合，勿再推演）

- **v1 → v2**：队长预审指出 `?orgId=` 是客户端可控租户选择器 → 删除（安全面必改）。
- **v2 → v3（队长裁定 B）**：我实测发现 `/api/sessions` 在 JWT 白名单内（`src/middleware/auth.ts:124`），中间件白名单早退不验签（`:282-284`）⇒ `extractAuthFromRequest()` 会落到**无签名**的 `x-synova-token` 分支（`:401-402`）。队长据实改判：**权威只取 `req.auth?.orgId`**（方案 B），`extractAuthFromRequest` 不作为租户来源。队长原"无条件 401"意见亦据 D590 创始人裁决与 D575 承诺撤回。

### ⚠️ 验证边界（交付必须逐字照写，禁 overclaim）

- 本卡对 org 隔离的验证在 **store + 路由层 + 一个"模拟已验证身份"的中间件**上完成；
- **不是**"穿真实 JWT 中间件"—— 因为 `/api/sessions` 白名单早退，**本进程内无法用 JWT 走生产中间件驱动租户身份**（这是既有鉴权模型的形态，不是本卡遗漏）；
- 测试里的 JWT 是**真实签发 + 真实 `verifyJwtToken` 校验**（`src/middleware/auth.ts:146` / 验签导出），只是"中间件挂载顺序"这一处由测试 app 显式完成；路由、SQL、store 全真实、**未 mock 管线**。

---

## 开工前实测（本工作树原始输出，非转述）

### 证据 1 · 现状：租户过滤确实缺失，两条 SQL 都缺（行号已重核）

```
$ grep -n "search(query" src/store/session-store.ts
605:  search(query: string, limit = 10): SearchResult[] {
LIKE 分支（CJK）:608-620  … WHERE m.content LIKE ?          ← 无 s.org_id
FTS5 分支     :626-637  … WHERE agent_messages_fts MATCH ?  ← 无 s.org_id
两条都 SELECT s.org_id 但只用于返回
$ grep -n "CREATE TABLE IF NOT EXISTS agent_messages" -A 7 src/store/session-store.ts   → :235-241，无 org_id 列
$ grep -n "store.search(q, 10)" src/routes/sessions.ts   → :62
```

### 证据 2 · FTS5 注入面（实测 8 例，原始输出）

```
$ node_modules/.bin/tsx /tmp/d826-fts-probe.ts
MATCH "alpha" → OK rows=1 ["s1"]
MATCH "alpha OR delta" → OK rows=2 ["s1","s2"]     ← 布尔语义被采纳＝不是字面短语
MATCH "\"" → THROW: unterminated string            ← 现状 → 路由 catch → 500
MATCH "a\"b" → THROW: unterminated string
MATCH "alpha \"" → THROW: unterminated string
MATCH "*" → THROW: unknown special query:
MATCH "NEAR(alpha delta)" → OK rows=0 []
MATCH "alpha AND" → THROW: fts5: syntax error near ""
--- 字面短语化后（"…" + 内部 " 翻倍）---
MATCH "alpha OR delta" → OK rows=0                 ← 字面短语生效（不再误召回 s1/s2）
MATCH """" → OK rows=0                             ← 单双引号不再抛
MATCH "a""b" → OK rows=0
```

### 证据 3 · `search()` 全部调用点（自核清单 —— 队长验收点 3 要求登记）

```
$ grep -rn "\.search(" --include="*.ts" src/ tests/ | grep -v node_modules
# 需同步的 SessionStore.search 调用点（其余为 KnowledgeStore / AgentMemoryStore / EvidencePool / IMA 的**同名异类**方法）：
src/routes/sessions.ts:62                  store.search(q, 10)             ← org 源：extractAuthFromRequest(req)?.orgId ?? loadConfig().orgId
src/cli.ts:204                             store.search(query, 5)          ← org 源：conv.getOrgId()
src/tui-v2/lib/commands.ts:214             ctx.store.search(q, 5)          ← org 源：ctx.store.getSession(ctx.sessionId)?.orgId（取不到则提示不搜）
src/agent/builtin-tools.ts:108             store.search(findingId, 5)      ← org 源：registerBuiltinTools 的 getOrgId()
tests/session-store.test.ts:94,102,109     store.search(...)               ← 需同步（保留原断言语义）
tests/store/fts-sync-trigger.test.ts:74,79,92,125  store.search(...)       ← 需同步（会话均建于 org-x）
# 不需改：tests/evidence-pool.test.ts（EvidenceStore 另一套 API，非 SessionStore）
# 不需改：tests/sessions-api.test.ts（走 HTTP；白名单 + 实例 org 缺省 → 仍 200 + results 数组）
```

### 证据 4 · FTS5 snippet 的 HTML 面 —— 明确结论

| 问题 | 结论（含证据） |
|---|---|
| 响应是纯文本还是含标签？ | **含标签，且是既有契约**：FTS5 分支 `:630` `snippet(agent_messages_fts, 1, '<mark>', '</mark>', '...', 40)`；`src/cli.ts:209` **显式**把 `<mark>` 转 ANSI 黄（`r.snippet.replace(/<mark>/g, YELLOW)`）→ 删标记会打断 CLI 功能 |
| 有 HTML 渲染消费者吗？ | **无**（`grep -rln "sessions/search"` 全仓仅 3 处：`src/routes/sessions.ts`、`src/tools/action-expert-tools.ts:29`、`src/tools/accuracy-tools.ts:52,183`；后两者只读 `results.length`/`results[0]`，**不渲染 snippet**；无 web/dsh 插件消费者） |
| 注入面判定 | **本卡注入面 = FTS5 `MATCH` 语法（已修：字面短语化 + 400 化），不是 HTML**。`<mark>` 透传在"无 HTML 消费者"前提下不构成 XSS；**若将来出现 HTML 渲染消费者则升级** → 登记遗留 |

### 证据 5 · DSH 借鉴（①范式复用，读源码自研、不引包）

```
$ sed -n '106,116p' /Users/wane/.nvm/.../dsh-session-query-sqlite/lib/index.js
    CREATE VIRTUAL TABLE IF NOT EXISTS persisted_docs USING fts5(
      text, session_id UNINDEXED, seq UNINDEXED, type UNINDEXED, time UNINDEXED,
      surface UNINDEXED, codepoint_length UNINDEXED, tokenize = 'unicode61')
```
**借鉴点（范式，不引包）**：把「可过滤元数据」放 **UNINDEXED 辅助列** —— 过滤不进倒排索引、可在 FTS 表上直接过滤，免 JOIN。
**本卡为何不照搬（有理由地说不）**：卡面硬约束「不得改 `agent_messages_fts` 列定义/不得 contentless」（来自 A 的 FTS 修复）→ **不新增 `org_id UNINDEXED` 列**，改用等价手段 `JOIN agent_sessions s ON s.id = ... AND s.org_id = ?`（`agent_messages` 无 org_id 列，必须经 join）→ 登记为**性能优化候选**（搜索量上来可另立卡，收益 = 免 join + 索引更小）。

---

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- **L5 存储层**（`src/store/session-store.ts` = 隔离唯一真相点）+ **L1 交互层**（`src/routes/sessions.ts`、`src/cli.ts`、`src/tui-v2/lib/commands.ts`）+ **L2 工具缝**（`src/agent/builtin-tools.ts` 调 L5 store 的既有缝）。
- 本卡是**修 bug（隔离缺失）+ 签名收紧**，不是新能力。

### b) 文件审计（物理 grep）
- `search` 定义唯一命中 `:605`；`SearchResult` 类型 `:118-124`（无其他消费者，仅本文件 + route 透传）。
- 隔离既有件：`agent_sessions.org_id`（建表 `:183-191`，`createSession :293` 写入）；`agent_messages` 无 org_id。
- 扩展既有签名 + 4 处调用点同步；新建 1 个测试文件。

### c) 决策
- 已有覆盖 → 复用 `JOIN agent_sessions`；不新增 FTS 列（硬约束）。
- 无覆盖 → FTS5 输入必须**字面短语化**（现状零转义；DSH 亦无此层，属本仓自有缺口）。
- 冲突 → `session-store.ts` 与 A 的 D822、`routes/sessions.ts` 与 A 的 D827 同文件 → **队长已裁定串行、我优先**。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = 本文件（v2，待批）→ ② 测试先行（`tests/store/search-tenant-isolation.test.ts` 先红）→ ③ 实现（签名 + 两条 SQL + 字面短语化 + org 权威链）→ ④ 接线（4 处调用点，**tsc 即证据**）→ ⑤ 验证（穿真实 HTTP 入口 + 两半各自反向必红 + 注入面 4 例）。

### b) 执行约束（每条带 verify）
- rule：**两条 SQL 各自可证伪**（队长硬要求 1）verify：分别抽掉 LIKE / FTS5 过滤 → 对应用例分别报红（两次原始输出）
- rule：**缺陷态仍绿的用例必须显式标注**（队长硬要求 2）verify：报告逐用例标注"是否具反向判别力"
- rule：**反向验收禁 git 还原动作**（共享 index）verify：`cp` 备份 + `sha256` 复原（队长硬要求 3）
- rule：**客户端入参不得改变租户** verify：带 `?orgId=<另一租户>` 的请求结果 **恒等于**不带该参数的权威 org 结果（同一断言两种输入）
- rule：`agent_messages_fts` schema 零改动 verify：`git diff` 不含 `CREATE VIRTUAL TABLE` / `tokenize=` 变更
- rule：铁律 38/CT-46 零逃逸 verify：`grep -nE "as (any|never|unknown as)"` 改动文件零命中
- 铁律 0-2 / 24+31 / 47+48 / 12；禁 `--no-verify` / `git stash` / `git add -A`（共享 index）

### c) 决策参考系（D333 四步）
参考：第一性原理 + Anthropic 工程基线 + DSH 实证 + 结论。
① 第一性原理：租户隔离必须在**唯一真相点（L5）**强制；**租户身份只能来自认证层，绝不能来自请求参数**；
② Anthropic 基线：fail-closed + 编译期强制（required param）> 运行时检查 > 文档约定；
③ DSH 实证：`UNINDEXED` 辅助列免 join（本卡因硬约束不采用，登记优化）；
④ 收敛：**orgId 必填 + 权威 org 只取认证层/服务端实例 + 两条 SQL 都过滤 + 输入字面短语化 + 非法输入 400 而非 500**。

### d) 相关 Note
- [x] `memory/notes/implemented/2026-09-20-D826-search-tenant-isolation.md`（impl_done 时落 implemented/，`check-notes-lifecycle.sh` 硬约束）

## Q2: 范围 — 正确的最简方案

做什么
- src/store/session-store.ts：`search(query, limit, orgId)` 签名收紧（orgId 必填）+ LIKE 分支加 `AND s.org_id = ?` + FTS5 分支加 `AND s.org_id = ?` + FTS5 查询**字面短语化**（转义工具函数带 JSDoc 契约）
- src/routes/sessions.ts：调用点同步 + **org 权威链**（`req.auth?.orgId` ?? `loadConfig().orgId`）+ 忽略并审计客户端 `?orgId=` + 非法查询 → 400（非 500）
- src/cli.ts：**仅** `/search` 调用点传 `conv.getOrgId()`（队长提醒：不改该文件其他部分）
- src/tui-v2/lib/commands.ts：`/search` 传 `ctx.store.getSession(ctx.sessionId)?.orgId`（取不到则不搜 + 明确提示，绝不发无 org 查询）
- src/agent/builtin-tools.ts：`store.search(findingId, 5, getOrgId())`
- tests/store/search-tenant-isolation.test.ts：**新建**（穿真实 HTTP 入口 + 真实 SessionStore）
- tests/session-store.test.ts、tests/store/fts-sync-trigger.test.ts：签名同步（**保留原断言语义**，不改判定）
- task-state/D826.json、.claude/task-briefs/2026-09-20-D826-search-tenant-isolation.md、memory/notes/implemented/2026-09-20-D826-search-tenant-isolation.md、docs/synova/product-lines/evidence/D826-search-tenant-isolation-20260920.json

不做什么
- 不改 src/init/engine-context.ts （A 的 D827 写集）
- 不改 src/store/session-projection.ts （A 的 D827 写集）
- 不改 src/tools/action-expert-tools.ts （HTTP 消费者；实例 org 缺省已足够；若队长要求显式传 org 我再纳入）
- 不改 src/tools/accuracy-tools.ts （同上，HTTP 消费者）
- 不改 tests/sessions-api.test.ts （走 HTTP；白名单 + 实例 org 缺省 → 断言仍成立）
- 不改 tests/evidence-pool.test.ts （EvidenceStore 另一套 API，非 SessionStore）
- 不改 extensions/industries/saas-tech/thresholds.json （测试污染，存量缺陷，禁 stage）
- 不改 scripts/audit/ 下任何文件 （K3 域）
- 不改 scripts/control-tower/ 下任何文件 （控制塔域）
- 不改 src/agent/conversation-engine.ts （D823 已交付；`fromState` 缺陷属 L2 另派卡）

**硬约束（"改哪一段"的边界，非排除项）**：`src/store/session-store.ts` 内 `agent_messages_fts` 的建表段**不得变更**（不得 contentless、不得改列定义/tokenize）—— 该文件本身在写集内（签名与两条 SQL 要改）。

#CRITERIA: C

## 写集（最终清单 — 机器可核，M2）

| 文件 | 归属（task/builtin + 理由） |
|---|---|
| `src/store/session-store.ts` | task — 唯一真相点：签名 + 两条 SQL 过滤 + FTS5 字面短语化 |
| `src/routes/sessions.ts` | task — HTTP 入口调用点 + org 权威链 + 400 化 |
| `src/cli.ts` | task — **仅** `/search` 调用点同步（`conv.getOrgId()`） |
| `src/tui-v2/lib/commands.ts` | task — **仅** `/search` 调用点同步（会话 org） |
| `src/agent/builtin-tools.ts` | task — **仅** `:108` 调用点同步（`getOrgId()`） |
| `tests/store/search-tenant-isolation.test.ts` | task — **新建**：隔离 + 注入面 + HTML 面结论（穿真实入口） |
| `tests/session-store.test.ts` | task — 存量调用点同步（保留原断言） |
| `tests/store/fts-sync-trigger.test.ts` | task — 存量调用点同步（保留原断言） |
| `task-state/D826.json` | task — 卡面状态/证据 |
| `.claude/task-briefs/2026-09-20-D826-search-tenant-isolation.md` | task — 本文件 |
| `memory/notes/implemented/2026-09-20-D826-search-tenant-isolation.md` | task — 铁律 49 Note |
| `docs/synova/product-lines/evidence/D826-search-tenant-isolation-20260920.json` | task — M5 证据（`D826-*` 命名） |

### 写集冲突清单（M2 硬要求 —— 逐文件；本卡独立重核）

| 目标文件 | 未提交改动 | 同队其他卡 | 裁决 |
|---|---|---|---|
| `src/store/session-store.ts` | **无**（A 的 D820 已提交 `8e89f357`） | **A 的 D822 也声明**（队长队列：D822 排我之后） | ✅ 我优先，A 等我提交 |
| `src/routes/sessions.ts` | **无** | **A 的 D827（task-6）也声明**（队长：串行，我优先） | ✅ 我优先，A 等我提交 |
| `src/cli.ts` | 无 | 无任何卡声明（队长已核，无冲突） | ✅ 我独占（仅 `/search` 一处） |
| `src/tui-v2/lib/commands.ts` | 无 | 无任何卡声明 | ✅ 我独占（仅 `/search` 一处） |
| `src/agent/builtin-tools.ts` | 无 | 无任何卡声明 | ✅ 我独占（仅 `:108` 一处） |
| `tests/store/search-tenant-isolation.test.ts` | 不存在 | 无 | 🆕 我独占（新建） |
| `tests/session-store.test.ts` | 无 | 无 | ✅ 我独占（仅签名同步） |
| `tests/store/fts-sync-trigger.test.ts` | 无 | 无 | ✅ 我独占（仅签名同步） |
| `task-state/D826.json` / brief / note / evidence | 不存在或我独有 | 无 | ✅ 我独占 |

**越界声明**：不碰 `src/init/**`、`src/store/session-projection.ts`（A 的 D827）、`src/tools/action-expert-tools.ts`、`src/tools/accuracy-tools.ts`、`tests/sessions-api.test.ts`、`tests/evidence-pool.test.ts`、`extensions/**`、`scripts/**`、`packages/**`。

## Q3: 验收 — 入口 → 交互 → 结果

- **入口**：`GET /api/sessions/search?q=&limit=` —— 真实 express 路由（`src/routes/sessions.ts:51-67`），测试用 `src/server.ts` 的 `createServer()`（**同 `tests/sessions-api.test.ts` 既有范式**：真实 server + `SYNOVA_DB_PATH=:memory:`）。
- **处理**：真实路由（真实 JWT/白名单认证层）→ org 权威链 → 真实 `SessionStore`（better-sqlite3 `:memory:`）→ 两条 SQL 各走一次（中文词 → LIKE；ASCII 词 → FTS5）。
- **结果**：响应 `results` 只含权威租户的会话；跨租户词返回 `[]`；客户端 `?orgId=` 不改变结果。

| # | 用例 | 断言 | 反向判别力 |
|---|---|---|---|
| 1 | org-A 身份搜**只在 org-B 存在**的中文词（LIKE 分支） | org-A → `[]`；org-B 同词 → 命中（同词对照，排除"词不存在"） | 抽掉 LIKE 过滤 → 红 |
| 2 | org-A 身份搜**只在 org-B 存在**的英文词（FTS5 分支） | org-A → `[]`；org-B → 命中 | 抽掉 FTS5 过滤 → 红 |
| 3 | **客户端不得选租户**：org-A 身份 + `?orgId=org-B` | 结果 **恒等于** org-A 不带该参数的结果（且 **不**出现 org-B 行）；伴随 `log.warn` 审计 | 改回信任 `?orgId=` → 红 |
| 4 | 注入面：`q="`、`q=a OR b`、`q=*`、`q=alpha AND` | 状态码 ∈ {200,400}，**绝不为 500**；`a OR b` 当**字面短语** | 去掉字面短语化 → 500/误召回 → 红 |
| 5 | HTML 面：snippet 契约 | `<mark>` 保留（CLI 依赖 `src/cli.ts:209`）+ 消费者清单证明无 HTML 渲染 | 契约断言（**标注无反向判别力**） |
| 6 | 边界：未认证（白名单语义）→ 服务端实例 org；`limit` 非法 | **另起一个不注入 `req.auth` 的 app**（= 生产白名单路径的真实形态）→ 200 且只返回实例 org 行（**绝不返回全部**）；`limit` 非法/超界 → 200 + 结果数 ≤ 50 | 去掉实例回落（→ 报错或全量）→ 红 |

**判据定位（禁 overclaim）**：D826 的真实价值是**为多租户阶段做纵深防御** —— 当前是 D590 单机本地信任模型，**今天实际泄露风险 ≈ 0**；卡面锚点"**第 2 个客户接入前必须修**"正是此意。**不得**写成"当前正在泄露"。

**测试身份注入方式**（用例 1/2/3 需要 org-A/org-B 身份）：`DEV_MODE=false` + `JWT_SECRET=<测试密钥>` + `signJwtToken({ sub, role, orgId: 'org-A' })`（`src/middleware/auth.ts` 既有导出）→ `Authorization: Bearer <token>`。**不 mock 认证层**（穿真实中间件 + 真实 JWT 校验）。

## 架构层: L5（存储层 src/store/session-store.ts · 隔离唯一真相点）+ L1（交互层 src/routes/sessions.ts、src/cli.ts、src/tui-v2/lib/commands.ts）+ L2 工具缝（src/agent/builtin-tools.ts 仅传 org）

## Done 标准

- [ ] D826-1 跨租户不泄露（LIKE 分支）：org-A 身份搜只在 org-B 存在的中文词 → `[]`；org-B 同词 → 命中 verify: `node_modules/.bin/vitest run tests/store/search-tenant-isolation.test.ts -t "D826-1"`
- [ ] D826-2 跨租户不泄露（FTS5 分支）：同断言，英文词走 FTS5 verify: `node_modules/.bin/vitest run tests/store/search-tenant-isolation.test.ts -t "D826-2"`
- [ ] D826-3 客户端入参不得选租户：org-A 身份 + `?orgId=org-B` → 结果恒等于 org-A 无参结果，且无 org-B 行 verify: `node_modules/.bin/vitest run tests/store/search-tenant-isolation.test.ts -t "D826-3"`
- [ ] D826-4 注入面：`q="` / `q=a OR b` / `q=*` / `q=alpha AND` → 200 或 400，绝无 500；`a OR b` 当字面短语 verify: `node_modules/.bin/vitest run tests/store/search-tenant-isolation.test.ts -t "D826-4"`
- [ ] D826-5 全部调用点已同步（编译期证明）：`tsc --noEmit` 中本卡 5 个 src 文件零 error verify: `node_modules/.bin/tsc --noEmit | grep -E "session-store|routes/sessions|src/cli|tui-v2/lib/commands|builtin-tools"`
- [ ] D826-6 存量回归：两个存量测试文件仍全绿（签名同步未改判定） verify: `node_modules/.bin/vitest run tests/session-store.test.ts tests/store/fts-sync-trigger.test.ts`
- [ ] D826-7 反向验收（两半各自可证伪）：分别抽掉 LIKE / FTS5 过滤 → 用例 1 / 用例 2 各自报红；还原 → 全绿（两次原始输出入证据） verify: `node_modules/.bin/vitest run tests/store/search-tenant-isolation.test.ts`
- [ ] D826-8 FTS schema 零改动：`git diff -- src/store/session-store.ts` 不含 `agent_messages_fts` 建表段变更 verify: `bash -c '! git diff -- src/store/session-store.ts | grep -E "^[+-].*(CREATE VIRTUAL TABLE|tokenize=)"'`
- [ ] D826-9 类型安全：改动文件 `as any`/`as never`/`as unknown as` 零新增 verify: `grep -nE "as (any|never|unknown as)" src/store/session-store.ts src/routes/sessions.ts src/cli.ts src/tui-v2/lib/commands.ts src/agent/builtin-tools.ts`

## 遗留（不在本卡写集，报队长）

1. **`listSessions()` 同样无租户过滤**（`GET /api/sessions` 列表 = 同型泄露面，`src/routes/sessions.ts:26-35` 直接调）：本卡不动（卡面只要求 search）→ 建议另立卡（同判据 D）。
2. `GET /api/sessions/:id` 无 org 校验（任取 id 可读任意租户会话）→ 同型泄露面，另立卡。
3. **🔴 鉴权模型层缺陷（队长已升级处置，台账登记 + 评估升级创始人；结论留给 K3/CTO，本卡不修）**：
   - 事实 ①：`jwtAuthMiddleware` 对白名单路径**在解析 Authorization 之前早退**（`src/middleware/auth.ts:282-284`）⇒ 白名单路由上**合法 JWT 也不被验签**，`req.auth` 恒空；
   - 事实 ②：`extractAuthFromRequest()` 的优先级 2 是 `x-synova-token`，`orgId = parts[1]` **无任何签名校验**（`:401-402`）；
   - 影响面（白名单前缀，`:124` 起）：`/api/sentinel/`、`/api/cockpit/`、`/api/diagnosis/consult`、`/api/diagnosis/reports`、`/api/conversations`、`/api/sessions`、`/api/notifications`、`/api/solutions`、`/api/ga/clients`、`/api/ga/switch`、`/api/ontology/graph/`、`/api/ontology/ingest`、`/api/knowledge/ask`；
   - 含义：**白名单路由上本机调用方可自称任意租户**（D590「信任边界是机器」在多租户阶段失效，而 D826 锚点正是"第 2 个客户接入前"）；
   - 本卡边界：**不引入鉴权、不修 header 校验**（属 D590 创始人裁决 + 超写集）→ 仅点名 file:line + 影响面。
4. **白名单 + 单机本地信任模型**（D590 裁决①）本身意味着"本机任何进程可读全部会话"→ 多租户/公网阶段须按施工图 §5.5 重构为会话级鉴权（本卡不引入鉴权，仅保证"入参不能选租户"）→ 建议在 26 线验收点里显式挂账。
5. TUI 直接显示 `<mark>` 原文（`src/tui-v2/lib/commands.ts:219`，cosmetic）→ 建议与 `src/cli.ts:209` 的 ANSI 着色对齐，另立卡。
6. DSH `UNINDEXED org_id` 免 join 优化（证据 5）→ 性能卡候选。
