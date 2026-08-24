# Task Brief: 修复 post-processing — 降级不阻断诊断

> 生成: 2026-06-22 19:31:31 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读）

- SynovaAgent = AI 诊断 Agent。五层架构 L1→L5。8 专家。

## Q1: 调研

### a) 业界最佳实践
动态 import 必须包裹 try/catch。post-processing 是增值不是必需——导入失败应降级不阻断主流程。

### b) 顶级团队怎么做
Anthropic: 每个可选依赖独立 try/catch。降级信号传播——import 失败 → log.warn → 返回 degraded 结果 → 主流程继续。

### c) 我们犯过的错
[[engine-core-split-fraud]] — 之前忽略 ESM 兼容问题。post-processor 的 L4 import 未被 try/catch 包裹，一炸全炸。

## Q2: 范围

只修 post-diagnosis-processor.ts：动态 import 包裹 try/catch。
不改 L4 模块本身。不改 GraphStore 实现。
L4 模块仍不可用 — 但诊断主流程不再被拖垮。

## Q3: 验收

入口: POST /api/diagnosis/consult
处理: 新引擎六阶段 → post-processing import 失败 → 降级返回
结果: 诊断完成 (complete)，零 error 事件，修复前总是以 error 结束

## 本任务在哪一层
L2 (agent/post-diagnosis-processor.ts) — 动态 import 容错。

## 文档引用
- Step 4 engine: src/l3/synova-diagnosis-engine.ts
- memory/engine-core-split-fraud.md

## 接口审计

| 文件:函数签名 | 返回类型 |
|--------|---------|
| `post-diagnosis-processor.ts:runPostDiagnosisProcessing(graphStore, teamId, report, events?)` | `PostProcessResult` |
| `post-diagnosis-processor.ts:import('../l4/graph-bridge')` — try/catch 包裹 | `GraphBridgeLike \| null` |

## 新建/修改文件
- `src/agent/post-diagnosis-processor.ts` (MODIFY, ~30行) — import 包裹 try/catch + null guard

## 数据流
```
engine.runConsultation() → result
  → runPostDiagnosisProcessing()
    → try: import L4 modules
    → catch: log.warn + return degraded result
    → 诊断主流程不受影响
```

## Done 标准 (PRD §5/§9)
- [x] 入口可触达: POST /api/diagnosis/consult → 默认新引擎
- [x] 链路走通: 六阶段 + complete 事件 (非 error)
- [x] 结果可见: 零 error 事件，post-processing 降级不阻断
- [x] tsc 零错误
