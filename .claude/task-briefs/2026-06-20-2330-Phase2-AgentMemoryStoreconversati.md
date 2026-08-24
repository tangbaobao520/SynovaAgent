# Task Brief: Phase2: AgentMemoryStore接入conversation-engine+workspaces-api消息路由传workspaceId——完成上下文隔离闭环

> 生成: 2026-06-20 23:30:50 | 分支: feat/prompt-architecture | as any: 0

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
- RAG: AgentMemoryStore.recall() + list() 已有接口,直接调用
- context-compressor.ts: Phase1已加confirmedFacts参数,本次接入真实数据源
- C:\Users\Administrator\AppData\Local\Temp\上下文管理优化任务.md: Step 2+3 的具体实现参考

### b) 顶级团队怎么做
- Anthropic: 先让loadConfirmedFacts()返回真实数据(接入AgentMemoryStore)→再让workspaces-api传workspaceId→最后验证端到端
- 分两步: 先数据层(AgentMemoryStore) 后路由层(workspaces-api)

### c) 我们犯过的错
- memory/iron-rules: 铁律4 交付不完整——Phase1的loadConfirmedFacts()返回undefined是半成品
- 铁律0-2: 测试先行——上次先写代码后补测试,这次先写测试
- 铁律12: 集成测试cover真实路由——要测试workspaceId从API传到Engine的全链路

## Q2: 范围 — MVP

1. conversation-engine.ts: loadConfirmedFacts() 接入AgentMemoryStore真实数据
2. workspaces-api.ts: processMessage() 接收workspaceId参数并传递(Phase1用echo,Phase2连Engine)
不做: conversation-engine支持多workspaceId并行(当前单例)

## Q3: 验收

入口: POST /api/workspaces/:id/messages → workspaces-api接收workspaceId → 传递到Engine
处理: Engine.loadConfirmedFacts()从AgentMemoryStore查询enterprise_fact → 压缩时保留
结果: 工作区A的已确认判断不因压缩丢失。切换工作区B不包含A的事实。

## 本任务在哪一层
L2编排(conversation-engine) + L4本体(AgentMemoryStore) + L1路由(workspaces-api)。架构合规: L2通过AgentMemoryStore(L4)访问数据。

## 文档引用
- C:\Users\Administrator\AppData\Local\Temp\上下文管理优化任务.md
- src/agent/conversation-engine.ts: loadConfirmedFacts(), processMessage()
- src/l4/agent-memory-store.ts: list(query), search(orgId, q, limit)
- src/routes/workspaces-api.ts: POST /api/workspaces/:id/messages

## 接口审计
- src/l4/agent-memory-store.ts: list(query: MemoryQuery) → MemoryEntry[]
- src/agent/conversation-engine.ts: loadConfirmedFacts() → Promise<string[] | undefined>
- src/orchestrator/context-compressor.ts: compress(messages, systemPrompt, config, confirmedFacts?) → CompressionResult

## 数据流
workspaces-api消息(/api/workspaces/:id/messages) → workspaceId → conversation-engine.processMessage() → this.workspaceId设置 → loadConfirmedFacts() → AgentMemoryStore.list({orgId:workspaceId, type:'enterprise_fact'}) → confirmedFacts[] → context-compressor.compress(confirmedFacts) → Agent回复(已确认判断不丢失)

## Done 标准
- [x] 测试: confirmedFacts从AgentMemoryStore真实加载的单元测试
- [x] 测试: compress注入已确认判断的集成测试
- [x] conversation-engine.loadConfirmedFacts() 接入AgentMemoryStore
- [x] workspaces-api消息路由传workspaceId
- [x] tsc零错误 + 全量测试通过
