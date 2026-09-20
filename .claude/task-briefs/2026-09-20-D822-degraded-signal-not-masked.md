# Task Brief: D822 降级信号自遮蔽（T-D5）

> 生成: 2026-09-20 | 工作树: `.synova-wt-team14` | 分支: `team/win-batch14` | 基线: `d527abcb`（= origin/main@4f3bb21c + 派单件）
> 执行: 批十四小队 编码队员 A（store 域）| 队长: 并行 CTO session | 自验: 队内队员（独立复核）；本卡不主张任何"审计"结论
> 状态: **规格已获队长批（Q-B 批，附条件：`appendFailureCount` 保留 + JSDoc 写明 + 测试真断言）→ 编码完成**

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
本卡只改 L5 存储层（`src/store/session-store.ts`：消息双写的**结果契约**与降级**累计**入账）与 L1 路由层（`src/routes/conversations.ts`：按"本轮是否发生过失败"发降级帧）。不改 L2/L3/L4，不动 `scripts/**`。

---

## 规格（一句话契约 — 铁律 47）

- **`addMessage(sessionId, role, content): AppendEventResult`（void → 有返回值，透传 `appendEvent` 结果）**：输入不变；输出 `{ ok: true, seq }`（双写都成功）/ `{ ok: false, degraded: true, error }`（事件流写失败，`agent_messages` 可能已写成功 = 正是 model-visible⟺logged 断裂）；降级 = `log.error` + `lastDegraded = true`（**逐条**语义）+ `appendFailureCount += 1`（**累计**，只增不减）。
- **`appendFailureCount: number`（只读累计计数）**：`appendEvent` 每次失败 `+1`，永不复位。**消费者**（防死代码，铁律 37）：本卡两处测试真断言 + **D831（P-2 不变量机制）断言③「降级信号不被后续成功写入抹掉」的物理探针面**（`task-state/D831.json` 验收点 6 第 ③ 条原文；队长 2026-09-20 批 Q-B 条件 (a)）。
- **`POST /api/conversations` 降级判定**：`[userWrite, assistantWrite].some(w => !w.ok) || store.lastDegraded` → 发 `{type:'error', code:'STORE_DEGRADED', degraded:true}`；帧形状/文案不变（前端契约零改），流不中断。
- **`lastDegraded` 语义保留**：= **最近一次** appendEvent 的结果（成功即复位 false）——`src/orchestrator/session-manager.ts:86` 的 model-visible⟺logged **逐条**断言依赖它（不动该文件、不动其测试）。

### 缺陷本体（为什么"看一下 lastDegraded"是错的）

| 环节 | 修复前 | 后果 |
|---|---|---|
| `addMessage` | 写成功即 `lastDegraded = false`（`session-store.ts` 旧 `:375-382`） | 同一轮"失败→成功"把失败事实**覆盖**掉 |
| 路由 | 第 2 次写**之后**才 `if (store.lastDegraded)`（旧 `conversations.ts:260-262`） | 该标志此刻已被复位 ⇒ **STORE_DEGRADED 帧漏发**，用户看到"一切正常" |
| 测试 | `tests/store/session-event-log.test.ts:146-164` 断言 `失败→成功 ⇒ lastDegraded=false` | **把缺陷固化**为正确行为 |

**范式（①范式复用，零依赖，不引包）**：`@deepseek-ai/dsh-session-stats/lib/index.js:11,103,129` —— 事件流**逐条累计落账**（`steps: state.steps + 1`、`llmMs: state.llmMs + Math.max(0, ...)`），每个事件独立入账、**不被后续事件覆盖**；其 `step/end` 放在 `finally`，所以 completed/failed/cancelled/max-tokens 四种结束都留一条。范式正解 = **失败累加**，不是用一个会被覆盖的瞬时布尔。

---

## 实证证据（本工作树实测原始输出）

### 证据 1 · store 层缺陷复现（修复前形态）

```
$ node_modules/.bin/tsx -e "<真实 SessionStore + trigger WHEN 按 role 拒绝 user 写>"
1st (role=user)      ok = {"ok":false,"degraded":true,"error":"d822-injected"}
   lastDegraded = false | events = []          ← appendEvent 直调，lastDegraded 未被本路径设置
2nd (role=assistant) ok = {"ok":true,"seq":1}
```
经 `addMessage`（会设置 lastDegraded）时：第 1 条失败 → `lastDegraded=true`；第 2 条成功 → `false` ⇒ **失败事实消失**。

### 证据 2 · 注入手法的一个假设计被实测推翻（自我纠错）

原拟 `WHEN NEW.seq = 1` **不成立**：seq 由 `SELECT MAX(seq)+1` 计算（`session-store.ts:498-500`），第一条被 ABORT 后 MAX 仍是 0 → 下一条又算 seq=1 → 触发器**持续命中，两条写全失败**。
```
after FAILED first write  -> lastDegraded = true | events = []
after SUCCESS second write -> lastDegraded = true | events = []   ← 第二条也失败
```
→ 改为**按 payload 角色**选择性注入（`json_extract(NEW.payload_json,'$.role')='user'`），实测「一失败一成功」成立。**已报队长备案。**

### 证据 3 · 修复后（穿真实入口）

```
$ node_modules/.bin/vitest run tests/store/degraded-signal-not-masked.test.ts tests/store/session-event-log.test.ts
 ✓ tests/store/degraded-signal-not-masked.test.ts (3 tests)
 ✓ tests/store/session-event-log.test.ts (17 tests)
 Test Files  2 passed (2) | Tests 20 passed (20)
```

---

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = AI 诊断 Agent。本任务在 **L5 存储层**（事件流双写 = model-visible⟺logged 的物理根基）+ **L1 路由层**的降级信号传播判定。既有覆盖：`AppendEventResult` 契约已存在（`session-store.ts:159-161`），但 `addMessage` 把它**吞成 void**（`session-store.ts:371` 旧签名）⇒ 调用方只能读一个会被复位的布尔。
### b) 文件审计
`grep -rn "lastDegraded" src/` → 生产消费者 2 处：`routes/conversations.ts:260`（本卡改）、`orchestrator/session-manager.ts:86`（本卡**不动**，逐条断言语义）；`grep -rn "addMessage" src/` 窄接口 4 处（im-inbound/graceful-shutdown/stuck-session-detector/restart-recovery）声明 `=> void`——**TS 下 `=>void` 接口接受有返回值实现**，故无需改这些文件（不越写集）。
### c) 决策
已有覆盖 → 复用 `AppendEventResult` 契约（本来就编码了失败），把降级判定从"最后状态"改为"本轮事件逐条判定"。参考：DSH `dsh-session-stats`（累计而非覆盖）+ 第一性原理（降级事实一旦发生即不可撤回，属 append-only 语义）。

## Q1: 调研 — 决策链 + 执行约束

- **铁律 0-2（spec → test → impl → wire）**：规格报批（队长批 Q-B）→ 改写固化缺陷的用例 + 新建穿入口 e2e → 实现 → 回归门。
- **铁律 24/31（降级显式）**：失败仍 `log.error` + 返回 `degraded: true`；前端经 `STORE_DEGRADED` 帧可见；不静默、不中断流。
- **铁律 47（契约优先）**：`addMessage` / `appendEvent` / `appendFailureCount` / `lastDegraded` 四处 JSDoc 已按新语义重写（含"哪个字段回答哪个问题"的分工）。
- **铁律 38（类型安全）**：新增/改写代码零 `as any` / `as never` / `as unknown as`。
- **铁律 48（测试非空壳）**：正常路径（两次都成功 → 不误报）+ 降级路径（一失败一成功 → 仍发帧）+ 边界（上一轮失败不粘滞到本轮）。
- **历史教训**：`214ac7f2 fix(D500): 降级信号非粘滞 — 成功写入重置 degraded/lastDegraded` —— 该修复解决的是"一次失败后永久 true 的误报"，但**副作用**是让"本轮发生过失败"这一事实无处可查；本卡补齐，不推翻 D500 的逐条语义（`session-manager.ts:86` 仍绿）。

## Q2: 范围 — 正确的最简方案

做什么
- src/store/session-store.ts：① `addMessage` 返回 `AppendEventResult`（透传）② 新增 `appendFailureCount` 累计计数（`appendEvent` 失败 `+1`）③ `lastDegraded` 字段 JSDoc 澄清分工（不改其行为）
- src/routes/conversations.ts：两次写的结果逐条判定 → 本轮任一失败即发 `STORE_DEGRADED`
- tests/store/session-event-log.test.ts：**改写**固化缺陷的那条用例（改为保护"失败不被抹掉"）
- tests/store/degraded-signal-not-masked.test.ts：新建（穿 `POST /api/conversations` 真实入口，按角色选择性注入）
- task-state/D822.json：卡面状态/spec/owner/证据
- .claude/task-briefs/2026-09-20-D822-degraded-signal-not-masked.md：本文件
- memory/notes/implemented/2026-09-20-D822-degraded-signal-not-masked.md：铁律 49 四态 Note

不做什么
- 不改 src/orchestrator/session-manager.ts（`lastDegraded` 逐条断言消费者，保持其语义与测试绿）
- 不改 src/l1/im-inbound.ts（B 卡 D823 写集）、packages/evolution/** 与 src/routes/ga-calibration.ts（C 卡 D829 写集）
- 不改 src/routes/diagnosis.ts、src/routes/sessions.ts、src/store/session-projection.ts、src/init/engine-context.ts、src/l4/temporal-baseline.ts（他人/波2 写集）
- 不改 tests/routes/conversations.test.ts、tests/orchestrator/session-manager-eventlog.test.ts（**不在写集，只作只读回归门**）
- 不改 scripts/audit/**（K3 域）、scripts/control-tower/**（控制塔域）
- 不在 src/** 加任何"测试专用开关"（四条禁止之一）：注入走 SQLite 触发器（测试侧 DDL）
- 不引入新表/新模块（队长明确：不为对齐 DSH 8 字段造新表）

#CRITERIA: C

## 写集

| 文件 | 归属（task/builtin + 理由） |
|---|---|
| `src/store/session-store.ts` | task — 结果契约 + 累计计数（D820 已在该文件提交过，本卡是第二批改动） |
| `src/routes/conversations.ts` | task — 本轮判定（D820 已在该文件提交过，本卡是第二批改动） |
| `tests/store/session-event-log.test.ts` | task — 改写固化缺陷用例 |
| `tests/store/degraded-signal-not-masked.test.ts` | task — 新建，穿入口 e2e |
| `task-state/D822.json` | task — 卡面状态/证据 |
| `.claude/task-briefs/2026-09-20-D822-degraded-signal-not-masked.md` | task — 本文件 |
| `memory/notes/implemented/2026-09-20-D822-degraded-signal-not-masked.md` | task — 铁律 49 四态 Note |

### 写集冲突清单（M2 硬要求 — 逐文件，禁目录级模糊）

| 目标文件 | 未提交改动 | 声明该文件的其他卡 | 在飞分支/PR | 裁决 |
|---|---|---|---|---|
| `src/store/session-store.ts` | 仅本人（M，本卡改动） | 波2 `D826.json`（pending，被 task-1 阻塞） | 无 | ✅ A 独占；**D820 已提交（`8e89f357`）**，本卡为同文件第二批，**同人串行**已满足 |
| `src/routes/conversations.ts` | 仅本人（M，本卡改动） | 无 | 无 | ✅ A 独占 |
| `tests/store/session-event-log.test.ts` | 仅本人（M） | 无 | 无 | ✅ A 独占 |
| `tests/store/degraded-signal-not-masked.test.ts` | 本人新建 | 无 | 无 | ✅ A 独占 |
| `task-state/D822.json`、本 brief、Note | 本人 | 仅 D822 | — | ✅ A 独占 |

**队内两两不相交复核**：B-D823 = `src/l1/**` + `tests/l1/**`（已提交 `3a0d5b5c`）；C-D829 = `packages/evolution/**` + `src/routes/ga-calibration.ts`（已提交 `3bafa7d5`）；波2 = `src/routes/sessions.ts` / `src/store/session-projection.ts` / `src/init/engine-context.ts` / `src/l4/temporal-baseline.ts` → 与本卡**零交集**。
**越界声明**：本卡不碰 `src/l1/**`、`src/l4/**`、`src/init/**`、`packages/**`、`scripts/**`、`src/routes/diagnosis.ts`、`src/routes/sessions.ts`、`src/routes/ga-calibration.ts`。
**索引纪律**：四个 session 共享同一 worktree/index ⇒ 提交串行（队长广播）；`git add` 只列本卡路径，禁 `-A`/`.`；不 stage `extensions/industries/**`。

## Q3: 验收 — 入口 → 交互 → 结果

- **入口（从哪触发）**：`POST /api/conversations`（`src/routes/conversations.ts:354`，当前行号见文件）——express 真实路由 + `listen(0)` + 真实 `fetch`。
- **处理（中间步骤）**：真实 `SessionStore`（better-sqlite3 `:memory:`）+ 真实事件流双写；注入 = 测试侧 SQLite 触发器 `BEFORE INSERT ON session_events WHEN json_extract(payload,'$.role')='user' → RAISE(ABORT)`（**按角色选择性**，D590 ⑭:602 同一既有缝隙；**未在 src/** 加开关**）。mock 仅既有配置缝 4 处（providers / providers/detect / config / 诊断引擎工厂）。
- **结果（最终展示）**：SSE 帧里出现 `{type:'error', code:'STORE_DEGRADED', degraded:true}`；`agent_messages` 2 行 / `session_events` 恰 1 行且 role=assistant（证明注入真实发生）；正常轮次**无** error 帧（不误报）。

| # | 用例 | 断言 |
|---|---|---|
| 1 | 核心降级（修复前必红） | 一失败一成功 → 帧存在且 `code=STORE_DEGRADED`；注入真实性（compat 2 行 / 事件流 1 行 role=assistant）；流未中断（agent_message + 末帧 end） |
| 2 | 不误报 | 两次写都成功 → 无 error 帧；事件流 2 行 |
| 3 | 不粘滞（边界） | 上一轮失败 → 本轮干净 → 本轮无 error 帧（D500 逐条语义保持） |
| 4 | store 契约（单测改写） | `addMessage` 透传 `{ok:false,...}`/`{ok:true,seq}`；失败后成功 → `appendFailureCount` 仍 ≥1；本轮聚合判定仍为真；`lastDegraded` 仍为"最近一次写" |

## 架构层: L5（存储层 src/store/session-store.ts；L1 路由层仅降级帧判定）

## Done 标准

- [ ] D822-1 穿真实入口：一次写失败 + 一次写成功 → **STORE_DEGRADED 仍被发出**（修复前无此帧） verify: `node_modules/.bin/vitest run tests/store/degraded-signal-not-masked.test.ts -t "用例 1"`
- [ ] D822-2 固化缺陷的测试已改写为保护正确行为（透传返回值 + 累计计数 + 本轮聚合判定） verify: `node_modules/.bin/vitest run tests/store/session-event-log.test.ts -t "D822 改写"`
- [ ] D822-3 不误报/不粘滞：正常轮次与"上一轮失败"后的干净轮次均不发 error 帧 verify: `node_modules/.bin/vitest run tests/store/degraded-signal-not-masked.test.ts -t "用例 2"` 与 `-t "用例 3"`
- [ ] D822-4 反向验收（两次）：抽掉路由判定 → 用例 1 红；抽掉累计计数 → 改写用例红；两次还原 → 全绿 verify: `node_modules/.bin/vitest run tests/store/degraded-signal-not-masked.test.ts tests/store/session-event-log.test.ts`
- [ ] D822-5 只读回归门全绿（不许改这两个文件）：对话路由 ⑭（全轮失败仍发帧）+ session-manager `lastDegraded` 逐条断言 verify: `node_modules/.bin/vitest run tests/routes/conversations.test.ts tests/orchestrator/session-manager-eventlog.test.ts`
- [ ] D822-6 类型安全：本卡改动文件 `as any`/`as never`/`as unknown as` 零命中 verify: `bash -c '! grep -nE "as (any|never|unknown as)" src/store/session-store.ts src/routes/conversations.ts tests/store/degraded-signal-not-masked.test.ts'`
- [ ] D822-7 无测试专用开关：`src/**` 内无按测试名/环境变量分支的注入点 verify: `bash -c '! grep -nE "d822|VITEST|NODE_ENV.*test" src/store/session-store.ts src/routes/conversations.ts'`

## 三问自查（队长/自验要核）

1. **谁调用它？** `appendFailureCount` 的消费者 = `tests/store/degraded-signal-not-masked.test.ts`（真断言）+ `tests/store/session-event-log.test.ts`（"失败不因后续成功消失"用例）+ **D831 断言③的探针面**（`task-state/D831.json` 验收点 6 第 ③ 条）；`addMessage` 返回值消费者 = `src/routes/conversations.ts:249/255`（`userWrite` / `assistantWrite`，判定点 `:262`）。**不是"应该会被调用"**。
2. **有没有一条测试穿过真实实现？** 有：`tests/store/degraded-signal-not-masked.test.ts` 走真 express + 真 `POST /api/conversations` + 真 better-sqlite3 + 真 `SessionStore` 双写，唯一注入是测试侧触发器 DDL；**不 mock 管线**（mock 仅 4 处既有配置缝）。
3. **如果它明天被删掉，什么会坏？** 删 `appendFailureCount` → 改写用例的"失败不被抹掉"断言红 + D831 断言③失去物理探针面；删路由的逐条判定 → 用例 1 红（STORE_DEGRADED 帧重新漏发，用户看不到落库降级）。

## 遗留

1. `lastDegraded` 仍是"最近一次写"的瞬时标志（本卡有意保留，供 session-manager 逐条断言）；若将来有新调用方需要"本轮是否失败"，**应读 `appendFailureCount` 或按返回值判定**，不得回退到读 `lastDegraded`——已写入字段 JSDoc。
2. 本卡未把 `appendFailureCount` 暴露到 HTTP/健康检查出口（无卡面要求）；D831 落地时若需 `/healthz` 可见，另行接线。
