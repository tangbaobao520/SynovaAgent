# Task Brief — D594 上下文压缩引擎四件套（DSH 借鉴卡 B-05）

> 任务: src/agent/context-compaction.ts 压缩引擎 + conversation-engine 长会话真实接线
> 日期: 2026-09-08（本地）| 09-07 同内容镜像副本供 UTC 跨零点 CI | Agent: Claude (Win) | dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D594-llm-context-compaction-20260908.md

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = 驻扎企业的 AI 诊断 Agent，诊断是手段，目的是增长导航。本任务在 L2 编排层对话链路（src/agent/ ConversationEngine）：长会话（诊断多轮）超上下文窗口时，现状只有 orchestrator/context-engine 的 G1 策略压缩（LLM 不可用降级 truncate_oldest，丢关键结论）与散落截断，无「threshold/retain + 压缩事件 + 影子 token 价 + 溢出恢复」的完整压缩引擎。新增 src/agent/context-compaction.ts（DSH compaction-basic 范式读源码自研，零代码依赖），并在 conversation-engine.ts 真实接线：长会话压力触发（LLM 调用前）+ 溢出恢复包装（provider 层，先于 failover chain）。属新增背压层，不替换既有 ContextEngine。

### b) 文件审计
grep 实证（clone 基线 e0308d35）：`grep -rn "compaction|shadowedTokenCount|CONTEXT_WINDOW_EXCEEDED" src/agent/` 零命中（DS1 前基线为零）→ 新建不重复。既有相邻物：src/orchestrator/context-engine.ts（G1 策略压缩，conversation-engine.ts:576 已接线，保留不动）；src/orchestrator/session-manager.ts:37 compactionThresholdTokens 属编排会话管理器，不在写集；src/errors/types.ts:643 B-01 映射 CONTEXT_WINDOW_EXCEEDED→CONTEXT_OVERFLOW 已就位（本卡只消费该码，不改文件）；src/providers/base.ts:45 provider 层已归一化产出 DiagnosticAgentError(code=CONTEXT_OVERFLOW)；src/llm/tool-result-pruner.ts 为 D587 工具结果修剪（消息体内容层，与会话级压缩正交）。关键路由事实：tool-loop-executor.ts:157-159/288-290 catch 把 LLM 错误吞成返回字符串不外传 → 溢出恢复必须接在 provider 包装层（conversation-engine 构造 engineCtx 前），且压缩必须原地 mutate this.messages（engineCtx.messages 共享同一数组引用，reassign 会脱钩）。无冲突。

### c) 决策
无既有覆盖 → 新建 src/agent/context-compaction.ts + 最小真实接线。冲突（toolLoop 内不可达）→ 溢出恢复下沉 provider 包装层，记录并排除，不扩写集。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- DSH 范式（借鉴锚点，已读全文 963 行）：`D:/deepseek-harness/packages/compaction/compaction-basic/lib/index.js` — DEFAULT_THRESHOLD_RATIO .8(:13)/DEFAULT_RETAIN_RATIO .16(:15)、resolveCompactSpec threshold/retain 预算(:106)、COMPACTION_INSTRUCTION 作为最后一条 user message 复用 KV-cache 前缀(:218)、selectCompactableRange 头锚定保留尾 + tool 配对平衡回退(:379)、compactSurfaceRegion 压缩事务 start/summary/end + 失败恰一次 end + 未匹配 start 即锁(:418)、影子价 shadowedTokenCount 且 summary 必须严格小于否则不落地(:556)、agent/pre-step 压力触发失败 warn 继续本轮(:780)、agent/request-error 溢出恢复 CONTEXT_WINDOW_EXCEEDED→retain=0 强制压缩→retry(:802)。
- dev doc（权威写集与完成标准）：docs/plans/codex/implementation/SYNOVA-IMPL-D594-llm-context-compaction-20260908.md §4-§7。
- Anthropic 决策链：context editing 基线——长会话压缩保留摘要+近期消息是标准做法；溢出错误驱动强制压缩后重试；摘要调用复用原前缀保 provider KV-cache。
- memory 历史教训：[[2026-08-28-d488-stage5b-delivery]] clone 缺 node_modules → npm ci --ignore-scripts + 手动 npx patch-package；[[2026-09-04-d492-task-decomposer-expert-map]] hook ROOT=主区，brief 须主区/clone 双副本；[[2026-08-22-d470-ci-brief-visibility]] CI G12 用 runner UTC 日期 → 跨零点双日期镜像 brief；[[2026-09-07-d587-tool-result-pruner]] 组4拦测试专用导出 → 公共面只导出生产消费入口；[[2026-08-23-d476-ga-enterprise-scope]] Done 项须 verify: 格式。
- 铁律对照：47（契约优先 JSDoc）、48（测试非空壳每用例≥3 expect）、24/31（压力压缩失败 log.warn 降级不阻断对话）、32（错误带 code+phase+retryable）、38（as any/as never/as unknown as=0）、5（接线必须真实调用链）、0-2（spec→test→impl→wire→review→merge）。

## Q2: 范围 — 正确的最简方案

不做什么（含文件路径）：
- 不修改 src/agent/tool-loop-executor.ts — 其 catch 吞错正是溢出恢复选 provider 层的根因，改动=扩写集
- 不修改 src/agent/prompt-assembler.ts — dev doc §3 明示不重写，散落截断保留
- 不修改 src/orchestrator/context-engine.ts — G1 策略压缩既有语义保留，与本卡会话级压缩互补
- 不修改 src/orchestrator/session-manager.ts — 编排会话管理器压缩不在本卡写集
- 不修改 src/llm/tool-result-pruner.ts — D587 已交付；DSH pruner 钩子为可选（prune!==void 0），本卡不接
- 不修改 src/providers/base.ts — CONTEXT_OVERFLOW 归一化已就位，本卡只消费
- 不修改 src/errors/types.ts — B-01 映射已就位，本卡只消费

做什么：
- src/agent/context-compaction.ts
- src/agent/conversation-engine.ts
- tests/agent/context-compaction.test.ts
- tests/agent/context-compaction.integration.test.ts（组2 门禁: 文件名含 context 须配集成测试——真实 ConversationEngine × 压缩引擎压力/溢出两条链路）
- .claude/task-briefs/2026-09-08-D594-context-compaction.md
- .claude/task-briefs/2026-09-07-D594-context-compaction.md

## Q3: 验收 — 入口 → 交互 → 结果

入口（触发）：用户在 Web/TUI 持续对话（诊断多轮）→ ConversationEngine.processMessage / processMessageStream 每轮 push user message 后、LLM 调用前；以及 provider.chat 抛 CONTEXT_OVERFLOW 时。
处理（中间）：compactIfNeeded 估算 tokens ≥ thresholdTokens（window×0.8）→ selectCompactableRange 头锚定保留尾（window×0.16，tool 配对不拆散）→ summarizer 以原前缀+压缩指令（KV-cache 复用）产摘要 → 影子价校验（摘要 < 被-shadowed tokens）→ 原地 splice 落地 checkpoint（<compacted-summary> 框架）→ 压缩事件 start/summary/end；溢出路径 isContextOverflowError → forceCompact(retain=0) → retry 一次（maxOverflowRetries 界）。
结果（呈现）：长会话不再撞上下文窗口；摘要+最近消息保留、回放一致；压缩失败 log.warn 降级继续本轮不阻断对话；事件序列可观测。

## 架构层:
L2 编排层（src/agent/）；仅依赖 providers/types（既有 L2→providers 惯例）与 @synova/logger，不触 L3/L4/L5。

## Done 标准:
- [ ] DS3 新测试 red→green 全绿 ≥4 用例（单测 18 + 集成 2） verify: npx vitest run tests/agent/context-compaction.test.ts tests/agent/context-compaction.integration.test.ts
- [ ] DS1 真实接线（非孤儿导出） verify: grep -rnE "compaction|shadowedTokenCount|CONTEXT_WINDOW_EXCEEDED" src/agent/
- [ ] DS2 零 @deepseek-ai 依赖 verify: grep -rn "@deepseek-ai" src/ | wc -l
- [ ] DS5 类型安全零容忍 verify: grep -rnE "as any|as never|as unknown as" src/agent/context-compaction.ts src/agent/conversation-engine.ts | wc -l
- [ ] DS4 tsc 28 基线零新增 verify: npx tsc --noEmit

## 文档引用

- docs/plans/codex/implementation/SYNOVA-IMPL-D594-llm-context-compaction-20260908.md（§4 写集表 / §5 测试要求 / §7 DS1-DS5）
- CLAUDE.md §铁律 47/48/24/31/32/38、§Loop Engineering V4.5.1、§五层架构
- D:/deepseek-harness/packages/compaction/compaction-basic/lib/index.js（借鉴锚点 0.1.1-rc.2，已读全文，零代码依赖 G1/G4）

## 接口审计

- D:/deepseek-harness/packages/compaction/compaction-basic/lib/index.js:13 DEFAULT_THRESHOLD_RATIO=0.8; :15 DEFAULT_RETAIN_RATIO=0.16; :106 resolveCompactSpec(policy, contextWindow); :379 selectCompactableRange(session, measurement, retainTokens); :418 compactSurfaceRegion(...); :556 摘要须严格小于被-shadowed tokens; :742 BasicCompactionEngine; :780 agent/pre-step 压力触发; :802 agent/request-error 溢出恢复; :218 COMPACTION_INSTRUCTION; :209 SUMMARY_OPEN_TAG（DSH 已读全文，签名与语义以此为准）
- src/agent/conversation-engine.ts:377 constructor(provider, config); :413 ContextEngine 实例化; :562 processMessage; :576 既有 shouldCompress 接线点（本卡新增背压层相邻位置）; :707 processMessageStream; :423 engineCtx.messages = this.messages 共享引用
- src/agent/tool-loop-executor.ts:57 messages 解构自 ctx; :157-159 与 :288-290 catch 返回字符串（错误不外传——溢出恢复必须接 provider 层）
- src/providers/types.ts:8 LLMMessage { role; content; tool_call_id?; tool_calls? }; :47 LLMProvider { chat/stream/listModels/healthCheck }
- src/providers/base.ts:45 归一化产物 DiagnosticAgentError(code=ErrorCode.CONTEXT_OVERFLOW, shouldCompress=true)
- src/errors/types.ts:44 ErrorCode.CONTEXT_OVERFLOW; :643 B-01 映射 CONTEXT_WINDOW_EXCEEDED→CONTEXT_OVERFLOW
- src/agent/prompt-assembler.ts:704 tokenCount=ceil(chars/4)（token 估算惯例，本卡 meter 同式）

## 自检清单

- [x] DSH compaction-basic 源码已读全文（963 行）
- [x] Synova prompt-assembler / conversation-engine 现状 grep 实证（Q0b）
- [x] 遵循新专家规范（推理层上下文管理，非固定 7 专家）
- [x] 溢出恢复 CONTEXT_WINDOW_EXCEEDED 已纳入（provider 层包装 + retain=0 + retry）
- [x] 不是凭记忆（全部 file:line 实读，clone 基线 e0308d35）
- [x] 不用 --no-verify
