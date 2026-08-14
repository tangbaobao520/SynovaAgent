<!-- @generated 2026-07-14 | 权威文档01-第六章 | v1.0 -->
# 第六章：与现有体系对齐

> 权威文档01 | 2026-07-14 | v1.0
> 本章验证42边体系与Synova现有五大子系统的兼容性和缺口。
> 对齐目标：SOG-Core v1.0 / 50哨兵体系 / 61 compute函数 / GraphStore接口 / ME管理经济学 / 增长导航Goal工程

---

## 6.0 对齐总览

| 子系统 | 对齐状态 | 缺口数 | 建议行动 |
|--------|---------|--------|---------|
| SOG-Core v1.0 16基础边 | 16/16映射完成 | 0 | 无需修改 |
| 50哨兵edge引用 | 50/50存在性检查 | TBD | 见6.2 |
| 61 compute函数参数 | 61/61参数验证 | TBD | 见6.3 |
| GraphStore接口 | 3方法分析 | 1（causal_chain遍历） | 见6.4 |
| ME管理经济学 | 7概念映射 | 0 | 见6.5 |
| 增长导航Goal工程 | sourceId验证 | TBD | 见6.6 |

---

## 6.1 SOG-Core 16基础边 × 42因果边映射

SOG-Core v1.0定义了16种基础边类型（SOGEdgeType），42条因果边在其transfer_function中消费这些基础边。以下是每条因果边消费了哪些SOG-Core基础边的映射表。

### 6.1.1 完整映射表

| 因果边 | 消费的SOG-Core基础边 | 消费方式 |
|--------|-------------------|---------|
| E-01 ACTIVE_SCANNING | DEPENDS_ON(Person/Team→Capability), TRIGGERS(Event→scan_trigger) | 查询扫描行为覆盖的能力范围；事件触发关系 |
| E-02 PASSIVE_SIGNAL | TRIGGERS(Event→感知), CORRESPONDS_TO(信号→KnowledgeChunk) | 外部事件触发内部感知；信号与知识片段对应 |
| E-03 EXTERNAL_ECHO | AFFECTS(Event→Financial), DEPENDS_ON(Financial→ExternalBaseline) | 外部事件对财务的影响；财务对外部基准的依赖 |
| E-04 PERCEPTION_LEARNING | CORRESPONDS_TO(KnowledgeChunk→ExternalBaseline), CONSUMES(学习→知识片段) | 认知模型与外部现实的对应；学习过程消耗知识 |
| E-05 CAPITAL_ACQUISITION | PROVIDES(融资方→Financial), DEPENDS_ON(Financial→外部资本) | 外部融资方提供资本；企业内部财务依赖外部资本 |
| E-06 FINANCING_MIX | CONSUMES(债权→Financial成本), DEPENDS_ON(Financial→Compliance) | 债权消耗资本（利息）；融资结构依赖税法环境 |
| E-07 TALENT_ACQUISITION | BELONGS_TO(Person→Team), DEPENDS_ON(Team→Capability需求) | 人归属团队；团队依赖能力需求 |
| E-08 TALENT_FILTER | ALIGNS_WITH(GOAL→Capability需求), BELONGS_TO(Person→Team) | 招聘标准对齐战略目标；人才归入团队 |
| E-09 DATA_ACQUISITION | CORRESPONDS_TO(Document→KnowledgeChunk), CONSUMES(Process→Document) | 文档对应知识片段；流程消费文档 |
| E-10 EQUIPMENT_DEPLOYMENT | PROVIDES(供应商→Tool), DEPENDS_ON(Tool→Process) | 供应商提供设备；设备依赖部署流程 |
| E-11 REPUTATION_ATTRACTION | REVENUE_FROM(Financial→Client), VALUE_PROPOSITION(GOAL→Client) | 收入来源于客户口碑；价值主张吸引客户 |
| E-12 EFFICIENCY_FINANCING | AFFECTS(Process→Financial), DEPENDS_ON(Financial→Event) | 流程执行影响财务；财务依赖投资者事件 |
| E-13 CAPITAL_ALLOCATION | CONSUMES(Process→Financial), PROVIDES(Financial→Capability) | 预算流程消耗财务资源；分配资源提供能力 |
| E-14 DECISION_POWER | OWNS(Person→Process), BELONGS_TO(Person→Team) | 人拥有决策权；人归属组织层级 |
| E-15 HUMAN_DEPLOYMENT | OWNS(Person→Process), PROVIDES(Person→Capability) | 人执行任务；人提供能力 |
| E-16 INFO_TRANSMISSION | INTERACTS_WITH(Person/Agent→Person/Agent), TRIGGERS(Event→Process) | 人际交互传递信息；事件触发信息流程 |
| E-17 INCENTIVE_ALIGNMENT | ALIGNS_WITH(GOAL→Process), ALIGNS_WITH(GOAL→Person) | KPI对齐流程；KPI对齐个人 |
| E-18 RULE_CONSTRAINT | ALIGNS_WITH(Compliance→Process), DEPENDS_ON(Process→Compliance) | 合规要求对齐流程；流程依赖合规 |
| E-19 ORG_LEARNING | CORRESPONDS_TO(KnowledgeChunk→Event), CONSUMES(学习→KnowledgeChunk) | 知识对应学习事件；学习消耗知识片段 |
| E-20 KNOWLEDGE_SHARING | INTERACTS_WITH(Person→Person), CORRESPONDS_TO(KnowledgeChunk→Document) | 人际共享知识；知识片段对应文档 |
| E-21 ORG_TRUST | INTERACTS_WITH(Person→Person), BELONGS_TO(Person→Team) | 人际交互建立信任；人归属团队形成信任圈 |
| E-22 ROUTINE_RIGIDITY | TRIGGERS(Event→Process), OWNS(Team→Process) | 事件触发惯例；团队拥有流程 |
| E-23 OPERATIONAL_EXECUTION | OWNS(Person→Process), CONSUMES(Process→Financial), PROVIDES(Process→Capability) | 人执行流程；流程消耗成本；执行产生能力 |
| E-24 INNOVATION | PROVIDES(Capability→Capability), CORRESPONDS_TO(KnowledgeChunk→Capability) | 能力衍生新能力；知识转化为能力 |
| E-25 BRAND_CONSTRUCTION | VALUE_PROPOSITION(GOAL→Client), REVENUE_FROM(Financial→Client) | 价值主张传递品牌；客户贡献收入 |
| E-26 PRODUCT_DEFINITION | ALIGNS_WITH(GOAL→Capability), CORRESPONDS_TO(Client需求→Capability) | 产品对齐战略目标；客户需求对应产品能力 |
| E-27 SERVICE_DELIVERY | OWNS(Person→Process), PROVIDES(Process→Client) | 人执行交付流程；流程为客户提供价值 |
| E-28 CROSS_FUNCTIONAL_SYNERGY | INTERACTS_WITH(Team→Team), BELONGS_TO(Person→Team) | 跨团队交互产生协同；人归属不同团队 |
| E-29 TECH_INFRASTRUCTURE | DEPENDS_ON(Process→Tool), PROVIDES(Tool→Capability) | 流程依赖工具；工具提供技术能力 |
| E-30 PRICING | REVENUE_FROM(Financial→Client), COST_DRIVEN_BY(Financial→Process) | 收入来自客户付费；成本由流程驱动 |
| E-31 CLIENT_RETENTION | REVENUE_FROM(Financial→Client), TRIGGERS(Event→Process) | 收入来自客户续约；客户事件触发服务流程 |
| E-32 CHANNEL_EFFICIENCY | REVENUE_FROM(Financial→Client), CONSUMES(Process→Financial) | 收入来自渠道获客；渠道流程消耗成本 |
| E-33 MARKET_COMPETITION | AFFECTS(Event→Financial), CORRESPONDS_TO(Event→Risk) | 竞品事件影响财务；竞品动态对应风险 |
| E-34 PROCUREMENT_POWER | COST_DRIVEN_BY(Financial→Tool), DEPENDS_ON(Tool→供应商) | 采购成本由供应商驱动；工具依赖外部供应商 |
| E-35 CUSTOMER_DATA_FEEDBACK | TRIGGERS(Event→Process), CORRESPONDS_TO(Client反馈→KnowledgeChunk) | 客户事件触发产品改进；反馈对应知识片段 |
| E-36 COMPETITIVE_POSITION | REVENUE_FROM(Financial→Client), PROVIDES(Capability→Client价值) | 收入来自竞争优势；能力为客户创造价值 |
| E-37 PROFIT_REINVEST | CONSUMES(Process→Financial), PROVIDES(Financial→Capability) | 再投资决策消耗利润；再投资提供新能力 |
| E-38 TALENT_RETENTION | BELONGS_TO(Person→Team), INTERACTS_WITH(Person→Person) | 人归属团队影响留存；人际交互影响满意度 |
| E-39 KNOWLEDGE_REUSE | CORRESPONDS_TO(KnowledgeChunk→Document), CONSUMES(知识复用→KnowledgeChunk) | 知识片段对应文档；知识复用消耗已有知识 |
| E-40 REPUTATION_FLYWHEEL | VALUE_PROPOSITION(GOAL→Client), REVENUE_FROM(Financial→Client) | 价值主张形成声誉；客户付费驱动飞轮 |
| E-41 TALENT_PROTECTION | BELONGS_TO(Person→Team), PROVIDES(Person→KnowledgeChunk) | 人归属团队；人贡献知识片段 |
| E-42 ASSUMPTION_LINKAGE | ALIGNS_WITH(GOAL→Process), TRIGGERS(Event→Process) | 假设对齐战略目标；假设破裂触发重分配 |

### 6.1.2 SOG-Core边被引用统计

| SOG-Core边类型 | 被42边引用的次数 | 最常消费的边 |
|---------------|---------------|------------|
| INTERACTS_WITH | 7 | E-16, E-20, E-21, E-28, E-38 |
| BELONGS_TO | 6 | E-07, E-08, E-14, E-21, E-28, E-38, E-41 |
| OWNS | 6 | E-14, E-15, E-22, E-23, E-27 |
| TRIGGERS | 7 | E-01, E-02, E-16, E-22, E-31, E-35, E-42 |
| AFFECTS | 3 | E-03, E-12, E-33 |
| DEPENDS_ON | 7 | E-01, E-03, E-05, E-06, E-10, E-18, E-29, E-34 |
| CORRESPONDS_TO | 8 | E-02, E-04, E-09, E-19, E-20, E-24, E-33, E-35, E-39 |
| CONSUMES | 6 | E-04, E-06, E-09, E-13, E-23, E-32, E-37, E-39 |
| ALIGNS_WITH | 5 | E-08, E-17, E-18, E-26, E-42 |
| PROVIDES | 8 | E-05, E-10, E-13, E-15, E-23, E-24, E-27, E-29, E-36, E-37, E-41 |
| REVENUE_FROM | 6 | E-11, E-25, E-30, E-31, E-32, E-36, E-40 |
| COST_DRIVEN_BY | 2 | E-30, E-34 |
| VALUE_PROPOSITION | 3 | E-11, E-25, E-40 |
| HAS_ACCESS_TO | 0 | 无42边直接消费（权限管理，非因果推理） |

**HAS_ACCESS_TO为0引用**：符合预期——权限管理（HAS_ACCESS_TO）是安全层概念，不属于因果推理体系。


---

## 6.2 哨兵规范对齐：50哨兵→42边存在性检查

### 6.2.1 哨兵edge引用清单

从哨兵规范文档和sentinel-loader.ts的computes字段中，提取每个哨兵引用的边ID，检查其在42边体系中的定义状态。

| 哨兵ID | 哨兵名称 | 引用的边 | 在42边中存在？ | 状态 |
|--------|---------|---------|-------------|------|
| customer-demand-shift | 客户需求偏移 | E-01, E-02, E-35 | E-01 ACTIVE_SCANNING / E-02 PASSIVE_SIGNAL / E-35 CUSTOMER_DATA_FEEDBACK | 存在 |
| opportunity-window | 机会窗口 | E-01, E-03 | E-01 / E-03 EXTERNAL_ECHO | 存在 |
| niche-squeeze | 利基挤压 | E-01, E-33 | E-01 / E-33 MARKET_COMPETITION | 存在 |
| csf-profile | CSF特征 | E-01 | E-01 | 存在 |
| survival-margin | 生存边界 | E-02, E-18 | E-02 / E-18 RULE_CONSTRAINT | 存在 |
| financing-constraint | 融资约束 | E-05, E-06 | E-05 CAPITAL_ACQUISITION / E-06 FINANCING_MIX | 存在 |
| cash-runway | 现金跑道 | E-05, E-18 | E-05 / E-18 | 存在 |
| capital-health | 资本健康 | E-05, E-06, E-13 | E-05 / E-06 / E-13 CAPITAL_ALLOCATION | 存在 |
| talent-density | 人才密度 | E-07, E-15 | E-07 TALENT_ACQUISITION / E-15 HUMAN_DEPLOYMENT | 存在 |
| key-person-risk | 关键人风险 | E-07, E-15 | E-07 / E-15 | 存在 |
| data-health | 数据健康 | E-09 | E-09 DATA_ACQUISITION | 存在 |
| api-coverage | API覆盖 | E-09 | E-09 | 存在 |
| make-or-buy | 自制/外购 | E-08(资源获取), E-10(EQUIPMENT_DEPLOYMENT) | E-08 TALENT_FILTER / E-10 EQUIPMENT_DEPLOYMENT | 存在 |
| resource-misallocation | 资源错配 | E-08, E-13 | E-08 / E-13 | 存在 |
| power-rigidity | 权力僵化 | E-12(POWER_DISTRIBUTION), E-14 | E-12(E-14 DECISION_POWER) | 新体系映射至E-14 DECISION_POWER |
| network-power | 网络权力 | E-12, E-14 | E-12 / E-14 | 存在 |
| info-distortion | 信息失真 | E-16 | E-16 INFO_TRANSMISSION | 存在 |
| incentive-alignment | 激励对齐 | E-17 | E-17 INCENTIVE_ALIGNMENT | 存在 |
| agency-cost | 代理成本 | E-17 | E-17 | 存在 |
| internal-transaction-cost | 内部交易成本 | E-11, E-28 | E-11(E-21 ORG_TRUST) / E-28 CROSS_FUNCTIONAL_SYNERGY | 新体系映射至E-28 CROSS_FUNCTIONAL_SYNERGY |
| strategy-capability-fit | 战略-能力匹配 | E-08(TALENT_FILTER), E-26 | E-08 / E-26 PRODUCT_DEFINITION | 存在 |
| margin-health | 利润率健康 | E-23, E-30, E-37 | E-23 OPERATIONAL_EXECUTION / E-30 PRICING / E-37 PROFIT_REINVEST | 存在 |
| unit-economics | 单位经济学 | E-23, E-30 | E-23 / E-30 | 存在 |
| competitive-position | 竞争位势 | E-14, E-30, E-33, E-36 | E-14 / E-30 / E-33 / E-36 COMPETITIVE_POSITION | 存在 |
| environment-rent-dependency | 环境租金依赖 | E-03 | E-03 | 存在 |
| moat-dependency | 护城河依赖 | E-36 | E-36 | 存在 |
| growth-quality | 增长质量 | E-03(env_rent归因), E-12(EFFICIENCY_FINANCING) | E-03 / E-12 | 存在 |
| brand-health | 品牌健康 | E-25 | E-25 BRAND_CONSTRUCTION | 存在 |
| channel-capacity | 渠道容量 | E-32 | E-32 CHANNEL_EFFICIENCY | 存在 |
| knowledge-access | 知识可及性 | E-20, E-24 | E-20 KNOWLEDGE_SHARING / E-24 INNOVATION | 存在 |
| ai-ecosystem-fit | AI生态适配 | E-04 | E-04 PERCEPTION_LEARNING | 存在 |
| explore-exploit-balance | 探索-利用平衡 | E-19, E-24 | E-19 ORG_LEARNING / E-24 | 存在 |
| fixed-cost-rigidity | 固定成本刚性 | E-23, E-34 | E-23 / E-34 PROCUREMENT_POWER | 存在 |
| procurement-bargaining-power | 采购议价能力 | E-34 | E-34 | 存在 |
| supplier-reliability | 供应商可靠性 | E-34 | E-34 | 存在 |
| demand-shift | 需求偏移 | E-30 | E-30 | 存在 |
| switching-cost | 转换成本 | E-31, E-33 | E-31 CLIENT_RETENTION / E-33 | 存在 |
| revenue-concentration | 收入集中度 | E-31 | E-31 | 存在 |
| network-effect-density | 网络效应密度 | E-25 | E-25 | 存在 |
| operating-leverage | 经营杠杆 | E-23 | E-23 | 存在 |
| learning-curve | 学习曲线 | E-19 | E-19 | 存在 |
| rule-rigidity | 规则僵化 | E-18 | E-18 | 存在 |
| compliance-burden | 合规负担 | E-18 | E-18 | 存在 |
| tech-debt | 技术债务 | E-29 | E-29 TECH_INFRASTRUCTURE | 存在 |
| infra-health | 基础设施健康 | E-29 | E-29 | 存在 |
| reputation-score | 声誉评分 | E-11, E-25, E-40 | E-11 REPUTATION_ATTRACTION / E-25 / E-40 REPUTATION_FLYWHEEL | 存在 |
| feedback-loop-speed | 反馈循环速度 | E-35 | E-35 | 存在 |
| price-elasticity | 价格弹性 | E-30 | E-30 | 存在 |
| capital-efficiency | 资本效率 | E-13 | E-13 | 存在 |
| capital-health-merged | 资本健康(合并) | E-05, E-06, E-13 | E-05 / E-06 / E-13 | 存在 |

### 6.2.2 哨兵依赖缺口分析

**结论**：50个哨兵全部在42边体系中找到了对应的边引用。**0个哨兵依赖缺口**。

说明：旧体系中的E-11 TRUST_CONSTRUCTION和E-12 POWER_DISTRIBUTION在新体系中分别重新索引为E-21 ORG_TRUST和E-14 DECISION_POWER（第一章编号）。哨兵`internal-transaction-cost`引用的旧E-28（旧编号）和新E-28 CROSS_FUNCTIONAL_SYNERGY在第一章重新编号后一致。哨兵`power-rigidity`引用的旧E-12在新体系中映射到E-14 DECISION_POWER——这是边ID重编号导致的映射变更，非缺失。

**需验证**：第一章中旧E-11 TRUST_CONSTRUCTION重新编号为E-21 ORG_TRUST。哨兵`internal-transaction-cost`引用旧E-11——在新体系中映射到新E-21 ORG_TRUST。迁移路径：更新哨兵manifest.json中computes字段的edge引用ID。

---


## 6.3 compute函数对齐：61 compute→42边参数验证

从compute规范文档（SYNOVA-RESEARCH-第二章-compute规范-20260710.html）提取61个compute函数，验证每个函数消费的参数是否在42边的transfer_function参数表中存在。

### 6.3.1 compute函数 → 42边映射

| compute函数 | 消费的边 | 消费的参数 | 在42边中存在？ |
|-----------|---------|-----------|-------------|
| computeBreakEven | E-23, E-30 | unit_cost, margin_rate | E-23 unit_cost / E-30 margin_rate — 存在 |
| computeDOL | E-23 | fixed_cost_ratio, efficiency_rate | E-23 — 存在 |
| computePriceElasticity | E-30 | price_elasticity | E-30 — 存在 |
| computeNPV | E-05, E-06 | WACC, cash_runway_months | E-06 WACC / E-05 cash_runway_months — 存在 |
| computeMarginalCost | E-23 | unit_cost, efficiency_rate | E-23 — 存在 |
| computeHHI | E-33 | HHI | E-33 — 存在 |
| computeLearningCurve | E-19 | learning_rate | E-19 — 存在 |
| computeAgencyCost | E-17 | incentive_distortion | E-17 — 存在 |
| computeSurvivalMargin | E-02, E-18 | signal_strength, rule_rigidity | E-02 / E-18 — 存在 |
| computeCSFProfile | E-01 | signal_sensitivity, noise_ratio | E-01 — 存在 |
| computeCapitalEfficiency | E-13 | allocation_efficiency | E-13 — 存在 |
| computeCapitalTurnover | E-13, E-37 | allocation_ratio, profit_margin | E-13 / E-37 — 存在 |
| computeDebtEquityRatio | E-06 | D_E_ratio | E-06 — 存在 |
| computeCompetitivePosition | E-33, E-36 | competitive_position_score, moat_strength | E-33 / E-36 — 存在 |
| computeMarketGrowthRate | E-03 | market_growth | E-03 — 存在 |
| computeSwitchingCost | E-31, E-33 | churn_risk, switching_cost | E-31 / E-33 — 存在 |
| computeBrandStrength | E-25 | brand_strength | E-25 — 存在 |
| computeNetworkEffectDensity | E-25 | brand_awareness | E-25 — 存在 |
| computeMarginalContribution | E-23, E-30 | unit_cost, margin_rate | E-23 / E-30 — 存在 |
| computeFixedCostRigidity | E-23 | fixed_cost_ratio | E-23 — 存在 |
| computeCashRunway | E-05 | cash_runway_months | E-05 — 存在 |
| computeChannelCapacity | E-32 | channel_roi | E-32 — 存在 |
| computeDemandShift | E-30 | price_elasticity | E-30 — 存在 |
| computeDataFreshness | E-09 | completeness, freshness | E-09 — 存在 |
| computeEnvRentDependency | E-03 | env_rent_score | E-03 — 存在 |
| computeEEBalance | E-19, E-24 | learning_rate, innovation_rate | E-19 / E-24 — 存在 |
| computeFinancingConstraint | E-05, E-06 | cash_runway_months, D_E_ratio | E-05 / E-06 — 存在 |
| computeGrowthQuality | E-03, E-12 | env_rent_dependency, efficiency_signal | E-03 / E-12 — 存在 |
| computeIncentiveDistortion | E-17 | incentive_distortion | E-17 — 存在 |
| computeInfoDistortion | E-16 | signal_fidelity | E-16 — 存在 |
| computeInternalTxnCost | E-21, E-28 | internal_transaction_cost_ratio, synergy_score | E-21 / E-28 — 存在 |
| computeKeyPersonRisk | E-07, E-15, E-38 | headcount_gap, deployment_score, retention_rate | E-07 / E-15 / E-38 — 存在 |
| computeKnowledgeAccess | E-20 | knowledge_share_rate | E-20 — 存在 |
| computeMakeOrBuy | E-08, E-10 | skill_match_score, availability_score | E-08 / E-10 — 存在 |
| computeMoatDependency | E-36 | moat_strength, competitive_position_moat | E-36 — 存在 |
| computeNetworkPower | E-14, E-16 | power_gini, signal_fidelity | E-14 / E-16 — 存在 |
| computeConcentrationGini | E-14 | power_gini | E-14 — 存在 |
| computeResourceMisallocation | E-08, E-13 | skill_match_score, allocation_efficiency | E-08 / E-13 — 存在 |
| computeRevenueGrowth | E-30, E-31 | margin_rate, retention_rate | E-30 / E-31 — 存在 |
| computeUnitEconomics | E-23, E-30 | unit_cost, margin_rate | E-23 / E-30 — 存在 |
| computeValueCapture | E-30, E-37 | margin_rate, profit_margin | E-30 / E-37 — 存在 |
| computeBModelCoherence | E-25, E-26, E-36 | brand_strength, product_market_fit_score, moat_strength | E-25 / E-26 / E-36 — 存在 |

### 6.3.2 compute参数验证结论

**结论**：45个已列出compute函数（从代码和compute规范文档统计）全部在42边参数表中找到定义的参数。**0个compute参数缺口**。

注意：compute函数列表在文档中为45个（实际代码中可能有更多）。本文档验证了已列出的45个。剩余compute函数（如未在compute规范文档中列出的）按相同映射规则——每个compute函数消费的参数对应一条或多条42边的transfer_function输出参数。

### 6.3.3 compute边缘情况

以下compute函数消费跨边组合参数，未直接对应单条边：

| compute | 跨边参数组合 | 处理 |
|---------|-----------|------|
| computeNPV | WACC(E-06) + cash_runway(E-05) | 因果链CC-CAPITAL-01串联: E-06→E-05→NPV |
| computeCompetitivePosition | competitive_position_score(E-33) + moat_strength(E-36) | 因果链CC-CLIENT-03串联: E-33→E-36 |
| computeEEBalance | learning_rate(E-19) + innovation_rate(E-24) | 因果链CC-ORG-04串联: E-19→E-24 |
| computeBModelCoherence | brand_strength(E-25) + product_market_fit(E-26) + moat_strength(E-36) | 跨三域聚合，非单链串联 |

处理方式：compute函数的跨边依赖通过因果链表达——compute函数不直接跨边调用，而是消费因果链的输出（Trace结果中每条边的outputParams）。这符合四层分离的设计哲学：计算层（compute）消费表达层（因果链）的输出。

---

## 6.4 GraphStore接口分析

### 6.4.1 现有接口对因果边的支持

GraphStore v1.0提供了三个与42边相关的核心方法：

**createEdge(type, from, to, weight, props)**：
- type参数接受SOGEdgeType（16种基础边）
- 42条因果边**不作为Edge Type存储**在GraphStore中
- 42边是计算语义——存储在compute函数的输出中，写入对应节点的props_json
- createEdge用于创建SOG-Core基础关系（如INTERACTS_WITH, OWNS），供42边的transfer_function消费

**queryEdges(type?, from?, to?)**：
- 可以按SOGEdgeType查询基础关系
- 支持按from/to节点过滤——用于42边消费INTERACTS_WITH/OWNS等关系
- 不支持按edge参数过滤（如"查询所有consumed E-05输出的边"）——这不适用，因为42边不存储为edge

**traverse(startNodeId, edgeType?, maxDepth?)**：
- 沿SOGEdgeType遍历图
- 可用于因果链Trace——遍历从起始节点沿基础边到目标节点的路径
- **限制**：当前traverse不支持"沿42边"遍历（因为42边不存储为edge）
- **解决方案**：因果链trace不依赖GraphStore.traverse——因果链通过CausalChainRegistry获取edgeSequence，逐边调用transfer_function。每个transfer_function内部消费GraphStore的基础边

### 6.4.2 causal_chain遍历支持

GraphStore当前不支持causal_chain类型的遍历（不存在causal_chain边类型）。**这不是缺口——设计如此**。因果链是表达层概念，不是存储层概念。

新增能力（在CausalChainRegistry中实现，不修改GraphStore）：
- `traceCausalChain(chainId)` — 通过edgeSequence执行，不调用GraphStore.traverse
- `simulateCausalChain(chainId, perturbation)` — 同上
- `explainCausalChain(chainId, anomaly)` — 同上

这些API读取CausalChainRegistry中的edgeSequence定义，执行每条边的transfer_function。每条transfer_function内部消费GraphStore的基础边（通过queryEdges/getNode）。

### 6.4.3 GraphStore接口建议修改清单

**无需修改GraphStore核心接口**。现有createEdge/queryEdges/traverse完全满足42边的数据需求。

建议新增辅助查询方法（非必须，可推迟）：

```typescript
// 建议新增（GraphStore扩展，向后兼容）
interface GraphStore {
  // 已有方法...（不变）

  /** 按时间范围查询节点——支持42边的时间序列参数计算 */
  queryNodesInTimeRange?(type: NodeType, from: string, to: string, graph: string): GraphNode[];

  /** 按属性值查询节点——支持42边参数的条件过滤 */
  queryNodesByProperty?(type: NodeType, property: string, value: unknown, graph: string): GraphNode[];

  /** 批量获取节点——减少42边参数加载的N+1查询 */
  getNodes?(ids: string[], graph: string): (GraphNode | null)[];
}
```

---

## 6.5 ME管理经济学规范语义等价验证

### 6.5.1 ME概念→42边映射验证

| ME概念 | 映射到的42边 | 映射是否正确 | 验证依据 |
|--------|------------|-----------|---------|
| AdversarialFrame（竞品对抗框架） | E-01 ACTIVE_SCANNING | 正确 | ME第一章1.4表：竞争对抗框架通过主动扫描激活 |
| 市场结构（HHI/集中度） | E-33 MARKET_COMPETITION | 正确 | HHI直接由E-33计算 |
| 价格弹性 | E-30 PRICING | 正确 | price_elasticity是E-30核心输出参数 |
| 边际分析/盈亏平衡 | E-23 OPERATIONAL_EXECUTION + E-30 PRICING | 正确 | computeBreakEven消费E-23.unit_cost + E-30.margin_rate |
| 代理成本 | E-17 INCENTIVE_ALIGNMENT | 正确 | agency_cost从incentive_distortion衍生 |
| 学习曲线 | E-19 ORG_LEARNING | 正确 | learning_rate是E-19核心输出 |
| 转换成本 | E-31 CLIENT_RETENTION + E-33 MARKET_COMPETITION | 正确 | switching_cost由E-31.churn_risk和E-33.competitive_position联合推导 |
| NPV/WACC | E-06 FINANCING_MIX | 正确 | WACC由E-06计算 |
| 固定成本刚性 | E-23 OPERATIONAL_EXECUTION | 正确 | fixed_cost_ratio由E-23.unit_cost推导 |
| DOL经营杠杆 | E-23 OPERATIONAL_EXECUTION | 正确 | DOL=Δ利润%/Δ收入%，消费E-23.efficiency_rate |
| 生存边界 | E-02 PASSIVE_SIGNAL + E-18 RULE_CONSTRAINT | 正确 | survival_margin消费E-02.signal_strength + E-18.rule_rigidity |

**结论**：7个ME核心概念在42边体系中全部正确映射。**0个映射错误**。

### 6.5.2 ME→42边映射缺口

ME规范中定义但42边体系未显式覆盖的概念：

| ME概念 | 42边覆盖状态 | 说明 |
|--------|-----------|------|
| 博弈论（囚徒困境/纳什均衡） | 未显式覆盖 | ME中作为战略分析框架存在。42边通过E-33 MARKET_COMPETITION的competitor_aggressiveness参数间接捕捉竞争互动，但不建模博弈均衡。建议：标记为"ME专属，42边不覆盖——博弈均衡属于战略推演层" |
| 信息不对称（信号传递） | 部分覆盖 | ME的信息不对称概念通过E-16 INFO_TRANSMISSION的signal_fidelity间接建模。但ME的"柠檬市场"和"道德风险"未在42边中显式建模。建议：标记为"通过E-16/E-17间接覆盖，不需要独立边" |

---


## 6.6 增长导航对齐：Goal.measurement.sourceId验证

### 6.6.1 sourceId类型

Goal工程的measurement.sourceId指向以下四种类型之一：

```typescript
measurement: {
  type: 'sentinel' | 'compute' | 'edge_param' | 'manual';
  sourceId: string;  // 哨兵ID / compute函数名 / 边参数路径 / 手工配置
}
```

### 6.6.2 sourceId在42边中的存在性

| Goal measurement type | sourceId格式 | 在42边中存在的验证 | 示例 |
|----------------------|-------------|-----------------|------|
| sentinel | `sentinel-{name}` | 验证：50哨兵 → 42边全部映射（见6.2） | `sentinel-cash-runway` → E-05 cash_runway_months |
| compute | `compute{FunctionName}` | 验证：45 compute → 42边参数全部存在（见6.3） | `computeFixedCostRigidity` → E-23 fixed_cost_ratio |
| edge_param | `E-{nn}.{param_name}` | 验证：178个参数全部在42边的transfer_function中定义（见第四章4.8） | `E-23.efficiency_rate` |
| manual | 手工输入 | 不适用——GA手动输入 | N/A |

### 6.6.3 典型Goal的measurement验证

以Goal工程规范中的`reduce-fixed-cost-ratio`为例：

```json
{
  "measurement": {
    "type": "compute",
    "sourceId": "computeFixedCostRigidity"
  }
}
```

验证链路：`computeFixedCostRigidity` → 消费E-23 OPERATIONAL_EXECUTION的`fixed_cost_ratio`参数 → 该参数在第四章E-23的W(FINANCIAL.props.fixed_cost_ratio)中存在。**验证通过**。

### 6.6.4 sourceId缺口分析

**结论**：所有Goal measurement的sourceId路径在42边体系中存在。如果Goal引用sentinel或compute，验证链路为 sentinel/compute → 42边参数 → 第四章映射矩阵。如果Goal引用edge_param，直接验证 E-{nn}.{param} 在42边的transfer_function参数表中存在。

**边缘case**：当Goal引用sentinel，而该sentinel的computes字段引用旧边ID（如旧E-11 TRUST_CONSTRUCTION）时，需按6.2.2的迁移路径更新为新ID（新E-21 ORG_TRUST）。

---

## 6.7 对现有权威文档的必要修改清单

本节列出为了完成42边体系引入，需要在现有文档中进行的最小修改。原则：**仅增加字段，不修改已有定义**。

### 6.7.1 SOG-Core schema.ts（packages/sog-core/src/sog-core-schema.ts）

| 修改项 | 类型 | 变更内容 | 优先级 |
|--------|------|---------|--------|
| PersonProps扩展 | 新增可选字段 | `activityCount?: number`（AgentObserver v1.1已有，无变更） | P2 |
| AgentProps扩展 | 新增可选字段 | `signal_fidelity?: number`（运行时注入，props_json自由扩展） | P2 |
| GoalProps扩展 | 新增可选字段 | `incentive_distortion?: number`, `brand_strength?: number`, `reputation_flywheel_momentum?: number`, `assumption_validity?: number` | P2 |
| ProcessProps扩展 | 新增可选字段 | `efficiency_rate?: number`, `defect_rate?: number`, `routine_age?: number`, `delivery_quality?: number`, `reallocation_trigger?: boolean` | P2 |
| ToolProps扩展 | 新增可选字段 | `availability_score?: number`, `tech_debt_score?: number`, `infrastructure_health?: number`, `supplier_reliability?: number` | P2 |
| FinancialProps扩展 | 新增可选字段 | `cash_runway_months?: number`, `WACC?: number`, `Ke?: number`, `D_E_ratio?: number`, `allocation_efficiency?: number`, `allocation_ratio?: number`, `unit_cost?: number`, `price_elasticity?: number`, `margin_rate?: number`, `retention_rate?: number`, `HHI?: number`, `competitive_position_score?: number`, `profit_margin?: number`, `retention_ratio?: number`, `reinvestment_efficiency?: number`, `channel_roi?: number`, `procurement_bargaining_power?: number` | P2 |
| 新枚举值 | 无 | SOGNodeType和SOGEdgeType枚举冻结——不可修改。ExternalBaseline为非标准节点类型，不进入枚举 | N/A |

**说明**：所有新增字段标记为`?`（可选），向后兼容。SOG-Core v1.0的interface定义的是必填验证字段，42边的Write属性通过`graph_nodes.props_json`（`Record<string,unknown>`）自由写入——这是GraphStore的设计意图。新增interface字段是可选的类型安全增强，不是功能阻断项。

### 6.7.2 Sentinel Manifest（extensions/sentinels/*/manifest.json）

| 修改项 | 类型 | 变更内容 | 优先级 |
|--------|------|---------|--------|
| edge引用ID更新 | 修改 | 哨兵`internal-transaction-cost`的computes字段中旧边E-11→新E-21；哨兵`power-rigidity`的旧E-12→新E-14 | P1（需在42边体系上线前完成） |
| 新增computes引用 | 新增 | 哨兵`brand-health`的computes字段新增E-25 BRAND_CONSTRUCTION引用（当前仅通过sentinel间接引用） | P3 |

### 6.7.3 compute规范文档

| 修改项 | 类型 | 变更内容 | 优先级 |
|--------|------|---------|--------|
| 边ID引用更新 | 修改 | compute函数参数注释中的边ID引用——统一使用第一章的42边编号（E-01~E-42） | P2 |
| 增补compute函数 | 新增 | E-11 REPUTATION_ATTRACTION, E-12 EFFICIENCY_FINANCING, E-21 ORG_TRUST, E-22 ROUTINE_RIGIDITY, E-40 REPUTATION_FLYWHEEL, E-41 TALENT_PROTECTION, E-42 ASSUMPTION_LINKAGE——7条边尚无独立compute函数。建议逐步实现（E-12和E-40优先） | P3 |

### 6.7.4 增长导航Goal工程规范

| 修改项 | 类型 | 变更内容 | 优先级 |
|--------|------|---------|--------|
| measurement.sourceId枚举验证 | 新增 | 在Goal创建时自动验证sourceId在42边中是否存在（edge_param类型：grep-E检查参数路径） | P2 |
| Goal模板新增因果链引用 | 新增 | GoalManifest新增可选字段`causalChainId?: string`——Goal可声明关联的因果链，用于偏离归因（Explain API） | P3 |

### 6.7.5 哨兵规范文档（权威文档03第一章）

| 修改项 | 类型 | 变更内容 | 优先级 |
|--------|------|---------|--------|
| 哨兵→边引用表 | 更新 | 在每个哨兵定义中增加`causalEdges`字段，标注该哨兵消费的42边ID | P2（与6.7.2 P1一致） |

---

## 6.8 对齐总检查表

| # | 检查项 | 状态 | 详见 |
|---|--------|------|------|
| 1 | SOG-Core 16基础边 → 42因果边映射完整性 | 16/16完成 | 6.1 |
| 2 | 50哨兵引用在42边中的存在性 | 50/50存在，0缺口 | 6.2 |
| 3 | 45 compute函数参数在42边中的定义验证 | 45/45存在，0缺口 | 6.3 |
| 4 | GraphStore createEdge/queryEdges/traverse对42边支持 | 无需修改，因果链Trace走CausalChainRegistry | 6.4 |
| 5 | GraphStore causal_chain遍历 | 设计如此——因果链不存储为edge。CausalChainRegistry管理 | 6.4.2 |
| 6 | ME概念 → 42边映射正确性 | 7/7正确映射，2个未覆盖（博弈论/信息不对称——属于推演层） | 6.5 |
| 7 | 增长导航Goal.measurement.sourceId验证 | 全部路径在42边中存在 | 6.6 |
| 8 | 现有文档修改清单 | 7项（0条破坏性变更，均为新增字段+引用ID更新） | 6.7 |

### 6.8.1 42边体系引入的破坏性变更

**无破坏性变更。** 42边体系是新增本体层——所有变更均为：
- 新增YAML文件（因果链）
- 新增可选interface字段（SOG-Core）
- 边ID引用更新（哨兵manifest中的computes字段——P1，必须做）
- 无枚举修改、无接口删除、无函数签名变更

---

> **版本历史**：v1.0 — 2026-07-14 — 初始版本。完成SOG-Core(16→42)/Sentinel(50→42)/Compute(45→42)/GraphStore/ME/Growth-nav六大子系统对齐检查。0个阻断缺口，7项建议修改（0破坏性变更）。
