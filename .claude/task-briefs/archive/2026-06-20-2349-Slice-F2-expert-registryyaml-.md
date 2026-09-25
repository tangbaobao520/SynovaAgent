# Task Brief: Slice F2: expert-registry.yaml 配置化注册

> 生成: 2026-06-20 23:49:12 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读）

- SynovaAgent = 组织数字孪生诊断 + 持续增长导航系统。
  诊断是手段，目的是增长。
  核心问题：这家企业的增长卡在哪里？现在该做什么？
- Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
- 五层架构：L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)，只能向下依赖相邻层。
- 8 位专家: strategy / org / finance / tech / marketing / action / business_model / knowledge
- 完整数据流:
  原始数据 → 本体层(电子病历) → 7维度×25测量器 → 证据池 → 专家ReAct推理 → 诊断报告

## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践
Claude for Financial Services用agent.yaml声明式配置。Kubernetes用YAML+CRD做声明式资源管理。

### b) 顶级团队怎么做
Anthropic: 执行引擎和Agent配置解耦。加Agent=加yaml条目，不改引擎代码。

### c) 我们犯过的错
F1刚修了ExpertType硬编码。这次不能只改表层——yaml必须和Registry联动。

## Q2: 范围 — 最简方案是什么？

创建expert-registry.yaml + YAML解析器 + ExpertDispatcher读配置。不新建复杂抽象。

## Q3: 验收 — 做完后用户能看到什么？

加第9专家=创建目录+yaml加4行+POST /api/reload。不需改.ts文件。

## 本任务在哪一层
L3洞察层 + 配置文件层。expert-config-loader是L2。无跨层风险。

## 文档引用
手册§4.1 必须无限扩展。PRD v1.8 §20.3 Agent配置化注册。

## 接口审计
expert-config-loader.ts:loadExpertConfig
expert-config-loader.ts:getEnabledDiagnosticExperts
expert-config-loader.ts:getBackgroundExperts
expert-dispatcher.ts:runAllExperts

## 数据流
expert-registry.yaml → expert-config-loader.ts → ExpertDispatcher.runAllExperts()

## Done 标准
- [x] 入口可触达: POST /api/reload 清除yaml缓存并重载
- [x] 链路走通: yaml→config-loader→Registry→ExpertDispatcher
- [x] 结果可见: 加第9专家=yaml加4行+POST /api/reload, 不改.ts
