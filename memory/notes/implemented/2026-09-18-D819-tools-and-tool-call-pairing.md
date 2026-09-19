---
状态: implemented
日期: 2026-09-18
落地: D819（2026-09-19，分支 feat/d819-tool-wiring-pilot）——工具接线三修 + 真实入口三路径用例 + D817 三条证词翻正
决策: D819 工具接线三修必须**同一提交**落地——① 出站请求体透传 `ChatOptions.tools` ② 响应侧 `choices[0].message.tool_calls` 映射进 `ChatResult.toolCalls` ③ assistant 只入上下文一次（工具循环只推中间态、引擎是终态唯一 owner）；并定下配对纪律：`role='tool'` 消息的 `tool_call_id` **必须**等于同源 `assistant.tool_calls[].id`（模型给的 id 原样透传；上游缺 id 走确定性兜底，**禁随机 UUID**）。
理由: ① 只修 P0-1（tools 进 body）而不修响应侧映射，模型仍收不到工具结果、工具循环照旧不触发；只修请求侧+响应侧而不修配对，模型收到的是**结构非法**的工具对话（tool_call_id 与 assistant.tool_calls 不匹配 → 真实上游 400）——三处是同一条链上的三个断点，拆开修等于没修；② 旧实现用 `crypto.randomUUID()` 充当 tool_call_id（`tool-loop-executor.ts` 8 处），是"看起来唯一"的假配对：模型只认自己给出的 id；③ assistant 双推（工具循环出口 + 会话引擎）会让出站角色序出现 `assistant,assistant`，破坏 P0-4 不变量「发出去的请求 == 日志重建的请求」——修在工具循环侧（删终态 push）而不是引擎侧，因为引擎 push 是非流式路径**唯一**的终态写入点，删它需要回填 4 个 return 分支，改动面更大且更易漏；④ provider 契约语义不变：`ChatOptions.tools` 形状/语义零改动，`ToolCall` 只加可选字段（纯增量），无新依赖。
---

## 触发场景（CTO 实测 + D817 证词，2026-09-18~19，origin/main）

| 事实 | 位置 | 结果 |
|---|---|---|
| 出站体缺 tools | `src/providers/base.ts` body 组装 | 只有 `model/messages/temperature/max_tokens`；而 `tool-loop-executor` 已把 `tools` 传进 `callLlm` → 在 provider 边界被丢弃 |
| 响应侧 tool_calls 从未映射 | `src/providers/base.ts` `chat()` | 只取 `choices[0].message.content` → `ChatResult.toolCalls` 恒 `undefined` → 工具循环恒走"无工具调用"分支（D817-F1） |
| 配对非法 | `tool-loop-executor.ts` 8 处 `tool_call_id: crypto.randomUUID()` | 与 `assistant.tool_calls[].id` 无关联 → 模型收到结构非法的工具对话 |
| assistant 双推 | `tool-loop-executor.ts` 终态 push + `conversation-engine.ts:785/790` | 出站角色序 `[system,user,assistant,assistant,user]`（D817-F2） |

## 落地（D819）

- **请求侧**：`base.ts` body 组装 `if (opts?.tools && opts.tools.length > 0) body.tools = opts.tools;`（无 tools 时不加 key，保持旧行为；无新增分支）。
- **响应侧**：`chat()` 读 `message.tool_calls` → 映射为 `{id,type:'function',function}`；空 content **且无 tool_calls** 才抛 `EMPTY_RESPONSE`（tool_calls 轮 content 为空是常态）；上游缺 id → 确定性兜底 `call_resp_<n>` + `log.warn({degraded:true})`。
- **配对**：`ToolLoopExecutor.normalizeToolCalls()` 统一给出 `id/type/function`（模型 id 原样；缺 id → `call_loop_<n>` 确定性兜底），assistant 与 tool 消息共用同一 id；`crypto` import 删除（死代码）。
- **去重**：删掉工具循环两处终态 push；`src/agent/conversation-engine.ts` **零改动**（终态唯一 owner）。
- **类型**：`ToolCall` 加可选 `id?: string` / `type?: 'function'`（纯增量，零契约语义变更）。
- **验证**：新增 `tests/agent/tool-loop-tool-pairing.integration.test.ts`（真实 `createServer` + 真路由 + 127.0.0.1 假上游，零 mock 管线；正常/降级/边界三路径）；证据落盘 `docs/synova/product-lines/evidence/D819-capture-20260919.json`（注册工具数 36、配对 `pairing_ok=true`、二次运行 sha256 一致）；D817 的三条 `it.fails` 证词翻转为正向断言。
- **残余**：D473 reminder 路径会对同一次 tool_call 多推一条 reminder tool 消息（同 id 重复）= 既有设计，本卡不改，已登记报告；诊断 consult 路径的内部形状 tools（`src/l3/synova-diagnosis-engine-impl.ts`）当前 registry 为空、不可达，另开卡。
