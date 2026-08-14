<!--
  Synova Skill/Tool体系研究 第五章 — Tool原子清单与权限模型
  版本: v1.0 | 日期: 2026-07-16
-->

# 第五章：Tool原子清单与权限模型

> 34个Tool原子：数据获取6 (T-ACQUIRE-*) + 计算分析25 (T-COMPUTE-*) + 输出格式化3 (T-FORMAT-*)。
> 与现有124个compute函数（extensions/sentinels/*/computes/*.ts）交叉比对。
> PolicyEngine (D38) 三元组仲裁每次Tool调用。

---

## 一、Tool分类总览

Synova的Tool体系分为三大类，共计34个原子Tool：

`
T-ACQUIRE-* (6)   -> 从本体层(GraphStore)读取边数据
T-COMPUTE-* (25)  -> 调用compute函数进行量化计算
T-FORMAT-* (3)    -> 将原始输出格式化为报告/图表
`

### Tool原子性定义（D68规范）

一个合格的原子Tool必须满足3项条件，由 ToolRegistry.validateAtomicity() 静态方法检查（src/tools/tool-registry.ts:140-167）：

1. contractId 非空 — 输入/输出契约明确
2. hasTests = true — 可独立测试
3. skills.length >= 2 — 被至少2个Skill复用

---

## 二、数据获取Tool (6个 T-ACQUIRE-*)

| # | tool_id | contractId | signature | category | edges_read | reuse_count | existing_impl |
|---|---------|------------|-----------|----------|------------|-------------|---------------|
| 1 | acquire-edge-data | ACQUIRE-EDGE-DATA-v1 | (edgeIds: string[]) => EdgeData[] | 数据获取 | 全量42边 | 20+ | OK |
| 2 | acquire-node-data | ACQUIRE-NODE-DATA-v1 | (nodeIds: string[]) => NodeData[] | 数据获取 | 本体节点 | 5+ | OK |
| 3 | query-graph | QUERY-GRAPH-v1 | (query: GraphQuery) => QueryResult | 数据获取 | 全量图 | 15+ | OK |
| 4 | query-knowledge | QUERY-KNOWLEDGE-v1 | (query: KnowledgeQuery) => KnowledgeResult | 数据获取 | 知识库 | 8+ | OK |
| 5 | acquire-baseline | ACQUIRE-BASELINE-v1 | (sentinelId: string) => BaselineData | 数据获取 | 基线存储 | 10+ | OK |
| 6 | acquire-evidence | ACQUIRE-EVIDENCE-v1 | (dimension: string) => Evidence[] | 数据获取 | 证据池 | 8+ | OK |

---

## 三、计算分析Tool (25个 T-COMPUTE-*)

### 财务类计算 (8个)

| # | tool_id | contractId | compute函数映射 | edges_read | reuse_count | existing_impl |
|---|---------|------------|----------------|------------|-------------|---------------|
| 7 | compute-break-even | COMPUTE-BREAK-EVEN-v1 | computeBreakEven() | E-1.1,E-2.1,E-3.1,E-4.1 | 5+ | OK |
| 8 | compute-dol | COMPUTE-DOL-v2 | computeDOL() | E-1.1,E-3.1 | 4+ | OK |
| 9 | compute-capital-allocation | COMPUTE-CAPITAL-ALLOCATION-v1 | computeCapitalAllocation() | E-1.x,E-5.x | 3+ | OK |
| 10 | compute-cost-structure | COMPUTE-COST-STRUCTURE-v1 | computeCostStructure() | E-1.x,E-3.x | 3+ | OK |
| 11 | compute-margin-trend | COMPUTE-MARGIN-TREND-v1 | computeMarginTrend() | E-1.2,E-1.3 | 3+ | OK |
| 12 | compute-roic-wacc | COMPUTE-ROIC-WACC-v1 | computeRoicWaccSpread() | E-1.x,E-5.x | 4+ | OK |
| 13 | compute-cash-runway | COMPUTE-CASH-RUNWAY-v1 | computeCashRunwayMonths() | E-1.x,E-3.x | 3+ | OK |
| 14 | compute-debt-equity | COMPUTE-DEBT-EQUITY-v1 | computeDebtEquityRatio() | E-1.x,E-5.x | 2+ | OK |

### 竞争/市场类计算 (5个)

| # | tool_id | contractId | compute函数映射 | edges_read | reuse_count | existing_impl |
|---|---------|------------|----------------|------------|-------------|---------------|
| 15 | compute-competitive-positioning | COMPUTE-COMPETITIVE-POSITIONING-v1 | computeCompetitivePositioning() | E-4.7,E-4.4,E-4.5 | 3+ | OK |
| 16 | compute-hhi | COMPUTE-HHI-v1 | computeHHI() | E-4.5,E-4.4 | 3+ | OK |
| 17 | compute-market-share | COMPUTE-MARKET-SHARE-v1 | computeMarketShare() | E-4.x | 2+ | OK |
| 18 | compute-niche-breadth | COMPUTE-NICHE-BREADTH-v1 | computeNicheBreadth() | E-4.x | 2+ | + |
| 19 | compute-opportunity-window | COMPUTE-OPPORTUNITY-WINDOW-v1 | computeOpportunityWindowScore() | E-4.x,E-5.x | 2+ | OK |

### 客户/收入类计算 (5个)

| # | tool_id | contractId | compute函数映射 | edges_read | reuse_count | existing_impl |
|---|---------|------------|----------------|------------|-------------|---------------|
| 20 | compute-customer-ltv | COMPUTE-CUSTOMER-LTV-v1 | computeCustomerLTV() | E-2.x | 3+ | + |
| 21 | compute-churn-rate | COMPUTE-CHURN-RATE-v1 | computeChurnRate() | E-2.x | 4+ | OK |
| 22 | compute-customer-concentration | COMPUTE-CUSTOMER-CONCENTRATION-v1 | computeCustomerConcentration() | E-2.x | 3+ | OK |
| 23 | compute-price-elasticity | COMPUTE-PRICE-ELASTICITY-v1 | computePriceElasticity() | E-2.x,E-4.x | 2+ | + |
| 24 | compute-revenue-health | COMPUTE-REVENUE-HEALTH-v1 | computeRevenueHealth() | E-1.2,E-2.x | 3+ | OK |

### 组织/运营类计算 (7个)

| # | tool_id | contractId | compute函数映射 | edges_read | reuse_count | existing_impl |
|---|---------|------------|----------------|------------|-------------|---------------|
| 25 | compute-talent-density | COMPUTE-TALENT-DENSITY-v1 | computeTalentDensity() | E-X.x | 2+ | OK |
| 26 | compute-key-person-risk | COMPUTE-KEY-PERSON-RISK-v1 | computeKeyPersonRisk() | E-X.x | 2+ | + |
| 27 | compute-incentive-alignment | COMPUTE-INCENTIVE-ALIGNMENT-v1 | computeIncentiveAlignment() | E-X.x | 2+ | OK |
| 28 | compute-info-distortion | COMPUTE-INFO-DISTORTION-v1 | computeInfoDistortion() | E-X.x | 2+ | + |
| 29 | compute-process-ai-readiness | COMPUTE-PROCESS-AI-READINESS-v1 | computeProcessAIReadiness() | E-3.x | 2+ | OK |
| 30 | compute-deviation-score | COMPUTE-DEVIATION-SCORE-v1 | computeDeviationScore() | E-3.x,E-5.x | 2+ | + |
| 31 | compute-learning-curve | COMPUTE-LEARNING-CURVE-v1 | computeLearningCurve() | E-X.x | 2+ | + |

---

## 四、输出格式化Tool (3个 T-FORMAT-*)

| # | tool_id | contractId | signature | category | reuse_count | existing_impl |
|---|---------|------------|-----------|----------|-------------|---------------|
| 32 | format-diagnosis-report | FORMAT-REPORT-v1 | (findings: Finding[]) => Report | 输出 | 5+ | OK |
| 33 | format-signal-alert | FORMAT-ALERT-v1 | (signal: SentinelSignal) => Alert | 输出 | 8+ | OK |
| 34 | format-action-plan | FORMAT-ACTION-PLAN-v1 | (prescriptions: Prescription[]) => ActionPlan | 输出 | 3+ | OK |

---

## 五、与现有compute函数交叉比对

现有124个compute函数位于 extensions/sentinels/*/computes/*.ts。25个T-COMPUTE-* Tool与这些compute函数的关系：

| 类别 | compute函数总数 | 已有Tool包装 | 需新增 |
|------|----------------|-------------|--------|
| 财务类 | ~18 | 8 | 10 |
| 竞争/市场类 | ~15 | 5 | 10 |
| 客户/收入类 | ~14 | 5 | 9 |
| 组织/运营类 | ~25 | 7 | 18 |
| 环境/外部类 | ~12 | 0 | 12 |
| 共享/工具类 | ~10 | 0 | 10 |
| 已废弃(_extinct) | ~30 | — | — |
| **合计** | **~124** | **25** | **59** |

## 六、PolicyEngine权限模型 (D38)

PolicyEngine (src/security/policy-engine.ts) 基于三元组 (role, dataLevel, SOI) 裁决每次Tool调用。

### SOI常量 (10条标准操作指令)

| SOI 常量 | 值 | 类型 |
|----------|-----|------|
| GRAPH_TRAVERSE | graph.traverse | 读 |
| SENTINEL_COMPUTE | sentinel.compute | 读/计算 |
| AGENT_PROACTIVE_ALERT | agent.proactive_alert | 写 |
| ONTOLOGY_WRITE | ontology.write | 写 |
| DIAGNOSIS_REPORT | diagnosis.report | 读 |
| DATA_EXPORT | data.export | 读 |
| DATA_DELETE | data.delete | 写 |
| KNOWLEDGE_UPLOAD | knowledge.upload | 写 |
| GA_CALIBRATE | ga.calibrate | 配置 |
| ADMIN_CONFIGURE | admin.configure | 配置 |

### 默认权限矩阵

| 角色 | T-ACQUIRE | T-COMPUTE | T-FORMAT | 写操作 | 管理操作 |
|------|-----------|-----------|----------|--------|----------|
| finance | S0-S2读 | 财务类全部 | 全部 | 禁止 | 禁止 |
| strategy | S0-S2读 | 战略/竞争类 | 全部 | 禁止 | 禁止 |
| org | S0-S1读 | 组织类 | 全部 | 禁止 | 禁止 |
| marketing | S0-S2读 | 市场/客户类 | 全部 | 禁止 | 禁止 |
| tech | S0-S2读 | 技术/运营类 | 全部 | 禁止 | 禁止 |
| host | S0-S4全读 | 全部 | 全部 | ONTOLOGY_WRITE | ADMIN_CONFIGURE |
| knowledge | S0-S3读 | 知识类 | 全部 | KNOWLEDGE_UPLOAD | 禁止 |

## 七、状态标记说明

| 标记 | 含义 | 本章数量 |
|------|------|---------|
| OK | 已实现（有代码路径） | 27个Tool |
| + | 待新增（compute函数存在但无Tool包装） | 7个Tool |

> T-COMPUTE-* 中标记 + 的7个Tool（niche-breadth, customer-ltv, price-elasticity, key-person-risk, info-distortion, deviation-score, learning-curve）对应compute函数已存在于 extensions/sentinels/*/computes/*.ts，但尚未在 src/tools/ 下创建Tool包装器。
