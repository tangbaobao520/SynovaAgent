--- 
title: "JTBD Phase 3 — 因果信息需求 → 哨兵+Compute函数综合映射"
version: "v1.0"
date: "2026-07-06"
status: "Phase 3 综合产出"
input: "Phase 2 Part A2/B2/C/E2 因果信息需求推导 (753 ND) + 本体层最终规范 v2.4 + 去重集 v2 (177 U-JTBD)"
scope: "结构性映射——因果边聚类 → compute函数设计 → 哨兵分配 → 数据可得性评估"
constraint: "不新增实体/边，只新增compute函数和哨兵"
---

# JTBD Phase 3 — 因果信息需求 → 哨兵+Compute函数综合映射

> 本Phase不逐条处理177个U-JTBD，而是做结构性聚类映射。
> 核心逻辑：因果信息需求 → 因果边参数提取 → compute函数设计 → 哨兵消费。

---

## 1. 方法论：三层映射框架

```
因果信息需求 (753 ND)
    │  聚类维度: 边类型 × 实体 × 参数 × 聚合方式 × 时间窗口
    ├── 同一因果参数，同一compute函数
    ├── 不同聚合方式 = 同一函数的不同调用参数
    └── 正交性原则: 每参数只有一个compute函数负责
        ↓
compute函数 (L4本体层查询函数)
    │  输入: 实体ID + 边类型 + 参数名 + 时间窗口 + 聚合方式 + 基准
    │  输出: 结构化计算结果 → Evidence池
        ↓
哨兵 (L3洞察层检测单元)
    │  消费: compute函数输出 + 异常检测 + 基线对比
    │  产生: SentinelFinding → SignalAggregator → ExpertDispatcher
        ↓
诊断报告 (L3输出)
```

**正交性原则（核心设计约束）**：
同一个因果参数只能由一个compute函数负责提取。不同聚合方式 = 同一函数的不同调用参数。
例如：`PRODUCES.边际贡献率` 由 `computeMarginalContribution(entityId, {window, groupBy, baseline})` 统一负责，
而不是每个U-JTBD各自实现一次"算边际贡献率"的逻辑。

---

## 2. Part 1: 因果边需求分布与聚类分析

### 2.1 边需求密度统计（来自Phase 2全量ND分析）

16条本体边在753个因果信息需求中的出现频次与聚类数量：

| 因果边 | 出现频次 | 参数聚类数 | 主要服务决策类 | 典型参数 |
|--------|---------|-----------|---------------|---------|
| **PRODUCES** | ~230 | 18 | ALLOCATE, DIAGNOSE, EVALUATE | 产出量、利润率、边际贡献、利用率、质量、产能 |
| **FLOWS_TO** | ~110 | 14 | ALLOCATE, PREDICT, CONTROL | 资金流、价值流、现金流、回款、激活率 |
| **AFFECTS** | ~102 | 12 | DIAGNOSE, PREDICT | 因果影响、归因权重、延迟效应 |
| **COMPETES_WITH** | ~80 | 8 | ALLOCATE, EVALUATE | 竞品价格、功能对比、市场份额 |
| **BUYS_FROM** | ~63 | 10 | DIAGNOSE, PREDICT, EVALUATE | 购买量、流失率、NDR、价格弹性 |
| **DEPENDS_ON** | ~46 | 7 | ALLOCATE, NEGOTIATE | 依赖强度、替代难度、关系重要性 |
| **CONSUMES** | ~37 | 6 | ALLOCATE, OPERATION | 资源消耗、工时分配、渠道成本 |
| COUPLES | ~28 | 5 | DIAGNOSE, DESIGN | 耦合强度、飞轮健康度 |
| SIGNAL_TRANSMITS | ~18 | 4 | DIAGNOSE | 信号保真度、偏差 |
| METRIC_BINDS | ~15 | 4 | DIAGNOSE | 度量偏离、博弈敏感度 |
| INCENTIVE_BINDS | ~10 | 3 | DIAGNOSE | 激励错位度 |
| EXPANSION_BRAKES | ~8 | 2 | CONTROL | 制动存在性、延迟 |
| CAPITAL_ALLOCATES | ~6 | 2 | ALLOCATE | 资本配置效率 |
| ASSET_LOCKS | ~5 | 2 | DIAGNOSE | 资产锁死度 |
| CUMULATIVE_LEARNING | ~3 | 2 | PREDICT | 学习曲线斜率 |
| COGNITIVE_FRICTION | ~2 | 1 | DIAGNOSE | 认知摩擦系数 |

### 2.2 聚类方法论：从ND到compute函数

聚类规则：
- **相同边 × 相同参数 × 相同实体** → 同一compute函数
- **相同边 × 相同参数 × 不同实体** → 同一compute函数，不同entityId入参
- **相同边 × 相同参数 × 不同聚合方式** → 同一compute函数，不同aggregation选项
- **不同边 × 不同参数** → 不同compute函数

**关键发现**：753个ND在参数层面收敛为约110个独立因果参数。
通过正交性进一步合并，收敛为约**45-55个compute函数**。
这证明了"逐条处理177个U-JTBD"是完全不必要的——177个U-JTBD消费的是同一个compute函数池。

### 2.3 "7层参数层"聚类架构

因果信息需求在参数层面可聚类为7个compute函数层：

| 参数层 | 边覆盖 | 估计compute函数数 | 特征 |
|--------|--------|------------------|------|
| **L1 产出与效率** | PRODUCES, CONSUMES | ~14 | 可量化的"产出/消耗"指标 |
| **L2 价值流转** | FLOWS_TO, BUYS_FROM | ~12 | 资金/客户/价值的流动 |
| **L3 因果推断** | AFFECTS, DEPENDS_ON | ~8 | 归因权重、延迟效应 |
| **L4 竞争参照** | COMPETES_WITH | ~6 | 外部对标计算 |
| **L5 结构健康** | COUPLES, SIGNAL_TRANSMITS, METRIC_BINDS, INCENTIVE_BINDS | ~7 | 组织内部结构参数 |
| **L6 资本与配置** | CAPITAL_ALLOCATES, EXPANSION_BRAKES, ASSET_LOCKS | ~5 | 资本维度 |
| **L7 认知与学习** | CUMULATIVE_LEARNING, COGNITIVE_FRICTION | ~3 | 组织认知参数 |

---

## 3. Part 2: 哨兵 → Compute函数分配矩阵

### 3.1 现有哨兵覆盖度分析

现有哨兵体系（~62个扩展目录，含~47个活跃哨兵适配器）已经覆盖了大部分L4-L7参数层。
但L1-L3（产出/价值/因果）存在显著缺口——这些恰好是177个U-JTBD需求最密集的领域。

| 哨兵域 | 现有哨兵数 | 覆盖参数层 | 缺口 |
|--------|-----------|-----------|------|
| **市场/外部** (E字头) | ~6 | L4竞争参照 | E1-E5基本覆盖，缺"客户需求结构变化检测" |
| **组织/内部** (O字头) | ~9 | L5结构健康 | O1-O9覆盖好，缺"跨部门协作摩擦度量" |
| **财务/资本** (F字头) | ~6 | L6资本配置 | F1-F4覆盖较好，缺"客户级盈利能力" |
| **运营/产出** | ~5 | L1产出效率 | 严重不足——大量PRODUCES需求无哨兵对接 |
| **客户/价值** | ~4 | L2价值流转 | 不足——BUYS_FROM/FLOWS_TO需求覆盖不到40% |
| **因果/归因** | ~2 | L3因果推断 | 严重不足——AFFECTS/DEPENDS_ON需求基本无哨兵 |
| **专项领域** | ~15 | 混合 | unit-economics/talent-density等专项覆盖好 |
| **合计** | **~47** | | **缺口集中在L1-L3** |

### 3.2 哨兵消费compute函数的标准模式

```
哨兵.check(context)
  ├── computeXxx(entityId, window, groupBy, baseline)  → 获取原始计算值
  ├── 基线对比（自适应基线、行业基线、趋势基线）
  ├── 异常判定（Z-Score > 2σ、CUSUM偏离、断层检测）
  └── 产出SentinelFinding {severity, evidence, suggestion}
```

### 3.3 新增哨兵需求清单

基于Phase 2因果信息需求缺口，建议新增以下哨兵：

| 新增哨兵ID | 名称 | 消费的compute函数 | 服务决策类 | 优先级 |
|-----------|------|------------------|-----------|--------|
| **O10** | 客户盈利能力哨兵 | compute.customerProfitability, compute.marginalContribution | ALLOCATE, EVALUATE | P0 |
| **O11** | 产能调度优化哨兵 | compute.productionSchedule, compute.orderDelayImpact | ALLOCATE | P0 |
| **O12** | 供应商绩效归因哨兵 | compute.supplierQualityTrend, compute.defectAttribution | DIAGNOSE | P1 |
| **O13** | 客户流失归因哨兵 | compute.churnDecomposition, compute.shapleyAttribution | DIAGNOSE | P0 |
| **O14** | 排期策略模拟哨兵 | compute.schedulingSimulation, compute.customerValueScore | ALLOCATE | P1 |
| **O15** | 定价策略哨兵 | compute.priceElasticity, compute.competitorPricing | ALLOCATE | P1 |
| **E6** | 客户需求结构哨兵 | compute.customerDemandStructure, compute.competitorErosion | MARKET | P1 |
| **F5** | 报价协同哨兵 | compute.quoteCostAggregation, compute.realTimeProfitEstimate | EVALUATE | P1 |
| **C1** | 多渠道ROI对比哨兵 | compute.channelROI, compute.channelCannibalization | ALLOCATE | P1 |
| **C2** | 客户分级冲突哨兵 | compute.customerMultiDimensionScore, compute.productionDifficulty | DESIGN | P2 |

---

## 4. Part 3: 建议的新compute函数清单

### 4.1 设计原则

1. **正交性**：每个因果参数只由一个compute函数负责
2. **可组合**：compute函数可被多个哨兵组合消费
3. **图遍历**：每个compute函数基于L4本体层的图遍历引擎执行
4. **时间原生**：所有compute函数支持 `window` 参数（3m/6m/12m/24m）
5. **降级传播**：数据不足时返回 `degraded: true`

### 4.2 L1 产出与效率层（新增 ~8个）

**L1-01: computeProductionOutput** (新增)
- 消费边: PRODUCES
- 图遍历: `Activity → [PRODUCES] → ResourcePool(产出)`
- 参数: outputVolume, outputValue, yieldRate, defectRate
- 时间约束: 实时(<5m) 到 月(<4h)
- 服务JTBD: ALLOCATE(Customer/Operation), DIAGNOSE(Customer/Product)
- 与现有关系: 部分被 computeBreakEven/computeMarginalContribution 消费，但缺少独立的"产出量/产出值"查询

**L1-02: computeCapacityUtilization** (新增)
- 消费边: PRODUCES, CONSUMES
- 图遍历: `Operation → [PRODUCES] → ResourcePool(产能)` + `Operation → [CONSUMES] → ResourcePool(工时)`
- 参数: utilizationRate, availableCapacity, bottleneckId, overtimeRatio
- 时间约束: 实时(<5m)
- 服务JTBD: ALLOCATE(Customer), CONTROL(Operation)
- 与现有关系: 新功能——现有compute函数无"产能利用率"查询

**L1-03: computeQualityTraceability** (新增)
- 消费边: PRODUCES
- 图遍历: `Product → [PRODUCES] → 质量问题` → 反向追溯 Supplier/Operation/Resource
- 参数: defectBatchTrace, cpkByLine, iqcMissRate, attributionProbability
- 时间约束: 周(<1h)
- 服务JTBD: DIAGNOSE(Customer/Product)
- 与现有关系: 全新——质量问题追溯是高频需求（U-JTBD-0081及4个等价变体）

**L1-04: computeFullCostAllocation** (新增)
- 消费边: PRODUCES, CONSUMES
- 图遍历: `Product/Order → [PRODUCES] → ResourcePool(成本)` + 驱动因素分摊
- 参数: fullyLoadedCost, directCost, indirectCostShare, returnCost, specialRequirementCost
- 时间约束: 周(<1h) 到 月(<4h)
- 服务JTBD: EVALUATE(Customer/Product), ALLOCATE(Customer)
- 与现有关系: 扩展现有 computeVariableCosts/computeMarginalContribution——增加完整分摊逻辑

**L1-05: computeMaterialAvailability** (新增)
- 消费边: PRODUCES, FLOWS_TO
- 图遍历: `Product → [DEPENDS_ON] → Supplier → [PRODUCES] → 物料`
- 参数: bomCompleteDate, earliestAvailableDate, criticalPathMaterial, inventoryCoverage
- 时间约束: 实时(<5m)
- 服务JTBD: ALLOCATE(Customer/Operation)
- 与现有关系: 新功能——现有的computeCashRunway聚焦资金而非物料齐套

**L1-06: computeOperationPerformance** (新增)
- 消费边: PRODUCES
- 图遍历: `Operation → [PRODUCES] → 履约指标`
- 参数: onTimeDeliveryRate, qualityPassRate, complaintCount, delayPenalty
- 时间约束: 周(<1h)
- 服务JTBD: DIAGNOSE(Customer), EVALUATE(Customer)
- 与现有关系: 新功能——履约/交货表现是最频繁的DIAGNOSE需求之一

**L1-07: computeProductionDifficulty** (新增)
- 消费边: PRODUCES, COUPLES
- 图遍历: `Product/Order → [COUPLES] → Operation` 提取工艺难度
- 参数: changeoverCount, minOrderQuantity, specialProcessRatio, difficultyScore
- 时间约束: 月(<4h)
- 服务JTBD: DESIGN(Customer), EVALUATE(Customer)
- 与现有关系: 全新——"好不好做"的量化是为客户分级服务的

**L1-08: computeScheduleImpactSimulation** (新增)
- 消费边: AFFECTS, PRODUCES
- 图遍历: `Order(急单) → [AFFECTS] → Order(被延期)` 模拟连锁影响
- 参数: delayChain, penaltyEstimate, capacityRecoveryPlan
- 时间约束: 实时(<5m)
- 服务JTBD: ALLOCATE(Customer), CONTROL(Operation)
- 与现有关系: 全新——插单影响模拟是制造业高频需求

### 4.3 L2 价值流转层（新增 ~7个）

**L2-01: computeCustomerProfitability** (新增)
- 消费边: PRODUCES, FLOWS_TO
- 图遍历: `Customer → [BUYS_FROM] → Order → [FLOWS_TO] → 利润`
- 参数: cumulativeProfitMargin, profitContribution, revenueShare, costToServe
- 时间约束: 周(<1h) 到 月(<4h)
- 服务JTBD: EVALUATE(Customer), ALLOCATE(Customer)
- 与现有关系: 新功能——现有的computeGrossMarginPerUnit聚焦产品而非客户

**L2-02: computeCustomerValueScore** (新增)
- 消费边: PRODUCES, DEPENDS_ON, FLOWS_TO
- 图遍历: `Customer → [PRODUCES → 利润] + [DEPENDS_ON → 关系] + [FLOWS_TO → 战略价值]`
- 参数: profitScore, strategicImportance, growthPotential, compositeScore
- 时间约束: 月(<4h)
- 服务JTBD: DESIGN(Customer), ALLOCATE(Customer), EVALUATE(Customer)
- 与现有关系: 新功能——客户分级的综合评分算法

**L2-03: computeChurnDecomposition** (新增)
- 消费边: BUYS_FROM, AFFECTS, COMPETES_WITH
- 图遍历: `Customer → [BUYS_FROM] → 下单量时序` + 关联竞品/产品使用/履约
- 参数: orderVolumeTrend, ndrDecomposition, churnAttributionWeights
- 时间约束: 周(<1h) 到 月(<4h)
- 服务JTBD: DIAGNOSE(Customer)
- 与现有关系: 消费现有 computeCustomerChurnRisk（提供风险分数），新增分解归因能力

**L2-04: computeAccountReceivableRisk** (新增)
- 消费边: FLOWS_TO, DEPENDS_ON
- 图遍历: `Customer → [FLOWS_TO] → 账期数据`
- 参数: overdueHistory, overdueDaysP90, creditRiskScore, industryCreditTrend
- 时间约束: 周(<1h)
- 服务JTBD: ALLOCATE(Customer)
- 与现有关系: 新功能——账期/回款风险评估

**L2-05: computeCustomerMigration** (新增)
- 消费边: BUYS_FROM, COMPETES_WITH
- 图遍历: `Customer → [BUYS_FROM] → 品类购买` + `[COMPETES_WITH] → 竞品替代`
- 参数: switchingCostEstimate, competitorMigrationRate, winBackProbability
- 时间约束: 月(<4h)
- 服务JTBD: ALLOCATE(Customer), DIAGNOSE(Customer)
- 与现有关系: 扩展 computeCustomerChurnRisk——增加竞品转向检测

**L2-06: computeChannelROI** (新增)
- 消费边: FLOWS_TO, CONSUMES
- 图遍历: `Channel → [FLOWS_TO] → 销售收入` + `[CONSUMES] → 营销成本`
- 参数: channelRevenue, channelCost, roi, paybackPeriod, cannibalizationRate
- 时间约束: 月(<4h)
- 服务JTBD: ALLOCATE(Channel)
- 与现有关系: 新功能——渠道ROI对比

**L2-07: computeCashFlowProjection** (新增)
- 消费边: FLOWS_TO
- 图遍历: `各实体 → [FLOWS_TO] → 应收/应付/库存变动`
- 参数: cashInflow, cashOutflow, netCashPosition, runwayMonths
- 时间约束: 周(<1h)
- 服务JTBD: PREDICT(Resource), CONTROL(Operation)
- 与现有关系: 扩展现有 computeCashRunway——从"静态跑道"升级为"动态现金流预测"

### 4.4 L3 因果推断层（新增 ~4个）

**L3-01: computeShapleyAttribution** (新增)
- 消费边: AFFECTS
- 图遍历: `事件 → [AFFECTS] → 结果` 多因素解耦
- 参数: factorContributions, shapleyValues, confidenceIntervals
- 时间约束: 月(<4h)
- 服务JTBD: DIAGNOSE(Customer/Product/Resource)
- 与现有关系: 全新——Shapley值归因是多因素诊断的核心引擎

**L3-02: computeCausalSequence** (新增)
- 消费边: AFFECTS, DEPENDS_ON
- 图遍历: 时序因果链追溯（First-Mover Principle）
- 参数: earliestDeviation, causalOrder, rootCauseProbability
- 时间约束: 周(<1h)
- 服务JTBD: DIAGNOSE(all), PREDICT(all)
- 与现有关系: 新功能——因果层级排序引擎

**L3-03: computeScenarioSimulation** (扩展现有)
- 消费边: AFFECTS, PRODUCES, FLOWS_TO
- 图遍历: 蒙特卡洛反事实模拟
- 参数: optimistic, baseline, pessimistic scenarios; sensitivityMatrix
- 时间约束: 月(<4h)
- 服务JTBD: DESIGN, ALLOCATE, PREDICT
- 与现有关系: 扩展现有 computeScenarioSimulation——增加蒙特卡洛和多因素联动

**L3-04: computeInterventionEffect** (新增)
- 消费边: AFFECTS
- 图遍历: `干预标记 → [AFFECTS] → 指标变化` 准实验因果推断
- 参数: effectSize, significanceLevel, prePostDiff, syntheticControl
- 时间约束: 月(<4h)
- 服务JTBD: EVALUATE, CONTROL
- 与现有关系: 新功能——干预效果量化评估（需求来自GA标记的干预事件）

### 4.5 L4 竞争参照层（新增 ~3个）

**L4-01: computeCompetitorPricingLandscape** (新增)
- 消费边: COMPETES_WITH
- 图遍历: `Market → [COMPETES_WITH] → 竞品价格数据`
- 参数: priceRangeP10_P50_P90, priceGapToSelf, priceTrend, discountDepth
- 时间约束: 周(<1h)
- 服务JTBD: ALLOCATE(Customer/Market), EVALUATE
- 与现有关系: 全新——竞品价格全景（非单点比较）

**L4-02: computeCompetitorFeatureThreat** (新增)
- 消费边: COMPETES_WITH
- 图遍历: `Market → [COMPETES_WITH] → 功能对比`
- 参数: featureOverlapScore, featureGap, threatLevel, upgradeVelocity
- 时间约束: 月(<4h)
- 服务JTBD: DIAGNOSE(Customer), EVALUATE(Product)
- 与现有关系: 新功能——竞品功能威胁度量化

**L4-03: computeSubstitutionRisk** (新增)
- 消费边: COMPETES_WITH, BUYS_FROM
- 图遍历: `Customer → [BUYS_FROM] → 我方` vs `Market → [COMPETES_WITH] → 替代品`
- 参数: substitutionElasticity, switchingCostBarrier, priceAdvantageRatio
- 时间约束: 月(<4h)
- 服务JTBD: ALLOCATE, EVALUATE, DIAGNOSE
- 与现有关系: 新功能——替代威胁量化（不同于单点竞品比较）

### 4.6 汇总：新增compute函数清单

| 编号 | 函数名 | 参数层 | 新增/修改 | 优先度 |
|------|--------|--------|----------|--------|
| L1-01 | computeProductionOutput | L1产出 | **新增** | P0 |
| L1-02 | computeCapacityUtilization | L1产出 | **新增** | P0 |
| L1-03 | computeQualityTraceability | L1产出 | **新增** | P1 |
| L1-04 | computeFullCostAllocation | L1产出 | **新增** | P0 |
| L1-05 | computeMaterialAvailability | L1产出 | **新增** | P1 |
| L1-06 | computeOperationPerformance | L1产出 | **新增** | P0 |
| L1-07 | computeProductionDifficulty | L1产出 | **新增** | P2 |
| L1-08 | computeScheduleImpactSimulation | L1产出 | **新增** | P1 |
| L2-01 | computeCustomerProfitability | L2价值 | **新增** | P0 |
| L2-02 | computeCustomerValueScore | L2价值 | **新增** | P0 |
| L2-03 | computeChurnDecomposition | L2价值 | **新增** | P0 |
| L2-04 | computeAccountReceivableRisk | L2价值 | **新增** | P1 |
| L2-05 | computeCustomerMigration | L2价值 | **新增** | P1 |
| L2-06 | computeChannelROI | L2价值 | **新增** | P0 |
| L2-07 | computeCashFlowProjection | L2价值 | **新增** | P1 |
| L3-01 | computeShapleyAttribution | L3因果 | **新增** | P0 |
| L3-02 | computeCausalSequence | L3因果 | **新增** | P1 |
| L3-03 | computeScenarioSimulation | L3因果 | **修改/扩展** | P0 |
| L3-04 | computeInterventionEffect | L3因果 | **新增** | P2 |
| L4-01 | computeCompetitorPricingLandscape | L4竞争 | **新增** | P1 |
| L4-02 | computeCompetitorFeatureThreat | L4竞争 | **新增** | P2 |
| L4-03 | computeSubstitutionRisk | L4竞争 | **新增** | P1 |

**总计：22个compute函数（21新增 + 1扩展修改）**

---

## 5. 现有compute函数复用分析

以下现有compute函数已经被Phase 2需求充分验证，无需修改，可直接服务U-JTBD：

### 5.1 单元经济层（直接满足 ~30个U-JTBD的因果信息需求）

| 现有函数 | 覆盖的典型ND | 说明 |
|---------|-------------|------|
| `computeMarginalContribution` | ND-013-B, ND-022-A, ND-080-C | 边际贡献率——ALLOCATE类高频需求 |
| `computeBreakEven` | ND-013-B, ND-122-D | 盈亏平衡——报价决策核心 |
| `computeGrossMarginPerUnit` | ND-011-D, ND-121-A | 单位毛利——盈利能力分解 |
| `computeLtvCacRatio` | ND-010-B, ND-017-A | LTV/CAC比——客户获取效率 |
| `computeFixedCostRigidity` | ND-013-A, ND-122-C | 固定成本刚性——产能决策 |
| `computeVariableCosts` | ND-013-B, ND-122-A | 变动成本分解——BOM级成本 |

### 5.2 客户/市场层

| 现有函数 | 覆盖的典型ND | 说明 |
|---------|-------------|------|
| `computeCustomerChurnRisk` | ND-079-A, ND-082-A | 流失风险——需要配合新增的分解归因 |
| `computeCustomerConcentration` | ND-012-C | 客户集中度——依赖风险评估 |
| `computeCompetitiveIntensity` / `hhiIndex` | ND-011-A, ND-079-C | 竞争强度——外部参照 |
| `computeLifecycleStage` / `computeOpportunityWindowScore` | 间接 | 产业周期——所有边的顶层约束 |

### 5.3 资本/财务层

| 现有函数 | 覆盖的典型ND | 说明 |
|---------|-------------|------|
| `computeRoicWaccSpread` | ND-012-D (间接) | 资本效率——F3哨兵核心 |
| `computeCashRunway` | ND-012-D (间接) | 现金跑道——生存评估 |
| `computeDebtEquityRatio` / `computeInterestCoverage` | ND-012-B (间接) | 债务结构——账期决策外参照 |
| `computeCashConversionRate` / `computeCashConversionCycle` | FLOWS_TO类需求 | 现金流转化——F4哨兵 |

### 5.4 组织健康层

| 现有函数 | 覆盖的典型ND | 说明 |
|---------|-------------|------|
| `computeOrgRepairability` / `computeProblemActionCycle` | 间接（DIAGNOSE类） | 组织修复力——O8哨兵 |
| `computePowerRigidity` / `computeFinkelsteinPowerIndex` | 间接 | 权力结构——O9哨兵 |
| `computeInfoDistortion` / `computeIncentiveAlignment` | 间接 | 信号失真/激励对齐——O3/O7哨兵 |

---

## 6. Part 4: 数据可得性分析

### 6.1 全量ND数据源覆盖度统计

| 数据源类别 | ND数量 | 占比 | 含义 |
|-----------|--------|------|------|
| **自动可得** | 287 | 38% | 已有系统可直接提取（ERP/MES/CRM/产品分析） |
| **企业补充** | 355 | 47% | 需接入企业系统但接口存在（成本核算/工时/质检） |
| **GA手工采集** | 111 | 15% | 需人工（竞品情报/客户访谈/公开数据） |

**解读**：38%自动可得 + 47%企业补充（需系统对接）= **85%的因果信息需求可通过技术手段获取**。
15%的GA手工缺口集中于竞品情报、客户关系主观评分、谈判底牌推断——这些都是无法自动化的"人类判断"。

### 6.2 新增compute函数的数据可得性分级

| 分级 | 函数 | 说明 |
|------|------|------|
| **A: 自动可得** | computeProductionOutput, computeCapacityUtilization, computeOperationPerformance, computeMarginalContribution, computeBreakEven, computeCashConversionCycle | ERP/MES直出 |
| **B: 企业补充（需对接）** | computeFullCostAllocation, computeQualityTraceability, computeCustomerProfitability, computeAccountReceivableRisk, computeChannelROI, computeMaterialAvailability, computeProductionDifficulty, computeCustomerValueScore | 需成本核算/质检/CRM深度对接 |
| **C: 混合（自动+GA手工）** | computeChurnDecomposition, computeCustomerMigration, computeScheduleImpactSimulation, computeCashFlowProjection, computeShapleyAttribution, computeScenarioSimulation | 自动计算 + GA确认归因假设 |
| **D: GA手工为主** | computeCompetitorPricingLandscape, computeCompetitorFeatureThreat, computeSubstitutionRisk, computeInterventionEffect | 竞品数据依赖GA采集 |

### 6.3 数据可得性提升路径

| 优先级 | 行动 | 影响范围 |
|--------|------|---------|
| **P0** | 完成ERP/MES/CRM/成本核算系统对接 | A+B类函数落地，覆盖 ~65% ND |
| **P1** | 建立竞品情报自动采集流水线（电商抓取+招聘分析+专利监控） | C类函数精度提升，D类部分自动化 |
| **P2** | GA干预标记标准化（定义干预事件模板） | computeInterventionEffect精准度，因果推断升级 |
| **P3** | NLP情感分析模块（飞书/钉钉/邮件沟通） | SIGNAL_TRANSMITS和COGNITIVE_FRICTION软信号补充 |

---

## 7. 实施路线图

### 7.1 阶段划分

```
Phase 3a (Week 1-2): L1产出层 — 8个compute函数 + O10/O11/O12哨兵
Phase 3b (Week 3-4): L2价值层 — 7个compute函数 + O13/O15/C1哨兵
Phase 3c (Week 5-6): L3因果层 — 4个compute函数 + O14/E6/F5哨兵
Phase 3d (Week 7-8): L4竞争层 — 3个compute函数 + C2哨兵
```

### 7.2 与现有哨兵体系的集成策略

- **不替换现有哨兵**：新增compute函数作为现有哨兵的"新数据源"
- **不修改现有compute函数签名**：新增函数独立存在，通过SentinelRegistry统一管理
- **铁律遵守**：不新增实体/边，不跨层调用，遵循L3→L4→L5架构边界

---

## 8. 总结

### 8.1 关键数字

| 指标 | 数值 |
|------|------|
| 输入因果信息需求 | 753 ND |
| 收敛为因果参数 | ~110 个独立参数 |
| 进一步收敛为compute函数 | 22 新增 + ~90 现有复用 |
| 新增哨兵 | 10 个 |
| 自动/技术可得率 | ~85% |
| U-JTBD覆盖率 | ~65% 新增函数覆盖高频需求，35%由现有函数覆盖 |

### 8.2 设计决策记录

1. **为什么不定177条映射**：753个ND在参数层高度收敛，逐条映射是重复劳动。22个compute函数可覆盖高频参数需求，低频需求可通过通用查询API（computeByEdgeParam）处理。
2. **为什么L1层新增最多**：Phase 2数据显示PRODUCES是最密集的边（~230次），而现有compute函数偏重L4-L7组织诊断而非L1-L3业务运营。这是刻意的——现有哨兵体系来自"死亡案例"驱动的防御边，现在需要"JTBD"驱动的业务边。
3. **正交性如何保证**：每个compute函数有唯一的 `(edgeType, paramName, entityType)` 三元组作为key。pre-commit新增check-compute-orthogonality.sh检测重复。
4. **为什么不新增实体/边**：本体层16边10实体的收敛是5阶段递进研究的结果（27案例验证+7位专家评审），新增实体/边的成本远高于新增compute函数。

---

*Phase 3 综合映射方案 · v1.0 · 2026-07-06*
*下一阶段: Phase 4 — compute函数详细设计（每个函数的入参/出参/图查询路径/降级策略）*
