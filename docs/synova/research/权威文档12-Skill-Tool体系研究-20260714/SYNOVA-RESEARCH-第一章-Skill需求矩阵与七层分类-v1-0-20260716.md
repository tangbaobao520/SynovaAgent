<!--
  SYNOVA-RESEARCH-第一章-Skill需求矩阵与七层分类-v1-0-20260716
  Skill/Tool体系研究 -- 第一章：Skill需求矩阵与七层分类
  版本: v1.0 | 日期: 2026-07-16 | 作者: SynovaAgent + Codex
  状态: Draft
-->

# 第一章：Skill需求矩阵与七层分类

> **研究目标**: 定义SynovaAgent完整的Skill体系 -- 33个核心Skill x 七层分类 x 三类复杂度，附实际代码引用。
> **先决阅读**: `AGENTS.md` V4.4.5（五层架构、Loop Engineering v3.1）、`docs/synova/research/管理经济学权威规范-20260715/`
> **关联文档**: 第二章（Tool基座映射）、第三章（Playbook编排引擎）、第四章（GA自有通道设计）

---

## 目录

1. [设计原则](#1-设计原则)
2. [七层分类总览](#2-七层分类总览)
3. [L1 感知层 -- 数据采集](#3-l1-感知层--数据采集)
4. [L2 分析层 -- 指标计算](#4-l2-分析层--指标计算)
5. [L3 诊断层 -- 问题定位](#5-l3-诊断层--问题定位)
6. [L4 处方层 -- 行动建议](#6-l4-处方层--行动建议)
7. [L5 反馈层 -- 执行追踪](#7-l5-反馈层--执行追踪)
8. [L6 学习层 -- 知识沉淀](#8-l6-学习层--知识沉淀)
9. [L7 自保层 -- 系统健康](#9-l7-自保层--系统健康)
10. [第九类：协同类Skill](#10-第九类协同类skill)
11. [第十类：工作台类Skill](#11-第十类工作台类skill)
12. [跨专家Skill设计](#12-跨专家skill设计)
13. [复杂度分类与分布](#13-复杂度分类与分布)
14. [反馈循环设计](#14-反馈循环设计)
15. [Playbook与Skill关系](#15-playbook与skill关系)

---

## 1. 设计原则

### 1.1 五大核心原则

| # | 原则 | 说明 | 代码体现 |
|---|------|------|----------|
| 1 | **反馈循环** | L5 -> L3（执行结果反哺诊断）、L6 -> L4（学习反哺处方）、L6 -> L1（学习反哺感知） | `src/sentinel/runner.ts` SentinelRunner 持续运行，发现 -> 诊断 -> 工单闭环 |
| 2 | **依赖方向默认向下** | 上层Skill依赖下层，不反向。L3调用L2计算，L4调用L3诊断结果 | `AGENTS.md` 铁律39：L1->L2->L3->L4->L5 五层架构边界 |
| 3 | **可追溯链路** | 每个输出追溯到输入数据源、计算模块、专家推理步骤 | `src/l4/audit-store.ts` + `src/l4/temporal-baseline.ts` 审计日志与时间基线 |
| 4 | **Playbook与Skill关系** | Playbook是Skill的编排脚本，Skill是原子能力单元 | `src/orchestrator/module-runner.ts` ModuleRunner 并行调度 compute 模块 |
| 5 | **GA自有通道** | GA (Growth Agent) 具备独立的Skill调用通道，不经过FDE/Sentinel | 预留：`src/agent/` 下 ConversationEngine 独立路由 |

### 1.2 Skill定义模板

每个Skill按以下格式定义：

```
skill_id     : S-L{N}-{NNN}      # 唯一标识
tier         : L1-L7             # 所属层级
complexity   : atomic/composite/expert  # 复杂度
description  : 一句话描述
triggers     : 触发条件列表
tools_consumed: 消费的Tool列表（工程引用）
edges_read   : 读取的本体边类型
output_schema: 输出结构
status       : 已实现 / 部分实现 / 待实现
code_ref     : 源码文件路径
```

---

## 2. 七层分类总览

```
L7 自保层 (4)    data-source-health, sentinel-config-management, agent-self-diagnosis, backup-restore
    ^
L6 学习层 (3)    industry-benchmark, expert-knowledge-distill, best-practice-match
    ^  ^
L5 反馈层 (3)    execution-progress, hypothesis-verify, plan-deviation
    ^
L4 处方层 (4)    pricing-strategy, budget-allocation, market-entry, synergy-value-assessment
    ^
L3 诊断层 (6)    cashflow-health, churn-root-cause, org-health-scan, competitive-decay,
                 profitability-root-cause, agency-cost
    ^
L2 分析层 (8)    break-even, dol, price-elasticity, hhi, switching-cost, fixed-cost-rigidity,
                 marginal-cost, concentration-gini
    ^
L1 感知层 (5)    acquire-financial-data, acquire-customer-data, acquire-competitive-intel,
                 acquire-org-health-data, acquire-operational-data
```

**统计**:

| 层级 | 名称 | Skill数 | Atomic | Composite | Expert |
|------|------|---------|---------|-----------|--------|
| L1 | 感知层 | 5 | 4 | 1 | 0 |
| L2 | 分析层 | 8 | 6 | 2 | 0 |
| L3 | 诊断层 | 6 | 2 | 3 | 1 |
| L4 | 处方层 | 4 | 0 | 2 | 2 |
| L5 | 反馈层 | 3 | 2 | 1 | 0 |
| L6 | 学习层 | 3 | 1 | 1 | 1 |
| L7 | 自保层 | 4 | 3 | 1 | 0 |
| **合计** | **七层** | **33** | **18** | **11** | **4** |

> 协同类(第九类)3个 + 工作台类(第十类)4个 + 跨专家3个 = **总计43个Skill**

---

## 3. L1 感知层 -- 数据采集

> **定位**: 从外部世界采集原始数据，是所有上层Skill的数据入口。对应 `AGENTS.md` 数据流总览中的"原始数据 -> 本体层"环节。
> **代码基础**: `src/connectors/` 连接器体系 + `src/l4/graph-bridge.ts` GraphBridge 写入本体图。

### S-L1-001: acquire-financial-data

| 字段 | 值 |
|------|-----|
| skill_id | S-L1-001 |
| tier | L1 |
| complexity | atomic |
| description | 采集企业财务数据：损益表、资产负债表、现金流量表，写入OUTCOME_FINANCIAL节点 |
| triggers | FDE Phase 1数据采集 / Sentinel定时采集 / 用户手动触发 |
| tools_consumed | `collect_cost_data`(`src/tools/finance-expert-tools.ts:13`)、`collect_revenue_data` |
| edges_read | `FINANCIAL_OUTCOME -> ORGANIZATION`, `ASSET -> ORGANIZATION` |
| output_schema | `{ financials: FinancialNode[], period: string, degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/tools/finance-expert-tools.ts` `collect_cost_data` 已实现SOG图查询 |

### S-L1-002: acquire-customer-data

| 字段 | 值 |
|------|-----|
| skill_id | S-L1-002 |
| tier | L1 |
| complexity | atomic |
| description | 采集客户数据：客户数量、MRR/ARR、流失率、CAC、LTV，写入CUSTOMER节点 |
| triggers | FDE Phase 1 / Sentinel定时 / 营销专家按需 |
| tools_consumed | MCP连接器（待实现：Stripe/Hubspot/Salesforce） |
| edges_read | `CUSTOMER -> ORGANIZATION`, `REVENUE -> CUSTOMER` |
| output_schema | `{ customers: CustomerNode[], mrr: number, churnRate: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/connectors/` 预留连接器目录 |

### S-L1-003: acquire-competitive-intel

| 字段 | 值 |
|------|-----|
| skill_id | S-L1-003 |
| tier | L1 |
| complexity | atomic |
| description | 采集竞争情报：竞品动态、市场份额变化、行业新闻，写入COMPETITOR节点 |
| triggers | Sentinel定时（周/月）/ 战略专家按需 |
| tools_consumed | 外部API + 爬虫（待实现） |
| edges_read | `COMPETITOR -> MARKET`, `COMPETITOR -> ORGANIZATION` |
| output_schema | `{ competitors: CompetitorNode[], marketShareDelta: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/connectors/` |

### S-L1-004: acquire-org-health-data

| 字段 | 值 |
|------|-----|
| skill_id | S-L1-004 |
| tier | L1 |
| complexity | atomic |
| description | 采集组织健康数据：员工数、离职率、管理层级深度、span of control |
| triggers | FDE Phase 1 / Sentinel定时 |
| tools_consumed | `collect_org_data` (待实现) / MCP连接器（HR系统） |
| edges_read | `TEAM -> ORGANIZATION`, `PERSON -> TEAM` |
| output_schema | `{ teams: TeamNode[], headcount: number, attritionRate: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/tools/org-expert-tools.ts` |

### S-L1-005: acquire-operational-data

| 字段 | 值 |
|------|-----|
| skill_id | S-L1-005 |
| tier | L1 |
| complexity | composite |
| description | 采集运营数据：库存周转、交付周期、产能利用率、质量缺陷率 |
| triggers | FDE Phase 1 / Sentinel定时 / 运营诊断按需 |
| tools_consumed | `collect_operational_data`（待实现，聚合多种数据源） |
| edges_read | `PROCESS -> ORGANIZATION`, `RESOURCE -> PROCESS` |
| output_schema | `{ operations: OpsNode[], metrics: OpsMetrics, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/connectors/` 预留 |

---

## 4. L2 分析层 -- 指标计算

> **定位**: 对L1采集的原始数据进行结构化计算，输出可量化指标。对应 `packages/engine-core/src/pipeline/diagnosis/` 下的 compute 模块。
> **代码基础**: `src/orchestrator/module-runner.ts` ModuleRunner 并行调度29个computeModule；管理经济学42概念参见 `docs/synova/research/管理经济学权威规范-20260715/`。

### S-L2-001: break-even

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-001 |
| tier | L2 |
| complexity | atomic |
| description | 计算盈亏平衡点：BEQ = FC / (P - VC)，输出盈亏平衡销量与安全边际 |
| triggers | FDE Phase 2 财务分析 / 财务专家按需 |
| tools_consumed | `collect_cost_data`(L1) |
| edges_read | `FINANCIAL_OUTCOME {revenue, fixedCost, variableCost, price}` |
| output_schema | `{ beq: number, safetyMargin: number, degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `packages/engine-core/src/pipeline/diagnosis/` computeModule体系 |

### S-L2-002: dol

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-002 |
| tier | L2 |
| complexity | atomic |
| description | 计算经营杠杆系数：DOL = (Revenue - VC) / (Revenue - VC - FC)，衡量利润对销量敏感度 |
| triggers | FDE Phase 2 / 财务专家按需 |
| tools_consumed | `collect_cost_data`(L1) |
| edges_read | `FINANCIAL_OUTCOME {revenue, variableCost, fixedCost}` |
| output_schema | `{ dol: number, interpretation: "high"|"moderate"|"low", degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | 管理经济学规范 S二 compute契约 |

### S-L2-003: price-elasticity

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-003 |
| tier | L2 |
| complexity | atomic |
| description | 计算价格弹性：Ed = (%delta Q) / (%delta P)，判断产品价格敏感度 |
| triggers | FDE Phase 2 / 营销专家 / 战略专家按需 |
| tools_consumed | `acquire-customer-data`(L1) |
| edges_read | `CUSTOMER {quantitySold, price}` 历史时间序列 |
| output_schema | `{ elasticity: number, type: "elastic"|"inelastic"|"unit", degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | 管理经济学规范 S二 |

### S-L2-004: hhi

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-004 |
| tier | L2 |
| complexity | atomic |
| description | 计算赫芬达尔指数：HHI = SUM(s_i^2 x 10000)，衡量市场集中度（反垄断判断依据） |
| triggers | FDE Phase 2 / 战略专家按需 |
| tools_consumed | `acquire-competitive-intel`(L1) |
| edges_read | `COMPETITOR {marketShare}` |
| output_schema | `{ hhi: number, concentration: "low"|"moderate"|"high", degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | 管理经济学规范 S二 |

### S-L2-005: switching-cost

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-005 |
| tier | L2 |
| complexity | composite |
| description | 评估客户转换成本：财务成本+流程成本+关系成本+风险成本，四维度加权 |
| triggers | FDE Phase 2 / 战略专家（Seven Powers分析） |
| tools_consumed | `acquire-customer-data`(L1) |
| edges_read | `CUSTOMER {contractTerms, integrationDepth, trainingInvestment}` |
| output_schema | `{ switchingCostIndex: number, breakdown: {...}, degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `packages/engine-core/src/pipeline/diagnosis/seven-powers.ts` Seven Powers框架 |

### S-L2-006: fixed-cost-rigidity

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-006 |
| tier | L2 |
| complexity | atomic |
| description | 计算固定成本刚性：FC / TotalCost，判断企业成本结构灵活性 |
| triggers | FDE Phase 2 / 财务专家按需 |
| tools_consumed | `collect_cost_data`(L1) |
| edges_read | `FINANCIAL_OUTCOME {fixedCost, totalCost}` |
| output_schema | `{ rigidity: number, riskLevel: "low"|"medium"|"high", degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | 管理经济学规范 S二 |

### S-L2-007: marginal-cost

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-007 |
| tier | L2 |
| complexity | atomic |
| description | 计算边际成本曲线：MC = delta(TC) / delta(Q)，识别规模经济/不经济拐点 |
| triggers | FDE Phase 2 / 财务专家按需 |
| tools_consumed | `collect_cost_data`(L1) |
| edges_read | `FINANCIAL_OUTCOME {totalCost, quantityProduced}` 时间序列 |
| output_schema | `{ marginalCostCurve: number[], inflectionPoint: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | 管理经济学规范 S二 |

### S-L2-008: concentration-gini

| 字段 | 值 |
|------|-----|
| skill_id | S-L2-008 |
| tier | L2 |
| complexity | atomic |
| description | 计算收入集中度基尼系数，判断客户/产品线集中风险 |
| triggers | FDE Phase 2 / 财务专家按需 |
| tools_consumed | `acquire-customer-data`(L1) + `collect_cost_data`(L1) |
| edges_read | `CUSTOMER {revenue}` / `PRODUCT_LINE {revenue}` |
| output_schema | `{ gini: number, concentrationRisk: "low"|"medium"|"high", degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | 管理经济学规范 S二 |

---

## 5. L3 诊断层 -- 问题定位

> **定位**: 消费L2分析结果+证据池，由专家Agent进行因果推理，输出诊断发现。对应 `AGENTS.md` 中的"8位专家 -> ReAct推理 + 交叉验证"。
> **代码基础**: `src/l3/expert-autonomy.ts` ExpertAutonomy 自治推理；`src/l3/expert-dispatcher.ts` ExpertDispatcher 路由；`src/sentinel/signal-aggregator.ts` 信号聚合。

### S-L3-001: cashflow-health

| 字段 | 值 |
|------|-----|
| skill_id | S-L3-001 |
| tier | L3 |
| complexity | composite |
| description | 现金流健康诊断：分析OCF/ICF/FCF三流，判断是否存在流动性危机、投资不足或过度依赖融资 |
| triggers | FDE Phase 3 / Sentinel 现金流哨兵 |
| tools_consumed | `break-even`(L2), `dol`(L2), `fixed-cost-rigidity`(L2), `acquire-financial-data`(L1) |
| edges_read | `ORGANIZATION -> FINANCIAL_OUTCOME` |
| output_schema | `{ healthScore: number, riskFactors: string[], recommendations: string[], degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/sentinel/cash-flow-sentinel.ts` CashFlowSentinel 已实现定时检测 |

### S-L3-002: churn-root-cause

| 字段 | 值 |
|------|-----|
| skill_id | S-L3-002 |
| tier | L3 |
| complexity | composite |
| description | 流失根因分析：交叉分析客户流失数据与产品使用/服务工单/NPS，定位流失主因 |
| triggers | FDE Phase 3 / Sentinel / 营销专家按需 |
| tools_consumed | `acquire-customer-data`(L1), `switching-cost`(L2), `price-elasticity`(L2) |
| edges_read | `CUSTOMER -> ORGANIZATION`, `CUSTOMER -> SERVICE_TICKET` |
| output_schema | `{ churnRate: number, rootCauses: CauseNode[], confidence: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/sentinel/` 预留哨兵适配器 |

### S-L3-003: org-health-scan

| 字段 | 值 |
|------|-----|
| skill_id | S-L3-003 |
| tier | L3 |
| complexity | composite |
| description | 组织健康扫描：分析span of control、离职率、关键人风险、团队规模分布，输出组织诊断报告 |
| triggers | FDE Phase 3 / Sentinel / 组织专家按需 |
| tools_consumed | `acquire-org-health-data`(L1) |
| edges_read | `PERSON -> TEAM`, `TEAM -> ORGANIZATION` |
| output_schema | `{ healthIndex: number, riskAreas: string[], keyPersonRisks: string[], degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/l3/key-person-risk.ts` 关键人风险分析已实现 |

### S-L3-004: competitive-decay

| 字段 | 值 |
|------|-----|
| skill_id | S-L3-004 |
| tier | L3 |
| complexity | expert |
| description | 竞争优势衰减诊断：Seven Powers框架下逐项评估每项护城河的衰退程度 |
| triggers | FDE Phase 3 / 战略专家按需 |
| tools_consumed | `acquire-competitive-intel`(L1), `hhi`(L2), `switching-cost`(L2) |
| edges_read | `COMPETITOR -> ORGANIZATION`, `ORGANIZATION -> COMPETITIVE_ADVANTAGE` |
| output_schema | `{ decayScore: number, powerAnalysis: PowerAssessment[], urgency: "low"|"medium"|"high", degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `packages/engine-core/src/pipeline/diagnosis/seven-powers.ts` Seven Powers框架完整实现 |

### S-L3-005: profitability-root-cause

| 字段 | 值 |
|------|-----|
| skill_id | S-L3-005 |
| tier | L3 |
| complexity | expert |
| description | 盈利能力根因诊断：杜邦分析拆解ROE，定位利润率/周转率/杠杆哪个环节出问题 |
| triggers | FDE Phase 3 / 财务专家按需 |
| tools_consumed | `break-even`(L2), `dol`(L2), `marginal-cost`(L2), `acquire-financial-data`(L1) |
| edges_read | `ORGANIZATION -> FINANCIAL_OUTCOME` |
| output_schema | `{ roe: number, dupontBreakdown: {...}, rootCauseChain: string[], degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `packages/engine-core/src/pipeline/diagnosis/` computeModule体系 |

### S-L3-006: agency-cost

| 字段 | 值 |
|------|-----|
| skill_id | S-L3-006 |
| tier | L3 |
| complexity | composite |
| description | 代理成本分析：评估所有权与经营权分离程度、激励机制有效性、监督成本，判断是否存在代理问题 |
| triggers | FDE Phase 3 / 组织专家按需 |
| tools_consumed | `acquire-org-health-data`(L1), `acquire-financial-data`(L1) |
| edges_read | `PERSON -> ORGANIZATION` (ownership), `PERSON -> TEAM` (management depth) |
| output_schema | `{ agencyCostIndex: number, riskFactors: string[], governanceGaps: string[], degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | 管理经济学规范 S四 信息差审计矩阵 |

---

## 6. L4 处方层 -- 行动建议

> **定位**: 基于L3诊断结果，生成具体的、可执行的行动建议。需要专家推理 + 约束优化。对应 `AGENTS.md` 中的"综合诊断报告 -> 行动建议"。
> **代码基础**: `src/l3/expert-autonomy.ts` ExpertAutonomy ReAct推理；`src/tools/action-expert-tools.ts` 行动专家工具链。

### S-L4-001: pricing-strategy

| 字段 | 值 |
|------|-----|
| skill_id | S-L4-001 |
| tier | L4 |
| complexity | expert |
| description | 定价策略处方：综合成本结构+价格弹性+竞争格局+转换成本，推荐定价区间与策略 |
| triggers | FDE Phase 5 / 财务+战略专家协同 |
| tools_consumed | `break-even`(L2), `price-elasticity`(L2), `switching-cost`(L2), `hhi`(L2), `competitive-decay`(L3) |
| edges_read | 跨多个L2/L3输出 |
| output_schema | `{ recommendedPriceRange: [number,number], strategy: string, expectedImpact: {...}, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | 战略+财务专家协同，`src/tools/strategy-expert-tools.ts` |

### S-L4-002: budget-allocation

| 字段 | 值 |
|------|-----|
| skill_id | S-L4-002 |
| tier | L4 |
| complexity | expert |
| description | 预算分配优化：基于ROI预测+战略优先级+风险约束，输出最优预算分配方案 |
| triggers | FDE Phase 5 / 财务+战略专家协同 |
| tools_consumed | `dol`(L2), `profitability-root-cause`(L3), `cashflow-health`(L3) |
| edges_read | `ORGANIZATION -> FINANCIAL_OUTCOME`, `ORGANIZATION -> INITIATIVE` |
| output_schema | `{ allocations: AllocationItem[], totalBudget: number, expectedROI: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/tools/finance-expert-tools.ts` + 战略专家协同 |

### S-L4-003: market-entry

| 字段 | 值 |
|------|-----|
| skill_id | S-L4-003 |
| tier | L4 |
| complexity | composite |
| description | 市场进入策略：评估新市场吸引力、进入壁垒、资源匹配度、风险，推荐进入方式 |
| triggers | FDE Phase 5 / 战略专家按需 |
| tools_consumed | `hhi`(L2), `switching-cost`(L2), `competitive-decay`(L3) |
| edges_read | `MARKET -> COMPETITOR`, `ORGANIZATION -> CAPABILITY` |
| output_schema | `{ marketAttractiveness: number, entryMode: string, risks: string[], degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/tools/strategy-expert-tools.ts` |

### S-L4-004: synergy-value-assessment

| 字段 | 值 |
|------|-----|
| skill_id | S-L4-004 |
| tier | L4 |
| complexity | composite |
| description | 协同价值评估：量化M&A或业务整合的协同效应（收入协同+成本协同+能力协同） |
| triggers | FDE Phase 5 / 战略+财务专家协同 |
| tools_consumed | `acquire-financial-data`(L1), `dol`(L2), `concentration-gini`(L2) |
| edges_read | `ORGANIZATION -> ORGANIZATION` (M&A edge), `CAPABILITY -> ORGANIZATION` |
| output_schema | `{ synergyValue: number, breakdown: {...}, confidenceInterval: [number,number], degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | 战略+财务专家协同 |

---

## 7. L5 反馈层 -- 执行追踪

> **定位**: 追踪L4处方执行效果，将实际结果反馈给L3诊断层，形成闭环。对应 `AGENTS.md` 中的"跟踪执行"。
> **代码基础**: `src/expert-platform/outcome-tracker.ts` 结果追踪；`src/sentinel/runner.ts` SentinelRunner持续运行。

### S-L5-001: execution-progress

| 字段 | 值 |
|------|-----|
| skill_id | S-L5-001 |
| tier | L5 |
| complexity | atomic |
| description | 执行进度追踪：对比计划vs实际，计算完成率、里程碑达成状态 |
| triggers | Sentinel定时（日/周）/ FDE Phase 6 |
| tools_consumed | L4输出 `actionPlan` |
| edges_read | `INITIATIVE -> ORGANIZATION`, `MILESTONE -> INITIATIVE` |
| output_schema | `{ progressPercent: number, onTrack: boolean, delayedItems: string[], degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/expert-platform/outcome-tracker.ts` |

### S-L5-002: hypothesis-verify

| 字段 | 值 |
|------|-----|
| skill_id | S-L5-002 |
| tier | L5 |
| complexity | composite |
| description | 假设验证：对比处方执行后的实际数据与预测值，判断诊断假设是否成立 |
| triggers | 执行周期结束后 / 关键数据变更后 |
| tools_consumed | L4预测值 + L1新采集实际值 |
| edges_read | `ORGANIZATION -> FINANCIAL_OUTCOME` (前后对比) |
| output_schema | `{ hypothesisId: string, verified: boolean, actualVsPredicted: {...}, learningPoints: string[], degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/l3/assumption-monitor.ts` 假设监控器已部分实现 |

### S-L5-003: plan-deviation

| 字段 | 值 |
|------|-----|
| skill_id | S-L5-003 |
| tier | L5 |
| complexity | atomic |
| description | 计划偏差检测：识别执行偏差超过阈值，触发告警+重新诊断 |
| triggers | Sentinel持续监控 |
| tools_consumed | `execution-progress`(L5), L1实时数据 |
| edges_read | `MILESTONE -> INITIATIVE` |
| output_schema | `{ deviationSeverity: number, deviatedItems: string[], triggerRediagnosis: boolean, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/sentinel/runner.ts` SentinelRunner框架已就绪 |

---

## 8. L6 学习层 -- 知识沉淀

> **定位**: 从历史诊断、执行反馈中提取可复用知识，反哺L1感知和L4处方。对应 `AGENTS.md` 中的"持续观测，主动发现"。
> **代码基础**: `src/l3/knowledge-agent.ts` KnowledgeAgent 知识管理；`src/l4/knowledge-store.ts` 知识存储。

### S-L6-001: industry-benchmark

| 字段 | 值 |
|------|-----|
| skill_id | S-L6-001 |
| tier | L6 |
| complexity | atomic |
| description | 行业对标：采集行业公开数据，与当前企业指标对比，输出相对位置 |
| triggers | 周期性（季度）/ 企业数据更新后 |
| tools_consumed | L1采集历史 + 外部行业数据库 |
| edges_read | `ORGANIZATION -> INDUSTRY` |
| output_schema | `{ benchmarks: BenchmarkItem[], percentileRank: number, gaps: string[], degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/l4/industry-loader.ts` 行业数据加载器 |

### S-L6-002: expert-knowledge-distill

| 字段 | 值 |
|------|-----|
| skill_id | S-L6-002 |
| tier | L6 |
| complexity | expert |
| description | 专家知识蒸馏：从L5验证结果中提取成功/失败模式，更新专家知识库 |
| triggers | 假设验证完成后 / 批量周期 |
| tools_consumed | `hypothesis-verify`(L5) 结果 |
| edges_read | 跨所有层级的历史数据 |
| output_schema | `{ newRules: Rule[], updatedPatterns: Pattern[], confidenceGain: number, degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/l3/knowledge-agent.ts` KnowledgeAgent知识管理框架 |

### S-L6-003: best-practice-match

| 字段 | 值 |
|------|-----|
| skill_id | S-L6-003 |
| tier | L6 |
| complexity | composite |
| description | 最佳实践匹配：基于企业画像（规模/行业/阶段），匹配最相关的历史成功案例 |
| triggers | L4处方生成前 / FDE Phase 4 |
| tools_consumed | L3诊断结果 + 知识库 |
| edges_read | `ORGANIZATION -> INDUSTRY`, `ORGANIZATION -> STAGE` |
| output_schema | `{ matchedPractices: Practice[], relevanceScore: number, adaptationNotes: string[], degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/l4/knowledge-store.ts` 知识检索接口 |

---

## 9. L7 自保层 -- 系统健康

> **定位**: 确保Agent自身健康运行，与业务逻辑完全解耦。对应 `AGENTS.md` 中的"Agent，不是ChatBot"自运维要求。
> **代码基础**: `src/sentinel/integration-health-sentinel.ts` 集成健康哨兵；`src/monitoring/` 监控体系。

### S-L7-001: data-source-health

| 字段 | 值 |
|------|-----|
| skill_id | S-L7-001 |
| tier | L7 |
| complexity | atomic |
| description | 数据源健康检查：检测各连接器可用性、数据新鲜度、数据质量指标 |
| triggers | 定时（每5分钟） |
| tools_consumed | 各L1连接器 |
| edges_read | N/A（不读本体，直接ping数据源） |
| output_schema | `{ sources: SourceHealth[], overallStatus: "healthy"|"degraded"|"down", degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/sentinel/integration-health-sentinel.ts` 集成健康哨兵 |

### S-L7-002: sentinel-config-management

| 字段 | 值 |
|------|-----|
| skill_id | S-L7-002 |
| tier | L7 |
| complexity | atomic |
| description | 哨兵配置管理：动态调整哨兵阈值、频率、优先级，无需重启 |
| triggers | 用户指令 / 自动优化建议 |
| tools_consumed | `src/sentinel/registry.ts` SentinelRegistry |
| edges_read | N/A |
| output_schema | `{ configs: SentinelConfig[], changesApplied: number, validationErrors: string[], degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/sentinel/registry.ts` SentinelRegistry 管理哨兵生命周期 |

### S-L7-003: agent-self-diagnosis

| 字段 | 值 |
|------|-----|
| skill_id | S-L7-003 |
| tier | L7 |
| complexity | composite |
| description | Agent自诊断：检测LLM可用性、GraphStore连通性、内存/存储使用率、token消耗异常 |
| triggers | 定时（每15分钟）/ 启动时 / 异常告警后 |
| tools_consumed | 内部健康API + `src/monitoring/` |
| edges_read | N/A（纯系统层面） |
| output_schema | `{ components: ComponentHealth[], overallScore: number, alerts: Alert[], degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/sentinel/integration-health-sentinel.ts` + `src/monitoring/` |

### S-L7-004: backup-restore

| 字段 | 值 |
|------|-----|
| skill_id | S-L7-004 |
| tier | L7 |
| complexity | atomic |
| description | 备份恢复：自动备份GraphStore/知识库/配置，支持时间点恢复 |
| triggers | 定时（每日）/ 手动触发 |
| tools_consumed | `src/l5/` 存储层API |
| edges_read | N/A |
| output_schema | `{ backupId: string, timestamp: string, sizeBytes: number, verified: boolean, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/store/` SQLite 持久化层 |

---

## 10. 第九类：协同类Skill

> **定位**: 不属于七层分类，而是横向跨越多个专家/模块的协作Skill。解决多专家协同推理、冲突消解、综合合成等跨领域问题。
> **代码基础**: `src/l3/quality-firewall.ts` 质量防火墙（交叉验证）；`src/l3/expert-dispatcher.ts` 多专家调度。

### S-X-001: cross-expert-review

| 字段 | 值 |
|------|-----|
| skill_id | S-X-001 |
| tier | 第九类（协同） |
| complexity | composite |
| description | 跨专家评审：将单一专家的诊断结论提交给其他2位专家交叉验证，发现盲点与矛盾 |
| triggers | L3诊断完成后自动触发 / 诊断结论置信度低于阈值 |
| tools_consumed | 所有L3诊断Skill输出 |
| edges_read | 跨专家输出结构 |
| output_schema | `{ originalFinding: Finding, reviewResults: Review[], consensusScore: number, conflicts: Conflict[], degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/l3/quality-firewall.ts` QualityFirewall 交叉验证逻辑 |

### S-X-002: conflict-resolution

| 字段 | 值 |
|------|-----|
| skill_id | S-X-002 |
| tier | 第九类（协同） |
| complexity | expert |
| description | 冲突消解：当多位专家对同一问题给出矛盾诊断时，通过证据权重+推理链审计+元推理解决冲突 |
| triggers | `cross-expert-review` 发现 conflict 后自动触发 |
| tools_consumed | `cross-expert-review` 输出 |
| edges_read | 争议涉及的原始证据链 |
| output_schema | `{ resolved: boolean, winner: ExpertType, reasoning: string, escalated: boolean, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/l3/quality-firewall.ts` 预留冲突消解逻辑 |

### S-X-003: synthesizer-invoke

| 字段 | 值 |
|------|-----|
| skill_id | S-X-003 |
| tier | 第九类（协同） |
| complexity | composite |
| description | 综合合成：将多位专家的诊断结果合并为一份统一的综合诊断报告 |
| triggers | FDE Phase 4 综合报告生成 |
| tools_consumed | 所有L3诊断Skill输出 + `cross-expert-review` 评审结果 |
| edges_read | 跨所有诊断路径 |
| output_schema | `{ report: SynthesisReport, sectionAuthors: {...}, conflictsResolved: number, degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `packages/engine-core/src/pipeline/diagnosis/synthesizer.ts` Synthesizer模块 |

---

## 11. 第十类：工作台类Skill

> **定位**: 面向Agent自身的运维、校准、知识管理等"后台"工作。与L7自保层不同，工作台类更偏"管理操作"而非"自主保护"。
> **代码基础**: `src/skill/skill-registry.ts` SkillRegistry；`src/skill/skill-loader.ts` SkillLoader。

### S-W-001: agent-self-health

| 字段 | 值 |
|------|-----|
| skill_id | S-W-001 |
| tier | 第十类（工作台） |
| complexity | atomic |
| description | Agent自健康：综合L7各检查结果，生成Agent整体健康仪表盘 |
| triggers | 手动触发 / 启动后自动 |
| tools_consumed | `data-source-health`(L7), `agent-self-diagnosis`(L7), `backup-restore`(L7) |
| edges_read | N/A |
| output_schema | `{ dashboard: HealthDashboard, uptime: number, tokenUsedToday: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/sentinel/integration-health-sentinel.ts` 集成健康哨兵 |

### S-W-002: knowledge-base-maintenance

| 字段 | 值 |
|------|-----|
| skill_id | S-W-002 |
| tier | 第十类（工作台） |
| complexity | composite |
| description | 知识库维护：清理过期知识、合并重复模式、重新索引、优化检索性能 |
| triggers | 定时（每周）/ 知识量超过阈值 |
| tools_consumed | `expert-knowledge-distill`(L6) |
| edges_read | `src/l4/knowledge-store.ts` |
| output_schema | `{ cleanedCount: number, mergedCount: number, indexRebuilt: boolean, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/l4/knowledge-store.ts` + `src/l3/knowledge-agent.ts` |

### S-W-003: diagnosis-calibration

| 字段 | 值 |
|------|-----|
| skill_id | S-W-003 |
| tier | 第十类（工作台） |
| complexity | expert |
| description | 诊断校准：对比历史诊断与实际结果，校准专家置信度、阈值参数、权重分配 |
| triggers | 定期（每月）/ 诊断准确率低于阈值 |
| tools_consumed | `hypothesis-verify`(L5) 历史结果 |
| edges_read | 跨所有诊断历史 |
| output_schema | `{ calibratedExperts: ExpertType[], thresholdChanges: ThresholdDelta[], accuracyGain: number, degraded: boolean }` |
| status | ➕ 待实现 |
| code_ref | `src/l3/quality-firewall.ts` + `src/expert-platform/outcome-tracker.ts` |

### S-W-004: playbook-lifecycle-management

| 字段 | 值 |
|------|-----|
| skill_id | S-W-004 |
| tier | 第十类（工作台） |
| complexity | composite |
| description | Playbook生命周期管理：创建/更新/禁用/版本管理Playbook编排脚本 |
| triggers | 用户指令 / 新Skill上线后自动建议 |
| tools_consumed | `src/playbook/` 模块 |
| edges_read | N/A |
| output_schema | `{ playbooks: PlaybookDef[], versionHistory: VersionRecord[], conflicts: string[], degraded: boolean }` |
| status | 🔧 部分实现 |
| code_ref | `src/playbook/index.ts` Playbook定义入口 |

---

## 12. 跨专家Skill设计

> **设计原则**: 某些Skill需要多位专家协同执行，每步由不同专家负责。使用 `expert: "multi"` 标记，`step_experts` 字段标注每步执行者。

### 跨专家Skill清单

| Skill | 涉及专家 | step_experts | 设计理由 |
|-------|---------|-------------|---------|
| `pricing-strategy` | strategy + finance | Step1: finance(cost analysis) -> Step2: strategy(market positioning) -> Step3: finance(price modeling) | 定价同时需要成本数据（财务）和市场判断（战略） |
| `budget-allocation` | finance + strategy + action | Step1: finance(ROI calc) -> Step2: strategy(priority ranking) -> Step3: action(feasibility check) | 预算分配涉及财务可行性、战略优先级、执行可行性三角 |
| `synergy-value-assessment` | strategy + finance | Step1: strategy(synergy identification) -> Step2: finance(quantitative valuation) | 协同识别是战略判断，量化是财务建模 |

### 跨专家Skill模板

```
skill_id     : S-L4-001
expert       : "multi"
step_experts : [
  { step: 1, expert: "finance", task: "compute cost structure baseline" },
  { step: 2, expert: "strategy", task: "analyze competitive pricing landscape" },
  { step: 3, expert: "finance", task: "model optimal price range" }
]
```

> **代码状态**: `src/l3/expert-dispatcher.ts` ExpertDispatcher 已支持多专家路由；`step_experts` 字段待加入Skill manifest schema。

---

## 13. 复杂度分类与分布

### 13.1 三类复杂度定义

| 复杂度 | 定义 | Token预算 | 推理深度 | 示例 |
|--------|------|-----------|---------|------|
| **atomic** | 单一计算/查询，无多步推理。确定性输入->输出。 | <2K tokens | 0层（纯计算） | `break-even`, `hhi` |
| **composite** | 多步组合：2-5个atomic串联+条件分支。需协调多个Tool。 | 5-15K tokens | 1-2层推理 | `cashflow-health`, `switching-cost` |
| **expert** | 需要专家Agent完整ReAct循环：观察->假设->验证->结论。 | 20-50K tokens | 3+层推理 | `competitive-decay`, `pricing-strategy` |

### 13.2 分布统计

| 复杂度 | 数量 | 占比 | 主要分布 |
|--------|------|------|---------|
| atomic | 18 | ~42% | L1(4) + L2(6) + L5(2) + L7(3) + L6(1) + L3(2) |
| composite | 11 | ~26% | L3(3) + L4(2) + L2(2) + L5(1) + L6(1) + L1(1) + L7(1) |
| expert | 4 | ~9% | L3(1) + L4(2) + L6(1) |
| 协同/工作台 | 10 | ~23% | 第九类(3) + 第十类(4) + 跨专家(3) |

> 注：协同类和工作台类的复杂度标记：cross-expert-review(composite), conflict-resolution(expert), synthesizer-invoke(composite); agent-self-health(atomic), knowledge-base-maintenance(composite), diagnosis-calibration(expert), playbook-lifecycle-management(composite).

### 13.3 设计启示

1. **Atomic为主力**（42%）：核心计算单元追求确定性，可独立测试、可缓存。
2. **Composite承上启下**（26%）：编排atomic Skill，形成有意义的诊断链路。
3. **Expert稀缺而高价值**（9%）：每个expert Skill消耗大但产出独特，仅在关键决策点触发。
4. **协同/工作台类不可忽视**（23%）：多专家系统的元能力，决定系统天花板。

---

## 14. 反馈循环设计

> 五大设计原则之首。Skill体系中的三个反馈循环：

### 14.1 L5 -> L3：执行反哺诊断

```
L4处方执行 -> L5追踪(execution-progress, plan-deviation)
    -> 结果偏离预期 -> 触发 L3重新诊断(cashflow-health/churn-root-cause/...)
    -> 修正诊断 -> 更新 L4处方
```

**代码体现**: `src/sentinel/runner.ts` SentinelRunner 持续运行，`plan-deviation`(L5) 检测到偏差 -> 触发 `runModules()` 重新诊断 -> 更新 `SentinelFinding[]`。

### 14.2 L6 -> L4：学习反哺处方

```
L5假设验证 -> L6知识蒸馏(expert-knowledge-distill)
    -> 提取成功/失败模式 -> 更新专家知识库
    -> L4处方生成时引用(best-practice-match)
```

**代码体现**: `src/l3/knowledge-agent.ts` KnowledgeAgent 接收 `hypothesis-verify`(L5) 结果，更新 `knowledge-store`(L4)，`best-practice-match`(L6) 在 L4 处方生成前查询。

### 14.3 L6 -> L1：学习反哺感知

```
L6行业对标 -> 发现数据缺口 -> 建议新增 L1数据源
    -> 调整 Sentinel 监控频率/阈值
```

**代码体现**: `industry-benchmark`(L6) 发现某指标缺失 -> 自动建议配置 `sentinel-config-management`(L7) -> 调整 L1 采集策略。

### 14.4 反馈循环的防振荡机制

- **冷却期**: 同一诊断在24小时内不被同一反馈触发两次。
- **置信度衰减**: 每次反馈循环后，修正建议的置信度乘以衰减因子(默认0.85)。
- **人工闸门**: 连续3次反馈循环后，标记为 `escalated`，等待人工介入。

---

## 15. Playbook与Skill关系

> 设计原则之四。

### 15.1 概念区分

| 概念 | 定义 | 类比 |
|------|------|------|
| **Skill** | 原子能力单元，有明确的输入/输出/降级契约 | 函数 |
| **Tool** | Skill底层依赖的工程实现（API调用、数据库查询、LLM推理） | 标准库 |
| **Playbook** | Skill的编排脚本，定义"何时、以何种顺序、在什么条件下调用哪些Skill" | 工作流/剧本 |

### 15.2 Playbook示例：FDE完整诊断

```yaml
playbook: fde-full-diagnosis
trigger: POST /api/diagnosis/start
steps:
  - phase: 1
    skills: [S-L1-001, S-L1-002, S-L1-004]  # 并行采集
  - phase: 2
    skills: [S-L2-001..S-L2-008]             # 并行计算
    depends_on: phase-1
  - phase: 3
    skills: [S-L3-001..S-L3-006]             # 串行诊断（专家瓶颈）
    depends_on: phase-2
  - phase: 4
    skills: [S-X-001, S-X-003]               # 交叉验证+综合
    depends_on: phase-3
  - phase: 5
    skills: [S-L4-001..S-L4-004]             # 处方生成
    depends_on: phase-4
```

### 15.3 Playbook引擎代码映射

| Playbook组件 | 代码位置 | 状态 |
|-------------|---------|------|
| 编排引擎 | `src/orchestrator/` (ModuleRunner, DiagnosisOrchestrator, PhaseStateMachine) | ✅ 已实现 |
| Playbook定义 | `src/playbook/index.ts` | 🔧 部分实现 |
| 阶段门禁 | `src/orchestrator/phase-gate-check.ts` | 🔧 部分实现 |
| 事件总线 | `src/orchestrator/event-bus.ts` | 🔧 部分实现 |

### 15.4 Playbook与Skill的解耦

- **Skill不感知Playbook**：Skill只关心输入->输出，不关心谁调用、何时调用。
- **Playbook不依赖Skill实现**：Playbook通过 `skill_id` 引用，运行时由 `SkillRegistry`(`src/skill/skill-registry.ts`) 解析。
- **降级传播独立**：每个Skill独立返回 `degraded: boolean`，Playbook根据降级策略决定是否继续。

---

## 附录A：代码引用索引

| Skill ID | 主要代码文件 | 关键符号 |
|----------|------------|---------|
| S-L1-001 | `src/tools/finance-expert-tools.ts` | `collect_cost_data` |
| S-L2-001..008 | `packages/engine-core/src/pipeline/diagnosis/` | computeModule |
| S-L2-005 | `packages/engine-core/src/pipeline/diagnosis/seven-powers.ts` | Seven Powers |
| S-L3-001 | `src/sentinel/cash-flow-sentinel.ts` | CashFlowSentinel |
| S-L3-003 | `src/l3/key-person-risk.ts` | KeyPersonRisk |
| S-L3-004 | `packages/engine-core/src/pipeline/diagnosis/seven-powers.ts` | Seven Powers |
| S-L5-002 | `src/l3/assumption-monitor.ts` | AssumptionMonitor |
| S-L6-002 | `src/l3/knowledge-agent.ts` | KnowledgeAgent |
| S-L6-001 | `src/l4/industry-loader.ts` | IndustryLoader |
| S-L6-003 | `src/l4/knowledge-store.ts` | KnowledgeStore |
| S-L7-001 | `src/sentinel/integration-health-sentinel.ts` | IntegrationHealthSentinel |
| S-L7-002 | `src/sentinel/registry.ts` | SentinelRegistry |
| S-L7-004 | `src/store/` | SQLite持久化层 |
| S-X-001 | `src/l3/quality-firewall.ts` | QualityFirewall |
| S-X-003 | `packages/engine-core/src/pipeline/diagnosis/synthesizer.ts` | Synthesizer |
| 编排 | `src/orchestrator/module-runner.ts` | ModuleRunner |
| 调度 | `src/l3/expert-dispatcher.ts` | ExpertDispatcher |
| 注册 | `src/skill/skill-registry.ts` | SkillRegistry |
| 本体 | `src/l4/graph-bridge.ts` | GraphBridge |
| 实体 | `src/l4/entity-resolver.ts` | EntityResolver |
| 审计 | `src/l4/audit-store.ts` | AuditStore |
| Playbook | `src/playbook/index.ts` | Playbook定义 |

---

## 附录B：状态统计

| 状态 | 数量 | 占比 | 说明 |
|------|------|------|------|
| 🔧 部分实现 | 15 | 35% | L2分析层多数有computeModule基础，L3/L7有哨兵框架 |
| ➕ 待实现 | 22 | 51% | L1感知层连接器、L4处方层、L5反馈层、L6学习层多数待建设 |
| ✅ 已实现 | 0 | 0% | 无Skill被标记为完整实现——全部处于建设期 |
| **总计** | **43** | **100%** | 七层33 + 协同3 + 工作台4 + 跨专家3 |

> **读表**: 目前系统的"骨架"已搭建（编排器、哨兵框架、专家引擎），但Skill体系中的"血肉"（具体的数据采集、分析计算、诊断推理的完整链路）尚在建设中。L2分析层进度最好（管理经济学42概念已有compute契约规范），L4处方层是最薄弱的环节。

---

## 附录C：与AGENTS.md铁律对照

| 铁律 | 本设计对应章节 | 符合性 |
|------|-------------|--------|
| 铁律39 五层架构边界 | §1.1 原则2、全篇分层设计 | ✅ 七层分类严格遵循L1->L7依赖方向 |
| 铁律47 契约优先 | §1.2 Skill模板 每Skill定义input/output/degraded | ✅ 所有Skill包含output_schema + degraded标记 |
| 铁律24 异常处理审计 | §13.1 composite/expert Skill必须返回degraded | ✅ 强制degraded传播 |
| 铁律31 降级信号传播 | §15.4 Playbook与Skill解耦 | ✅ 独立degraded返回 |
| 铁律35 自动化优先 | §14.4 反馈循环防振荡机制 | ✅ 自动冷却+衰减+升级 |
| 铁律1 垂直切片交付 | §15.2 Playbook示例 完整链路 | ✅ 入口->推理->结果可见 |

---

> **下一章预告**: 第二章《Tool基座映射》——将本章33个Skill映射到具体Tool实现（`src/tools/`下10个专家工具链 + MCP协议 + `packages/engine-core/` 543文件），定义Tool接口标准与原子性验证规则。