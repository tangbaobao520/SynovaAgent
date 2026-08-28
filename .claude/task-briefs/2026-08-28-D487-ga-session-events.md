# Task Brief: D487 D394 片2-A — GA 诊断会话事件化装配（D500 地基接线）

> spec: docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md（唯一契约）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova 是驻扎企业的增长导航诊断 Agent，GA 诊断过程可回放 = 交付物可自证（D394 片2 信任层）。本任务在 L2 编排 + L5 存储：D500 已交付 session_events/appendEvent/deriveMessages 地基，但生产链路零装配——① ConversationEngine 的实例化点未传 sessionManager（消息事件不落流）② DiagnosisLauncher 的阶段/模块/报告事件不落 session_events（诊断不可回放）。本切片只做装配接线，不重建事件溯源。
### b) 文件审计
grep 实测：appendEvent 唯一实现在 session-store.ts L272；SessionEventType=L58 三型、CHECK=L131；SessionManager store 为 private（session-manager.ts，不修改）；ctx.sessionStore 在 conversation-engine 无赋值点（launcher L122 cast 读取永远 undefined）；5 实例化点 = conversation-engine.ts L783 fromState / cli.ts L118 / l1/im-inbound.ts L180 / mcp/index.ts L222 / tui-v2 L41（已传 sessionManager 但无 sessionStore）；cli 有 store、im-inbound 有 builtinStore、mcp 经 getDatabase()、tui-v2 经 bootstrap ctx；DS4 引用的 tests/agent/diagnosis-launcher.test.ts 不存在（回归改跑 tests/conversation-engine.test.ts + session-event-log 系列）。结论：扩展复用，零新建组件。
### c) 决策
已有覆盖→复用 appendEvent/deriveMessages。文件驱动→无新组件。冲突→写集与 dev doc §3.1 有偏差（实例化点实际在 cli/im-inbound/mcp 而非 bootstrap/server 内），按 spec §3.2 同 commit 回填 §3.2 并在 Q2 如实登记。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界：事件溯源 append-only 单一事实源（D500 已确立 model-visible⟺logged 不变量）；诊断事件属会话事件流的 log-only 类（投影跳过，不污染消息历史）；SQLite CHECK 约束变更须表重建迁移（ALTER 不支持）。
b) 顶级团队：最小改动 + 生产入口唯一（Anthropic 决策链）——装配点就近传参（实例化点已有 store 在 scope），不加间接层；spec §4.5 三决策点（复用 appendEvent / bootstrap 就近 / 阶段粒度）与本实现一致。
c) memory：铁律 0-2 测试先行（red→green）；铁律 31 降级显式（appendEvent 失败 log.warn + 诊断继续）；铁律 38 as any 零容忍（ctx 注入用内联类型 cast）；D500 2026-08-22 seq 并发四防线不回退。
参考：Anthropic/第一性原理 + 结论：地基复用 + 就近装配 + CHECK 迁移表重建，无分歧。

## Q2: 范围 — 正确的最简方案
做什么：
- src/store/session-store.ts
- src/agent/diagnosis-launcher.ts
- src/agent/conversation-engine.ts
- src/deploy/bootstrap.ts
- src/cli.ts
- src/l1/im-inbound.ts
- src/mcp/index.ts
- src/tui-v2/index.ts
- src/tui-v2/lib/bootstrap.ts
- tests/agent/diagnosis-session-events.test.ts
- docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md
- .claude/task-briefs/2026-08-28-D487-ga-session-events.md
- task-state/D487.json
- store 扩展 diagnosis_phase/diagnosis_module/diagnosis_report + CHECK 同步 + 旧库表重建迁移（幂等）
- launcher onEvent 包装落流（phase/module 映射 + report 事件）+ SessionStoreLike 导出
- engine EngineConfig.sessionStore 注入 ctx + fromState 可选装配参 + L669 FDE 改 GA
- cli/im-inbound/mcp 传 sessionManager+sessionStore（mcp getDatabase 守卫降级）、bootstrap ctx.set sessionStore、tui-v2 透传
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md（接力登记：CI D540 同路径演进 carve-out，仅追加交接注记，不改 D500 声明）
不做什么（含文件路径）：
- 不改 src/orchestrator/session-manager.ts（D500 已审计交付，不加 getStore——经 EngineConfig.sessionStore 直传）
- 不改 src/server.ts（services.sessionManager 已入 wiring，无 ConversationEngine 实例化点，DS1 grep 现状已命中）
- 不改 src/routes/diagnosis.ts（consult 路由直建 SynovaDiagnosisEngine，不经过 launcher——片2-B 范围）
- 不改 src/orchestrator/wiring.ts（无事件桥职责，本切片零接触）
- 不改 scripts/sentinel 与 src/sentinel/（DSH 线禁入）
- 不做 fork/resume 与 D398（片3 期权）

## Q3: 验收 — 入口 → 交互 → 结果
入口（从哪触发）：GA 诊断启动（ConversationEngine.startDiagnosis 或 cli/im-inbound/mcp/tui 诊断链路）。
处理（中间步骤）：launcher 阶段/模块/报告事件经 onEvent 包装映射 diagnosis_phase/diagnosis_module/diagnosis_report → SessionStore.appendEvent 落 session_events（append-only，seq 单调）。
结果（最终展示）：consult 一次后 getEvents 可回放完整事件流（阶段→模块→报告顺序）；deriveMessages 投影不受诊断事件污染；双写失败显式 degraded 诊断不崩。

## 架构层: L2
编排层装配（conversation-engine/diagnosis-launcher/cli/im-inbound/mcp/tui-v2）+ L5 session-store 事件类型扩展
## Done 标准
- [ ] verify: grep -c "appendEvent" src/agent/diagnosis-launcher.ts 输出 >=1
- [ ] verify: grep -cE "diagnosis_phase|diagnosis_module|diagnosis_report" src/store/session-store.ts 输出 >=3
- [ ] verify: grep -c "sessionManager" src/cli.ts src/l1/im-inbound.ts src/mcp/index.ts 输出均 >=1
- [ ] verify: npx tsc --noEmit 零新增错误，基线 0=0
- [ ] DS3 测试全绿: vitest run tests/agent/diagnosis-session-events.test.ts 5/5（red 先行：①② 现状失败已证）
- [ ] DS4 零回归: tests/conversation-engine.test.ts + tests/store/session-event-log.test.ts + tests/orchestrator/session-manager-eventlog.test.ts 全绿
- [ ] DS5 范围一致: git diff --name-only 与 Q2 include 一致（spec §3.2 已回填偏差）
- [ ] DS6 无绕过: bypass.log 零 no-verify
- [ ] DS7 推送 + CI: origin 分支 push + PR CI 绿
