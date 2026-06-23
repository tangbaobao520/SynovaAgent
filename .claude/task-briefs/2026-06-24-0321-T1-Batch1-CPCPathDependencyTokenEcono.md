# Task Brief: T1 Batch1: CPC+PathDependency+TokenEconomics compute重建 + 专家知识注入

> 生成: 2026-06-24 03:21:36 | 分支: feat/prompt-architecture | as any: 0

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
基础设施 — 消除 engine-core 桥接。T1 Batch 1 = 3 compute 重建 (CPC/PathDependency/TokenEconomics)。每函数产出: computees/*.ts 纯函数 + THEORY.md + TOOLS.md + RULES.md。零 engine-core import。方法: 读 engine-core 源码理解算法 → L4 GraphStore 重写。

### b) 文件审计
已有: extensions/sentinels/cost-health (模式参考), expert/org|strategy|finance/ (已有文件), src/sentinel/compute/ (旧桥接只读参考)
新建: extensions/sentinels/collaboration-health/, path-dependency/, token-economics/ computess/
扩展: expert/org/ + strategy/ + finance/ THEORY+TOOLS+RULES
无冲突。

### c) 决策
重写(rewrite): 提取算法逻辑，L4 GraphStore 接口重写纯函数。不 bridge，不 import engine-core。

## Q1: 调研 — Anthropic 团队会怎么做？
a) memory/engine-core-split-fraud.md: 桥接文件欺诈—538文件原封不动,20个桥接伪装迁移。本次直接重写纯函数,不建桥接。
b) 原则2: 先设计验证标准(grep零engine-core import)。原则5: 物理强制(pre-commit铁律46阻断)。

## Q2: 方案 — 重写(rewrite)
重写: 读engine-core/{cpc,path-dependency,token-economics}.ts提取算法, L4 GraphStore接口重写纯函数。

## Q3: 验收 — 怎么证明不是空壳？
verify: grep -r "engine-core" extensions/sentinels/collaboration-health/computes/ extensions/sentinels/path-dependency/computes/ extensions/sentinels/token-economics/computes/ | wc -l | xargs test 0 -eq
verify: test -f expert/org/TOOLS.md && grep -q "协作协议" expert/org/TOOLS.md

## 本任务在哪一层
L3(哨兵compute) + expert/(知识注入)。不跨层。

## Done 标准
- [x] verify: grep -r "engine-core" extensions/sentinels/*/computes/cpc.ts 零结果
- [x] verify: expert/org/TOOLS.md 含协作协议内容
- [x] verify: expert/strategy/THEORY.md 含路径依赖框架
- [x] verify: expert/finance/TOOLS.md 含Token成本核算
