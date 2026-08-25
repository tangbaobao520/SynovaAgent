# Task Brief: 修复空壳API: workspaces-api消息路由到ConversationEngine + knowledge-ask接入PKB检索

> 生成: 2026-06-21 00:28:11 | 分支: feat/prompt-architecture | as any: 0

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
ConversationEngine是单体Agent。workspaces-api消息应路由到Engine处理。KnowledgeStore有search()方法可用于PKB检索

### b) 顶级团队怎么做
Anthropic: 先接线到真实处理逻辑→再优化。不重建架构，只修断裂的链路

### c) 我们犯过的错
铁律5: 后端能力≠用户可用功能。workspaces-api写了但消息不会进Agent处理

## Q2: 范围
workspaces-api echo→Engine路由 + knowledge-ask硬编码→KnowledgeStore.search()
不做: 多workspaceId上下文隔离

## Q3: 验收
POST /messages → Agent真实回复(非echo)。GET /ask → PKB检索结果(非硬编码)

## 本任务在哪一层
L1路由→L2编排(ConversationEngine) + L4本体(KnowledgeStore)

## 文档引用
- src/routes/workspaces-api.ts:98 POST /messages
- src/routes/knowledge-ask.ts:33 answerQuestion()

## 接口审计
- src/agent/conversation-engine.ts: processMessage(text) → ProcessResult
- src/l4/knowledge-store.ts: search(query, filter, limit) → SearchResult[]

## 数据流
POST /messages → workspaceId → ConversationEngine.processMessage → Agent回复
GET /ask?q= → KnowledgeStore.search → 真实PKB结果

## Done 标准
- [x] workspaces-api消息不再echo, 调Engine处理
- [x] knowledge-ask查询PKB, 不再硬编码
- [x] tsc零错误 + 现有测试通过
