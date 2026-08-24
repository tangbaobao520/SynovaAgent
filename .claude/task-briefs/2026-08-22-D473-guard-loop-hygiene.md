# Task Brief: D473 guard 循环卫生 + 超时策略（Stage1-D4）

> 生成: 2026-08-22 | 任务: D473 | 认领: DeepSeek Harness（编码）
> 权威文档: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D473-guard-loop-hygiene-20260822.md
> 依赖: ToolGuard 已存在（复用不重造）；D460（llm-verifier）无

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属 L2 编排（tool-loop-executor）+ L3 洞察（ToolGuard）：工具循环有两个失控面。① 无超时策略——tools.ts local/connector 模式裸 await（卡死 = 诊断停摆），http 硬编码 30s 不可配 ② 循环卫生只有硬阻断——ToolGuard 连续 3 次同工具同参数直接 deny，模型不知道自己在重复。
### b) 文件审计
- src/agent/tools.ts: L40-57 ToolDefinition 无 timeoutMs；L185 local 裸 await；L196 connector 裸 await；L208 http 硬编码 30s
- src/l3/tool-guard.ts: L96-106 连续 3 次 deny 无阶梯；ToolGuardDecision 无 level/reminderMessage
- src/agent/tool-loop-executor.ts: L94 与 L214 两条 beforeCall 路径；L97/L217 block 处理
- tests/l3/tool-guard.test.ts: 19 用例，需扩 ≥8 新用例
### c) 决策
借鉴 DSH timeout-policy + repeat-tool-reminder（B5）。超时：每工具声明 timeoutMs 才包裹（无 blanket budget，不改未声明工具行为）；循环阶梯：MAX_TOOL_ROUNDS=3 下 BLOCK=5 永远达不到 → 压缩为 [2 提醒, 3 阻断]（2026-08-22 修正）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
参考 DSH 源码精读（本机 /Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-call-timeout-policy/lib/index.js + dsh-repeat-tool-reminder/lib/index.js）：
- timeout-policy: 工具声明 timeoutMs → 超时 → 结构化 { error: { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT', message } }；未声明不包裹
- repeat-tool-reminder: 链 key = (tool, canonical args) 深排序；阶梯命中注入模型可见 reminder；advisory only 不阻断；被 deny 的调用也计数；per-agent keying
决策：① ToolTimeoutError 内联定义在 tools.ts（error-types 包无超时专属类，避免改 packages/ 跨包，归 Win）② 阶梯 [2 reminder, 3 block]（3 轮循环上限内 5 次不可达，warning 中档删除 descope）③ reminder 注入 tool 结果（模型可见，不阻断执行）④ block 保持最后手段。
历史教训：铁律 42 逐字流延迟（stream 路径 for+sleep 已有）；静默挂起 = 铁律 24 违反（catch 必须 log + degraded 结构化）。
参考：Anthropic 工程基线（fail-closed + 结构化错误）+ DeepSeek guard 包族源码（B5）+ 第一性原理（失控面 = 无超时 + 无反馈）+ 结论：timeoutMs 契约 + 超时包裹 + 分级阶梯三件套。

## Q2: 范围 — 正确的最简方案
做什么：
- src/agent/tools.ts
- src/l3/tool-guard.ts
- src/agent/tool-loop-executor.ts
- tests/l3/tool-guard.test.ts
- task-state/D473.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D473-guard-loop-hygiene-20260822.md
不做什么：
- 不改 src/infra/command-lanes.ts（60s 超时隔离，冻结不动，任务卡 S1-4 明令）
- 不改 src/loops/ 哨兵调度（领域层不属本卡）
- 不改 src/agent/conversation-engine.ts 对外接口（capability seam）
- 不改 packages/error-types（ToolTimeoutError 内联，避免跨包改动归 Win 区域）
- 不加全局默认超时（registry-wide timeoutMs，DSH 明令无 blanket budget）

## Q3: 验收 — 入口 → 交互 → 结果
入口：ConversationEngine → ToolLoopExecutor（callLLMWithTools + streamWithToolLoop 两路径）真实工具调用
处理：tools.execute 超时包裹（声明 timeoutMs 才生效）+ ToolGuard 分级阶梯（2 次 reminder / 3 次 block）
结果：慢 handler 超时 → 结构化 TOOL_TIMEOUT（非挂起）；重复调用 2 次收到 reminder 消息（模型可见），3 次 block

## 架构层:
L2 编排 + L3 洞察（tool-loop-executor L2 / tool-guard L3，铁律 39 相邻层合规）

## Done 标准
- [x] verify: npx vitest run tests/l3/tool-guard.test.ts 全过（≥8 新用例 + 原 19 用例回归）
- [x] verify: grep -n "timeoutMs" src/agent/tools.ts 命中定义 + 消费
- [x] verify: grep -n "TOOL_TIMEOUT" src/agent/tools.ts 命中
- [x] verify: grep -n "reminderMessage\|guardDecision.level" src/agent/tool-loop-executor.ts 命中两条路径
- [x] verify: bash scripts/control-tower/baseline-check.sh 无新增失败；vitest 全量绿
