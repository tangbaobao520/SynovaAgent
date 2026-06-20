# Task Brief: Slice 8: 企业事实层——AgentMemoryStore扩展+expert prompt注入企业事实

> 生成: 2026-06-20 16:05:22 | 分支: feat/prompt-architecture | as any: 0

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
- RAG: 检索增强生成——注入事实约束到prompt顶部是标准模式
- Anthropic: system prompt最前面放硬约束(constitutional principles)

### b) 顶级团队怎么做
- Anthropic会先把事实存SQLite→检索→注入system prompt顶部

### c) 我们犯过的错
- memory/iron-rules: 铁律4交付不完整——写完AgentMemoryStore要接到ExpertFileLoader

## Q2: 范围
AgentMemoryStore加enterprise_fact type+版本链。ExpertFileLoader注入事实。不做完整CRUD UI。

## Q3: 验收
创建事实→新诊断→Agent回答基于事实。更新事实(superseded_by)→Agent用新版本。

## 本任务在哪一层
<!-- L1/L2/L3/L4/L5？触及哪几层？有没有跨层风险？ -->

## 文档引用
<!-- 全量对齐手册哪些章节和本任务相关？引用具体节号。 -->

## 接口审计
<!-- 本任务调用的关键函数签名（从代码 grep 来的，不凭记忆） -->
<!-- 格式: 文件名:函数名(参数) → 返回类型 -->

## 数据流
<!-- 输入来自哪里 → 经过哪些文件/函数 → 输出到哪里 -->

## Done 标准
<!-- 铁律 7: 入口可触达 + 完整链路走通 + 结果可见 -->
- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:
