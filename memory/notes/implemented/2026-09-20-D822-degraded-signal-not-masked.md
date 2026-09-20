---
状态: implemented
日期: 2026-09-20
决策: D822 —— 降级事实**累加入账**，不再用一个会被后续成功重置的瞬时布尔承载：`addMessage` 由 `void` 改为**透传 `AppendEventResult`**；新增只读累计计数 `appendFailureCount`（`appendEvent` 每次失败 `+1`，永不复位）；`POST /api/conversations` 的降级判定由「最后一次写是否失败」改为「**本轮是否发生过失败**」（两次写结果逐条判）；`lastDegraded` 保留为「最近一次写的结果」以维持 `session-manager.ts:86` 的**逐条**断言语义。
理由: 修复前 `addMessage` 写成功即把 `lastDegraded` 复位（`src/store/session-store.ts` 旧 `:375-382`），而路由层在第 2 次写**之后**才检查它（`src/routes/conversations.ts` 旧 `:260-262`）⇒ 同一轮「用户消息写失败 → 助手回复写成功」时失败事实被**覆盖**，`STORE_DEGRADED` 帧漏发——用户看到"一切正常"，实际 `agent_messages` 与 `session_events` 已断裂（model-visible⟺logged 破）。且该缺陷被测试**固化**：`tests/store/session-event-log.test.ts:146-164` 断言「失败→成功 ⇒ lastDegraded=false」。范式参照 `@deepseek-ai/dsh-session-stats/lib/index.js:11,103,129`：事件流逐条累计落账（`steps: state.steps + 1`、`llmMs: state.llmMs + ...`），每个事件独立入账、**不被后续事件覆盖**（其 step/end 放在 `finally`，completed/failed/cancelled/max-tokens 四种结束都留一条）。正解是**失败累加**而非覆盖。注意与既有 D500 修复（`214ac7f2`「降级信号非粘滞」）的关系：那次解决"一次失败后永久 true 的误报"，本次**不推翻**它——逐条语义（`lastDegraded`）与累计语义（`appendFailureCount` + 返回值）各司其职，两条测试都在。
---

## 落地（本卡执行面，逐文件）

| 文件 | 改动 |
|---|---|
| `src/store/session-store.ts` | ① `addMessage(...): AppendEventResult`（透传，契约 JSDoc 重写：调用方**必须**按本次返回值判定本轮）② 新增 `appendFailureCount`（JSDoc 写明消费者：本卡两处测试 + **D831 断言③的物理探针面**）③ `appendEvent` catch 内 `appendFailureCount += 1` ④ `lastDegraded` JSDoc 澄清它只回答"最近一次写" |
| `src/routes/conversations.ts` | `userWrite` / `assistantWrite` 承接返回值；判定 `failedWrites.length > 0 \|\| store.lastDegraded`；log 增带 `failedWrites` / `appendFailureCount` |
| `tests/store/session-event-log.test.ts` | **改写**那条固化缺陷的用例：断言透传结果（`failed.ok===false` / `recovered.ok===true`）+ `appendFailureCount` 只增不减 + 本轮聚合判定仍为真 + `lastDegraded` 仍为"最近一次写" |
| `tests/store/degraded-signal-not-masked.test.ts` | 新建：穿 `POST /api/conversations` 真实入口，按 **payload 角色**选择性注入失败（`json_extract`），断言 ①STORE_DEGRADED 帧存在 ②注入真实发生（compat 2 行 / 事件流恰 1 行 role=assistant）③流未中断 ④正常轮次不误报 ⑤上一轮失败不粘滞 |

## 反向验收（两次原始输出见交付报告）

- **抽掉路由判定**（还原 `if (store.lastDegraded)`）→ `Tests 1 failed | 19 passed`：**恰好用例 1（自遮蔽）红**，用例 2/3（不误报）仍绿 ⇒ 证明该断言可证伪且不靠误报取胜。
- **抽掉累计计数**（注释 `appendFailureCount += 1`）→ `Tests 1 failed | 19 passed`：改写的旧用例红 ⇒ 证明"真事件化"（累计入账）而非"布尔别名"。
- 两次还原后：`Tests 20 passed (20)`。

## 相关

- 卡：`task-state/D822.json`；规格与批注：`.claude/task-briefs/2026-09-20-D822-degraded-signal-not-masked.md`
- 下游不变量：`task-state/D831.json` 验收点 6 第 ③ 条「降级信号不被后续成功写入抹掉」——本卡的 `appendFailureCount` 是其**物理探针面**（队长 2026-09-20 批 Q-B 条件 (a)）
- 只读回归门（**不在写集、不许改**）：`tests/routes/conversations.test.ts`（⑭ 全轮失败仍发帧）、`tests/orchestrator/session-manager-eventlog.test.ts`（`lastDegraded` 逐条断言）——均绿
- 遗留：`appendFailureCount` 暂未暴露 HTTP 出口（D831 落地时按需接线）；新调用方不得回退到读 `lastDegraded` 判"本轮是否失败"（已写进字段 JSDoc）
