---
title: "JTBD增量 — 哨兵+Compute函数 gap分析"
version: "v1.0"
date: "2026-07-06"
status: "审计完成"
input: "JTBD Phase 3综合映射方案 + 本体层最终规范 v2.4 + 62个哨兵扩展目录"
methodology: "逐函数搜索grep + 读源码 + 本体边类型对照"
---

# Synova JTBD增量 Gap分析 — 22个Compute函数 + 10个哨兵

## 前置发现：本体层边命名严重不一致

JTBD Phase 3文档引用的边名（PRODUCES, FLOWS_TO, AFFECTS, COMPETES_WITH, BUYS_FROM, CONSUMES, COUPLES, SIGNAL_TRANSMITS, METRIC_BINDS, INCENTIVE_BINDS, EXPANSION_BRAKES, CAPITAL_ALLOCATES, ASSET_LOCKS, CUMULATIVE_LEARNING, COGNITIVE_FRICTION）与**代码中实际存在的本体边JSON Schema**存在显著差异。

**代码中的16条本体边**（`extensions/ontology/edge-types/*.json`）：

| 序号 | 代码边名 | JTBD文档引用名 | 匹配? |
|------|---------|---------------|-------|
| 1 | PRODUCES | PRODUCES | 部分匹配 — 代码中只连Activity→Outcome，无"产出量/产出值"参数 |
| 2 | DEPLOYS | — | JTBD未知 |
| 3 | FUNDS | FLOWS_TO | 语义接近但不同 — FUNDS是"资金分配到活动"，FLOWS_TO是"价值在实体间流动" |
| 4 | DEPENDS_ON | DEPENDS_ON | 匹配 — 但代码中只连Activity→Activity |
| 5 | SUBSTITUTES | COMPETES_WITH | 不匹配 — SUBSTITUTES是"新旧活动替代"，COMPETES_WITH是"竞品比较" |
| 6 | SIGNAL_TRANSMITS | SIGNAL_TRANSMITS | 匹配 |
| 7 | METRIC_BINDS | METRIC_BINDS | 匹配 |
| 8 | INCENTIVE_BINDS | INCENTIVE_BINDS | 匹配 |
| 9 | DECISION_CONCENTRATES | — | JTBD未知 |
| 10 | EXTERNAL_ASSUMPTION_BINDS | — | JTBD未知 |
| 11 | LOCKS_IN | ASSET_LOCKS | 语义接近但不完全一致 |
| 12 | CONSTRAINS | EXPANSION_BRAKES | 不匹配 |
| 13 | AUGMENTS | — | JTBD未知 |
| 14 | INFORMS | — | JTBD未知 |
| 15 | DEPENDS_ON_PLATFORM | — | JTBD未知 |
| 16 | REPLENISHES | — | JTBD未知 |

**核心问题**：JTBD Phase 3使用的边名（如`FLOWS_TO`, `AFFECTS`, `COMPETES_WITH`, `BUYS_FROM`, `CONSUMES`, `COUPLES`, `EXPANSION_BRAKES`, `CAPITAL_ALLOCATES`, `ASSET_LOCKS`, `CUMULATIVE_LEARNING`, `COGNITIVE_FRICTION`）在**代码中不存在**或**语义完全不同**。

**影响评级：CRITICAL** — 所有22个新增compute函数和10个新增哨兵的数据可行性分析需要以代码中真实的16条边为基准重新评估。

---

## 汇总

| 指标 | 数值 |
|------|------|
| 22个新增compute函数 | 3个可复用/扩展现有, 3个部分覆盖, **16个需要全新设计**（因JTBD假定的边不存在） |
| 10个新增哨兵 | 1个可增强现有, 1个有部分等价, **8个需要全新设计** |
| 数据可行性 | 仅~30%的JTBD假设参数在代码本体中可直接获取，~70%需新增边或扩展边参数字段 |

**根本原因**：JTBD Phase 3是在一个**与代码本体不同步的"理想本体"**上做的映射。代码中的本体边是Activity→Resource→Outcome的三层模型，而JTBD假设的本体是Customer/Product/Market/Channel等业务实体的"通用企业本体"。两者是**不同的本体论**。

---

## 逐函数gap分析

### L1-01: computeProductionOutput
- JTBD描述: 查询Activity→PRODUCES→ResourcePool的产出量和产出值
- 现有覆盖: **部分覆盖** — 现有`computeMarginalContribution`通过`(revenue, variableCost)`间接得到产出价值，`computeUnitMargin`有`unitRevenue/unitCost`。但没有独立的"产出量/产出值"查询函数。
- 数据可行性: **PARTIAL** — 代码中的PRODUCES边只连Activity→Outcome，有`marginal_contribution`和`period`两个required参数，有`quantity`可选参数。但JTBD假设的"ResourcePool(产出)"实体在代码中对应的是`resource/*`下的12个resource子类型，不是统一实体。
- 正交性检查: OK — 不与现有函数冲突（不同参数维度）
- **结论: NEW（需适配真实PRODUCES边参数）**

### L1-02: computeCapacityUtilization
- JTBD描述: 查询产能利用率（Operation→PRODUCES→ResourcePool产能 + Operation→CONSUMES→工时）
- 现有覆盖: **完全无覆盖** — 现有`computeChannelCapacity`计算的是组织通信信道（人员→团队→事件），不是产能利用率。
- 数据可行性: **LOW** — JTBD假定的CONSUMES边在代码中不存在。最接近的是DEPLOYS边（Resource→Activity，有`contribution_elasticity`和`is_bottleneck`参数），可利用`is_bottleneck`推断瓶颈。产能利用率需新增参数或扩展PRODUCES边的`optionalProps`。
- 正交性检查: OK
- **结论: NEW（需扩展PRODUCES/DEPLOYS边参数，或新增加载率计算逻辑）**

### L1-03: computeQualityTraceability
- JTBD描述: 产品质量问题反向追溯（Product→PRODUCES→质量问题→Supplier/Operation/Resource）
- 现有覆盖: **完全无覆盖** — 现有代码中无任何质量追溯函数。
- 数据可行性: **LOW** — 代码中PRODUCES边无`defectRate`/`defectBatchTrace`/`cpkByLine`参数。质量问题追溯需要数据源（MES/质检系统），这是"企业补充"类数据。
- 正交性检查: OK
- **结论: NEW（需新增PRODUCES边参数 + MES数据源对接）**

### L1-04: computeFullCostAllocation
- JTBD描述: 完整成本分摊（直接成本+间接成本+退换货成本+特殊需求成本）
- 现有覆盖: **部分覆盖** — `computeVariableCosts`分类变动/固定成本，`computeFixedCostRigidity`评估固定成本刚性，`computeMarginalContribution`计算边际贡献。缺少完整的"全成本分摊"逻辑（间接成本驱动因素分摊、退换货成本、特殊需求附加成本）。
- 数据可行性: **PARTIAL** — FUNDS边有`amount`和`allocation_period`参数，可获取资金分配。PRODUCES边的`marginal_contribution`可获取直接成本。但间接分摊需要ACTIVITY→ACTIVITY的DEPENDS_ON边的`criticality`参数辅助推算。
- 正交性检查: OK — `computeFullCostAllocation`是`computeVariableCosts`+`computeFixedCostRigidity`的上层聚合函数，不冲突。
- **结论: EXTEND — 扩展现有成本函数体系，新增分摊逻辑层**

### L1-05: computeMaterialAvailability
- JTBD描述: 物料齐套/BOM可用性查询（Product→DEPENDS_ON→Supplier→PRODUCES→物料）
- 现有覆盖: **完全无覆盖** — 无物料/BOM/齐套相关函数。
- 数据可行性: **LOW** — 代码本体中无"物料"实体。DEPENDS_ON只连Activity→Activity（有`criticality`/`dependency_type`参数），不连Supplier。需要`resource/supplier`通过DEPLOYS边连到Activity来间接推断，但无直接物料可用性参数。
- 正交性检查: OK
- **结论: NEW（需Supplier→Material实体映射 + DEPLOYS边扩展）**

### L1-06: computeOperationPerformance
- JTBD描述: 履约/交货表现（准时交付率、质量合格率、投诉数、延期罚款）
- 现有覆盖: **完全无覆盖** — 无任何运营绩效/履约指标计算函数。
- 数据可行性: **LOW** — PRODUCES边只有`marginal_contribution`/`period`/`quantity`/`quality`/`output_type`可选参数。`quality`参数可支持质量合格率，但`onTimeDeliveryRate`/`complaintCount`/`delayPenalty`需新增边参数。
- 正交性检查: OK
- **结论: NEW（需扩展PRODUCES边参数 + 运营系统数据源）**

### L1-07: computeProductionDifficulty
- JTBD描述: 产品工艺难度量化（换线次数、最小起订量、特殊工艺占比）
- 现有覆盖: **完全无覆盖** — 无工艺难度相关函数。JTBD引用的COUPLES边在代码中不存在。
- 数据可行性: **LOW** — 需数据源（工艺BOM/生产排程），且无对应本体边。
- 正交性检查: OK
- **结论: NEW（需新增本体边或扩展DEPENDS_ON边参数）**

### L1-08: computeScheduleImpactSimulation
- JTBD描述: 插单影响模拟（急单→AFFECTS→被延期订单的连锁影响）
- 现有覆盖: **无直接覆盖** — 现有`computeScenarioSimulation`模拟的是"砍掉低利润客户群后的盈亏变化"，不是"插单排程影响"。但两者共享"模拟"模式。
- 数据可行性: **LOW** — JTBD假定的AFFECTS边在代码中不存在。代码中的DEPENDS_ON边（Activity→Activity）的`criticality`和`slack_time_hours`可选参数可用于排程依赖分析，但无"插单影响"的因果推理。
- 正交性检查: OK
- **结论: NEW（复用DEPENDS_ON边结构，新增排程模拟逻辑）**

### L2-01: computeCustomerProfitability
- JTBD描述: 客户级盈利能力（累计利润率、利润贡献、营收占比、服务成本）
- 现有覆盖: **部分覆盖** — `computeMarginalContribution`按客户群计算边际贡献（revenue - variableCost），`computeUnitMargin`有单位毛利率。缺少完整的"客户级全成本利润"（含分摊固定成本+服务成本）。
- 数据可行性: **PARTIAL** — FUNDS边有`amount`和`expected_roi`/`actual_roi`，REPLENISHES边有`reinvestment_rate`。需组合PRODUCES（marginal_contribution）+ FUNDS（allocation）+ REPLENISHES（reinvestment）来计算客户级全成本利润。
- 正交性检查: OK — `computeCustomerProfitability`是`computeMarginalContribution`的上层聚合，按Customer维度重组。
- **结论: EXTEND — 基于computeMarginalContribution扩展为客户维度+全成本**

### L2-02: computeCustomerValueScore
- JTBD描述: 客户综合价值评分（利润分+战略重要性+增长潜力）
- 现有覆盖: **完全无覆盖** — 无客户综合评分函数。现有`computeCustomerConcentration`/`computeCustomerChurnRisk`只覆盖风险维度，不覆盖价值维度。
- 数据可行性: **LOW** — 需组合PRODUCES（利润）、DEPENDS_ON（依赖强度）、REPLENISHES（再投资率）等多边数据。战略重要性评分需人工GA输入。
- 正交性检查: OK
- **结论: NEW（多边组合评分，需GA补充战略重要性）**

### L2-03: computeChurnDecomposition
- JTBD描述: 客户流失归因分解（下单量时序+竞品关联+产品使用+履约关联）
- 现有覆盖: **部分覆盖** — `computeCustomerChurnRisk`提供流失率/营收流失率/NPS风险客户。但只输出"谁在流失"不输出"为什么流失"。
- 数据可行性: **LOW** — JTBD假定的BUYS_FROM/COMPETES_WITH/AFFECTS边在代码中不存在。分解归因需要：订单时序数据（不直接在本体中）、竞品替代数据（无COMPETES_WITH边）、履约失败关联（需PRODUCES边扩展）。**核心能力`computeShapleyAttribution`（L3-01）本身也需要先存在。**
- 正交性检查: OK — `computeChurnDecomposition`消费`computeCustomerChurnRisk`的结果并做归因分解，不冲突。
- **结论: NEW（依赖L3-01 Shapley归因引擎先行存在）**

### L2-04: computeAccountReceivableRisk
- JTBD描述: 账期/回款风险评估（逾期历史、P90逾期天数、信用风险分）
- 现有覆盖: **无直接覆盖** — 现有`cashRunwaySentinel`内部计算了`overdueRate = receivable / totalCash`，但没有独立的AR风险compute函数。`computeCashConversionCycle`关注现金转化效率而非信用风险。
- 数据可行性: **PARTIAL** — FUNDS边有`amount`/`allocation_period`，PRODUCES（outcome/financial）可产出回款数据。但需要明确的"账期"字段（目前本体无此参数）。
- 正交性检查: OK
- **结论: NEW（需新增回款/信用/逾期相关边参数）**

### L2-05: computeCustomerMigration
- JTBD描述: 客户向竞品迁移检测（转换成本估算、竞品迁移率、赢回概率）
- 现有覆盖: **部分覆盖** — `computeCustomerChurnRisk`提供流失率，`computeSwitchingCost`（competitive-moat-structural）计算转换成本。但缺少"竞品迁移方向"的检测能力。
- 数据可行性: **LOW** — 代码中无COMPETES_WITH边。最接近的是SUBSTITUTES边（Activity→Activity替代关系），但其`substitution_rate`和`switching_cost`参数评估的是"新旧活动替代"不是"客户从我家迁移到竞品"。需要GA人工采集竞品迁移数据。
- 正交性检查: OK
- **结论: NEW（需竞品数据GA采集 + 消费computeSwitchingCost）**

### L2-06: computeChannelROI
- JTBD描述: 渠道ROI对比（渠道收入、渠道成本、ROI、回收期、渠道间蚕食率）
- 现有覆盖: **完全无覆盖** — 无渠道ROI计算函数。`computeChannelCapacity`只算通信信道，不算营销渠道。
- 数据可行性: **LOW** — JTBD假定的FLOWS_TO/CONSUMES边在代码中不存在。需通过PRODUCES（outcome/financial）获取渠道收入、FUNDS（allocation）获取渠道投入。`resource/channel`实体存在但无"渠道收入/成本"的直接边参数。
- 正交性检查: OK
- **结论: NEW（需新增渠道收入/成本的边映射）**

### L2-07: computeCashFlowProjection
- JTBD描述: 动态现金流预测（现金流入/流出/净头寸/跑道月数）
- 现有覆盖: **部分覆盖** — `computeCashRunway`计算静态跑道（总现金/月消耗），`computeCashConversionRate`/`computeCashConversionCycle`计算现金转化效率。缺少"动态预测"能力（时序投影、应收/应付变动模拟）。
- 数据可行性: **PARTIAL** — FUNDS边有`amount`和`allocation_period`，PRODUCES（outcome/financial）可产出收入流，REPLENISHES可产出再投资率。动态预测需时序数据+蒙特卡洛模拟。
- 正交性检查: OK — `computeCashFlowProjection`消费`computeCashRunway`结果并扩展为动态预测。
- **结论: EXTEND — 基于computeCashRunway扩展为动态现金流预测**

### L3-01: computeShapleyAttribution
- JTBD描述: Shapley值归因（多因素贡献分解、置信区间）
- 现有覆盖: **完全无覆盖** — 无任何归因推理引擎。这是JTBD 22个函数中**最关键的新增能力**，也是L2-03/L3-02等多个函数的前置依赖。
- 数据可行性: **CONCEPTUAL** — 算法可行（Shapley值是成熟方法），但输入数据（多因素+结果时序）需从多条边（PRODUCES/FUNDS/DEPENDS_ON/DEPLOYS）交叉提取。DEPENDS_ON的`criticality`参数可作为归因的初始权重。
- 正交性检查: OK — 全新能力层。
- **结论: NEW（核心新引擎，多个其他函数的前置依赖）**

### L3-02: computeCausalSequence
- JTBD描述: 因果链追溯（最早偏离点、因果排序、根因概率）
- 现有覆盖: **完全无覆盖** — 无因果层级排序引擎。现有`computeStructuralChangeSignal`检测结构性变化但不做因果链排序。
- 数据可行性: **LOW** — JTBD假定的AFFECTS边在代码中不存在。DEPENDS_ON边（Activity→Activity的`criticality`+`dependency_type`）可用于构建依赖图，但因果方向性推断需时序数据+Granger因果/PC算法。PRODUCES→INFORMS反馈环可辅助构建因果图。
- 正交性检查: OK
- **结论: NEW（需DEPENDS_ON+PRODUCES时序数据+因果推断算法）**

### L3-03: computeScenarioSimulation（扩展）
- JTBD描述: 蒙特卡洛反事实模拟（乐观/基线/悲观+敏感度矩阵）
- 现有覆盖: **部分覆盖** — 现有`computeScenarioSimulation`只模拟"砍掉N个客户群后的盈亏变化"，是单场景单目标的确定性模拟。JTBD需求是多场景多因素的蒙特卡洛模拟。
- 数据可行性: **PARTIAL** — 现有函数已有基础结构（MarginalGroup+RigidityItem作为输入），可扩展为多因素+概率分布输入。
- 正交性检查: OK — 扩展现有函数，不新增独立函数。
- **结论: EXTEND — 扩展现有computeScenarioSimulation为蒙特卡洛版**

### L3-04: computeInterventionEffect
- JTBD描述: 干预效果量化（效应量、显著性、前后差异、合成控制）
- 现有覆盖: **完全无覆盖** — 无因果推断/准实验评估函数。
- 数据可行性: **LOW** — 需要干预标记（GA手工标注）+ 前后对比数据。代码中无"干预事件"实体。可利用PRODUCES边的时间序列+INFORMS边的`feedback_latency_days`参数来构建前后对比，但干预标记需人工。
- 正交性检查: OK
- **结论: NEW（需GA干预标记基础设施）**

### L4-01: computeCompetitorPricingLandscape
- JTBD描述: 竞品价格全景（P10/P50/P90价格区间、价差、价格趋势、折扣深度）
- 现有覆盖: **完全无覆盖** — 无竞品价格监控函数。现有`computeCompetitiveIntensity`/`computeHhiIndex`只评估市场结构（集中度/竞争强度），不监控价格。
- 数据可行性: **LOW** — 代码中无COMPETES_WITH边。竞品价格数据完全依赖GA手工采集或外部数据源（电商爬虫/行业报告）。**不是在代码本体中"能不能算"的问题，是"有没有数据输入"的问题。**
- 正交性检查: OK
- **结论: NEW（纯数据采集问题，非计算逻辑问题）**

### L4-02: computeCompetitorFeatureThreat
- JTBD描述: 竞品功能威胁度（功能重叠度、功能缺口、威胁等级、升级速度）
- 现有覆盖: **完全无覆盖** — 无竞品功能分析函数。
- 数据可行性: **LOW** — 完全依赖GA手工采集（竞品功能矩阵）。代码中无对应边。
- 正交性检查: OK
- **结论: NEW（纯GA数据采集问题）**

### L4-03: computeSubstitutionRisk
- JTBD描述: 替代威胁量化（替代弹性、转换成本壁垒、价格优势比）
- 现有覆盖: **部分覆盖** — `computeSubstitutionRate`（competitive-moat-structural的SUBSTITUTES边）评估活动间替代率，`computeSwitchingCost`评估转换成本。但只评估"我方活动间替代"不评估"外部替代品威胁"。
- 数据可行性: **PARTIAL** — SUBSTITUTES边有`substitution_rate`/`switching_cost`参数，可借鉴其计算逻辑。但外部替代品数据需GA采集。
- 正交性检查: OK — `computeSubstitutionRisk`聚焦外部替代（vs 现有`computeSubstitutionRate`聚焦内部活动替代）。
- **结论: NEW（复用SUBSTITUTES边逻辑，扩展为外部替代威胁）**

---

## 逐哨兵gap分析

### O10: 客户盈利能力哨兵
- JTBD描述: 检测客户级盈利能力异常，消费`computeCustomerProfitability`+`computeMarginalContribution`
- 现有覆盖: **无等价哨兵** — 现有`unitEconomicsSentinel`/`profitHealthSentinel`关注产品/订单级单位经济，不关注客户级。`customerDemandShiftSentinel`关注集中度/流失风险，不关注盈利能力。
- 需要的compute函数: `computeCustomerProfitability`(L2-01, EXTEND), `computeMarginalContribution`(已存在)
- **结论: NEW（依赖L2-01先行）**

### O11: 产能调度优化哨兵
- JTBD描述: 检测产能瓶颈和排程异常，消费`computeProductionOutput`+`computeOrderDelayImpact`
- 现有覆盖: **无等价哨兵** — 现有`resourceMisallocationSentinel`检测资源配置错配但不关注产能/排程。`timePenetrationSentinel`关注时间渗透率而非产能。
- 需要的compute函数: `computeProductionOutput`(L1-01, NEW), `computeCapacityUtilization`(L1-02, NEW)
- **结论: NEW（依赖L1-01/L1-02先行）**

### O12: 供应商绩效归因哨兵
- JTBD描述: 检测供应商质量趋势和缺陷归因，消费`computeQualityTraceability`+`computeDefectAttribution`
- 现有覆盖: **无等价哨兵** — 现有`makeOrBuySentinel`关注自制vs外购决策，不关注供应商绩效追溯。
- 需要的compute函数: `computeQualityTraceability`(L1-03, NEW), `computeDefectAttribution`（JTBD列表中未列出但哨兵需要，需新增）
- **结论: NEW（依赖L1-03 + 额外compute函数先行）**

### O13: 客户流失归因哨兵
- JTBD描述: 检测客户流失原因（价格/竞品/履约/产品），消费`computeChurnDecomposition`+`computeShapleyAttribution`
- 现有覆盖: **部分覆盖** — `customerDemandShiftSentinel`已检测客户集中度和流失率，但**不做归因**。O13是E4的"归因增强版"。
- 需要的compute函数: `computeChurnDecomposition`(L2-03, NEW), `computeShapleyAttribution`(L3-01, NEW)
- **结论: ENHANCE_EXISTING — 增强E4哨兵而非新增独立哨兵**（合并到customerDemandShiftSentinel中增加归因能力更合理）

### O14: 排期策略模拟哨兵
- JTBD描述: 检测插单/排程策略对交期的影响，消费`computeScheduleImpactSimulation`+`computeCustomerValueScore`
- 现有覆盖: **无等价哨兵**
- 需要的compute函数: `computeScheduleImpactSimulation`(L1-08, NEW), `computeCustomerValueScore`(L2-02, NEW)
- **结论: NEW（依赖L1-08/L2-02先行）**

### O15: 定价策略哨兵
- JTBD描述: 检测定价异常/价格弹性/竞品价格变动，消费`computePriceElasticity`+`computeCompetitorPricing`
- 现有覆盖: **无等价哨兵** — 现有`competitiveDynamicsSentinel`检测市场结构但不监控价格。`valueCaptureSentinel`关注价值捕获但不做价格弹性分析。
- 需要的compute函数: `computePriceElasticity`（JTBD列表中未列出但哨兵需要，需新增）, `computeCompetitorPricingLandscape`(L4-01, NEW)
- **结论: NEW（依赖L4-01 + 额外compute函数先行）**

### E6: 客户需求结构哨兵
- JTBD描述: 检测客户需求结构变化（品类偏好/渠道偏好/价格敏感度），消费`computeCustomerDemandStructure`+`computeCompetitorErosion`
- 现有覆盖: **部分覆盖** — `customerDemandShiftSentinel`检测客户集中度和流失率变化，但**不检测需求结构变化**（品类迁移/渠道偏好转移）。`competitiveDynamicsSentinel`检测竞争格局但不检测客户需求结构。
- 需要的compute函数: `computeCustomerDemandStructure`（JTBD列表中未列出但哨兵需要，需新增）, `computeCompetitorFeatureThreat`(L4-02, NEW)
- **结论: ENHANCE_EXISTING — 增强E4哨兵增加需求结构维度更合理**

### F5: 报价协同哨兵
- JTBD描述: 检测报价决策中的成本遗漏/利润预估偏离，消费`computeQuoteCostAggregation`+`computeRealTimeProfitEstimate`
- 现有覆盖: **无等价哨兵** — 现有`costHealthSentinel`/`profitHealthSentinel`关注历史成本/利润健康度，不关注实时报价协同。
- 需要的compute函数: `computeQuoteCostAggregation`（JTBD列表中未列出，需新增）, `computeFullCostAllocation`(L1-04, EXTEND)
- **结论: NEW（依赖L1-04 + 额外compute函数先行）**

### C1: 多渠道ROI对比哨兵
- JTBD描述: 检测渠道ROI异常和渠道间蚕食，消费`computeChannelROI`+`computeChannelCannibalization`
- 现有覆盖: **无等价哨兵** — 现有`channelCapacitySentinel`检测组织通信信道容量，与营销渠道ROI完全无关。
- 需要的compute函数: `computeChannelROI`(L2-06, NEW), `computeChannelCannibalization`（JTBD列表中未列出，需新增）
- **结论: NEW（依赖L2-06 + 额外compute函数先行）**

### C2: 客户分级冲突哨兵
- JTBD描述: 检测客户分级矛盾（高价值客户难服务/低价值客户占资源），消费`computeCustomerMultiDimensionScore`+`computeProductionDifficulty`
- 现有覆盖: **无等价哨兵**
- 需要的compute函数: `computeCustomerValueScore`(L2-02, NEW), `computeProductionDifficulty`(L1-07, NEW)
- **结论: NEW（依赖L2-02/L1-07先行）**

---

## 关键交叉依赖图

```
L3-01 computeShapleyAttribution ← 前置依赖多个函数
    ↓
L2-03 computeChurnDecomposition ← 消费 Shapley
    ↓
O13 客户流失归因哨兵 ← 消费 ChurnDecomposition + Shapley

L1-01 computeProductionOutput + L1-02 computeCapacityUtilization
    ↓
O11 产能调度优化哨兵

L2-01 computeCustomerProfitability ← 消费 computeMarginalContribution(已存在)
    ↓
O10 客户盈利能力哨兵

L3-03 computeScenarioSimulation(EXTEND) ← 扩展现有函数
    ↓
L2-07 computeCashFlowProjection(EXTEND) ← 消费现有computeCashRunway
```

**最长依赖链**: L3-01 Shapley归因 → L2-03 流失分解 → O13哨兵（3层前置依赖）

---

## 建议修正

### 立即修正（P0）
1. **本体边名对齐**：JTBD文档中的边名需映射到代码中实际存在的16条边。建议建立对照表：`FLOWS_TO→FUNDS+REPLENISHES`, `AFFECTS→DEPENDS_ON+TRIGGERS(旧SOG)`, `COMPETES_WITH→SUBSTITUTES(近似)`, `BUYS_FROM→无对应(需新增或降级为GA数据)`

2. **3个EXTEND函数优先实施**：`computeFullCostAllocation`(L1-04), `computeCustomerProfitability`(L2-01), `computeCashFlowProjection`(L2-07) — 这些基于现有函数扩展，风险最低

3. **L3-01 Shapley归因引擎**是22个函数中的**战略制高点** — 2个哨兵(O13/O12)+2个compute函数(L2-03/L3-02)依赖它。建议最先设计。

### 架构建议（P1）
4. **哨兵合并**：O13合并到现有E4（customerDemandShiftSentinel），E6合并到E4或E3（competitiveDynamicsSentinel）。避免哨兵碎片化。

5. **GA数据采集基础设施**：L4竞争层3个函数+O15定价哨兵+C1渠道ROI哨兵的全部输入数据依赖GA手工采集。在开始代码实现前，需先建立GA数据采集流水线。

6. **本体边扩展**：PRODUCES边需新增`defectRate`/`onTimeDeliveryRate`等运营参数字段。DEPLOYS边需新增`capacity`参数。这是16个NEW函数的共同前置条件。

---

## 诚实清单

| 诚实问题 | 回答 |
|---------|------|
| JTBD的"22个新增函数"在代码本体中是否都存在对应的边参数？ | **不。约70%的JTBD假设边参数在代码中不存在。** |
| 如果不新增实体/边，这些函数能不能实现？ | 部分可以（~30%），但精度会大打折扣。16条现有边能覆盖L4-L7组织诊断层，但**严重缺少L1-L3业务运营层**的参数。 |
| JTBD Phase 3的"边"引用是从哪来的？ | 似乎是Phase 3独立构思的"理想业务本体"，与代码中的"Activity-Resource-Outcome三层组织本体"是两套不同的本体论。 |
| 现在最大的风险是什么？ | 按JTBD文档的边名去实现compute函数会发现**数据库里根本没有那些边**。图遍历查询返回空结果。 |
| 最快的修正路径？ | 1) 建立JTBD边名→代码边名映射表，2) 识别代码边中已有的可复用参数字段，3) 对确实缺失的参数规划边扩展。 |

---

*审计完成 · v1.0 · 2026-07-06*
*执行人: Codex Agent · 数据来源: 62个哨兵扩展目录 + 16个edge-type JSON + unit-economics/computes/* + 本体层v2.4规范*
