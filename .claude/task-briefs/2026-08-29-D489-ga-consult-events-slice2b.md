# Task Brief: D489 D394片2-B GA诊断会话事件化 consult路由接线

> 生成: 2026-08-29 04:08:07 | 分支: main | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.5.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）

GA 诊断线（增长导航的核心链路：诊断是手段，增长是目的）。L1 交互层 routes/diagnosis.ts 的 POST /api/diagnosis/consult 路由——现状直建 SynovaDiagnosisEngine（L134-161）、手工包 DiagnosisEngine（L163-166）、直接 engine.runConsultation（L181），完全绕过 DiagnosisLauncher，诊断阶段/模块/报告事件不落 session_events（D500 地基 + D487 片2-A 落流机制在生产 consult 路径零生效）。本任务 = 接线修复：复用 DiagnosisLauncher（D487 已交付）+ SessionStore（D500 已交付），替换 consult 路由的引擎运行为 launcher.startDiagnosis。不新建模块、不重建事件溯源。

### b) 文件审计
grep persistEvent/appendEvent/DiagnosisLauncher 实测（2026-08-29）：new DiagnosisLauncher 全仓唯一生产调用点 src/agent/conversation-engine.ts:448（ConversationEngine 路径）；src/routes/ 零命中——consult 路由是唯一缺口，非重复造轮子。src/agent/diagnosis-launcher.ts（D487：SessionStoreLike/persistEvent/persistingOnEvent/diagnosis_report 落流 + 空 sessionId 守卫）与 src/store/session-store.ts（D500：session_events 表/appendEvent/createSession/getEvents/deriveMessages）均已交付 → 关系：复用。expert/ sentinel/ extensions/ 无本任务相关文件驱动模块，零冲突。

### c) 决策
已有覆盖（launcher 落流 + session 事件溯源）→ 复用，不新建硬编码、不内联复制 D487 逻辑（S-14 无重复审计）。决策点（完整替换 vs 内联 persistEvent）走 DECISION-REFERENCE 四步框架，结论见 Q1c。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按 SPEC → 测试（red）→ 实现（green）→ 接线 → 验证 顺序执行：dev doc SYNOVA-IMPL-D489 已定义 Done 标准（DS1-DS8）；先写 tests/routes/diagnosis-consult-events.test.ts 跑红（现状直建引擎 → ①事件落流断言失败），再改 src/routes/diagnosis.ts 跑绿；接线 = 生产 consult 路径经 DiagnosisLauncher（grep 物证）；验证 = 自检 5 问 + DS1-DS8 逐项证据。

引用依据：铁律 0-2（spec→test→impl→wire→review→merge）；铁律 7（入口可触达+链路走通+结果可见）；铁律 24+31（catch 显式 log+degraded——launcher 内 persistEvent 已守卫，路由侧 SessionStore 构造失败须 log.warn + 降级继续）；铁律 33（*.test.ts 命名）；铁律 38（as any=0，沿用 L359 resume 路由的 as never 先例）；铁律 39（L1 经 DiagnosisLauncher/DiagnosisEngine 接口，不直触 engine-core）；memory 历史教训：D487 空 sessionId 桶缺陷（路由必须先 createSession 再装配）、D484 hook 反斜杠误拦、D470 跨午夜追踪名 brief。

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
- rule: "consult 生产路径必须经 DiagnosisLauncher，禁止内联复制 persistEvent（S-14）"
  verify: "grep -n 'new DiagnosisLauncher' src/routes/diagnosis.ts"
- rule: "事件落流必须先 createSession 得非空 sessionId（D487 空 id 桶缺陷教训）"
  verify: "grep -n 'createSession' src/routes/diagnosis.ts"
- rule: "无 db 环境必须降级不崩（sessionStore 可选依赖，铁律 24/31）"
  verify: "npx vitest run tests/routes/diagnosis-consult-events.test.ts"

### c) 决策参考系（S-12）
决策点：consult 路由用「完整 DiagnosisLauncher 替换」还是「onEvent 里内联 persistEvent」？
① 第一性原理——片2 目标 = 诊断过程可回放；DiagnosisLauncher 是唯一已实现的落流编排器，内联 = 复制 D487 逻辑造第二事实源。
② Anthropic 工程基线——机器可验契约：事件落库可断言（session_events 可 SELECT）；复用经过测试的组件优于新写。
③ 开源实证——dsh-session 事件溯源范式（D500 已确立），本切片只装配不重建。
④ 收敛检查——两参考系同指「完整替换」。
结论：参考：Anthropic/DeepSeek/第一性原理 + 结论=完整替换为 DiagnosisLauncher（graphBridge=null 保持零行为变化，可选组件 evidenceCollector/corroborationEngine/hookRunner/eventBus 全 null 走 launcher 内部守卫降级）。风险如实声明：launcher 额外发射 phase_started（phase 1）起始事件 + 契约门禁/安全门禁（轻量）；report 事件只落库不推 SSE——可接受非破坏性变化（dev doc §4.5 已裁定）。

### d) 相关 Note 引用
- [ ] memory/notes/proposed/2026-08-29-d489-consult-route-launcher-wiring.md（交付后沉淀：consult 路由绕过 launcher 的装配缺口模式）

### e) 文档引用
- docs/plans/codex/implementation/SYNOVA-IMPL-D489-ga-consult-events-slice2b-20260829.md（本任务 dev doc：§2 审计/§3 写集/§4 测试/§6 DS1-DS8）
- docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md（片2-A：launcher 落流机制 + 片2-B 范围裁定）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md（D500 事件溯源地基）
- docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md（K3 咨询 §4.1 片2 定义 + L204 硬依赖裁定）
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md（V5.2.0 clone 隔离工作流）

### f) 接口审计（2026-08-29 grep 实证，非凭记忆）
- src/agent/diagnosis-launcher.ts:startDiagnosis
- src/agent/diagnosis-launcher.ts:SessionStoreLike
- src/store/session-store.ts:createSession
- src/store/session-store.ts:appendEvent
- src/store/session-store.ts:getEvents
- src/l3/synova-diagnosis-engine-impl.ts:createSynovaDiagnosisEngine

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/routes/diagnosis.ts
- tests/routes/diagnosis-consult-events.test.ts
- task-state/D489.json

不做什么：
- 不改 src/agent/diagnosis-launcher.ts（D487 已交付，复用不改）
- 不改 src/store/session-store.ts（D500 已交付）
- 不改 src/agent/conversation-engine.ts（D487 已交付）
- 不改 src/server.ts（orchestration.db 已可用，L244）
- 不改 src/routes/ga-calibration.ts（D551 Mac 并行红线）
- 不改 src/loops/middle-evolution-engine.ts（D556 Mac 并行红线）
- 不改 scripts/（DSH 线越界）
- 不改 src/mcp/（越界）
- 不改 electron/（越界）
- 不改 VERSION.md（功能装配，非门禁/工具行为变化，dev doc S-8）
- 不做 fork/resume（D394 片3 Q4 期权）
- 不做 D398 组织记忆（依赖片2 + N13 闭环）
- 不接 GraphBridge 同步（ctx.graphBridge=null，保持零行为变化，归 ConversationEngine 路径）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：GA 发起 POST /api/diagnosis/consult（SSE 流式六阶段诊断，生产入口真实触发）。
处理（中间经过哪些步骤）：路由从 req.app.locals.orchestration.db 构造 SessionStore（L359 resume 先例）→ createSession(teamId) 得非空 sessionId → 组装最小 EngineContext（可选组件 null + sessionStore + flags 双 false）→ new DiagnosisLauncher(ctx, engine) → launcher.startDiagnosis(role, name, onEvent) → persistingOnEvent 双写（phase_started/completed → diagnosis_phase；其余 → diagnosis_module）→ 诊断成功后 diagnosis_report 落流；SSE onEvent 透传、post-processing、completedReports 缓存全部保持现状。
结果（最终展示在哪）：SSE 事件流不变（前端零感知）+ session_events 可回放（诊断阶段/模块/报告事件，"上次诊断为什么得出这个结论"可追溯）+ GET /api/diagnosis/consult/:id/report 行为零回归。

## 架构层: L1
L1 交互层 routes/ 经 L2 DiagnosisLauncher（DiagnosisEngine 接口，铁律 39）调用引擎；SessionStore 构造沿用 resume 路由 L358-359 先例（经 orchestration.db，动态 import）。不新增跨层依赖。

#CRITERIA: A

## Done 标准
- [ ] 入口可触达: verify: grep -n "new DiagnosisLauncher" src/routes/diagnosis.ts 命中 ≥1（生产 consult 路径经 launcher，非测试调用）
- [ ] 链路走通: verify: grep -n "createSession" src/routes/diagnosis.ts 命中（sessionId 非空装配，事件不落空桶）+ npx vitest run tests/routes/diagnosis-consult-events.test.ts 4/4 pass（red 先行：实现前用例①断言失败）
- [ ] 结果可见: verify: npx vitest run tests/agent/diagnosis-session-events.test.ts 全绿（D487 5/5 零回归）+ grep -rn "as any" src/routes/diagnosis.ts 零命中 + tsc --noEmit 零新增（30 条基线全在 extensions/sentinels/_extinct/）
