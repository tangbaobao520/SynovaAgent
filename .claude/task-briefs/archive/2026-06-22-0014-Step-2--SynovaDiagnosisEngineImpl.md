# Task Brief: Step 2: 实现 SynovaDiagnosisEngineImpl — 六阶段诊断

> 生成: 2026-06-22 00:14:39 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读）

- SynovaAgent = AI 诊断 Agent。核心问题：这家企业的增长卡在哪里？现在该做什么？
- 五层架构：L1→L2→L3→L4→L5。8 专家: strategy/org/finance/tech/marketing/action/business_model/knowledge

## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践
Builder 模式配置引擎参数。工厂函数注入 LLM/Tools 依赖。每阶段独立 try/catch 降级不阻断后续。

### b) 顶级团队怎么做
Anthropic Step 2/4: 基于 Step 1 接口实现引擎。mock LLM 驱动测试。每阶段独立验证。降级路径覆盖。

### c) 我们犯过的错
[[engine-core-split-fraud]] — 上次用桥接文件骗过 tsc。本次：零 engine-core import，Synova 自研 prompt，自研错误处理。

## Q2: 范围 — 最简方案是什么？

实现六阶段诊断引擎：
- Phase 0 组织访谈 / Phase 1 数据采集 / Phase 2 LLM 假设生成 / Phase 3 根因分析 / Phase 4 报告生成 / Phase 5 交付
- Builder 模式配置 (maxIterations, gateCompleteness, gateConfidence)
- Synova 自研诊断 Prompt
- 每阶段独立降级

明确不做：GraphStore 集成、哨兵 compute 函数、专家并行推理（后续 Step 迭代）。

## Q3: 验收 — 做完后用户能看到什么？

入口: `new SynovaDiagnosisEngineImpl(llm, tools)` 或 `createSynovaDiagnosisEngine(llm, tools)`
处理: 六阶段事件流 → LLM 诊断 → JSON 解析 → 结构化报告
结果: ConsultationResult 含 rootCauses + recommendations + summary

## 本任务在哪一层
L3 洞察层 — 引擎实现。纯 L3，不碰 L4/L5。

## 文档引用
- Step 1 接口: src/l3/synova-diagnosis-engine.ts
- PRD v1.6 §5/§9
- memory/engine-core-split-fraud.md

## 接口审计

| 文件:函数签名 | 返回类型 |
|--------|---------|
| `synova-diagnosis-engine-impl.ts:SynovaDiagnosisEngineImpl.runConsultation(teamId, initiator, scope?, onEvent?)` | `Promise<ConsultationResult>` |
| `synova-diagnosis-engine-impl.ts:createSynovaDiagnosisEngine(llm, tools, options?)` | `SynovaDiagnosisEngine` |
| `synova-diagnosis-engine-impl.ts:SynovaDiagnosisEngineImpl.withMaxIterations(n)` | `this` (Builder) |

## 新建文件声明
- `src/l3/synova-diagnosis-engine-impl.ts` (NEW, ~330行) — 引擎实现
- `tests/l3/synova-diagnosis-engine-impl.test.ts` (NEW, 12 assertions) — 集成测试

## 数据流
```
L1/L2 调用方
  → new SynovaDiagnosisEngineImpl(llm, tools).withMaxIterations(4)
  → engine.runConsultation(teamId, initiator, scope, onEvent)
    → Phase 0-1: 输入验证 + 数据采集
    → Phase 2: LLM.chat(Synova 自研 Prompt) → JSON 解析
    → Phase 3: 根因提取 → root_cause_identified 事件
    → Phase 4: 报告组装 → report_ready 事件
    → Phase 5: 交付 → return ConsultationResult
```

## Done 标准 (PRD §5/§9 — Step 2/4)
- [x] 入口可触达: `new SynovaDiagnosisEngineImpl(llm, tools)` 类型正确
- [x] 链路走通: 六阶段全事件流 + LLM 调用 + 报告返回
- [x] 结果可见: 12 集成测试通过 (mock LLM)
- [x] 降级覆盖: LLM 失败 / JSON 解析失败 / 空输入 → 均不崩溃
- [x] 接线就绪: 接口实例化可用，Step 3 原子切换时接入调用方
- [x] 零 engine-core: `grep -r "engine-core\|@synova/diagnosis-engine" src/l3/synova-diagnosis-engine-impl.ts` = 零结果
