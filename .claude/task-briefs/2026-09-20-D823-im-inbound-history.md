# Task Brief: D823 IM 通道会话历史恢复静默空转（T-D6）

> 生成: 2026-09-20 | 工作树: `.synova-wt-team14` | 分支: `team/win-batch14` | 基线: `d527abcb`（= origin/main@4f3bb21c + 派单件）
> 执行: 批十四小队 编码队员 B（L1 交互域）| 队长: 并行 CTO session | 自验: 队内队员（独立复核），本卡不主张任何"审计"结论
> 状态: **impl_done（2026-09-20）** —— 队长裁定 (a′) 已批并落地；6 条硬条件逐条落（见下「队长裁定」）；证据 `docs/synova/product-lines/evidence/D823-im-inbound-history-20260920.json`。待队内自验（verifier）独立复核 → K3。

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
本任务只改 L1 交互层（`src/l1/`，IM 通道入站），只调用相邻 L2（`src/agent/conversation-engine`）的**既有公开 API**，不越层、不改 L2。

---

## 规格（一句话契约 — 铁律 47）

- **输入**：IM 平台 webhook 入站消息（`InboundMessage{platform,senderId,content,timestamp,rawPayload}`）+ `SessionStoreLike` + `PIIScrubber`。`handleInboundMessage` 签名与返回类型**不变**（调用点 `src/routes/im.ts:54` 不在本卡写集 → 不改签名）。
- **输出**：`InboundResult{ok,degraded,sessionId?,error?}`。**行为增量**：同一发送者（`identity.userId`）的连续消息落**同一 sessionId** 且复用**同一 `ConversationEngine` 实例** → 第 N 轮模型上下文**真实包含**前 N-1 轮（修复前每轮只送当前一句）。
- **降级**（铁律 24/31，**全部显式，无静默**）：
  1. `store.db` 缺失（无法装配会话事件流 + 内置工具）→ `log.error`（载荷含 `degraded: true`）+ 跳过该两段装配，**回复仍生成**（不因降级丢消息）；
  2. 引擎装配抛错 → `log.error` + 本轮无回复（**不再静默**；修复前 `addToHistory?.()` 静默吞掉正是病根）；
  3. 跨进程重启（注册表冷）→ 该用户从**新会话**起步 + `log.info` 显式记录边界；**不写永远返回空的假恢复动作**。
- **边界（如实记录，不掩盖）**：跨重启的*历史恢复*受阻于 L2 —— 见下节「(a)/(b)/(a′) 判定」，本卡上报挂账（`memory/notes/proposed/2026-09-20-D823-im-inbound-history.md` §遗留 1）。

---

## 实证证据（开工第一步复核；全部为本工作树实测原始输出，非转述派单）

### 证据 1 · `addToHistory` 根本不存在（原病根）

```
$ grep -rn "addToHistory" --include="*.ts" --include="*.tsx" . | grep -v node_modules
./src/l1/im-inbound.ts:195:      (conv as unknown as { addToHistory?: (r: string, c: string) => void }).addToHistory?.(m.role, m.content);
$ grep -n "^  \(static \)\?\(async \)\?[a-zA-Z_][a-zA-Z0-9_]*(" src/agent/conversation-engine.ts
386: constructor / 472: setViewAdapter / 477: recordDecision / 488: getPhase / 493: getOrgId / 498: setOrgId
503: advancePhase / 517: getMessages / 522: getToolRegistry / 561: syncToSOG / 566: getOntologySummary
581: processMessage / 740: processMessageStream / 796: startDiagnosis / 819: serialize / 833: static fromState
```
→ 全仓唯一命中，写法是「`as unknown as` + 可选链」；ConversationEngine 公开 API 里**没有** `addToHistory` → 可选链把「方法不存在」吞成 undefined 调用 = **静默空转**（不报错、不降级、用户无感）。

### 证据 2 · 唯一的历史恢复 API `fromState` 实证**对模型上下文无效**（所以字面 (a) 不可用）

```
$ node_modules/.bin/tsx /tmp/d823-probe.ts      # 本工作树原始输出（节选）
getMessages.length BEFORE process = 3
provider call count = 1
provider saw roles = ["system"]
provider saw ROUND1 = false
provider saw ROUND2 = false
```
`fromState` 后 `getMessages()` 有 3 条，但 provider **实际只收到 1 条 system**——连**本轮**用户消息都进不去模型。
根因（file:line）：构造器按引用把 `this.messages` 注入 ToolLoopExecutor（`src/agent/conversation-engine.ts:444` `messages: this.messages`），`fromState` 却赋值换数组（`:844` `engine.messages = [...state.messages]`）→ toolLoop 手里引用脱钩。
仓库自认同源缺陷：`src/routes/conversations.ts:58-63`（决策记录「实测 fromState 存在 L2 侧缺陷…」）、`tests/e2e/conversation-flow.e2e.test.ts:527-530`（如实记录 + 划归 Stage 3）。

### 证据 3 · 会话级复用引擎**真的**让第 2 轮看到第 1 轮

```
$ node_modules/.bin/tsx /tmp/d823-probe2.ts     # 本工作树原始输出（节选）
calls = 2
call1 saw ROUND1 = true
call2 saw ROUND1 = true
call2 saw ROUND2 = true
call2 roles = ["system","user","assistant","user"]
call2 assistant round1 = true
```
既有先例：`src/routes/conversations.ts:222-241`（会话级引擎缓存 + FIFO 200，同款决策）。

### 证据 4 · 同文件第二处静默失败：`s.userId` 恒 undefined（「老用户恢复 Session」永远走不到）

```
$ sed -n '126,128p' src/l1/im-inbound.ts
      (s as unknown as Record<string, unknown>).userId === identity.userId ||
      (s as unknown as Record<string, unknown>).userId === identity.openId
$ sed -n '332,341p' src/store/session-store.ts    # listSessions 映射：不含 user_id
      id, orgId, phase, stateJson, title, createdAt, updatedAt
$ sed -n '183,191p' src/store/session-store.ts    # 表里明明有 user_id 列
        user_id TEXT,
```
→ `listSessions()` 行**丢弃 user_id** → `s.userId` 恒 `undefined` → `existing` 恒 undefined → **每轮新建会话**。`SessionRow`（`src/store/session-store.ts:100-108`）与 `getSession`（`:298-305`）同样不含 userId。

---

## (a) / (b) / (a′) 判定（卡面要求「这个判断写进规格报队长批」）

| 选项 | 内容 | 实测可行性 | 结论 |
|---|---|---|---|
| **(a) 字面版** | 接 `ConversationEngine.fromState` 做历史注入 | ❌ 证据 2：注入后 provider 连**本轮**都收不到（引用脱钩）= 假修复 | **不采用** |
| **(b)** | 显式删除「恢复」动作，IM 保持单轮 | ✅ 可做，但**验收点 1 永不成立**（第 2 轮仍只看当前一句）= 放弃卡面明示的产品意图 | **不采用**（备选，队长可否决） |
| **(a′) 采用** | **会话级引擎复用**：L1 自持 `userId → {sessionId, engine}` 注册表 + 同用户轮次串行；假恢复块删除 | ✅ 证据 3 实测成立；先例 `routes/conversations.ts:222-241`；**纯本文件改动，零越界** | **采用** |

**(a) 不可用的举证责任已履行**（证据 2 原始输出）。修 `fromState` 需改 `src/agent/conversation-engine.ts` —— **不在本卡写集**（派单 §四），且 `tests/e2e/conversation-flow.e2e.test.ts:530` 已把它划归 **Stage 3（L2 演进）**。
**(a′)** 满足验收点 1（第 2 轮模型上下文含第 1 轮，**穿真实入口**），且**不留任何永远返回空的假动作**；跨重启边界显式记日志 + 上报。
→ **队长裁定（2026-09-20）：同意 (a′)，(b) 否决。** 理由：卡面主判据（第 2 轮含第 1 轮）是 D823 的存在理由；(b) 等于放弃验收点 1（卡无完成态）；(a) 实测不可用且根因属仓库自认的 L2 缺陷（队长独立复核成立）。

### 队长 6 条硬条件（缺一条即退回）与落点

| # | 条件 | 本卡落点 |
|---|---|---|
| 1 | 注册表**有界 + FIFO 逐出**（对齐 `src/routes/conversations.ts:222-241` `SESSION_ENGINE_CACHE_MAX`） | `IM_SESSION_MAX = 200` + 超限逐出最旧（log.info 记账）→ Done D823-8 |
| 2 | **有测试证明上界**（灌 N+1 用户 → 尺寸 ≤ 上限且最旧被逐出） | 用例 ⑥：灌 201 用户 → 最旧用户下一条消息 sessionId **变化**（被逐出）+ 次新用户仍复用 → Done D823-8 |
| 3 | 同 userId **真单飞锁**且**不得跨用户串行** | `entry.chain` 按 userId 独立；用例 ⑦：A 被替身端点闸住时 B 仍能完成（跨用户不阻塞）→ Done D823-9 |
| 4 | sessionId 必须是**真 store 会话**，消息真落库 | 注册表只存 `store.createSession()` 的 id；用例 ① 断言 `store.getMessages(sessionId)` 含 user+assistant 两行 → Done D823-10 |
| 5 | **不得声称修好 L2 缺陷**（`fromState` 数组脱钩原封不动） | 本卡零改动 `src/agent/conversation-engine.ts`（写集外）；交付报告与 Note 一律表述为「上报挂账」 |
| 6 | 跨重启**不得留假恢复动作** | 假恢复块整段删除；冷启动仅 `log.info` 记边界 → Done D823-6（`getMessages` 镜像成员同步移除） |

**队长附带更正**：`docs/synova/product-lines/evidence/` 归**各卡产出者**写入（此前记成"队长队外产物"是队长笔误），**文件名必须带本卡任务号**（M5）→ 本卡写 `D823-*`，已授权。
**队长附带约束**：`listSessions` 丢 `user_id` 的根因在 `src/store/session-store.ts`（A 写集）→ **本卡不得改**，只在遗留清单写明 file:line（见 §遗留 3）。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- 纵向层级：**L1 交互**（`src/l1/im-inbound.ts`，IM 通道入站入口）；上游入口 `src/routes/im.ts:19-84`（`POST /api/im/feishu/webhook`）。
- 该层现有模块：`src/l1/im-inbound.ts`（本卡）、`src/l1/im-channel.ts`（IMRegistry）、`src/l1/qa-router.ts`。
- 新增/替换/扩展：**扩展**（改造既有函数内部的会话归位与引擎装配；**不加新导出、不加新文件**，测试除外）。

### b) 文件审计（物理 grep，全部在本工作树执行）
- `grep -rn "addToHistory"` 全仓 **1 命中** = `src/l1/im-inbound.ts:195`（不存在的方法）。
- `grep -n "as unknown as\|as never\|as any" src/l1/im-inbound.ts` → `:126`、`:127`、`:183`、`:189`、`:195`，共 5 处逃逸（含 1 处 `as never`）。
- 会话注册表先例：`src/routes/conversations.ts:62-63`（`sessionEngines` + FIFO 200）；身份缓存先例：本文件 `:41`（`identityCache`）。
- 类型缝合先例：`import type Database from 'better-sqlite3'`（`src/tui-v2/lib/commands.ts:18` 等 20 处）——用于把 `store.db` 类型化以消 `:183` 的 `as never`。
- 决策：**复用既有函数与先例；零新建文件（测试除外）；无冲突**。

### c) 决策
- 已有覆盖 → 复用 `ConversationEngine`（真实 L2）；**不新建历史 API**（属 L2 写集）。
- 无覆盖 → 会话归位改由 L1 自持注册表承担（store 行不含 user_id，无法按用户查会话）。
- 冲突 → 跨重启恢复**不做**（L2 缺陷，挂账上报），不造假动作。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链（SPEC→测试→实现→接线→验证）
① SPEC = 本文件（待队长批）；② 测试先行 = `tests/l1/im-inbound-history.test.ts` 先红；③ 实现 = `src/l1/im-inbound.ts`；④ 接线 = 既有入口 `src/routes/im.ts:54` 已调用 `handleInboundMessage`（**无新导出** → 无新接线缺口）；⑤ 验证 = 穿入口 vitest + 反向验收（抽掉修复必红）+ tsc/oxlint + 类型逃逸 grep 零命中。

### b) 执行约束
- 铁律 0-2（spec→test→impl→wire→review→merge）、0-3（禁 `git stash`/`--no-verify`/force push）。
- 铁律 24 + 31：**本卡病根就是静默** —— 新增失败路径一律 `log.error/warn`，不许 `.catch(() => {})` 空吞。
- 铁律 38 / CT-46：本卡清掉本文件全部 `as any`/`as never`/`as unknown as`（`grep` 零命中作为 Done 判据）。
- 铁律 47/48：会话注册表带 JSDoc 契约（输入/输出/降级/边界）；测试三类路径（正常/降级/边界）非空壳。
- 铁律 12：集成用例穿真实路由 + 真实 store + 真实引擎，**不 mock 管线**（LLM 端点用本机替身服务，provider 实现与 HTTP 层全真）。
- 铁律 37：删除假恢复块后不留死代码（`getMessages` 镜像成员同步清理，`grep` 复核零引用）。
- 小队固化件 M2（写集互斥 + 规格必含写集冲突清单）、M5（证据按任务号命名）。

### c) 决策参考系（D333 四步）
参考：第一性原理 + Anthropic 工程基线 + 开源实证 + 结论。
① 第一性原理：会话连续性的载体是**引擎自持的消息数组**，不是 store 里一行读回；
② Anthropic 工程基线：宁可显式降级并记账，也不留静默 no-op（silent failure 是最贵的失败）；
③ 开源实证：DSH/Claude Code 的会话续写靠**进程内会话对象复用**，跨进程才落盘重建；
④ 收敛检查：三者同向 → (a′) 会话级复用 + 边界显式日志 + 上报 L2 缺陷。

### d) 相关 Note 引用
- [x] `memory/notes/proposed/2026-09-20-D823-im-inbound-history.md`（本卡决策沉淀，proposed）

## Q2: 范围 — 正确的最简方案

做什么
- src/l1/im-inbound.ts：删 `:191-197` 假恢复块（`addToHistory` 可选链 + 恒假遍历）；新增进程内 IM 会话注册表（`userId → {sessionId, engine, chain, lastSeen}`，FIFO 200，`chain` 串行化同用户轮次）；`generateAIReply` 命中注册表即复用引擎、未命中才装配并登记（`registerBuiltinTools` 只调一次）；会话归位改走注册表（替代恒假的 `s.userId` 匹配）；清 5 处类型逃逸；`startSessionCleanup` 同步回收注册表（会话已删/空闲超时 → 移除条目）；文件头注释与真实行为对齐
- tests/l1/im-inbound-history.test.ts：新增（穿 `POST /api/im/feishu/webhook` 真实入口的集成用例，见 Q3）
- task-state/D823.json：卡面状态/spec/owner 字段
- .claude/task-briefs/2026-09-20-D823-im-inbound-history.md：本文件
- memory/notes/proposed/2026-09-20-D823-im-inbound-history.md：铁律 49 四态 Note
- docs/synova/product-lines/evidence/D823-im-inbound-history-20260920.json：M5 证据（本卡任务号命名，队长已授权本目录）

不做什么
- 不改 src/agent/conversation-engine.ts（`fromState` 缺陷修复属 L2/Stage 3，非本卡写集；仅上报）
- 不改 src/routes/im.ts（调用点 `:54` 存量 `as unknown as` 属该文件，本卡仅上报不改）
- 不改 src/l1/im-channel.ts（IM 发送通道，与本卡无关）
- 不改 src/l1/qa-router.ts（另一切片，与本卡无关）
- 不改 src/store/session-store.ts（A 卡 D820/D822 写集）
- 不改 src/routes/conversations.ts（A 卡 D822 写集）
- 不改 src/l4/temporal-baseline.ts（波2 D828 写集）
- 不改 src/init/engine-context.ts（波2 D827 写集）
- 不改 packages/evolution 下的文件（C 卡 D829 写集）
- 不改 scripts/audit/ 下任何文件（K3 审计域，红线）
- 不改 scripts/control-tower/ 下任何文件（控制塔域，红线）

#CRITERIA: C

## 写集

| 文件 | 归属（task/builtin + 理由） |
|---|---|
| `src/l1/im-inbound.ts` | task — 唯一实现改动点（会话归位 + 引擎复用 + 清逃逸 + 删假恢复） |
| `tests/l1/im-inbound-history.test.ts` | task — 新建，穿真实入口的配对测试（卡面写集已声明） |
| `task-state/D823.json` | task — 卡面状态/证据 |
| `.claude/task-briefs/2026-09-20-D823-im-inbound-history.md` | task — 本文件 |
| `memory/notes/proposed/2026-09-20-D823-im-inbound-history.md` | task — 铁律 49 四态 Note |
| `docs/synova/product-lines/evidence/D823-im-inbound-history-20260920.json` | task — M5 证据（`D823-*` 命名，队长已授权；M5 禁写他人任务号文件） |
| `.claude/current-brief` | builtin — 运行期指针（不提交，多队员共用 → 提交时按需设置） |

### 写集冲突清单（M2 硬要求 — 逐文件，禁目录级模糊；本卡**独立重核**，非转述队长扫描）

| 目标文件 | 未提交改动（证据①） | 声明该文件的其他卡（证据②） | 历史/分支（证据③） | 裁决 |
|---|---|---|---|---|
| `src/l1/im-inbound.ts` | 遍历 `git worktree list` 全部 150+ 工作树 `status --porcelain` → 除本工作树外**零命中** | `grep -l "src/l1/im-inbound.ts" task-state/*.json` → 仅 `D487.json`（status=audited，已合 main）与 `D823.json` | `git log --all -- src/l1/im-inbound.ts` 最新 `c796da55`（D487，已合）；无在飞分支独占 | ✅ B 独占 |
| `tests/l1/im-inbound-history.test.ts` | 全工作树**零命中**（文件当前不存在） | 无任何卡声明 | 无 | ✅ B 独占（新建） |
| `task-state/D823.json` | 本工作树 `M`（本人操作） | 仅 D823 自身 | — | ✅ B 独占 |
| `.claude/task-briefs/2026-09-20-D823-im-inbound-history.md` | 全工作树**零命中** | — | — | ✅ B 独占（新建） |
| `memory/notes/proposed/2026-09-20-D823-im-inbound-history.md` | 全工作树**零命中** | — | — | ✅ B 独占（新建） |

**队内两两不相交复核**（读同队卡面 write_set）：D820/D822 = `src/store/session-store.ts` + `src/routes/conversations.ts` + `tests/store/**`；D829 = `packages/evolution/**` + `src/routes/ga-calibration.ts` + 配对测试；D826/D827/D828 = `src/store/session-store.ts` / `src/routes/sessions.ts` / `src/init/engine-context.ts` / `src/store/session-projection.ts` / `src/l4/temporal-baseline.ts` → 与本卡（`src/l1/**` + `tests/l1/**`）**零交集**。
**越界声明**：本卡不碰 `src/store/**`、`src/routes/**`、`src/l4/**`、`src/init/**`、`packages/**`、`scripts/**`。
**上游依赖不越界**：本卡只用 `ConversationEngine` 既有公开 API（构造器 / `processMessage` / `getToolRegistry` / `getPhase`），**不改 L2 一行**。
**待队长确认项**：⑥「证据按任务号命名落 `docs/synova/product-lines/evidence/`」与队长扫描 §四（该目录登记为**队长队外产物**）冲突 → 本卡默认**不写**该目录，若队长要证据文件请回一句批准归属。

## Q3: 验收 — 入口 → 交互 → 结果

- **入口（从哪触发）**：`POST /api/im/feishu/webhook` —— express 真实路由（`src/routes/im.ts:19`）+ `app.listen(0)` + 真实 `fetch`。
- **处理（中间步骤）**：`handleInboundMessage`（L1）→ 身份解析 → 会话注册表归位 → 真实 `SessionStore`（better-sqlite3，`SYNOVA_DB_PATH=:memory:`）落库 → 真实 `ConversationEngine`（L2）→ 真实 `createProvider('deepseek')` 经真实 HTTP 打**本机替身 LLM 端点**（`POST /chat/completions`，OpenAI 兼容响应体）。**不 mock 管线、不替换 provider 模块、不在 `src/**` 加测试开关。**
- **结果（最终展示）**：第 2 轮请求体的 `messages` 含第 1 轮 user 文本与第 1 轮 assistant 文本；两轮 `sessionId` 相同。

| # | 用例 | 断言 |
|---|---|---|
| 1 | 正常路径 · 两轮同一发送者 | 第 2 轮 provider 请求含第 1 轮 user + assistant；roles = `system,user,assistant,user`；两轮 sessionId 相同 |
| 2 | 反向（修复前必红） | 同用例 1 —— 抽掉修复必须报红（见 Done 4） |
| 3 | 边界 · 不同发送者不串上下文 | 用户 B 的请求不含用户 A 文本；sessionId 不同 |
| 4 | 降级 · `store.db` 缺失 | 显式 `log.error`（**非静默**）+ 消息仍落库 + 返回 `ok:true` |
| 5 | 边界 · 会话清理后不复用已删会话 | `startSessionCleanup` 回收后该用户下一轮用**可用**会话（不向已删 session 写消息） |
| 6 | 上界 · 注册表有界 + FIFO 逐出（队长条件 1/2） | 灌 201 个用户后：最旧用户下一条消息 sessionId **变化**（已被逐出）；次新用户仍复用同一 sessionId |
| 7 | 并发 · 同用户单飞、跨用户不阻塞（队长条件 3） | A 的 LLM 调用被替身端点闸住时，B 的请求仍能完成（若跨用户串行则 B 超时失败） |

## 架构层: L1（交互层 · src/l1/im-inbound.ts；只调相邻 L2 的既有公开 API，不越层不改 L2）

## Done 标准

- [ ] D823-1 穿真实入口两轮上下文连续：同一 open_id 经 `POST /api/im/feishu/webhook` 发两轮 → 第 2 轮 provider 请求的 `messages` 含第 1 轮 user 文本与第 1 轮 assistant 文本，且两轮 `sessionId` 相同 verify: `node_modules/.bin/vitest run tests/l1/im-inbound-history.test.ts -t "D823-1"`
- [ ] D823-2 边界不串上下文：不同 open_id 两路的 provider 请求互不含对方文本、sessionId 不同 verify: `node_modules/.bin/vitest run tests/l1/im-inbound-history.test.ts -t "D823-2"`
- [ ] D823-3 降级非静默：`store.db` 缺失 → `log.error` 被调用（断言日志载荷 degraded）+ 消息仍落库 + `ok:true` verify: `node_modules/.bin/vitest run tests/l1/im-inbound-history.test.ts -t "D823-3"`
- [ ] D823-4 反向验收：抽掉修复（恢复 `:191-197` 假恢复块）→ D823-1 必须报红；还原 → 全绿（两次原始输出入交付报告） verify: `node_modules/.bin/vitest run tests/l1/im-inbound-history.test.ts -t "D823-1"`
- [ ] D823-5 类型安全：本文件 `as any`/`as never`/`as unknown as` 零命中，且 `addToHistory` 零命中 verify: `bash -c '! grep -nE "as (any|never|unknown as)" src/l1/im-inbound.ts && ! grep -n addToHistory src/l1/im-inbound.ts'`
- [ ] D823-6 死代码清零：假恢复块删除后文件内 `getMessages` 镜像成员同步移除、全仓引用复核 verify: `bash -c '! grep -n getMessages src/l1/im-inbound.ts'`
- [ ] D823-7 类型与全量回归：`tsc --noEmit` 本文件零新增错误 + 本测试文件全绿 verify: `node_modules/.bin/tsc --noEmit`
- [ ] D823-8 注册表有界 + FIFO 逐出（队长条件 1/2）：灌 201 用户 → 最旧用户下一条消息 sessionId 变化（被逐出）、次新用户仍复用 verify: `node_modules/.bin/vitest run tests/l1/im-inbound-history.test.ts -t "D823-8"`
- [ ] D823-9 并发不跨用户阻塞（队长条件 3）：A 被替身端点闸住时 B 仍完成 verify: `node_modules/.bin/vitest run tests/l1/im-inbound-history.test.ts -t "D823-9"`
- [ ] D823-10 真落库（队长条件 4）：两轮消息经真实 store API 落库（`getMessages(sessionId)` 含 user + assistant 两行，按序） verify: `node_modules/.bin/vitest run tests/l1/im-inbound-history.test.ts -t "D823-1"`
- [ ] D823-11 不越界不越权（队长条件 5）：`git diff --name-only` 仅含本卡写集 5 文件 + 证据；`src/agent/conversation-engine.ts` 零改动 verify: `bash -c '! git diff --name-only | grep -q "conversation-engine.ts"'`

## 遗留（不在本卡写集，报队长另派卡）

1. **L2 缺陷（P0 级，本卡上报）**：`ConversationEngine.fromState` 恢复的会话模型上下文**丢失**（连本轮用户消息都进不去）——影响面不止 IM：`src/routes/conversations.ts:233` 的进程重启恢复路径同源受害（靠会话级缓存规避）。修复 = `fromState` 原地替换数组（`splice`）或让 ToolLoopExecutor 每轮从 engine 读 `messages`；归属 **L2 / Stage 3 演进**（`src/agent/conversation-engine.ts` 非本卡写集）。
2. **调用点残留逃逸**：`src/routes/im.ts:54` `store as unknown as Parameters<typeof handleInboundMessage>[0]` 仍是 `as unknown as`（铁律 38 存量）——该文件非本卡写集，仅上报。
3. **`SessionStore.listSessions/getSession` 丢弃 `user_id`**：使"按用户找会话"在 L5 层不可表达；跨重启归位需 store 侧补映射或新增 `findSessionsByUser`（`src/store/session-store.ts` = A 卡写集，需队长排期）。
4. **跨重启 IM 历史恢复**未实现（依赖遗留 1）：当前边界 = 进程存活期内连续、重启后从新会话起步，已在代码内 `log.info` 显式记录，不掩盖。
