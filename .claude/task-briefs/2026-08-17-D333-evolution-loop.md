# Task Brief: D333 进化闭环 N13 接线 + loop-3/5 placeholder 真实化

> 生成: 2026-08-17 | 分支: feat/win-d333-evolution-loop | worktree: synova-wt-d333 | as any: 0
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D333-进化闭环N13接线-loop真实化-20260817.md

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统（组织数字孪生诊断 + 持续增长导航系统）。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/
  L4 本体: l4/ evidence/
  L5 存储: store/ cron/
LLM: providers/（DeepSeek, OpenAI, Gateway）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于**纵向（L2 编排层 + loops 引擎接线）**。K3 权威偏差 P0-A1：middle-evolution-engine 零生产调用方（N13 反馈→规则闭环断裂）+ loop-3/5 名义进化通道是 placeholder 假成功（每次 cron 触发写伪造 'completed' 审计记录）。
现有模块: src/loops/middle-evolution-engine.ts（D92 引擎: processFeedbackSignals 5 类进化动作 + D273 applyEvolutionActions 回写）、src/growth/feedback-collector.ts（D93: getAggregatedSignals 聚合信号）、src/agent/loop-handlers.ts（4 个 default handler，本任务真实化 evolution 一个）、src/agent/main-agent.ts（selectHandler 路由 loop-3/5 → defaultEvolutionHandler；executeLoopScale 状态映射）。
新增/替换/扩展: **接线**（机制已有→生产消费），非新建机制。

### b) 文件审计
grep 实测（worktree origin/main 87743f7）:
- grep "processFeedbackSignals\|applyEvolutionActions\|middle-evolution" src/ → 仅 middle-evolution-engine.ts 自身引用（:2/:17/:28/:61/:137/:142/:329/:541），**零生产调用方**（缺陷 A 实证）
- grep "defaultEvolutionHandler" src/agent/main-agent.ts → :20 import + :277-278 路由（`loopId.includes('evolution') || loopId === 'loop-3' || loopId === 'loop-5'`）
- grep "feedbackCollector.setDatabase\|getFeedbackCollector().setDatabase" src/ → **零调用**（collector 单例 db 永为 null → 生产 getAggregatedSignals 恒空 → N13 读侧无数据，需在 synova-agent.ts 接 setDatabase）
- grep "collectFeedback" src/routes/workspace-data.ts → :141/:166/:191 写入方真实（decision modify/reject_path/reject 合法）
- tsc 基线存量: middle-evolution-engine.ts:138 TS2322 '"accept"' is not assignable（D262 记录块死代码实证）
结论: 复用 processFeedbackSignals/applyEvolutionActions/getAggregatedSignals/getFeedbackCollector（均已存在）；无冲突；无新建模块。

### c) 决策
已有覆盖→复用。引擎 processFeedbackSignals 内部已含 apply 副作用（:152-159）→ handler 按 dev doc §3.1 直调两函数会**双次回写**（correction 计数 2 倍加速，违反 MIN_TRIGGER_COUNT=3 语义）→ 决策：processFeedbackSignals 纯化（副作用移除），handler 串接 signals→process→apply 单次回写。D262 GA 反馈记录块（'accept' 违反 FeedbackDecision 类型 + DDL CHECK，从未成功写入）随纯化移除。详见 Q1c 决策记录。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC/Done 标准（dev doc DS1-DS8）→ ② 测试先行 red→green → ③ 实现 → ④ 接线（grep 物理证明）→ ⑤ 验证（自检 6 问）。
引用依据:
  - 铁律 0-2（CLAUDE.md）: spec → test → impl → wire → review → merge；WIRE CHECK 硬门禁
  - 铁律 4/5（CLAUDE.md）: 交付不完整——写了没接线 / 后端能力≠用户可用功能（N13 断裂即实证）
  - 铁律 11/24/31（CLAUDE.md）: 禁静默降级；每个 catch 有 log + degraded；降级显式传播
  - 铁律 37（CLAUDE.md）: dead code 入仓库即违规（middle-evolution 存活至今实证 + D262 记录块死代码）
  - 铁律 47/48（CLAUDE.md）: 契约优先 + 测试非空壳（三态: 正常/降级/边界）
  - memory/engine-core-split-fraud.md: 声称完成须 grep 物理证明
  - memory/2026-08-12-D330-kimi-k3-audit-fix.md: fail-open 吞信号=隐藏失效
  - 测试惯例: tests/agent/main-agent.test.ts（describe/it/expect 真实断言）

### b) 本任务执行约束
  - rule: "defaultEvolutionHandler 无信号/collector 不可用必须返回 degraded:true + 显式输出，禁止静默 success"
    verify: "grep -c 'degraded: true' src/agent/loop-handlers.ts"
  - rule: "processFeedbackSignals 纯化后不含 collectFeedback/applyEvolutionActions 调用（回写只发生一次，在 handler）"
    verify: "grep -n 'collectFeedback\|applyEvolutionActions(actions)' src/loops/middle-evolution-engine.ts"
  - rule: "handler 返回 degraded 时 MainAgent 状态记 degraded，不得无条件 completed"
    verify: "grep -n \"'degraded'\" src/agent/main-agent.ts"
  - rule: "collector 生产 DB 接线（setDatabase）在 SynovaAgent.start 与 baselineStore 同点"
    verify: "grep -n 'setDatabase' src/agent/synova-agent.ts"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
决策点 1（dev doc §4.5 已定）: 真实化 handler 直接调引擎 vs 新增 runEvolutionCycle 统一入口。
参考：第一性原理（N13 断裂根因=引擎建好没人调，最小修复=把调用点接上）+ Anthropic 工程基线（接线验收=生产调用点真实传递，grep 可验）。收敛。
结论：采用 handler 直调 processFeedbackSignals + applyEvolutionActions（dev doc §4.5 结论一致）。

决策点 2（实现新增，dev doc 未预见）: processFeedbackSignals 内部已调 applyEvolutionActions（:152-159）→ dev doc §3.1 直连链会**双次回写**（correction 计数 2 倍加速）。选项 a) handler 只调 processFeedbackSignals（拿不到 applied/skipped 计数，违反 dev doc §3.1「返回真实 applied/skipped 计数」）b) 引擎纯化 + handler 直连。
参考：第一性原理（一次信号一次回写，双写破坏 MIN_TRIGGER_COUNT=3 语义）+ Anthropic 工程基线（DS2 grep 要求 handler 直调两函数，纯化是唯一满足 DS2 又不双写的路径）。收敛。
结论：选 b——processFeedbackSignals 纯化（移除内部 D262 记录块 + apply 调用），5 类信号处理器逻辑不动。

决策点 3（实现新增）: D262 GA 反馈记录块（decision:'accept'）处置。违反 FeedbackDecision 类型（tsc 基线存量 TS2322 :138）+ feedback_log DDL CHECK（运行时 INSERT 必败）→ 从未成功写入=死代码。
参考：铁律 37（dead code 入仓库即违规）+ Anthropic 工程基线（诚实移除 + 交付报告记录，优于保留永失败代码）。
结论：随纯化移除，交付报告记录「实现中发现的缺陷」；D262 语义修复（决策类型扩展）独立任务。

决策点 4（实现新增）: 生产环境 collector.setDatabase 零调用 → 只接 handler 不接 DB，N13 读侧恒空、永远 degraded（闭环「接通但饿死」）。P0-A1 修复标准含「端到端跑通」。
参考：第一性原理（数据不落库，消费方无数据可消费）+ D363 先例（failover 接线同模式：机制已建，补生产注入点）。
结论：synova-agent.ts start() 与 baselineStore.setDatabase（:63）同点接线 getFeedbackCollector().setDatabase(this.db)。

决策点 5（实现新增）: main-agent 状态映射。placeholder 假成功根因=`result.success ? 'completed' : 'failed'` 无条件映射。handler 降级（无信号/部分失败）≠ completed ≠ failed。
参考：Anthropic 工程基线（审计记录必须真实）+ 第一性原理（三态语义: completed=全量完成, degraded=执行但降级, failed=崩溃）。
结论：LoopStatus 增 'degraded'；映射 `result.success ? 'completed' : result.degraded ? 'degraded' : 'failed'`；writeAuditLog action 对应 loop.degraded。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/agent/loop-handlers.ts — 修改。defaultEvolutionHandler 真实化: getFeedbackCollector().getAggregatedSignals() → processFeedbackSignals(signals) → applyEvolutionActions(actions)，返回真实 applied/skipped 计数；无信号/零动作/回写出错 → degraded:true + 显式输出（禁静默 success）
- src/agent/main-agent.ts — 修改。LoopStatus 增 'degraded'；executeLoopScale 状态映射改为 success?completed:degraded?'degraded':'failed'；writeAuditLog 增 loop.degraded action；降级日志措辞区分
- src/loops/middle-evolution-engine.ts — 修改。processFeedbackSignals 纯化（移除内部 D262 记录块 + apply 调用，消除 handler 直连导致的双次回写）；清理 unused import（getFeedbackCollector/FeedbackCollector）
- src/agent/synova-agent.ts — 修改。start() 与 baselineStore.setDatabase 同点接线 getFeedbackCollector().setDatabase(this.db)（生产 DB 注入，N13 读侧数据源）
- tests/agent/loop-handlers.test.ts — 新建。8 用例: 正常信号→真实计数 / 无信号→degraded / collector 不可用→degraded+error / 边界零动作→degraded / apply 部分失败→degraded+error / 全部 pending→degraded / MainAgent 无信号→status=degraded / MainAgent 正常→status=completed
- tests/agent/main-agent.test.ts — 修改。多循环并行测试 loop-3 断言 completed → degraded（原断言即缺陷 B 的测试面；真实化后诚实行为回归）
- docs/plans/codex/implementation/SYNOVA-IMPL-D333-进化闭环N13接线-loop真实化-20260817.md — 修改。§3.2 最终实现同 commit 回填（S-6，写集偏离方案）

不做什么：
- 不真实化 diagnosis/navigation/overflow 三个 handler (P1-C2 其余项, 各自后续任务)
- 不重写 middle-evolution-engine 5 类信号处理器逻辑 (threshold/goal/path/expert/contradiction, D92/D273 已实现)
- 不修复 D262 反馈记录语义 ('accept' 决策类型扩展 + DDL CHECK 调整是独立任务, 本任务随纯化移除死代码块并记录)
- 不改 src/loops/direction-monitor.ts (D334/P1-A2 域)
- 不改 src/sentinel/sentinel-loader.ts (D356 域, dev doc §3.3)
- 不改 .codex/control-tower/VERSION.md (纯产品代码接线, 非门禁/工具行为变化)
- 不改 scripts/pre-commit-check.sh (12 组门禁本体)

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：cron（loop-scheduler 已注册 loop-3 '0 9 1 */3 *' / loop-5 '0 0 * * 0'）→ MainAgent.executeLoop → selectHandler 路由 defaultEvolutionHandler；或 POST /api/loops/loop-3/execute 手动触发
处理（中间经过哪些步骤）：defaultEvolutionHandler 取聚合信号 → processFeedbackSignals 生成进化动作 → applyEvolutionActions 回写（阈值文件/专家 manifest/agent_memory，同 key ≥3 次才生效）→ 返回真实 applied/skipped；无信号/collector 不可用/回写出错 → degraded:true + 显式输出
结果（最终展示在哪）：LoopExecutionRecord 写入（status=completed/degraded/failed 三态诚实）+ 审计日志 loop.completed/loop.degraded/loop.failed；GET /api/loops/status 显示真实状态；回写结果落 extensions/industries/*/thresholds.json _gaCorrections

## 文档引用
- docs/plans/codex/implementation/SYNOVA-IMPL-D333-进化闭环N13接线-loop真实化-20260817.md — dev doc §1 权威偏差/§2 代码审计/§3 写集/§4 测试/§6 完成标准 DS1-DS8
- docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v2.md — P0-A1 N13 断裂 + P1-C2 placeholder 假成功
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md — 铁律 0-3 PR 工作流
- CLAUDE.md — 铁律 0-2/4/11/24/31/37/47/48

## 接口审计（从代码 grep，非凭记忆）
- src/loops/middle-evolution-engine.ts:processFeedbackSignals(signals: AggregatedSignal[]): EvolutionAction[] — L61 定义；L152-159 内部已调 applyEvolutionActions + L133 collectFeedback（纯化对象，双写根因）
- src/loops/middle-evolution-engine.ts:applyEvolutionActions(actions: EvolutionAction[]): ApplyActionResult — L541，{applied,skipped,errors}
- src/growth/feedback-collector.ts:getAggregatedSignals(threshold=3): AggregatedSignal[] — L267，db null → 返回 []（L268）
- src/growth/feedback-collector.ts:setDatabase(db): void — L130，生产零调用（grep 实证，决策点 4）
- src/agent/loop-handlers.ts:defaultEvolutionHandler(scale: ScaleName): Promise<LoopExecutionResult> — L65-78 placeholder 假成功
- src/agent/main-agent.ts:selectHandler — L270-285，L277-278 路由 loop-3/5 → defaultEvolutionHandler
- src/agent/main-agent.ts:executeLoopScale — L185 `status: result.success ? 'completed' : 'failed'`（伪造 completed 根因）
- src/agent/synova-agent.ts:start — L63 baselineStore.setDatabase(this.db)（collector 接线同点）
- src/routes/workspace-data.ts:collectFeedback — L141/L166/L191 写入方（decision 合法值，生产真实路径）

## 架构层: L2
本任务主体在 L2 编排层（src/agent/loop-handlers.ts + main-agent.ts 循环执行路径，L1-L5 五层内仅动 L2 与既有 loops/growth 模块）；引擎在 src/loops/、数据源在 src/growth/（现有跨模块依赖，与 D92 建引擎时一致，无新增跨层违规）。collector DB 注入在 src/agent/synova-agent.ts（L2 内既有 DI 模式，与 baselineStore 同点）。
#CRITERIA: A

## Done 标准
- [ ] DS1 测试绿: `npx vitest run tests/agent/loop-handlers.test.ts` 全绿（red→green 已证，修复前恒 success → 修复后真实动作/降级）
- [ ] DS2 N13 接线: `grep -c "processFeedbackSignals" src/agent/loop-handlers.ts` ≥1（生产调用，非 import）+ `grep -c "applyEvolutionActions" src/agent/loop-handlers.ts` ≥1
- [ ] DS3 degraded 诚实: `grep -c "degraded: true" src/agent/loop-handlers.ts` ≥2（无信号 + 回写失败路径）
- [ ] DS4 伪造 completed 修正: `grep -c "'degraded'" src/agent/main-agent.ts` ≥1，status 映射非无条件 completed
- [ ] DS5 零回归: `bash scripts/control-tower/baseline-check.sh --tsc --tests --audit` 无新增（middle-evolution-engine.ts:138 存量 TS2322 应转「已修复」）
- [ ] DS6 范围一致: `git diff --name-only HEAD^` 与 Q2 写集一致（无越界文件，尤其不碰 src/sentinel/）
- [ ] DS7 无绕过: pre-commit 12 组全过 + bypass.log 无 `--no-verify`；提交走 synova-commit
- [ ] DS8 推送 + CI: push 后 CI 任务相关 job 绿
