# Task Brief — D587 工具结果确定性修剪器（DSH 借鉴卡 B-04）

> 任务: src/llm/tool-result-pruner.ts 纯函数修剪器 + tool-loop-executor 真实接线
> 日期: 2026-09-07 | Agent: Claude (Win) | dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D587-tool-result-pruner-20260907.md

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = 驻扎企业的 AI 诊断 Agent，诊断是手段，目的是增长导航。本任务在 L2 编排层的对话/诊断链路：工具结果与证据块在进入 LLM 提示词前缺统一确定性修剪层，现状是散落 naive `slice(0,N)`（破坏中文代理对、不可回放）。新增 src/llm/tool-result-pruner.ts 纯函数修剪层（head+marker+tail、码点计数、配置校验、replay-safe 幂等），并在 src/agent/tool-loop-executor.ts 工具结果进 messages（即 provider.chat 提示词）前接线。属新增能力，不替换既有 message-sanitizer。

### b) 文件审计
grep 实证（clone 基线 da9b37db）：`grep -rn "slice(0" src/agent/ src/providers/ src/l3/` 命中散落截断（message-sanitizer.ts:54、base.ts:113、expert-output-schema.ts:94/102 等），无 prune/headChars/tailChars/codePointLength 等价物 → 新建不重复。诊断证据块现状：diagnosis-launcher.ts:129-135 `evidenceSummary` 赋值后 src/ 内零消费（死变量，grep 实证仅 2 处均为赋值）；真实证据块进提示词路由在 src/l3/expert-dispatcher.ts:328-333（不在本卡写集，不越界）。工具结果真实路由：src/agent/tool-loop-executor.ts 两处 `content: JSON.stringify(execResult)` push 进 messages（L129/L260）。无冲突，无需复用 expert/ 或 sentinel/ 既有物。

### c) 决策
无既有覆盖 → 新建纯函数层 + 最小真实接线。冲突（写集外更优接线点 expert-dispatcher 在 L3）→ 记录并排除，不扩写集。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- DSH 范式（借鉴锚点，已读全文）：`D:\deepseek-harness\packages\compaction\compaction-tool-result-pruner\lib\index.js` — `PRUNE_MARKER`(:7)、`codePointLength`=Array.from 码点计数(:24)、`resolveConfig` 未知 key 抛错+正/非负整数断言+head+marker+tail≤threshold(:32-51)、`pruneContent` 头尾保留+单 marker+确定性(:90-123)。核心语义：确定性、replay-safe（同输入同输出）。
- dev doc（权威写集与完成标准）：`docs/plans/codex/implementation/SYNOVA-IMPL-D587-tool-result-pruner-20260907.md` §4-§7。
- Anthropic 决策链：context engineering 基线——工具结果进上下文前确定性截断是标准做法；码点（非 UTF-16 unit）切片防拆代理对，与 DSH 一致。
- memory 历史教训：[[2026-08-28-d488-stage5b-delivery]] clone 缺 node_modules → `npm ci --ignore-scripts` + 手动 `npx patch-package`；[[2026-09-04-d492-task-decomposer-expert-map]] hook ROOT=主区，brief 须主区/clone 双副本；[[2026-08-23-d476-ga-enterprise-scope]] Done 项须 verify: 格式；[[2026-08-16-d355-l4-contract]] 基线对照法。
- 铁律对照：47（契约优先 JSDoc）、48（测试非空壳≥3 expect）、24/31（接线处 try/catch 降级原文+log.warn，不阻断对话）、38（as any=0）、5（后端能力≠用户可用——接线必须真实调用链）。

## Q2: 范围 — 正确的最简方案

做什么：
- 新建 src/llm/tool-result-pruner.ts
- 新建 tests/llm/tool-result-pruner.test.ts
- 修改 src/agent/tool-loop-executor.ts
- 新建 .claude/task-briefs/2026-09-07-D587-win-tool-result-pruner.md

不做什么：
- 不修改 src/providers/message-sanitizer.ts — 存量语义不变，本卡只建独立修剪层
- 不修改 src/providers/base.ts — 同上
- 不修改 src/l3/expert-output-schema.ts — 同上
- 不修改 src/l3/expert-dispatcher.ts — 真实证据块路由在 L3 但超出 dev doc 写集，记录待后续卡
- 不修改 src/agent/diagnosis-launcher.ts — evidenceSummary 为死变量，接它=假路由
- 不做块数组内容修剪接口 — DSH pruneContent 面向 blocks，Synova 现网消费面是纯文本字符串，YAGNI

## Q3: 验收 — 入口 → 交互 → 结果

入口（触发）：用户在 Web/TUI 发起对话或诊断 → ConversationEngine → ToolLoopExecutor.callLLMWithTools / streamWithToolLoop 执行工具。
处理（中间）：工具执行产出 execResult → `JSON.stringify` 后、push 进 messages（role: tool）前，经 `pruneForPrompt()` → `pruneToolResult(text)` 确定性修剪（超阈值才修剪：保留头 headChars + 固定 marker + 尾 tailChars，码点计数不拆代理对）→ messages 传给 provider.chat 进入提示词。
结果（呈现）：LLM 收到的工具结果 ≤ thresholdChars 且中文/emoji 完整；同输入同输出可回放；修剪失败时 log.warn 降级为原文，对话不阻断。

## 架构层:
L2 编排层（src/agent/）+ 新增 src/llm/ 纯函数层；L2→src/llm 为同仓内模块依赖，不触 L3/L4/L5 边界（check-architecture.sh 只检 L2→L4 与 L1 越层，src/llm 无层约束）

## Done 标准:
- [x] DS3 新测试 red→green 全绿 ≥4 用例 verify: npx vitest run tests/llm/tool-result-pruner.test.ts
- [x] DS1 接线为真实路由 verify: grep -rn "pruneToolResult" src/agent/
- [x] DS2 零 @deepseek-ai 依赖 verify: grep -rn "@deepseek-ai" src/ | wc -l
- [x] DS5 as any = 0 verify: grep -rn "as any\|as never\|as unknown as" src/llm/ src/agent/tool-loop-executor.ts | wc -l
- [x] DS4 tsc 零新增错误（28 基线对照） verify: npx tsc --noEmit

## 文档引用

- docs/plans/codex/implementation/SYNOVA-IMPL-D587-tool-result-pruner-20260907.md（§4 写集表 / §5 测试要求 / §7 DS1-DS5）
- CLAUDE.md §铁律 47/48/24/31/38、§Loop Engineering V4.5.1
- D:/deepseek-harness/packages/compaction/compaction-tool-result-pruner/lib/index.js（借鉴锚点 0.1.1-rc.2，已读全文，零代码依赖）

## 接口审计

- D:/deepseek-harness/.../compaction-tool-result-pruner/lib/index.js:7 PRUNE_MARKER 常量; :24 codePointLength(text); :32 resolveConfig(config); :90 pruneContent(blocks)（DSH 已读全文，签名与语义以此为准）
- src/agent/tool-loop-executor.ts:129 messages.push({ role: 'tool', tool_call_id, content: JSON.stringify(execResult) })（非流式工具结果注入点）
- src/agent/tool-loop-executor.ts:260 同上（流式路径工具结果注入点）
- src/providers/types.ts:8 LLMMessage { role: 'system'|'user'|'assistant'|'tool'; content: string; tool_call_id?: string }
- src/agent/diagnosis-launcher.ts:129 evidenceSummary（grep 实证赋值后零消费，死变量，不接线）

## 自检清单

- [x] DSH pruner 源码已读全文（196 行）
- [x] Synova 散落 slice 现状 grep 实证（Q0b）
- [x] 写集零越界（2 新建 + 1 修改 + brief）
- [x] red→green 实测
- [x] 不是凭记忆（全部 file:line 实读）
- [x] 不用 --no-verify
