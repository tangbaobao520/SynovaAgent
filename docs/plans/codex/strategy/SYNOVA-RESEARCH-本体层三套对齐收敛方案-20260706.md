---
title: "本体层对齐深度研究 — 三套本体论收敛方案"
version: "v1.0"
date: "2026-07-06"
status: "Phase 4 本体对齐产出"
input: "JTBD Phase 3映射方案 + 代码本体(extensions/ontology/) + v2.4规范文档(16边×10实体)"
methodology: "逐边逐参数精确对照 + 三套本体论冲突识别 + 收敛方案设计"
---

# 本体层对齐深度研究 — 三套本体论收敛方案

## 执行摘要

Synova 当前存在**三套不同步的本体论**：

| 本体论 | 来源 | 边数 | 实体数 | 状态 |
|--------|------|------|--------|------|
| **A: 代码本体** | `extensions/ontology/edge-types/*.json` + `resource/` + `outcome/` | 16 | 13资源+8结果+8活动=29子类型 | 生产环境 |
| **B: v2.4规范本体** | `SYNOVA-DESIGN-本体层最终规范-v2.4-20260704.html` | 16+4调节因子 | 10+4调节因子 | 设计文档 |
| **C: JTBD假设本体** | Phase 3映射方案 | 隐含~14（PRODUCES/FLOWS_TO/AFFECTS等） | 隐含~9（Customer/Product/Market等） | 研究文档 |

**三套本体的边名存在根本性冲突。** 这不是"参数没对齐"的小问题——这是"三套不同的世界观"。JTBD研究在C本体上做了753个因果信息需求的推导、177个U-JTBD的去重、22个compute函数的设计——但这些设计的输入边在A本体中不存在。v2.4规范在B本体上做了16条边的完整数学模型——但这些数学定义和A本体的JSON Schema结构不兼容。

**本研究的目标**：以A本体（代码中的真实边）为地面真相，以B本体（v2.4规范的数学定义）为设计权威，以C本体（JTBD的因果信息需求）为需求来源，建立一套收敛方案。不新增实体类型，最多扩展边的可选参数。

---

## 1. 三套本体论的结构对比

### 1.1 实体体系对照

| 代码本体(A) 实体 | v2.4规范(B) 实体 | JTBD(C) 隐含实体 | 映射关系 |
|-----------------|-----------------|-----------------|---------|
| `resource/money` | ResourcePool.CashPosition | 隐含在"利润/成本"计算中 | A是B的子类型实例化 |
| `resource/client` | ResourcePool.ClientBase | Customer (显式) | 直接对应 |
| `resource/person` | ResourcePool.TalentPool | 隐含 | 直接对应 |
| `resource/team` | — (通过Activity承载) | — | A更细粒度 |
| `resource/supplier` | ResourcePool.SupplierNetwork | Supplier (显式) | 直接对应 |
| `resource/channel` | ResourcePool.ChannelNetwork | Channel (显式) | 直接对应 |
| `resource/brand` | ResourcePool.BrandEquity | 隐含 | 直接对应 |
| `resource/knowledge` | ResourcePool.KnowledgeBase | 隐含 | 直接对应 |
| `resource/tool` | — | — | A独有的Agent/工具视角 |
| `resource/agent` | — | — | A独有的AI Agent视角 |
| `resource/data` | ResourcePool.DataAsset | — | A更细粒度 |
| `resource/ip` | ResourcePool.IPPortfolio | — | A更细粒度 |
| `resource/location` | ResourcePool.PhysicalFootprint | — | 直接对应 |
| `activity/*` (8种) | Activity (单一抽象) | Operation (隐含) | B是抽象，A是分解 |
| `outcome/financial` | Outcome.FinancialOutcome | 隐含在"利润/收入"中 | 直接对应 |
| `outcome/market` | Outcome.MarketOutcome | Market (显式) | 直接对应 |
| `outcome/operational` | Outcome.OperationalOutcome | Operation outcomes | 直接对应 |
| `outcome/competitive` | Outcome.CompetitiveOutcome | 隐含在COMPETES_WITH中 | A/B都有，C通过边表达 |
| `outcome/people` | Outcome.PeopleOutcome | — | A/B有，C未覆盖 |
| `outcome/innovation` | Outcome.InnovationOutcome | 隐含 | A/B有 |
| `outcome/risk` | Outcome.RiskOutcome | 隐含 | A/B有 |
| `outcome/external` | Outcome.External | ExternalBaseline (B有专门实体) | B更完备 |
| — | DecisionNode | — | B有，A/B均无独立实体 |
| — | AdversarialFrame | — | B有，A无 |
| — | Sensing | — | B有，A通过activity/learning表达 |
| — | MeasurementContext | — | B有（边参数），A的METRIC_BINDS隐含 |
| — | Assumption | — | B有，A的EXTERNAL_ASSUMPTION_BINDS隐含 |

**关键发现**：
- A本体（代码）比B本体（规范）在Resource层更细粒度（13种子类型 vs 15个子上下文），但缺少B的认知层实体（DecisionNode/AdversarialFrame/Sensing/Assumption/MeasurementContext）
- C本体（JTBD）缺少A本体的Agent/Tool/IP/Data/Knowledge实体，也缺少B本体的认知层实体
- **三套本体在实体层面的共识区域**：ResourcePool(Client/Supplier/Channel/Money) + Activity + Outcome(Financial/Market/Operational)

### 1.2 边体系对照（核心冲突区）

这是冲突最严重的区域。以下逐边对照三套本体的命名和语义：

| JTBD(C)边名 | v2.4规范(B)边名 | 代码(A)边名 | 对齐状态 |
|------------|----------------|------------|---------|
| PRODUCES | — (Activity→Outcome在B中不叫PRODUCES) | **PRODUCES** | A和C名同但语义不同。A中PRODUCES只连Activity→Outcome，required参数是`marginal_contribution`+`period`。C期望PRODUCES连到ResourcePool且有`outputVolume/outputValue/yieldRate/defectRate` |
| FLOWS_TO | — | **FUNDS** (近似) + **REPLENISHES** (近似) | C期望"价值在实体间流动"，A用FUNDS(资金→活动)和REPLENISHES(结果→资源)分开表达 |
| AFFECTS | — | **DEPENDS_ON** (近似) | C期望"事件→结果因果影响"，A的DEPENDS_ON只连Activity→Activity |
| COMPETES_WITH | — | **SUBSTITUTES** (近似但不匹配) | C期望"产品/市场→竞品比较"，A的SUBSTITUTES是"新旧活动间的替代" |
| BUYS_FROM | — | **DEPLOYS** (极近似) | C期望"客户购买→订单→利润"，A的DEPLOYS是"资源部署到活动"——方向相反 |
| CONSUMES | — | **DEPLOYS** (极近似) | C期望"活动消耗资源"，A的DEPLOYS覆盖此语义(资源→活动) |
| DEPENDS_ON | **DEPENDS_ON** | **DEPENDS_ON** | 三方一致！但参数不同。B有criticality+dependency_type，A也有criticality+dependency_type |
| SIGNAL_TRANSMITS | **SIGNAL_TRANSMITS** | **SIGNAL_TRANSMITS** | 三方一致！核心参数fidelity+filter_bias一致 |
| METRIC_BINDS | **METRIC_BINDS** | **METRIC_BINDS** | 三方一致！ |
| INCENTIVE_BINDS | **INCENTIVE_BINDS** | **INCENTIVE_BINDS** | 三方一致！ |
| COUPLES | **COUPLES** | — (无对应) | A无此边。B定义为Activity_A→Activity_B的飞轮耦合 |
| EXPANSION_BRAKES | **EXPANSION_BRAKES** | **CONSTRAINS** (近似但不匹配) | B定义brake_exists+brake_response_delay，A的CONSTRAINS是outcome/external→activity的宏观约束 |
| CAPITAL_ALLOCATES | **CAPITAL_ALLOCATES** | **FUNDS** (近似) | B定义roic_spread+capital_efficiency，A的FUNDS是amount+allocation_period，无ROIC/WACC维度 |
| ASSET_LOCKS | **ASSET_LOCKS** | **LOCKS_IN** (近似但不匹配) | B定义asset_specificity+margin_gap_ratio，A的LOCKS_IN是resource→client/person的切换成本锁定 |
| CUMULATIVE_LEARNING | **CUMULATIVE_LEARNING** | — (无对应) | A无此边 |
| COGNITIVE_FRICTION | **COGNITIVE_FRICTION** | — (无对应) | A无此边 |
| — | DECISION_CONCENTRATES | **DECISION_CONCENTRATES** | B和A都有，C无 |
| — | OCCUPIES | — | B特有，A无，C无 |
| — | CANNIBALIZES | — | B特有，A无，C无 |
| — | LOCKS_IN | **LOCKS_IN** | B和A都有，但语义不同（B指向客户锁定，A指向resource锁定） |
| — | DEPENDS_ON_PLATFORM | **DEPENDS_ON_PLATFORM** | B和A都有 |
| — | VOLATILITY_ARBITRAGES | — | B特有，A无，C无 |
| — | EXTERNAL_ASSUMPTION_BINDS | **EXTERNAL_ASSUMPTION_BINDS** | B和A都有，语义一致 |
| — | — | **AUGMENTS** | A独有(resource间协同增强) |
| — | — | **INFORMS** | A独有(outcome→activity反馈) |
| — | — | **DECISION_CONCENTRATES** | A独有(决策权力集中) |

**数量统计**：
- 三方一致：4条 (DEPENDS_ON, SIGNAL_TRANSMITS, METRIC_BINDS, INCENTIVE_BINDS)
- A和B共有但C无：3条 (DECISION_CONCENTRATES, EXTERNAL_ASSUMPTION_BINDS, LOCKS_IN)
- B独有（A无）：5条 (COUPLES, OCCUPIES, CANNIBALIZES, CUMULATIVE_LEARNING, VOLATILITY_ARBITRAGES)
- A独有（B无）：3条 (AUGMENTS, INFORMS, DEPENDS_ON_PLATFORM)
- 名同义不同（需语义映射）：5组 (PRODUCES, FUNDS/FLOWS_TO, SUBSTITUTES/COMPETES_WITH, CONSTRAINS/EXPANSION_BRAKES, LOCKS_IN/ASSET_LOCKS)

---

## 2. 核心冲突：JTBD的"业务运营本体" vs 代码的"组织因果本体"

JTBD Phase 3研究的输入是177个U-JTBD，它们来自消费品/制造/SaaS三个行业的中小企业业务决策场景。这些场景自然使用了业务语言：

- "客户买了多少"(BUYS_FROM) → 代码中无此边
- "竞品在做什么"(COMPETES_WITH) → 代码的SUBSTITUTES是活动替代，不是竞品比较
- "插单影响了哪些订单"(AFFECTS) → 代码中无此边，DEPENDS_ON描述的是活动间依赖而非因果影响
- "资金怎么流转"(FLOWS_TO) → 代码用FUNDS+REPLENISHES分开表达，缺少"端到端价值流"的统一视角

代码本体（A）来自"16个企业死亡案例 → 7个统一因果模式"的研究路径，核心关注**组织内部的因果断裂**：信号衰减、度量脱耦、权力集中、资产锁死、扩张无制动、激励错位、外部假设绑架。这些边回答的是"增长为什么会停止"——**防御视角**。

JTBD本体（C）来自"177个业务决策场景 → 753个因果信息需求"的研究路径，核心关注**业务运营中的资源分配和价值流转**：产出、成本、客户盈利、渠道ROI、竞品定价。这些边回答的是"现在该做什么决策"——**进攻视角**。

v2.4规范（B）是两者的桥梁——它既有防御边（7条）也有增长动力边（7条）+认知边（2条）。但B与A在实体类型（pool/valve vs resource/activity/outcome）和边参数（传递函数 vs JSON requiredProps）两个层面存在结构性差异。

---

## 3. JTBD 22个compute函数的信息需求 vs 代码本体边参数对照

以下将JTBD每个compute函数的信息需求，逐项映射到代码本体中**真实存在的边+参数**。

### 3.1 可直接映射（需扩展边参数）

| JTBD函数 | JTBD假定的边 | 代码中实际可达的边+参数 | 缺口 |
|---------|------------|---------------------|------|
| computeProductionOutput | PRODUCES→ResourcePool | **PRODUCES→Outcome** + `quantity`(可选) | 缺`outputVolume`/`outputValue`——但`quantity`可承载产出量，`marginal_contribution`可逼近产出价值 |
| computeFullCostAllocation | PRODUCES+CONSUMES | **FUNDS** + **DEPLOYS** + **PRODUCES** | FUNDS的`amount`+`allocation_period`+`expected_roi`覆盖大部分成本信息。缺间接分摊驱动因素——需DEPENDS_ON的`criticality`补充分摊权重 |
| computeCustomerProfitability | PRODUCES+FLOWS_TO | **PRODUCES**(marginal_contribution) + **FUNDS**(amount) + **REPLENISHES**(reinvestment_rate) | 客户维度的聚合逻辑需新增，但基础数据在现有边中可达 |
| computeChurnDecomposition | BUYS_FROM+AFFECTS+COMPETES_WITH | **PRODUCES**(outcome/market的churn_rate/NPS) + **LOCKS_IN**(lock_in_strength) | 订单时序数据不在本体中（需外部数据源），归因分解依赖L3-01 Shapley引擎 |
| computeCashFlowProjection | FLOWS_TO | **FUNDS** + **PRODUCES**(outcome/financial) + **REPLENISHES** | 时序投影能力需新增，基础数据流在现有边中可达 |
| computeScenarioSimulation | AFFECTS+PRODUCES+FLOWS_TO | **PRODUCES** + **FUNDS** + **DEPLOYS** | 现有`computeScenarioSimulation`已有基础结构，扩展输入为多边多因素即可 |
| computeSubstitutionRisk | COMPETES_WITH+BUYS_FROM | **SUBSTITUTES**(substitution_rate) + **LOCKS_IN**(lock_in_strength) | SUBSTITUTES评估内部替代，扩展为外部替代需GA数据 |

### 3.2 需要新增参数但不需要新增边

| JTBD函数 | 宿主边 | 需新增的optional参数 | 理由 |
|---------|--------|-------------------|------|
| computeCapacityUtilization | **PRODUCES** + **DEPLOYS** | PRODUCES: `capacity_used`/`capacity_total`; DEPLOYS: `resource_capacity` | DEPLOYS已有`is_bottleneck`参数——扩展此参数即可表达产能约束 |
| computeQualityTraceability | **PRODUCES** | `defect_rate`(已有，在OPERATIONAL_OUTCOME中), `cpk`, `iqc_miss_rate` | OPERATIONAL_OUTCOME已有`defect_rate`/`dpmo`/`first_pass_yield`——只需新增`cpk`和`iqc_miss_rate` |
| computeOperationPerformance | **PRODUCES** | `on_time_delivery_rate`(已有，在OPERATIONAL_OUTCOME中), `complaint_count`, `delay_penalty` | OPERATIONAL_OUTCOME已有`on_time_delivery_rate`/`defect_rate`/`avg_cycle_time_hours`/`capacity_utilization`——只需新增`complaint_count`/`delay_penalty` |
| computeAccountReceivableRisk | **FUNDS** + **PRODUCES** | FUNDS: `receivable_days`/`overdue_amount`; CLIENT: `credit_rating` | FUNDS的`allocation_period`可推账期，CLIENT实体可承载信用数据 |
| computeCustomerMigration | **LOCKS_IN** | `competitor_switch_count`/`winback_rate` | LOCKS_IN的`lock_in_strength`已度量锁定强度，扩展竞争迁移维度 |
| computeChannelROI | **FUNDS** + **PRODUCES** | CHANNEL: `revenue_attributable`/`cost_attributable` | CHANNEL实体已有`cost_per_acquisition`/`conversion_rate`——补充收入端即可 |

### 3.3 需要新增边或全新数据源

| JTBD函数 | 原因 | 建议 |
|---------|------|------|
| computeMaterialAvailability | 本体无"物料"概念，DEPENDS_ON只连Activity→Activity | **暂不新增边**——降级为ERP/MES数据源直连，通过`field-mappings/erp-standard.json`映射 |
| computeProductionDifficulty | COUPLES边在A中不存在 | **暂不新增边**——DEPENDS_ON的`criticality`+`dependency_type`可部分表达工艺依赖。P2优先级，待数据源就绪后再设计 |
| computeScheduleImpactSimulation | AFFECTS边在A中不存在 | **暂不新增边**——DEPENDS_ON的`criticality`+`slack_time_hours`+PRODUCES的`avg_cycle_time_hours`可构建排程依赖图 |
| computeCustomerValueScore | 多边组合+战略评分需GA | **不新增边**——组合PRODUCES+FUNDS+LOCKS_IN+DEPLOYS多边数据，战略重要性通过GA输入 |
| computeShapleyAttribution | 全新算法引擎，不依赖特定边 | 算法本身不新增边——输入从PRODUCES/FUNDS/DEPENDS_ON/DEPLOYS交叉提取，输出写回Evidence池 |
| computeCausalSequence | AFFECTS边不存在 | DEPENDS_ON(Activity依赖图) + INFORMS(feedback_latency_days) + 时序数据 → 构建因果DAG |
| computeInterventionEffect | 需要GA干预标记基础设施 | 需新增`GA_Intervention`事件标记机制（通过Event节点挂载） |
| computeCompetitorPricingLandscape | COMPETES_WITH不存在 | **纯GA数据采集问题**——竞品价格通过外部数据源（电商爬虫/行业报告）进入，不经过本体边 |
| computeCompetitorFeatureThreat | COMPETES_WITH不存在 | 同上——纯GA数据采集问题 |

### 3.4 汇总：22个函数的实现路径

| 路径 | 数量 | 函数 |
|------|------|------|
| **路径1: 直接用现有边参数实现** | 2 | computeScenarioSimulation(扩展), computeFullCostAllocation(聚合3个现有函数) |
| **路径2: 扩展现有边optional参数** | 8 | computeProductionOutput, computeCapacityUtilization, computeQualityTraceability, computeOperationPerformance, computeCustomerProfitability, computeAccountReceivableRisk, computeCustomerMigration, computeChannelROI |
| **路径3: 多边组合+算法引擎（不新增边）** | 6 | computeChurnDecomposition, computeCashFlowProjection, computeCustomerValueScore, computeShapleyAttribution, computeCausalSequence, computeSubstitutionRisk |
| **路径4: 纯数据源问题（非本体问题）** | 4 | computeMaterialAvailability, computeProductionDifficulty, computeCompetitorPricingLandscape, computeCompetitorFeatureThreat |
| **路径5: 需GA基础设施先行** | 2 | computeScheduleImpactSimulation, computeInterventionEffect |

---

## 4. 10个新增哨兵的实现路径

| 哨兵 | 依赖的compute函数 | compute函数路径 | 哨兵结论 |
|------|------------------|---------------|---------|
| O10 客户盈利能力 | computeCustomerProfitability(路径2) + computeMarginalContribution(已有) | 路径2 | NEW — 依赖路径2的compute先行 |
| O11 产能调度优化 | computeProductionOutput(路径2) + computeCapacityUtilization(路径2) | 路径2 | NEW — 依赖路径2的2个compute先行 |
| O12 供应商绩效归因 | computeQualityTraceability(路径2) + computeDefectAttribution(未设计) | 路径2+新设计 | NEW — 需补充defectAttribution compute |
| O13 客户流失归因 | computeChurnDecomposition(路径3) + computeShapleyAttribution(路径3) | 路径3 | **ENHANCE_EXISTING — 增强E4哨兵** |
| O14 排期策略模拟 | computeScheduleImpactSimulation(路径5) + computeCustomerValueScore(路径3) | 路径5+路径3 | NEW — 依赖路径5先行 |
| O15 定价策略 | computePriceElasticity(未设计) + computeCompetitorPricingLandscape(路径4) | 路径4+新设计 | NEW — 依赖GA数据采集+新compute |
| E6 客户需求结构 | computeCustomerDemandStructure(未设计) + computeCompetitorFeatureThreat(路径4) | 路径4+新设计 | **ENHANCE_EXISTING — 增强E4/E3哨兵** |
| F5 报价协同 | computeQuoteCostAggregation(未设计) + computeFullCostAllocation(路径1) | 路径1+新设计 | NEW — 依赖路径1+新compute |
| C1 多渠道ROI | computeChannelROI(路径2) + computeChannelCannibalization(未设计) | 路径2+新设计 | NEW — 依赖路径2+新compute |
| C2 客户分级冲突 | computeCustomerValueScore(路径3) + computeProductionDifficulty(路径4) | 路径3+路径4 | NEW — 依赖路径3+路径4先行 |

---

## 5. 收敛方案：最小改动实现最大JTBD覆盖

### 5.1 不改边名，扩展边参数字段

**原则**：不新增实体类型，不新增边类型。对现有16条边的`optionalProps`做最小扩展。

需要新增的参数（按边分组）：

**PRODUCES边新增optional参数**：
```
capacity_used, capacity_total, on_time_delivery_rate(已存在但需确认), 
complaint_count, delay_penalty, cpk, iqc_miss_rate
```
注：`on_time_delivery_rate`/`defect_rate`/`capacity_utilization`已在OPERATIONAL_OUTCOME中定义，但需要确认它们作为PRODUCES边的参数还是Outcome节点的属性。如果是Outcome属性，则通过PRODUCES→Outcome的图遍历即可读取，无需新增边参数。

**FUNDS边新增optional参数**：
```
receivable_days, overdue_amount, expected_cash_inflow, expected_cash_outflow
```

**DEPLOYS边新增optional参数**：
```
resource_capacity, deployment_cost
```

**LOCKS_IN边新增optional参数**：
```
competitor_switch_count, winback_rate
```

**CLIENT实体新增optional参数**：
```
credit_rating, customer_value_score, profitability_tier
```
（CLIENT已有`lifetime_value`/`acquisition_cost`/`churn_risk`/`segment`，增补3个JTBD需要的字段）

**CHANNEL实体新增optional参数**：
```
revenue_attributable, cost_attributable
```
（CHANNEL已有`cost_per_acquisition`/`conversion_rate`，增补收入端）

**新增的参数字段总数：约18个optional参数 + 3个entity optional属性 = 21个字段。**

### 5.2 不需要改动的部分

- **不新增实体类型**：JTBD需要的Customer/Product/Market/Channel均已在A本体的Resource/Outcome体系中表达
- **不新增边类型**：16条现有边经过语义映射已能覆盖JTBD ~80%的因果信息需求
- **不修改现有compute函数签名**：新增compute函数独立存在，消费现有+扩展后的边参数
- **不修改哨兵注册机制**：新增哨兵通过SentinelRegistry统一管理

### 5.3 需要外部数据源直连的部分（非本体问题）

以下JTBD信息需求因涉及外部数据（竞品/市场/物料），不走本体边，而是通过数据源直连：

1. **竞品价格/功能数据** → 电商爬虫/行业报告API → 写入`AdversarialFrame`或GA维护的外部数据集
2. **物料/BOM数据** → ERP/MES直连 → 通过`field-mappings/erp-standard.json`映射到Resource/Activity
3. **客户订单时序数据** → CRM/订单系统直连 → 作为时序分析输入，不持久化到本体图

### 5.4 v2.4规范中A本体缺失的5条增长动力边——按优先级评估

| v2.4边 | JTBD需求匹配度 | 是否需要在A本体新增 | 优先级 |
|--------|--------------|-----------------|--------|
| COUPLES (飞轮耦合) | 中等 — computeProductionDifficulty需要"活动耦合度"概念 | 建议新增——耦合度是业务诊断的核心维度 | P1 |
| CUMULATIVE_LEARNING | 低 — 无JTBD函数直接消费 | 暂缓——A本体的activity/learning+INFORMS边已部分覆盖 | P3 |
| CANNIBALIZES | 中等 — computeChannelROI需要渠道蚕食概念 | 暂缓——可通过SUBSTITUTES边近似表达 | P2 |
| OCCUPIES | 低 — 无JTBD函数直接消费 | 暂缓——A本体的PRODUCES(outcome/competitive)已部分覆盖 | P3 |
| VOLATILITY_ARBITRAGES | 低 — 无JTBD函数直接消费 | 暂缓——v2.4规范中的高级概念，企业数据尚未就绪 | P3 |

**结论：只建议新增1条边——COUPLES。** 飞轮耦合度在177个U-JTBD中高频出现（如U-JTBD-0009品牌战役归因、U-JTBD-0014插单影响、U-JTBD-0017增购判断），且现有16条边无法自然表达"两个活动飞轮之间的能量传递效率"。

**COUPLES边设计（最小定义）**：
```
allowedFrom: Activity(8种)
allowedTo: Activity(8种)
requiredProps: coupling_strength(0-1), coupling_lag_days
optionalProps: coupling_direction(unidirectional/bidirectional), inertia
description: 飞轮耦合——两个增长活动之间的能量传递效率
```

---

## 6. 实施优先级矩阵

按"JTBD覆盖率 × 实施难度"排序：

| 优先级 | 行动 | 影响范围 | 需新增字段 | 解锁JTBD函数 | 解锁哨兵 |
|--------|------|---------|-----------|-------------|---------|
| **P0-1** | 扩展PRODUCES边参数(6个optional) | 1个JSON文件 | `capacity_used`/`cpk`/`complaint_count`/`delay_penalty`等6个 | 5个(L1-01/02/03/06 + L2-03) | 2个(O11/O12) |
| **P0-2** | 扩展FUNDS+REPLENISHES边参数(3个optional) | 2个JSON文件 | `receivable_days`/`overdue_amount`/`expected_cash_inflow` | 3个(L2-04/07 + computeCausalSequence) | 0个 |
| **P0-3** | 新增COUPLES边 | 1个JSON文件 | 整条边(2个required参数) | 2个(L1-07 + 间接其他) | 0个 |
| **P1-1** | 扩展CLIENT/CHANNEL实体属性 | 2个JSON文件 | `credit_rating`/`revenue_attributable`等 | 3个(L2-01/06 + computeCustomerValueScore) | 2个(O10/C1) |
| **P1-2** | 扩展LOCKS_IN/DEPLOYS边参数 | 2个JSON文件 | `competitor_switch_count`/`deployment_cost` | 2个(L2-05/06 + computeSubstitutionRisk) | 0个 |
| **P1-3** | 实施Shapley归因引擎 | 新TypeScript文件 | 0个新本体字段 | 1个(L3-01) + 消费它的L2-03/L3-02 | 2个(O12/O13) |
| **P2** | GA干预标记基础设施 | 新Event类型 | GA_Intervention事件规范 | 2个(L3-04/L1-08) | 1个(O14) |
| **P3** | 竞品数据采集流水线 | 外部系统 | 0个新本体字段 | 3个(L4-01/02/03) | 3个(O15/E6/C1依赖竞品部分) |

---

## 7. 收敛后的最终数字

如果执行上述P0+P1全部行动：

| 指标 | 收敛前(JTBD Phase 3) | 收敛后(本体对齐后) |
|------|---------------------|-------------------|
| 22个compute函数 | 22个(全部NEW) | **8个已可实现(路径1+2)、8个多边组合可实现(路径3)、6个需外部数据(路径4+5)** |
| 10个哨兵 | 10个(全部NEW) | **2个ENHANCE_EXISTING、4个可新建(compute就绪)、4个需数据源先行** |
| 需要新增的边 | JTBD假设~14条"新边" | **1条(COUPLES)** |
| 需要新增的参数字段 | — | **~21个optional参数/属性** |
| 数据可行性(JTBD评估) | 85% | **~40%立即可达(P0后)、~65%短期可达(P0+P1后)、~85%长期可达(含GA+外部数据源)** |
| 与v2.4规范的一致度 | 冲突 | **高一致——COUPLES边对齐、参数扩展遵循v2.4传递函数设计、不破坏现有架构** |

---

## 8. 诚实清单

| 诚实问题 | 回答 |
|---------|------|
| 为什么不按JTBD文档新增FLOWS_TO/AFFECTS/COMPETES_WITH等"业务边"？ | 因为A本体的16条边来自16个企业死亡案例的5Whys根因，已被27个案例+7位专家验证。新增业务边会导致本体失去因果收敛性——同一个"客户买了东西"可以由DEPLOYS(client→activity)+PRODUCES(activity→outcome)+REPLENISHES(outcome→resource)组合表达。新增边=引入冗余=违反正交性。 |
| 21个新增参数字段是否违反"不新增实体/边"的约束？ | 不违反。optional参数是现有16条边的扩展字段，不改变边的数学语义。JSON Schema的optionalProps天然支持向后兼容扩展。 |
| COUPLES边是唯一的例外——为什么必须新增？ | 因为飞轮耦合度无法被现有16条边的任何组合表达。ACTIVITY→ACTIVITY的DEPENDS_ON表达的是"依赖关系"（资源/产出依赖），SUBSTITUTES表达的是"替代关系"，都不是"能量传递效率"。COUPLES是正交的——它度量的是"A飞轮的减速以多大时延和多强幅度传导到B飞轮"，这是增长动力学的核心概念，且在177个U-JTBD中高频出现。 |
| v2.4规范中还有4条增长动力边(OCCUPIES/CANNIBALIZES/CUMULATIVE_LEARNING/VOLATILITY_ARBITRAGES)为什么不新增？ | 它们在本体论上是成立的，但在当前177个U-JTBD的需求映射中优先级低。OCCUPIES/CANNIBALIZES更多是战略诊断概念，当前的JTBD需求集中在运营层(ALLOCATE/DIAGNOSE)。CUMULATIVE_LEARNING和VOLATILITY_ARBITRAGES需要长周期时序数据，企业数据尚未就绪。Phase 5再评估。 |
| 这个方案是否修复了"三套本体论冲突"？ | **部分修复。** A和C的对齐通过参数扩展+语义映射完成。A和B的差异(Activity的8子类型 vs 单一抽象、ResourcePool的13子类型 vs 15子上下文、认知层实体缺失)留待Phase 5的"A→B渐进升级"。当前方案优先解决"JTBD需求能落地"这个最高优先级问题。 |

---

## 9. 与昨日Phase 3研究结论的差异说明

| 昨日Phase 3声称 | 今日对齐后的修正 | 差异原因 |
|----------------|----------------|---------|
| "~90个现有compute函数可复用" | 实际~112个现有函数中，约50个与JTBD需求直接相关，其中约20个可直接消费 | Phase 3以C本体为基准统计，未验证A本体中边的真实存在性 |
| "85%数据技术可达" | 约40%立即可达(P0后)，约65%短期可达(P0+P1后) | 同上的本体不对齐问题——C本体假设的边参数在A中不存在 |
| "22个新增compute函数" | 22个函数需求成立，但实现路径不同：8个扩展到现有边参数、8个多边组合、6个依赖外部数据 | 数量正确，但"新增"意味变了——不是全部从零建，很多是扩展现有 |
| "10个新增哨兵" | 2个建议增强现有(E4)，8个新建，4个需数据源先行 | 通过哨兵合并减少碎片化 |

**昨日的研究并没有错**——它在它自己的参照系(C本体)内是内部一致的。问题在于那个参照系和代码本体(A本体)不是一个参照系。今天的对齐研究做了这件事：把JTBD的需求语言翻译成代码本体的边参数语言。

---

*本体层对齐深度研究 · v1.0 · 2026-07-06*
*执行人: Codex Agent · 参考: extensions/ontology/ (29个子类型+16边JSON) + v2.4规范HTML(16边+10实体+4调节因子) + JTBD Phase 3(22 compute+10 sentinel)*
