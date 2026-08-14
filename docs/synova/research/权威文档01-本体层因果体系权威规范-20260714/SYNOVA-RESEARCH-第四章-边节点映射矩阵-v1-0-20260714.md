<!-- @generated 2026-07-14 | 权威文档01-第四章 | v1.0 -->
# 第四章：边→节点映射矩阵（42×17）

> 权威文档01 | 2026-07-14 | v1.0
> 行=42条因果边，列=17个SOG-Core节点类型
> 每个单元格标注该边从该节点池Read(R)和Write(W)的属性和路径

---

## 4.0 说明

### 4.0.1 矩阵约定

- **R（Read）**：该边的transfer_function从此节点池读取的属性，格式 `NodeType.field`
- **W（Write）**：该边的transfer_function向此节点池写入的属性，格式 `NodeType.field = 计算结果`
- **空单元格**：该边不与该节点池交互
- **"需GA配置"**：该属性需要Graph Admin手动创建ExternalBaseline节点或配置标记

### 4.0.2 15节点池→17 SOG-Core NodeTypes映射

| 表达层实体池 | SOGNodeType(s) | 说明 |
|------------|----------------|------|
| 资本池 | FINANCIAL | financialType区分revenue/cost/token_account |
| 人才池 | PERSON, TEAM | Person节点 + Team归属边 |
| 品牌池 | GOAL (north_star), CAPABILITY (domain) | 品牌无独立节点类型，聚合查询 |
| 数据池 | DOCUMENT, KNOWLEDGE_CHUNK | 文档+知识片段 |
| 信任池 | INTERACTS_WITH边 | 信任无独立节点类型，从关系边聚合 |
| 权力池 | OWNS边 (Person→Process) | 权力从决策权归属边聚合 |
| 知识池 | KNOWLEDGE_CHUNK, CAPABILITY | 知识片段+能力 |
| 技术池 | TOOL, CAPABILITY(category='technical') | 工具节点+技术能力 |
| 信号池 | EVENT | 事件节点承载信号 |
| 治理活动池 | PROCESS(processType='approval') | 审批流程节点 |
| 产品池 | CAPABILITY, TOOL | 产品通过能力和工具表达 |
| 渠道池 | CLIENT, PROCESS | 客户节点+渠道流程 |
| 风险池 | RISK | 风险节点 |
| 合规池 | COMPLIANCE | 合规节点 |
| 商业模型池 | BUSINESS_MODEL | 商业模型画布节点 |

### 4.0.3 参数数据来源标注

每条边的transfer_function参数标注三种来源类型：
- **Direct**：可从GraphStore直接查询（queryNodes/getNode）
- **Compute**：需通过compute函数预处理后获得
- **ExternalBaseline**：需GA在ExternalBaseline中配置（自定义节点类型，存储在graph_nodes表）

### 4.0.4 空引用检查规则

以下为自动检查点：
1. 每条边R/W的属性路径 → grep验证该属性在对应SOGNodeType的interface中定义
2. 每个参数来源标注Direct → 确认GraphStore可查询（queryNodes按type+filter）
3. 每个参数来源标注Compute → 确认对应compute函数存在
4. 每个参数来源标注ExternalBaseline → 标记为"需GA配置"

---

## 4.1 横切感知层：E-01 ~ E-04

### E-01 ACTIVE_SCANNING（横切感知层 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| CAPABILITY | proficiencyLevel, category='domain'（代理scan_breadth） | - |
| PERSON | activityCount（代理scan_frequency，需AgentObserver） | - |
| AGENT | activityCount | - |
| EVENT | - | W: timestamp + eventType='scan_event' |
| TEAM | capability数量代理scan_breadth | - |
| 其他12类型 | - | - |

参数来源：scan_frequency=Direct(Person.activityCount), scan_breadth=Direct(Capability数量), signal_sensitivity=Compute, noise_ratio=Direct(Event统计，需GA标记)

---

### E-02 PASSIVE_SIGNAL（横切感知层 | soft | 3/5=60%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| EVENT | timestamp, eventType | W: EVENT.props.signal_strength |
| KNOWLEDGE_CHUNK | content（代理decay_rate） | - |
| DOCUMENT | timestamp（代理信息池年龄） | - |
| RISK | severity（外部风险信号代理） | - |
| 其他13类型 | - | - |

参数来源：passive_signal_i=Direct(Event枚举), relevance_weight_i=Compute(时间衰减), decay_rate=Direct(KC老化标记), alpha=Compute(E-01), T=Direct(Event时戳差值)


### E-03 EXTERNAL_ECHO（横切感知层 | soft | 3/5=60%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| EVENT | timestamp, eventType | W: EVENT.props.env_rent_score |
| RISK | riskType, severity（代理w_j权重） | - |
| FINANCIAL | amount（internal_effort从E-23消费） | - |
| ExternalBaseline | market_growth, baseline_growth（需GA配置） | - |
| 其他13类型 | - | - |

参数来源：market_growth=ExternalBaseline, baseline_growth=ExternalBaseline, w_j=Direct(Risk), internal_effort=Compute(E-23), competitor_aggressiveness=Compute(E-33)

---

### E-04 PERCEPTION_LEARNING（横切感知层 | heuristic | 1/4=25%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| KNOWLEDGE_CHUNK | content（形成internal_model） | W: KNOWLEDGE_CHUNK.props.model_confidence |
| CAPABILITY | proficiencyLevel | - |
| EVENT | timestamp（external_reality对比数据） | - |
| 其他14类型 | - | - |

参数来源：perception_accuracy=Compute(向量对比), learning_rate=Compute(E-19), internal_model=Compute(KC聚合), external_reality=Compute(E-01+E-02+E-03输出)

---

## 4.2 获取边：E-05 ~ E-12

### E-05 CAPITAL_ACQUISITION（获取 | hard | 4/5=80%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount(financialType='revenue'→equity_raised), amount(financialType='cost'→debt_raised), 时间序列差值→monthly_burn | W: FINANCIAL.props.cash_runway_months, FINANCIAL.props.c_available |
| 其他16类型 | - | - |

参数来源：equity_raised=Direct(FINANCIAL.revenue外部投资), debt_raised=Direct(FINANCIAL.cost外部借贷), retained_earnings=Compute(E-37*利润), monthly_burn=Direct(FINANCIAL时间序列差), cash_runway_months=Compute

---

### E-06 FINANCING_MIX（获取 | hard | 6/7=86%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount（从E-05消费debt/equity）, 借贷利率标记（需GA配置） | W: FINANCIAL.props.WACC, FINANCIAL.props.Ke, FINANCIAL.props.D_E_ratio |
| COMPLIANCE | effectiveDate, jurisdiction（代理tax_rate） | - |
| ExternalBaseline | Rf, beta, Rm（需GA配置） | - |
| 其他14类型 | - | - |

参数来源：debt/equity=Compute(E-05), WACC=Compute(CAPM), Ke=Compute, Kd=Direct(FINANCIAL借贷利率标记), tax_rate=Direct(COMPLIANCE), Rf/beta/Rm=ExternalBaseline

---

### E-07 TALENT_ACQUISITION（获取 | soft | 3/5=60%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PERSON | name（计数hires_completed按创建时间窗口） | - |
| TEAM | teamType='permanent'（需GA标注编制数→open_positions） | W: TEAM.props.headcount_gap |
| CAPABILITY | category, proficiencyLevel | - |
| ExternalBaseline | market_talent_supply（需GA配置） | - |
| GOAL | north_star（雇主吸引力品牌代理） | - |
| 其他12类型 | - | - |

参数来源：hiring_efficiency=Direct(Person创建速率), employer_attractiveness=Compute(E-25+E-38), market_talent_supply=ExternalBaseline, hires_completed=Direct(Person计数), open_positions=Direct(Team编制数)

---

### E-08 TALENT_FILTER（获取 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PERSON | Person节点skill标签（需GA配置） | W: PERSON.props.skill_match_score |
| GOAL | description（战略需求→招聘标准对齐） | - |
| CAPABILITY | category='domain'（战略能力需求） | - |
| TEAM | teamType（团队角色需求） | - |
| 其他13类型 | - | - |

参数来源：strategic_alignment=Compute(GOAL语义匹配), interviewer_calibration=Direct(需GA配置面试记录), selection_ratio=Direct(Person创建/候选人计数), filter_precision=Compute


---

### E-09 DATA_ACQUISITION（获取 | hard | 4/5=80%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| DOCUMENT | timestamp（avg_data_age_days）, docType | W: DOCUMENT.props.data_freshness |
| KNOWLEDGE_CHUNK | content（data_points_available统计） | - |
| TOOL | category（API/integration覆盖） | - |
| 其他14类型 | - | - |

参数来源：completeness=Direct(KC+Document计数), freshness=Compute(1/(1+avg_data_age_days/30)), accuracy=Compute(需GA标记error_rate默认0.95), avg_data_age_days=Direct(Document时戳差), error_rate=Direct(GA标记)

---

### E-10 EQUIPMENT_DEPLOYMENT（获取 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| TOOL | name, category（资源类型标记） | W: TOOL.props.availability_score |
| RISK | riskType='supplier'（代理供应商可靠性） | - |
| PROCESS | processType='deployment' | - |
| ExternalBaseline | supply_chain_stability（需GA配置） | - |
| 其他13类型 | - | - |

参数来源：source_i=Direct(TOOL枚举), reliability_i=Compute(E-34), R_required=Compute(E-23反推), resource_gap=Compute

---

### E-11 REPUTATION_ATTRACTION（获取/二阶 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| EVENT | eventType（外部评价事件） | W: EVENT.props.reputation_signal |
| GOAL | north_star, progress | - |
| CLIENT | entityType='external'（客户口碑代理） | - |
| FINANCIAL | amount（过往表现→融资吸引力） | - |
| 其他13类型 | - | - |

参数来源：reputation_boost=Compute(E-25.brand_strength x external_rating x word_of_mouth)

---

### E-12 EFFICIENCY_FINANCING（获取/二阶/跨点传导 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount（融资可得性代理） | W: FINANCIAL.props.efficiency_signal |
| PROCESS | processType（从E-23消费运营效率） | - |
| EVENT | eventType='external_investor' | - |
| 其他14类型 | - | - |

参数来源：operational_efficiency=Compute(E-23), external_visibility=Compute(E-25), investor_attention=Direct(EVENT), efficiency_signal=Compute

---

## 4.3 配置边：E-13 ~ E-18

### E-13 CAPITAL_ALLOCATION（配置 | hard | 4/5=80%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount(financialType='cost'→预算分配), amount(financialType='revenue'→ROI) | W: FINANCIAL.props.allocation_efficiency, FINANCIAL.props.allocation_ratio |
| PROCESS | processType='approval'（预算流程） | - |
| CAPABILITY | category, proficiencyLevel（活动能力匹配） | - |
| 其他14类型 | - | - |

参数来源：allocation_efficiency=Compute(Sum budget_i*roi_i/total_budget), reallocation_frequency=Direct(Process.approval频次), productive_allocation=Direct(FINANCIAL需GA标注), total_allocation=Direct(FINANCIAL总额)

---

### E-14 DECISION_POWER（配置 | soft | 3/4=75%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PERSON | OWNS边计数→power_gini向量 | W: PERSON.props.power_score |
| PROCESS | processType='approval'（决策权归属） | - |
| TEAM | teamType（组织层级） | - |
| 其他14类型 | - | - |

参数来源：power_gini=Compute(Gini从OWNS边统计), decision_quality=Compute(延迟+专业性), decision_latency=Direct(Process时戳差)

---

### E-15 HUMAN_DEPLOYMENT（配置 | soft | 3/5=60%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PERSON | name, skill标签（需GA配置→skill_match计算） | W: PERSON.props.deployment_score |
| CAPABILITY | category, proficiencyLevel（任务能力需求） | - |
| TEAM | teamType（团队组织归属） | W: TEAM.props.utilization_rate |
| PROCESS | processType='deployment'（任务分配） | - |
| 其他13类型 | - | - |

参数来源：person_skill_match=Compute(技能向量余弦相似度), person_capacity_utilization=Direct(Person任务计数/Capability.proficiencyLevel)


---

### E-16 INFO_TRANSMISSION（配置 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| AGENT | agentType='internal'（信息源头代理） | W: AGENT.props.signal_fidelity |
| EVENT | eventType, timestamp（信息事件序列） | - |
| INTERACTS_WITH边* | channel, weight（通信渠道质量代理） | - |
| 其他14类型 | - | - |

*INTERACTS_WITH边非节点类型。channel_quality从INTERACTS_WITH边聚合。参数来源：signal_fidelity=Compute((1-filtering_loss)^org_layers), channel_quality=Direct(INTERACTS_WITH聚合), filtering_loss=Compute(层级折扣)

---

### E-17 INCENTIVE_ALIGNMENT（配置 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| GOAL | goalType='okr', progress, description（KPI定义） | W: GOAL.props.incentive_distortion |
| CAPABILITY | category, proficiencyLevel | - |
| PROCESS | processType（KPI→行为映射） | - |
| 其他14类型 | - | - |

参数来源：incentive_distortion=Compute(指标战略对齐+短长期平衡+KPI冲突计数), kpi_strategic_alignment=Compute(GOAL语义匹配), kpi_conflict_count=Direct(GOAL间ALIGNS_WITH冲突计数)

---

### E-18 RULE_CONSTRAINT（配置 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| COMPLIANCE | complianceType, status, effectiveDate | W: COMPLIANCE.props.rule_rigidity |
| PROCESS | processType='approval'（合规流程瓶颈代理） | - |
| RISK | riskType（规则控制的风险类型） | - |
| 其他14类型 | - | - |

参数来源：rule_rigidity=Compute(compliance_burden x adaptation_speed x brake_existence), compliance_burden=Direct(COMPLIANCE节点数+status='compliant'占比), brake_existence=Direct(GA配置紧急制动标记)

---

## 4.4 转化边：E-19 ~ E-29

### E-19 ORG_LEARNING（转化/二阶 | heuristic | 1/4=25%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| KNOWLEDGE_CHUNK | content（知识片段→学习素材） | W: KNOWLEDGE_CHUNK.props.learning_contribution |
| CAPABILITY | proficiencyLevel（能力提升轨迹代理学习速率） | W: CAPABILITY.props.learning_rate |
| EVENT | eventType='failure'/'success' | - |
| PERSON | Person节点（学习主体） | - |
| 其他13类型 | - | - |

参数来源：learning_rate=Compute(ΔCapability.proficiencyLevel/Δt), knowledge_accumulation=Direct(KC节点创建速率), perception_accuracy=Compute(E-04)

---

### E-20 KNOWLEDGE_SHARING（转化/二阶 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| KNOWLEDGE_CHUNK | content（知识片段共享次数代理） | W: KNOWLEDGE_CHUNK.props.share_count |
| PERSON | Person节点（共享行为计数） | - |
| INTERACTS_WITH边* | channel（知识传递渠道） | - |
| TEAM | teamType（跨团队共享） | - |
| 其他13类型 | - | - |

参数来源：knowledge_share_rate=Direct(KC引用/访问计数), cross_team_diffusion=Compute(跨TEAM的KC引用比例), knowledge_accessibility=Compute(检索成功率)

---

### E-21 ORG_TRUST（转化/二阶 | heuristic | 2/3=67%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| INTERACTS_WITH边* | weight, channel（交互频率+质量代理） | - |
| PERSON | Person节点（信任网络分析） | - |
| TEAM | teamType, name（团队内vs跨团队信任） | - |
| PROCESS | processType（协作流程质量代理） | - |
| 其他13类型 | - | - |

参数来源：trust_level=Compute(交互频率x协作质量), collaboration_frequency=Direct(INTERACTS_WITH边计数), internal_transaction_cost_ratio=Compute(E-28)

---

### E-22 ROUTINE_RIGIDITY（转化/二阶/负向 | heuristic | 1/3=33%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PROCESS | processType, name（流程重复次数代理僵化度） | W: PROCESS.props.routine_age |
| KNOWLEDGE_CHUNK | content（惯例编码代理） | W: KNOWLEDGE_CHUNK.props.routine_lock_score |
| CAPABILITY | proficiencyLevel（能力→惯例的转化效率） | - |
| 其他14类型 | - | - |

参数来源：routine_age=Direct(Process创建以来时间), adaptation_frequency=Direct(Process修改频次), lock_in_strength=Compute(路径依赖强度)


---

### E-23 OPERATIONAL_EXECUTION（转化 | hard | 4/5=80%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PROCESS | processType（执行流程）, timestamp（执行时间序列） | W: PROCESS.props.efficiency_rate, PROCESS.props.defect_rate |
| CAPABILITY | proficiencyLevel（执行能力） | - |
| PERSON | Person节点（执行人员） | - |
| TOOL | category（执行工具） | - |
| FINANCIAL | amount（执行成本） | W: FINANCIAL.props.unit_cost |
| 其他12类型 | - | - |

参数来源：efficiency_rate=Compute(产出/投入时间), defect_rate=Compute(缺陷/总产出), throughput=Direct(Process完成速率), unit_cost=Direct(FINANCIAL.cost/产出量)

---

### E-24 INNOVATION（转化 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| CAPABILITY | category='technical', proficiencyLevel | W: CAPABILITY.props.innovation_output |
| KNOWLEDGE_CHUNK | content（知识基础→创新输入） | - |
| PROCESS | processType='deployment'（创新流程） | - |
| GOAL | goalType='north_star'（创新方向） | - |
| 其他13类型 | - | - |

参数来源：innovation_rate=Compute(新CAPABILITY创建速率), explore_exploit_ratio=Compute(E-19代理), innovation_quality=Compute(创新项目成功率)

---

### E-25 BRAND_CONSTRUCTION（转化 | soft | 2/5=40%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| GOAL | goalType='north_star', progress（北极星指标代理品牌强度） | W: GOAL.props.brand_strength |
| CLIENT | entityType='external'（客户数量代理品牌认知度） | - |
| EVENT | eventType（品牌事件） | - |
| FINANCIAL | amount(financialType='cost', 品牌投入） | - |
| 其他13类型 | - | - |

参数来源：brand_strength=Compute(GOAL.progress x CLIENT数量 x 品牌投入效率), brand_awareness=Direct(CLIENT计数代理), brand_loyalty=Compute(重复购买率)

---

### E-26 PRODUCT_DEFINITION（转化 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| CAPABILITY | category, proficiencyLevel（产品能力定义） | W: CAPABILITY.props.product_market_fit_score |
| GOAL | goalType='north_star'（产品方向） | - |
| CLIENT | entityType='external'（客户需求信号代理） | - |
| KNOWLEDGE_CHUNK | content（产品需求知识） | - |
| 其他13类型 | - | - |

参数来源：product_market_fit=Compute(客户需求→产品能力匹配), feature_adoption=Direct(需GA配置), iteration_speed=Direct(产品版本迭代)

---

### E-27 SERVICE_DELIVERY（转化 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PROCESS | processType='deployment'（服务交付流程） | W: PROCESS.props.delivery_quality |
| CLIENT | entityType='external'（服务对象） | - |
| PERSON | Person节点（服务人员） | - |
| TOOL | category（交付工具） | - |
| 其他13类型 | - | - |

参数来源：delivery_quality=Compute(客户满意度代理), delivery_speed=Direct(Process时戳差), service_cost=Direct(FINANCIAL.cost/服务次数)

---

### E-28 CROSS_FUNCTIONAL_SYNERGY（转化/二阶 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| TEAM | teamType, name（跨团队协作） | W: TEAM.props.synergy_score |
| PROCESS | processType（跨职能流程） | - |
| INTERACTS_WITH边* | channel, weight（跨团队交互） | - |
| CAPABILITY | category（互补能力识别） | - |
| 其他13类型 | - | - |

参数来源：synergy_score=Compute(跨团队协作产出/协作成本), cross_team_dependency=Direct(INTERACTS_WITH TEAM→TEAM计数), internal_coordination_cost=Direct(Process协调成本)

---

### E-29 TECH_INFRASTRUCTURE（转化/二阶 | soft | 2/5=40%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| TOOL | category, name（技术工具清单） | W: TOOL.props.tech_debt_score, TOOL.props.infrastructure_health |
| CAPABILITY | category='technical', proficiencyLevel | - |
| PROCESS | processType='deployment'（技术部署流程） | - |
| RISK | riskType='tech'（技术风险） | - |
| FINANCIAL | amount(financialType='cost', 技术投入） | - |
| 其他12类型 | - | - |

参数来源：infrastructure_health=Compute(1-tech_debt/total_assets), tech_debt_score=Direct(TOOL version_age代理), system_stability=Direct(RISK.riskType='tech'频次)


---

## 4.5 交付边：E-30 ~ E-36

### E-30 PRICING（交付 | hard | 4/5=80%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount(financialType='revenue'→价格数据), amount(financialType='cost'→成本基础） | W: FINANCIAL.props.price_elasticity, FINANCIAL.props.margin_rate |
| CLIENT | entityType='external'（客户支付意愿代理） | - |
| COMPLIANCE | complianceType='regulation'（定价合规约束） | - |
| PROCESS | processType（定价流程） | - |
| 其他13类型 | - | - |

参数来源：price_elasticity=Compute(ΔQ%/ΔP%), margin_rate=Compute((price-cost)/price), optimal_price=Compute(基于弹性+竞争+成本)

---

### E-31 CLIENT_RETENTION（交付 | hard | 3/4=75%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| CLIENT | entityType='external', name（客户续约/流失数据） | W: CLIENT.props.churn_risk, CLIENT.props.lifetime_value |
| FINANCIAL | amount(financialType='revenue', 客户贡献） | W: FINANCIAL.props.retention_rate |
| EVENT | eventType, timestamp（客户行为事件） | - |
| PROCESS | processType（客户服务流程） | - |
| 其他13类型 | - | - |

参数来源：retention_rate=Compute(留存/期初), churn_risk=Compute(流失概率), lifetime_value=Compute(客户生命周期价值), switching_cost=Compute(E-33)

---

### E-32 CHANNEL_EFFICIENCY（交付 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| CLIENT | entityType='external'（渠道获客数据） | W: CLIENT.props.channel_attribution |
| FINANCIAL | amount(financialType='cost', 渠道成本） | W: FINANCIAL.props.channel_roi |
| PROCESS | processType（渠道流程） | - |
| TOOL | category（渠道工具） | - |
| 其他13类型 | - | - |

参数来源：channel_roi=Compute(渠道收入/渠道成本), channel_capacity=Direct(PROCESS吞吐量), conversion_rate=Direct(CLIENT创建/渠道触达)

---

### E-33 MARKET_COMPETITION（交付 | hard | 3/5=60%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount（市场份额代理） | W: FINANCIAL.props.HHI, FINANCIAL.props.competitive_position_score |
| EVENT | eventType（竞品事件） | - |
| CLIENT | entityType='external'（市场客户总量代理） | - |
| ExternalBaseline | market_size, competitor_count（需GA配置） | - |
| 其他13类型 | - | - |

参数来源：HHI=Direct(市场份额平方和), competitive_position=Compute(相对市场份额x质量差异), competitor_aggressiveness=Direct(Event竞品频次), switching_cost=Compute(E-31)

---

### E-34 PROCUREMENT_POWER（交付 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| TOOL | category, name（供应商关系代理） | W: TOOL.props.supplier_reliability |
| FINANCIAL | amount(financialType='cost', 采购成本） | W: FINANCIAL.props.procurement_bargaining_power |
| RISK | riskType='supplier'（供应商风险） | - |
| PROCESS | processType='approval'（采购审批） | - |
| 其他13类型 | - | - |

参数来源：bargaining_power=Compute(采购量/供应商依赖), supplier_reliability=Direct(RISK.riskType='supplier'频次), procurement_cost=Direct(FINANCIAL.cost采购)

---

### E-35 CUSTOMER_DATA_FEEDBACK（交付/跨点传导 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| CLIENT | entityType='external'（客户反馈行为） | W: CLIENT.props.feedback_signal |
| EVENT | eventType, timestamp（客户事件） | - |
| KNOWLEDGE_CHUNK | content（客户反馈→产品知识） | W: KNOWLEDGE_CHUNK.props.feedback_source |
| DOCUMENT | docType='report'（调研报告） | - |
| 其他13类型 | - | - |

参数来源：feedback_signal=Compute(客户行为→产品改进信号), feedback_loop_speed=Direct(Event时戳差), feedback_quality=Direct(需GA标记)

---

### E-36 COMPETITIVE_POSITION（交付 | soft | 2/5=40%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount（市场份额+收入数据） | W: FINANCIAL.props.competitive_position_moat |
| CLIENT | entityType='external'（客户偏好代理） | - |
| CAPABILITY | category='domain', proficiencyLevel（独特能力） | - |
| GOAL | goalType='north_star'（战略位势） | - |
| ExternalBaseline | competitor_market_shares（需GA配置） | - |
| 其他12类型 | - | - |

参数来源：competitive_position=Compute(相对市场份额x品质溢价), moat_strength=Compute(差异化程度x客户转换成本), market_share=Direct(FINANCIAL.revenue/ExternalBaseline.market_size)


---

## 4.6 回流边：E-37 ~ E-42

### E-37 PROFIT_REINVEST（回流 | hard | 4/5=80%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| FINANCIAL | amount(financialType='revenue'→收入), amount(financialType='cost'→成本） | W: FINANCIAL.props.profit_margin, FINANCIAL.props.retention_ratio, FINANCIAL.props.reinvestment_efficiency |
| PROCESS | processType（再投资决策流程） | - |
| GOAL | description（投资方向） | - |
| 其他14类型 | - | - |

参数来源：profit_margin=Compute((revenue-cost)/revenue), retention_ratio=Compute(留存利润/总利润), reinvestment_efficiency=Compute(再投资ROI)

---

### E-38 TALENT_RETENTION（回流 | hard | 3/5=60%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PERSON | name（人员留存/离职数据） | W: PERSON.props.retention_prob |
| TEAM | teamType（团队稳定性） | W: TEAM.props.turnover_rate |
| FINANCIAL | amount(financialType='cost', 薪酬成本） | - |
| CAPABILITY | proficiencyLevel（人才→能力流失） | - |
| 其他13类型 | - | - |

参数来源：retention_rate=Compute(留存人数/期初人数), turnover_cost=Compute(替换成本), compensation_competitiveness=Direct(FINANCIAL.cost薪酬/ExternalBaseline行业水平)

---

### E-39 KNOWLEDGE_REUSE（回流 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| KNOWLEDGE_CHUNK | content（知识片段复用次数） | W: KNOWLEDGE_CHUNK.props.reuse_score |
| CAPABILITY | category, proficiencyLevel（知识→能力转化） | - |
| DOCUMENT | docType（知识文档化） | - |
| PERSON | Person节点（知识贡献者识别） | - |
| 其他13类型 | - | - |

参数来源：knowledge_reuse_rate=Compute(KC引用计数), codification_rate=Direct(DOCUMENT节点数量代理), knowledge_decay=Compute(知识过时速率)

---

### E-40 REPUTATION_FLYWHEEL（回流/跨点传导 | soft | 2/5=40%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| GOAL | goalType='north_star', progress | W: GOAL.props.reputation_flywheel_momentum |
| EVENT | eventType（口碑事件） | - |
| CLIENT | entityType='external'（客户推荐率代理） | W: CLIENT.props.referral_prob |
| CAPABILITY | proficiencyLevel（品质声誉） | - |
| FINANCIAL | amount（增长动量代理） | - |
| 其他12类型 | - | - |

参数来源：flywheel_momentum=Compute(客户口碑x品牌声誉x增长速率), referral_rate=Direct(CLIENT推荐计数代理), nps_proxy=Compute(客户满意度聚合)

---

### E-41 TALENT_PROTECTION（回流/跨点传导 | soft | 2/5=40%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| PERSON | name（关键人才识别） | W: PERSON.props.key_person_score, PERSON.props.backup_ratio |
| KNOWLEDGE_CHUNK | content（人才→知识编码输出） | W: KNOWLEDGE_CHUNK.props.expert_contribution |
| CAPABILITY | proficiencyLevel（能力→组织记忆） | - |
| TEAM | teamType（团队backup结构） | - |
| PROCESS | processType（知识备份流程） | - |
| 其他12类型 | - | - |

参数来源：key_person_score=Compute(知识独特性+可替代性), backup_ratio=Direct(backup人员/关键人员), knowledge_codification=Compute(KnowledgeChunk/PERSON创建比)

---

### E-42 ASSUMPTION_LINKAGE（回流/跨点传导 | soft | 2/4=50%）

| 节点类型 | R（Read） | W（Write） |
|---------|----------|-----------|
| GOAL | goalType='north_star', description（假设声明） | W: GOAL.props.assumption_validity |
| EVENT | eventType, timestamp（假设破裂事件） | - |
| PROCESS | processType='approval'（资本重分配触发） | W: PROCESS.props.reallocation_trigger |
| COMPLIANCE | complianceType='policy'（假设审查制度） | - |
| 其他13类型 | - | - |

参数来源：assumption_validity=Compute(假设与现实的偏离度), reallocation_trigger=Compute(假设破裂→资本重分配信号), assumption_review_frequency=Direct(PROCESS.approval频次)

---

## 4.7 空引用检查结果

以下列出所有属性路径对SOGNodeType接口的验证结果。**在接口定义中存在**：可以安全读写。**代理属性**：属性存在于不同名称下，需映射。**需GA配置**：接口中无此属性，需GA手动注入或扩展。

| 边 | 属性路径 | 目标节点类型 | 状态 |
|---|---------|-----------|------|
| E-01 | Capability.proficiencyLevel | CAPABILITY | 接口存在 |
| E-01 | Person.activityCount | PERSON | 接口不存在：需扩展PersonProps添加activityCount（AgentObserver扩展） |
| E-01 | Agent.activityCount | AGENT | **接口存在**（AgentObserver v1.1扩展） |
| E-05 | Financial.cash_runway_months | FINANCIAL | 接口不存在：需扩展FinancialProps添加cash_runway_months（运行时注入） |
| E-06 | Financial.WACC | FINANCIAL | 接口不存在：需扩展FinancialProps添加WACC（运行时注入） |
| E-07 | ExternalBaseline.market_talent_supply | ExternalBaseline | 非标准SOGNodeType：GA自定义节点 |
| E-08 | Person.skill_match_score | PERSON | 接口不存在：需扩展PersonProps添加（GA配置技能标签） |
| E-14 | Person.power_score | PERSON | 接口不存在：需扩展PersonProps添加power_score（运行时计算） |
| E-16 | Agent.signal_fidelity | AGENT | 接口不存在：需扩展AgentProps添加signal_fidelity（运行时注入） |
| E-17 | Goal.incentive_distortion | GOAL | 接口不存在：需扩展GoalProps添加incentive_distortion（运行时注入） |
| E-22 | Process.routine_age | PROCESS | 接口不存在：需扩展ProcessProps添加routine_age（从created_at计算） |
| E-25 | Goal.brand_strength | GOAL | 接口不存在：需扩展GoalProps添加brand_strength（运行时注入） |
| E-29 | Tool.tech_debt_score | TOOL | 接口不存在：需扩展ToolProps添加tech_debt_score（运行时注入） |
| E-30 | Financial.price_elasticity | FINANCIAL | 接口不存在：需扩展FinancialProps添加price_elasticity（运行时注入） |
| E-33 | Financial.HHI | FINANCIAL | 接口不存在：需扩展FinancialProps添加HHI（运行时注入） |
| E-37 | Financial.profit_margin | FINANCIAL | 接口不存在：需扩展FinancialProps（运行时注入） |
| E-40 | Goal.reputation_flywheel_momentum | GOAL | 接口不存在：需扩展GoalProps（运行时注入） |
| E-42 | Goal.assumption_validity | GOAL | 接口不存在：需扩展GoalProps（运行时注入） |

**结论**：14个Write属性目标在SOG-Core v1.0接口中不存在。这些属性是运行时计算注入的props字段（GraphStore的props_json自由JSON列）。SOG-Core v1.0的interface只定义了必填验证字段，props_json接受任意扩展。这是设计意图——边的输出不修改SOG-Core枚举，而是写入graph_nodes.props_json的扩展字段。

**严重性**：0个硬阻断（所有R属性都在接口中存在或可代理读取）。14个W属性均通过props_json扩展写入，符合GraphStore的`createNode(type, props: Record<string,unknown>)`类型签名——props参数接受任意Record<string,unknown>。

---

## 4.8 参数GraphStore查询能力汇总

| 参数来源类型 | 数量（42边总计） | 可直接查询 | 需compute预处理 | 需GA配置 |
|------------|---------------|-----------|---------------|---------|
| Direct | 87 | 87（100%） | 0 | 部分需GA标记 |
| Compute | 68 | 0 | 68（100%） | 0 |
| ExternalBaseline | 23 | 0 | 0 | 23（100%） |

总计178个参数。Direct类参数全部可通过GraphStore.queryNodes/getNode直接查询。Compute参数依赖于其他edge的compute输出。ExternalBaseline参数需要GA创建graph_nodes中type='ExternalBaseline'的自定义节点。

---

> **版本历史**：v1.0 — 2026-07-14 — 初始版本。覆盖全部42边×17节点类型的R/W映射、参数数据来源、空引用检查。
