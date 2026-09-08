# Task Brief — D598 token 四桶计量 + 成本护栏（DSH 借鉴卡 B-03）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计 + 决策

### a) 项目拼图
Synova = 组织数字孪生诊断 + 持续增长导航系统，Agent 驻扎企业持续观测、主动发现、给出行动建议。本任务在模型底座/成本治理层：诊断 consult 管线的 LLM 调用目前 usage 只有 2 桶（prompt/completion），DeepSeek cache 字段被丢弃，无四桶计量、无预算护栏、无 Sentinel 告警接线。动作全部为扩展：新建 src/llm/token-meter.ts（四桶 disjoint 计量 + 固定密度估算 + 预算判定 + 告警构造）；扩展 src/providers/types.ts 与 deepseek.ts 的四桶捕获 seam；在 src/routes/diagnosis.ts consult 生产路径挂 TokenMeter 聚合——报告附 tokenUsage 四桶报表，超预算经 L2 injectManualSignal 注入成本告警。

### b) 文件审计
grep 实测（基线 d235231c，写集文件与 origin/main b54a0fb6 零漂移）：src/providers/types.ts:41 ChatResult.usage 仅 2 桶；src/providers/deepseek.ts:46-49 afterResponse 丢弃 cache 字段；src/llm/ 现有 circuit-breaker/output-validator/tool-result-pruner/retry-middleware/timeout/types 六文件，无 token-meter；grep CHARS_PER_TOKEN|cacheReadTokens|uncachedInput 于 src/ 零命中（无四桶实现）。既有成本设施 src/agent/cost-budget.ts（BudgetTracker 2 桶 warn 0.8/block 1.0）、src/services/llm-cost.ts（¥ 定价）、src/services/context-budget-tracker.ts（2 桶+cachedPromptTokens）——均非四桶口径，本卡不重写不复用其口径。告警 seam src/agent/sentinel-service.ts:416 injectManualSignal（src/routes/ga-calibration.ts:346 生产先例）——复用不改其实现。冲突：无（与 Mac DSH 线的 src/sentinel/ 零交集）。

### c) 决策
已有覆盖→复用 injectManualSignal seam；无覆盖→新建 src/llm/token-meter.ts 文件驱动模块；冲突→无。决策参考（DECISION-REFERENCE.md 四步）：①第一性原理——四桶 disjoint 才能把 cache 命中从 prompt 流量中拆出不双计；②DSH 工程基线——projection.ts 四桶 TokenUsageProjection + translate.js mapUsage「prompt_tokens 含 cache hit 须减出」+ estimate.ts 固定密度启发式；③开源实证——DSH 0.1.1-rc.2 真实源码已读；④收敛检查——采纳 disjoint 四桶 + 固定密度估算 + 预算默认 500_000/0.8/1.0（对齐 cost-budget.ts）。参考：Anthropic/DeepSeek/第一性原理 + 结论 = 读源码自研，零 @deepseek-ai 依赖（G1/G4）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 锚点源码（已读原文）：D:\deepseek-harness\packages\llm\token-meter\src\estimate.ts（CHARS_PER_TOKEN=4 / BLOCK_OVERHEAD=4 / ROLE_OVERHEAD=4 固定密度）；usage-projection.ts（bucketsFrom 四桶归一 + addReplacing 同 step 替换防双计）；projection.ts（四桶 disjoint，reasoning 已含 output 不重复计）；surface-projection.ts（O(1) surface fold + shadow price）；D:\deepseek-harness\packages\llm\llm-deepseek\lib\types\translate.js（mapUsage：prompt_tokens = prompt_cache_hit_tokens + miss，harness 约定 disjoint 须减出 cacheRead）。
- 权威文档：docs/plans/codex/implementation/SYNOVA-IMPL-D598-token-meter-cost-guardrail-20260908.md（唯一契约，§1-§8 逐条照做）；docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md §B-03；docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章-专家架构权威定义与路线图-20260905.md §6.1/§6.2（成本治理对象 = 推理层问题域专家 + 主持层 host，计算层不跑 LLM 不计入四桶）。
- 铁律：24/31（catch 必须 log + degraded 显式传播）、32（错误 .code/.phase/.retryable 分类）、38（as any / as never / as unknown as 零容忍）、47/48（契约优先 JSDoc + 测试非空壳 ≥3 expect）、39（L1→L2 告警 seam 合法方向，不绕层直触 L3 src/sentinel）。
- memory/ 历史教训：D594（synova-commit 组2 强制集成测试命名 .integration.test.ts；组4 无消费导出收窄——只导出生产消费入口；组8 BRE 单行类型联合检测——const 数组派生类型绕开）；D587（组4 拦测试专用导出——常量必须在生产代码体内被消费）；D490（autocrlf=true 下正则 $ 行尾锚定恒假——断言用 split(/\r?\n/) 或不锚行尾）；D476（Q2 排除项路径紧跟动词且含扩展名；Done 项 verify: 格式）；D358（brief 须含字面「增长导航」）。

## Q2: 范围 — 正确的最简方案

做什么（include，写集 = spec §3.1：3 修改 + 1 新建 + 2 测试 + brief 簿记 + spec §3.2 同 commit 回填授权）：
- src/llm/token-meter.ts
- src/providers/types.ts
- src/providers/deepseek.ts
- src/routes/diagnosis.ts
- tests/llm/token-meter.test.ts
- tests/routes/diagnosis-token-meter.integration.test.ts
- .claude/task-briefs/2026-09-08-D598-token-meter-cost-guardrail.md
- docs/plans/codex/implementation/SYNOVA-IMPL-D598-token-meter-cost-guardrail-20260908.md

不做什么（排除项，本任务不做以下文件）：
- 不改 src/sentinel/runner.ts — DSH 线地盘，告警只复用 injectManualSignal 不改实现
- 不改 src/agent/sentinel-service.ts — 同上 seam 复用零改动
- 不改 src/providers/base.ts — usage 透传经既有 afterResponse spread 零改动成立
- 不改 src/agent/cost-budget.ts — 既有 2 桶预算口径保留不重写
- 不改 src/services/llm-cost.ts — ¥ 定价体系不动
- 不改 src/services/context-budget-tracker.ts — 2 桶聚合保留
- 不改 src/config.ts — 预算覆盖经 TokenMeter 构造参数而非全局配置
- 不做流式逐 chunk 四桶投影 — 归 D500/D588 phase 4 deferred，本卡做同步聚合报表
- 不引 @deepseek-ai、不 copy DSH 代码 — G1/G4 红线

## Q3: 验收 — 入口 → 交互 → 结果

入口：POST /api/diagnosis/consult（GA 发起诊断，SSE 流式）。
处理：consult 内每次 provider.chat 返回的 usage 经 bucketsFrom 拆四桶（DeepSeek cacheRead 从 promptTokens 减出，保持 disjoint）→ TokenMeter.record 按 model 聚合 → 诊断完成时 checkBudget（warn 0.8 / exceed 1.0，projectedTokens 外推增量）判定。
结果：① SSE complete 帧 report.tokenUsage 含四桶报表（totals/totalTokens/requestCount/byModel/degraded），GA 在 SSE 与 GET /api/diagnosis/consult/:id/report 均可见；② 超预算 → injectManualSignal（signalType='成本预算超限'）→ GET /api/sentinel/findings 可见告警 finding；③ provider 无 usage 时 meter 降级（degraded:true + log.warn）不阻断诊断。

## 架构层: L1

本任务在哪一层: L1（src/routes/diagnosis.ts 诊断路由接线 + src/providers 适配器 + src/llm 模型底座支撑设施）。告警经 L2 sentinel-service.injectManualSignal（既有合法方向，ga-calibration 先例），不绕层直触 L3 src/sentinel。

## Q4: 历史教训防复发

- D594：集成测试文件名必须 .integration.test.ts（组2 拦截）；导出面只留生产消费入口（组4）；类型联合避免单行 BRE 误报（组8）——token-meter 全部具名导出均有 src/ 生产消费点。
- D587：组4 拦测试专用导出——CHARS_PER_TOKEN/BLOCK_OVERHEAD/ROLE_OVERHEAD 在 estimate 函数体内被生产消费，非测试专用。
- D490：CRLF 环境正则行尾锚定恒假——测试断言不使用 $ 锚定。
- D476：Q2 排除项路径紧跟「不改」动词且含扩展名；Done 项使用 verify: 格式。
- D358：brief 含字面「增长导航」（已写入 Q0a）。

## 文档引用

- docs/plans/codex/implementation/SYNOVA-IMPL-D598-token-meter-cost-guardrail-20260908.md §2 现状审计 / §3.1 写集 / §3.3 不做的事 / §4 测试要求 / §4.5 决策参考 / §5 接线 / §6 DS1-DS8
- docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md §B-03（token 计量四桶 + 成本护栏）
- docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章-专家架构权威定义与路线图-20260905.md §6.1/§6.2
- CLAUDE.md 铁律 24/31/32/38/39/47/48；docs/synova/coordination/DECISION-REFERENCE.md（四步决策框架）；docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md（独立 clone 模型）

## 接口审计（grep 实测，全部真实存在）

- src/providers/deepseek.ts: createDeepSeekProvider（L15；afterResponse L45-50 现只映射 2 桶）
- src/providers/base.ts: afterResponse（L106 钩子签名 Partial ChatResult；L232 spread 透传——零改动即透传新增四桶字段）
- src/routes/diagnosis.ts: createSynovaDiagnosisEngine（L138-165；chat adapter L141-153 为 provider usage 唯一汇聚点）
- src/agent/sentinel-service.ts: injectManualSignal（L416；输入 signalType/title/description/severity 1-10/confidence 0-100/gaId/orgId）
- src/agent/cost-budget.ts: checkBudget（L107-143；warnAt 0.8 / blockAt 1.0 / cumulativeBudget 500_000 为默认值来源）
- 另 src/providers/types.ts 的 ChatResult.usage（L37-42）与 ChatCompletionResponse.usage（L65-72）本卡增可选 cache 字段，保持既有消费方零行为变化。

## Done 标准

- [ ] Done 1: token-meter 单测 + consult 集成测试 red→green 全绿 ≥12 用例。verify: npx vitest run tests/llm/token-meter.test.ts tests/routes/diagnosis-token-meter.integration.test.ts
- [ ] Done 2: DS1 接线——token-meter 导出在 consult 生产路径被调 ≥1 处。verify: grep -rn "TokenMeter\|checkBudget\|buildCostFinding" src/routes/diagnosis.ts
- [ ] Done 3: DS2 四桶 seam 存在。verify: grep -rn "cacheReadTokens" src/providers/types.ts src/providers/deepseek.ts
- [ ] Done 4: 零 DSH 依赖。verify: grep -rn "@deepseek-ai" src/ 零命中
- [ ] Done 5: tsc 基线零新增（28=28）。verify: npx tsc --noEmit 与基线 FAIL 集恒等
- [ ] Done 6: 新增行零类型逃逸。verify: grep -rn "as any\|as never\|as unknown as" src/llm/token-meter.ts 零命中
