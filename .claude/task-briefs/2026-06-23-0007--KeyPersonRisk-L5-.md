# Task Brief: 哨兵端到端切片: KeyPersonRisk L5-L4-L3 完整验证

> 生成: 2026-06-23 00:07:05 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读）

- SynovaAgent = 组织数字孪生诊断 + 持续增长导航系统。
  诊断是手段，目的是增长。
  核心问题：这家企业的增长卡在哪里？现在该做什么？
- Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
- 五层架构：L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)，只能向下依赖相邻层。
- 8 位专家: strategy / org / finance / tech / marketing / action / business_model / knowledge
- 完整数据流:
  原始数据 → 本体层(电子病历) → 7维度×25测量器 → 证据池 → 专家ReAct推理 → 诊断报告

## Q1: 调研
Palantir 本体图加哨兵模式。Anthropic 先验证一个完整切片再批量。

## Q2: 范围
KeyPersonRisk 哨兵 Bus Factor 计算注入诊断引擎 Phase 2。

## Q3: 验收
入口 POST diagnosis consult Phase 0 写 Person 节点 Phase 2 哨兵查询注入 LLM

## 本任务在哪一层
L3 哨兵加诊断引擎 L4 GraphStore 读写

## Done 标准
- [x] Person 节点写入 Phase 0
- [x] 哨兵查询 Bus Factor 计算 7 tests
- [x] Finding 注入 LLM E2E 零 error
