# Task Brief: Step 3: Feature flag 原子切换 — SYNOVA_USE_NEW_ENGINE

> 生成: 2026-06-22 04:46:15 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读）

- SynovaAgent = AI 诊断 Agent。核心问题：这家企业的增长卡在哪里？现在该做什么？
- 五层架构：L1→L2→L3→L4→L5。8 专家。

## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践
Feature flag 环境变量控制新旧引擎切换。默认旧引擎（零风险），手动开启新引擎验证。验证通过后默认切新，稳定后删旧。

### b) 顶级团队怎么做
Anthropic Step 3/4: adapter 内 if/else 分支，两个引擎实现同一接口。L1/L2 调用方无感知。

### c) 我们犯过的错
[[engine-core-split-fraud]] — 上次用桥接文件骗过 tsc。本次：feature flag 原子切换，旧路径完整保留作回退。

## Q2: 范围 — 最简方案是什么？

diagnosis.ts 中 if/else 分支：
- SYNOVA_USE_NEW_ENGINE=true → SynovaDiagnosisEngineImpl
- 默认 → EngineCoreVendorAdapter (零影响)

明确不做：改其他调用方、删旧 adapter、改 diagnosis-launcher。

## Q3: 验收 — 做完后用户能看到什么？

入口: SYNOVA_USE_NEW_ENGINE=true DEV_MODE=true npx tsx src/index.ts
处理: POST /api/diagnosis/consult → 六阶段事件流 → 报告
结果: 首次六阶段全部走通（旧引擎 Phase 2 崩溃）

## 本任务在哪一层
L1 交互层 (src/routes/diagnosis.ts) — feature flag 分支。L1→L3 调用（通过接口）。

## 文档引用
- Step 1 接口: src/l3/synova-diagnosis-engine.ts
- Step 2 实现: src/l3/synova-diagnosis-engine-impl.ts
- PRD v1.6 §5/§9
- memory/engine-core-split-fraud.md

## 接口审计

| 文件:函数签名 | 返回类型 |
|--------|---------|
| `diagnosis.ts:createSynovaDiagnosisEngine(llm, tools, opts)` | `SynovaDiagnosisEngine` |
| `diagnosis.ts:engine.runConsultation(teamId, initiator, onEvent?)` | `Promise<ConsultationResult>` |
| `diagnosis.ts:provider.chat(messages, opts)` ToolCall映射 | `{content, toolCalls}` |

## 数据流
```
POST /api/diagnosis/consult
  → if SYNOVA_USE_NEW_ENGINE:
    → createSynovaDiagnosisEngine(llmClient, toolExecutor)
    → newEngine.runConsultation() → 六阶段事件流
  → else:
    → new EngineCoreVendorAdapter (旧路径)
  → SSE push → 前端渲染
```

## Done 标准 (PRD §5/§9 Step 3/4)
- [x] 入口可触达: SYNOVA_USE_NEW_ENGINE=true 启动服务器 → POST /api/diagnosis/consult
- [x] 链路走通: 六阶段事件全部发出 (phase 0→5 + 3 hypotheses + 3 root_causes)
- [x] 结果可见: 报告生成 (report_ready 事件)、旧路径 else 分支完整保留
- [x] 回退安全: 不设环境变量 = 旧引擎，零影响
- [x] tsc 零错误、as any = 0
