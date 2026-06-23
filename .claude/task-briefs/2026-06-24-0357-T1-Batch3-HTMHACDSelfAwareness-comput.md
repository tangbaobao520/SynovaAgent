# Task Brief: T1 Batch3: HTM+HACD+SelfAwareness compute 重建 + 专家注入

> 生成: 2026-06-24 03:57:41 | 分支: feat/prompt-architecture | as any: 0

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
T1 Batch3: HTM+HACD+SelfAwareness compute重建。触及L3+expert/org。零engine-core import。

### b) 文件审计
已有: extensions/sentinels/cost-health(模式参考), expert/org/(已有文件)。新建: htm/hacd/self-awareness computess/。扩展: expert/org/THEORY+TOOLS。无冲突。

### c) 决策
重写(rewrite): 提取算法 → L4 GraphStore纯函数。

## Q1: 调研
memory/engine-core-split-fraud.md: 桥接欺诈。本批次直接重写纯函数。

## Q2: 方案
重写: HTM信任模型 + HACD协作深度 + SelfAwareness自知偏差。

## Q3: 验收
verify: grep -r engine-core extensions/sentinels/{htm,hacd,self-awareness}/computes/ 零结果

## 本任务在哪一层
L3+expert。不跨层。

## Done 标准
- [x] verify: 零 engine-core import
- [x] verify: expert/org/THEORY.md 含HTM信任模型
- [x] verify: expert/org/TOOLS.md 含HACD评估+SelfAwareness检测
## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践
<!-- 你的训练数据里，这类问题有什么已知的设计模式、库、架构方案？ -->

### b) Anthropic 团队怎么做
<!-- Anthropic 拿到这个任务，会怎么分解？先做什么、后做什么？ -->

### c) 我们犯过的错
<!-- 在 memory/ 里搜索相关关键词。我们以前做过类似的事吗？犯过什么错？ -->

## Q2: 范围 — 正确的最简方案是什么？

<!-- 必须符合现有架构、复用已有模块。明确列出做什么、不做什么。 -->

## Q3: 验收 — 做完后用户能看到什么？

<!-- 入口 → 交互 → 结果，三环节各是什么？ -->

## 本任务在哪一层
<!-- L1/L2/L3/L4/L5？触及哪几层？有没有跨层风险？ -->

## Done 标准
<!-- 铁律 7: 入口可触达 + 完整链路走通 + 结果可见 — 至少一条可验证标准 -->
- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:
