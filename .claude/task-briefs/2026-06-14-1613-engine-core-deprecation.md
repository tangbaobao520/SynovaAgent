# Task Brief: engine-core 旧管道退役标记 — ModuleRegistry → Sentinel 迁移清理

> 生成时间: 2026-06-14 16:13
> 分支: feat/prompt-architecture
> 代码库状态: tsc=0 errors, 工作树 6 文件未提交

## 项目身份（每次重读）

- SynovaAgent = 组织数字孪生诊断 + 持续增长导航系统。
  诊断是手段，目的是增长。
  核心问题：这家企业的增长卡在哪里？现在该做什么？
- Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
- 五层架构：L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)，只能向下依赖相邻层。

## 本任务在哪一层

L4 (engine-core/pipeline/diagnosis) → 仅文档/注释/死代码清理，不涉及逻辑变更。
触及：packages/engine-core/src/pipeline/diagnosis/ (L4本体层)
无跨层风险 — 仅修改注释和禁用一个内部注册调用。

## 文档引用

- §7.3 测量器与哨兵：测量能力已迁移到 Sentinel 接口
- ARCH-20: 可替换后端，接口预留 SurrealDB
- docs/SENTINEL-GAP-D1-D4-D5.md：哨兵缺口分析

## 接口审计

- module-registry.ts: ensureModulesRegistered() → 被 diagnosis-orchestrator.ts:247 调用（调用方保留，内部变为 no-op）
- signal-aggregator.ts: collectAndAggregate() → 零调用方，安全删除
- types.ts: ExpertTypeShort → **当前零引用**，需补充接线或删除（铁律 37）
- graph-store.ts: 仅注释变更
- measurement-pipeline.ts: 仅注释变更
- start-codex-bridge.bat: 仅路径/注释变更

## 数据流

旧管道 (退役中): diagnosis-orchestrator → ensureModulesRegistered() → registerBuiltinModules() → **已禁用**
新管道 (已就绪): Cron → SentinelRunner → Sentinel 接口 → SignalAggregator → ExpertDispatcher

## 用户旅程

无用户可见变更。本次为内部代码清理：旧 pipeline 框架退役标记，不影响任何 API 端点或哨兵运行。

## Done 标准

- [x] 入口可触达: 无需新入口，仅标记退役
- [ ] 链路走通: tsc 零错误 + vitest 全量通过 + iron-laws 零 hard-block
- [ ] 结果可见: git commit + push 成功
- [ ] ExpertTypeShort 接线或删除（当前零引用 = 铁律 37 违规）

## 验证命令
```bash
npx tsc --noEmit
npx vitest run
npm run check:iron-laws
```
