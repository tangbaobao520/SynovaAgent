---
状态: implemented
任务: D823
日期: 2026-09-20
决策: D823 —— IM 通道（`src/l1/im-inbound.ts`）的「恢复会话历史」**不做 store 读回注入**，改为**进程内会话级引擎复用**（`userId → {sessionId, engine}` 注册表 + 同用户生成链串行），并**删除**第 195 行调用不存在方法的假恢复动作；跨进程重启的历史恢复**如实记录边界 + 上报 L2 缺陷**，不留静默 no-op。
理由: 原实现 `(conv as unknown as { addToHistory?: ... }).addToHistory?.(...)` 调的**方法根本不存在**（全仓唯一命中；ConversationEngine 公开 API 无 `addToHistory`），`as unknown as` + 可选链把「不存在」吞成 undefined 调用 → IM 每轮只把当前一句送模型，**不报错、不降级、用户无感**。判定其替代方案时实测了 L2 唯一的历史恢复 API：`ConversationEngine.fromState` **对模型上下文无效** —— 构造器按引用把 `this.messages` 注入 ToolLoopExecutor（`src/agent/conversation-engine.ts:444`），`fromState` 却赋值换数组（`:844` `engine.messages = [...state.messages]`），引用脱钩后 provider 实测只收到 1 条 system，**连本轮用户消息都进不去**（本卡探测原始输出：`provider saw ROUND1 = false` / `provider saw ROUND2 = false`）。该缺陷仓库已自认（`src/routes/conversations.ts:58-63` 决策记录、`tests/e2e/conversation-flow.e2e.test.ts:527-530` 划归 Stage 3 / L2 演进），修复它需改 `src/agent/conversation-engine.ts`——不在本卡写集。故取第三路（非字面 a 也非 b）：会话连续性由**引擎实例自持的消息数组**承载（实测同一 engine 两轮 → 第 2 轮 roles `["system","user","assistant","user"]`，含第 1 轮 user+assistant），与既有先例 `src/routes/conversations.ts:222-241` 会话级引擎缓存同款；既不留下永远返回空的假动作，也不放弃卡面明示的产品意图。附带的第二处静默失败同批修掉：`listSessions()` 行丢弃 `user_id` 列（`src/store/session-store.ts:332-341`）导致 `s.userId` 恒 undefined →「老用户恢复 Session」永远走不到、每轮新建会话——会话归位改由 L1 注册表承担。
---

## 落地（本卡执行面，逐文件）

- **`src/l1/im-inbound.ts`**
  - 删 `:191-197` 假恢复块（`addToHistory` 可选链 + 恒假遍历）。
  - 新增进程内 IM 会话注册表：`userId → { sessionId, engine, chain, lastSeen }`，FIFO 上限 200（对齐 `routes/conversations.ts:63` `SESSION_ENGINE_CACHE_MAX` 先例）+ `chain` 串行化同一用户的连续轮次（复用引擎禁止并发进入）。
  - `generateAIReply`：引擎**命中即复用**，未命中才装配并登记；`registerBuiltinTools` 只在装配时调用一次。
  - 会话归位：`imSessions` 命中即复用 sessionId；未命中才 `createSession`（替代恒假的 `listSessions().find(s => s.userId === ...)`）。
  - 清 5 处类型逃逸（铁律 38/CT-46）：`:126/:127` 删 cast、`:183` `as never` → `db?: Database.Database` + 缺失**显式 log.error 降级**、`:189` `as unknown as` → 改传已构造的真实 `builtinStore`、`:195` 整行删。
  - `startSessionCleanup` 同步回收注册表（会话已删 / 空闲超时 → 移除条目，防复用已删会话导致外键写失败）。
- **测试**：`tests/l1/im-inbound-history.test.ts` —— 穿真实入口 `POST /api/im/feishu/webhook`（express + `listen(0)` + 真实 fetch）+ 真实 `SessionStore`（better-sqlite3 `:memory:`）+ 真实 `ConversationEngine` + 真实 `createProvider('deepseek')` HTTP 打到**本机替身 LLM 端点**（`POST /chat/completions`）；**不 mock 管线、不替换 provider 模块**。6 用例：①两轮上下文连续 + 真落库 ②不同发送者不串上下文 ③`store.db` 缺失降级非静默 ④同用户串行/跨用户不阻塞（替身端点闸门法）⑤注册表上界 200 + FIFO 逐出（灌 201 用户观测行为）⑥会话清理后不复用已删会话。
- **队长裁定（2026-09-20）**：(a′) 批准（(b) 否决），附 6 条硬条件（有界+逐出 / 上界测试 / 同用户单飞且跨用户不阻塞 / sessionId 必为真 store 会话 / 不得声称修好 L2 / 跨重启不留假动作）——逐条已落（见 brief §队长 6 条硬条件与落点）。
- **证据**：`.claude/task-briefs/2026-09-20-D823-im-inbound-history.md`（含 (a)/(b)/(a′) 判定与原始输出）、`docs/synova/product-lines/evidence/D823-im-inbound-history-20260920.json`（命令 + 原始输出）、`task-state/D823.json`。

## 依据（本单独立复现的物理事实，非转述派单）

- 独立复核 ①: `grep -rn "addToHistory" --include="*.ts" .`（排除 node_modules）→ **1 命中**，即 `src/l1/im-inbound.ts:195`；ConversationEngine 公开方法清单（`src/agent/conversation-engine.ts:386-833`）无此方法。
- 独立复核 ②（探针实测，本工作树）: `fromState` 恢复后 `getMessages().length = 3`，但 provider 实收 `roles = ["system"]`、`ROUND1 = false`、`ROUND2 = false` → **L2 历史注入 API 不可用**（不是"没人用"，是"用了也无效"）。
- 独立复核 ③（探针实测）: 同一 engine 实例连跑两轮 → `call2 roles = ["system","user","assistant","user"]`、`call2 saw ROUND1 = true` → 会话级复用**真实**达成上下文连续。
- 独立复核 ④: `listSessions()` 映射（`src/store/session-store.ts:332-341`）不含 `user_id`（表 `:186` 有该列）→ `s.userId` 恒 undefined，「老用户恢复 Session」为第二处静默空转。
- 同型先例: `src/routes/conversations.ts:58-63`（自认 fromState 缺陷，落会话级复用）；`tests/conversation-engine.test.ts:98-105`（fromState 仅断言"state 相符"，未断言模型上下文 → 缺陷逃逸点）。

## 参考

- 派单: `docs/synova/coordination/批十二-计划与派单-20260918.md` §2.2 D823；本批: `docs/synova/coordination/小队派单-批十四-win并行-20260920.md`
- 验收口径: `docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md`（五态 + 三问 + 四条禁止）
- 写集互斥: `docs/synova/coordination/批十四-开工前冲突扫描-20260920.md` §四（B‑D823 = `src/l1/im-inbound.ts` + 本测试文件）
- 决策参考系（D333）: 第一性原理（连续性的载体是引擎消息数组，不是 store 读回）+ Anthropic 工程基线（宁可显式降级记账，不留静默 no-op）+ DSH/Claude Code 实证（会话续写靠进程内会话对象复用）→ **收敛**：会话级复用 + 假动作删除 + 边界显式记录。

## 遗留（转下一单，非本卡范围）

1. **L2 缺陷挂账（P0 级，本卡上报）**: `ConversationEngine.fromState` 恢复的会话模型上下文**丢失**（含本轮用户消息）——影响面不止 IM：`src/routes/conversations.ts:233` 的进程重启恢复路径同源受害（该文件靠会话级缓存规避）。修复 = `fromState` 改为**原地替换数组**（`engine.messages.splice(0, len, ...state.messages)`）或让 ToolLoopExecutor 每轮从 engine 读 `messages`；归属 **L2 / Stage 3 演进**，写集非本卡 → 需 CTO 另派卡（含 `src/agent/conversation-engine.ts`）。
2. **调用点残留逃逸**: `src/routes/im.ts:54` `store as unknown as Parameters<typeof handleInboundMessage>[0]` 仍是 `as unknown as`（铁律 38 存量）——该文件不在本卡写集，如实上报，不越界改。
3. **跨重启 IM 历史恢复**未实现（依赖遗留 1）：当前边界为"进程存活期内连续；重启后该用户从新会话起步"，已在代码内 `log.info` 显式记录，**不掩盖**。
4. **`SessionStore.listSessions/getSession` 丢弃 `user_id`**：使"按用户找会话"在 L5 层不可表达；若要跨重启归位，需在 store 侧补 `user_id` 映射或新增 `findSessionsByUser`（`src/store/session-store.ts` = A 卡写集，需 CTO 排期）。
