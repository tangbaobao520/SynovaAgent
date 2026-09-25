# Task Brief: V4.1 补测试：16个compute+aggregate测试 + pre-commit扩展extensions/门禁

> 生成: 2026-06-24 09:35:51 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

流程约束: V3.8 — task brief 6 字段强制 + plan.json 分阶段 + pre-commit 8 组物理阻断。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
补测试+修门禁。pre-commit扩展extensions/覆盖+15个compute/aggregate测试。

### b) 文件审计
新建: tests/sentinels/15个.test.ts。修改: pre-commit-check.sh(NEW_IMPL覆盖extensions/)。无冲突。

### c) 决策
复用已有vitest框架。

## Q1: 调研
Anthropic原则2:先设计验证标准。16个函数零测试=未完成。memory/engine-core-split-fraud:声称完成但实际空壳。

## Q2: 方案
修门禁(extensions/纳入测试配对)+补15测试+跑全量+CI结果。

## Q3: 验收
verify: npx vitest run tests/sentinels/ 全部通过

## 本任务在哪一层
测试基础设施。不跨层。

## Done 标准
- [x] verify: npx vitest run tests/sentinels/ 45/45 passed
- [x] verify: grep extensions/ scripts/pre-commit-check.sh 含NEW_IMPL扩展


### b) 文件审计


### c) 决策


## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践


### b) Anthropic 团队怎么做


### c) 我们犯过的错


## Q2: 范围 — 正确的最简方案是什么？



## Q3: 验收 — 做完后用户能看到什么？



## 本任务在哪一层


## Done 标准

- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:
