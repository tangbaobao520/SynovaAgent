# 第三章：15节点池与10表达层实体

> 权威文档01 | 2026-07-14 | v1.0
> 本章回答：企业数字孪生的实体有哪些？它们如何从存储层组装为表达层的用户可理解语义？
> 存储层 = 机器读写的最细粒度实体池（15+1个）；表达层 = 用户可理解的自然语义面（10个），通过聚合公式从存储层计算得出。
> 约束：SOGNodeType枚举值冻结（17个），只能从现有枚举中选择。新增映射不超过现有枚举范围。

---

## 零、四层分离中的本章位置

```
表达层  10个实体（本章第三/四部分）—— 用户可理解的自然语言语义
         | 消费计算层结果，生成可解释的传导路径
编排层  Playbook + Skill（依赖表达层实体作为参数节点）
         | 按触发条件执行边序列
计算层  42条因果边（依赖存储层节点池读取属性）
         | transfer_function计算，输出置信度
存储层  15+1节点池（本章第一/二部分）—— 机器读写的实体状态
         | SOG-Core v1.0: 17节点类型 + 16边类型
```

**核心原则**：表达层不直接触碰存储层。表达层实体通过聚合公式从存储层节点池计算得出——查询时计算，不预缓存。底层GraphStore的节点和边不受表达层新增影响。

---

## 一、存储层节点池概览

15个节点池分为两大类：

| 类别 | 数量 | 节点池 | 语义 |
|------|------|--------|------|
| **存量池** | 9 | 资本池、人才池、客户池、知识池、品牌池、技术池、信任池、权力池、数据池 | 企业的"资产负债表"——在某个时间点企业拥有什么 |
| **活动池** | 6 | 配置池、执行池、定价池、创新池、学习池、治理池 | 企业的"损益表"——在某个时间段企业做了什么 |
| **事件池** | 1 | 事件池（新增第16个） | 企业的"日记"——离散发生的重大变化 |

**存量vs活动的区分逻辑**：存量可以"持有"（可以被积累、消耗、折旧），活动只能"发生"（有时间窗口，产生改变存量的因果效应）。

---


## 第一部分：15存储层节点池

---

### 池1：资本池 (CAPITAL_POOL)

**定义**：企业可动用的财务资源总量，包括现金、融资额度、留存收益和可快速变现资产。这是企业价值循环的"血液"——没有资本，其他14个池都无法运转。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 现金/融资 | `FINANCIAL` (financialType='revenue' 或 'cost') | 金融节点原生承载金额属性 |
| 外部融资来源 | `CLIENT` (entityType='external') | 投资方作为外部实体 |
| 成本中心 | `FINANCIAL` (financialType='cost_center') | 部门级预算归属 |
| Token经济 | `FINANCIAL` (financialType='token_account') | LLM API消耗账户 |
| 商业模式 | `BUSINESS_MODEL` | 收入集中度和固定成本比 |

**关键属性**（从NodeProps接口提取）：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `total_capital` | number | FinancialProps.amount（聚合） | 资本总量 = sum(FINANCIAL.revenue) - sum(FINANCIAL.cost) |
| `cash_runway_months` | number | 计算（E-05） | 现金流跑道 = total_capital / monthly_burn |
| `monthly_burn` | number | FinancialProps.amount时间序列差值 | 月烧钱率 |
| `debt_equity_ratio` | number | 计算（E-06） | 债权股权比，equity=0时返回Infinity并标记degraded |
| `revenue_concentration` | number | BusinessModelProps.revenueConcentration | 最大单一收入来源占比0-1 |
| `fixed_cost_ratio` | number | BusinessModelProps.fixedCostRatio | 固定成本占比0-1 |
| `health_score` | number | BusinessModelProps.healthScore | 商业模式健康度0-1 |

**动态行为**：
- `total_capital` 随时间变化受三条路径影响：(1) E-05 资本获取 → `total_capital` 增加；(2) E-13 资本配置 → `total_capital` 减少（被分配到活动）；(3) E-37 利润再投资 → `total_capital` 恢复。
- `cash_runway_months` 是核心预警指标：< 6个月 → critical；6-12个月 → warning；> 18个月 → healthy。
- `debt_equity_ratio` 突变（月环比变化 > 50%）触发 `financing-constraint` 哨兵。
- 5人企业：`total_capital` 典型范围1-50万元，`monthly_burn` 0.2-5万元/月，`cash_runway` < 3个月则生存受威胁。
- 100人企业：`total_capital` 典型范围200-2000万元，`monthly_burn` 10-80万元/月，`cash_runway` < 6个月触发融资压力。
- 500人企业：`total_capital` 典型范围2000-20000万元，`monthly_burn` 50-500万元/月，`debt_equity_ratio` > 2.0 触发偿债风险。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写**（边输出写入此池） | E-05 CAPITAL_ACQUISITION | 获取的资本写入total_capital |
| **写** | E-37 PROFIT_REINVEST | 留存收益回流写入 |
| **读**（边从此池读取属性） | E-06 FINANCING_MIX | 读取debt_equity_ratio计算WACC |
| **读** | E-13 CAPITAL_ALLOCATION | 读取total_capital用于配置决策 |
| **读** | E-38 TALENT_RETENTION | 读取资本健康度影响薪酬竞争力 |

---

### 池2：人才池 (TALENT_POOL)

**定义**：企业人力资本的规模、质量、结构和动态。人才是"活资本"——不同于金融资本，人才自带学习能力和流失风险。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 个体能力 | `PERSON` + `CAPABILITY` (PROVIDES边) | Person节点通过PROVIDES边关联其能力 |
| 团队归属 | `TEAM` + `BELONGS_TO` 边 | Person → BELONGS_TO → Team |
| 技能缺口 | `CAPABILITY` (category='technical'或'domain'或'leadership') | 组织所需能力 - 已有能力 = 缺口 |
| 关键人风险 | `RISK` (riskType='key_person') | 单人依赖度标记 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `headcount` | number | Person节点计数 | 总人数 |
| `talent_density` | number | 计算 = sum(Capability.proficiencyLevel) / headcount | 人均能力水平0-1 |
| `turnover_rate` | number | Person节点valid_to时间戳统计 | 月离职率，正常范围0.01-0.05 |
| `skill_mismatch` | number | 计算 = 需求能力集与现有人才能力集的Jaccard距离 | 技能错配度0-1 |
| `backup_ratio` | number | 计算 = 有关键备份的关键岗位 / 总关键岗位 | 关键人备份率 |
| `avg_tenure_months` | number | Person节点created_at至今 | 平均在职月数 |

**动态行为**：
- `talent_density` 随E-07 TALENT_ACQUISITION（人才流入）上升，随E-38 TALENT_RETENTION（人才流失）下降。
- `turnover_rate` 的季节性：Q1（年后跳槽季）偏高是正常现象；持续>行业基准1.5x → `talent-density` 哨兵告警。
- `skill_mismatch` 在战略转型期会突增——因为新战略需要新技能。突增后的恢复速度是组织学习能力的体现。
- 10人企业：`headcount`=10，单点依赖严重——`backup_ratio` < 0.3 即触发 `key-person-risk` critical。
- 100人企业：`headcount`=100，`turnover_rate` > 0.08（月）显著异常——正常范围0.02-0.05。
- 500人企业：`headcount`=500，`skill_mismatch` > 0.3 表示系统性能力缺口，单岗招聘难以解决。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-07 TALENT_ACQUISITION | 人才流入写入headcount/talent_density |
| **写** | E-38 TALENT_RETENTION | 人才流失更新turnover_rate |
| **写** | E-15 HUMAN_DEPLOYMENT | 人力配置改变skill_mismatch |
| **读** | E-07 TALENT_ACQUISITION | 读取skill_mismatch决定招聘方向 |
| **读** | E-19 ORG_LEARNING | 读取talent_density作为学习基础 |
| **读** | E-21 ROUTINE_INERTIA | 读取avg_tenure_months影响惯例刚性 |

---

### 池3：客户池 (CLIENT_POOL)

**定义**：为企业付费的外部实体集合，包括客户数量、结构、关系和生命周期状态。客户池是"外部资产"——企业不拥有客户，但客户关系是企业最重要的存量之一。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 客户实体 | `CLIENT` (entityType='external') | 客户原生节点 |
| 客户细分 | `CLIENT` + `GOAL` (goalType='north_star') | 目标客户画像（North Star指标定义的目标客户） |
| 收入来源 | `FINANCIAL` (financialType='revenue') + `REVENUE_FROM` 边 → `CLIENT` | 收入归因到具体客户 |
| 价值主张匹配 | `VALUE_PROPOSITION` 边 (GOAL → CLIENT) | 价值主张-客户匹配度 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `total_clients` | number | CLIENT节点计数 | 总客户数 |
| `active_clients` | number | CLIENT节点（按最近交易时间过滤，90天内） | 活跃客户数 |
| `churn_rate` | number | CLIENT节点valid_to统计 | 月流失率 |
| `arpu` | number | 计算 = 总revenue / active_clients | 每客户平均收入 |
| `concentration_hhi` | number | 计算 = sum((client_i_revenue/total_revenue)^2) | 客户集中度HHI，>2500为高集中 |
| `value_prop_match` | number | VALUE_PROPOSITION.alignmentStrength均值 | 价值主张匹配度0-1 |

**动态行为**：
- `churn_rate` 上行 + `arpu` 不变 → 问题在交付/产品质量（检查E-30价传匹配、E-31客户锁定）。
- `churn_rate` 上行 + `arpu` 也上行 → 可能是定价淘汰低价值客户（检查E-29定价优化是否过度）。
- `concentration_hhi` > 2500 且最大客户churn → `competitive-moat` 哨兵升级为critical。
- 10人企业：`total_clients` 典型5-50，`concentration_hhi` > 4000是常态——小企业必然依赖少数客户。
- 100人企业：`total_clients` 典型50-500，`concentration_hhi` > 2500开始风险显著。
- 500人企业：`total_clients` 典型200-5000，`churn_rate` > 0.05（月）触发系统性客户流失分析。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-30 VALUE_PROPOSITION_MATCH | 价值主张匹配影响客户获得/流失 |
| **写** | E-31 CLIENT_LOCK_IN | 客户锁定影响churn_rate |
| **写** | E-33 MARKET_COMPETITION | 竞争强度影响客户争夺 |
| **读** | E-29 PRICING_OPTIMIZATION | 读取arpu和churn_rate做定价弹性分析 |
| **读** | E-35 DATA_FEEDBACK | 读取客户行为数据进入反馈循环 |
| **读** | E-40 REPUTATION_AMPLIFICATION | 读取客户满意度影响声誉 |

---

### 池4：知识池 (KNOWLEDGE_POOL)

**定义**：企业积累的显性知识和隐性知识，包括文档、经验、流程know-how、最佳实践。知识池是"可复用的认知资产"——它是组织学习能力的物质基础。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 显性知识 | `KNOWLEDGE_CHUNK` | 知识片段原生节点（Auth M1） |
| 文档载体 | `DOCUMENT` (docType='report'或'prd'或'meeting_notes') | 文档是知识的容器 |
| 知识→能力鸿沟 | `CAPABILITY` + `DEPENDS_ON` 边 → `KNOWLEDGE_CHUNK` | 能力依赖知识片段 |
| 知识孤岛 | `KNOWLEDGE_CHUNK` + INTERACTS_WITH边缺位 | 知识只被创建者访问 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `chunk_count` | number | KNOWLEDGE_CHUNK节点计数 | 知识片段总数 |
| `doc_count` | number | DOCUMENT节点计数 | 文档数 |
| `freshness_score` | number | 1 / (1 + avg(now - Document.created_at) / 180天) | 知识新鲜度0-1，180天半衰期 |
| `accessibility_score` | number | 计算 = 有HAS_ACCESS_TO边的chunk数 / total | 知识可访问性0-1 |
| `knowledge_island_count` | number | 计算 = 度中心性=0（无任何边连接）的KNOWLEDGE_CHUNK节点 | 知识孤岛数 |
| `codification_rate` | number | 计算 = Document覆盖的KNOWLEDGE_CHUNK / total | 隐性→显性转化率 |

**动态行为**：
- `accessibility_score` 低 + `knowledge_island_count` 高 → `knowledge-accessibility` 哨兵告警（知识孤岛密度 > 阈值）。
- `freshness_score` 下降（知识老化）→ 检查E-04 PERCEPTION_LEARNING是否失效（感知→学习链路断裂）。
- `codification_rate` 在关键人离职前如果<0.3 → `key-person-risk` 哨兵升级（知识随人走）。
- 10人企业：`chunk_count` 典型10-100，知识高度集中在创始人/核心成员脑中——`codification_rate` < 0.2 是常态但危险。
- 100人企业：`chunk_count` 典型200-2000，`knowledge_island_count` / `chunk_count` > 0.3 表示严重的信息孤岛。
- 500人企业：`chunk_count` 典型1000-10000，`accessibility_score` < 0.5 → 存在系统性知识管理问题。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-04 PERCEPTION_LEARNING | 感知→学习→知识积累写入 |
| **写** | E-19 ORG_LEARNING | 组织学习产生新知识 |
| **写** | E-20 KNOWLEDGE_SHARING | 知识共享影响accessibility_score |
| **读** | E-09 DATA_ACQUISITION | 数据质量影响知识提取效率 |
| **读** | E-23 OPERATIONAL_EXECUTION | 执行过程消费知识 |
| **读** | E-24 INNOVATION_CAPACITY | 创新依赖知识存量 |

---

### 池5：品牌池 (BRAND_POOL)

**定义**：企业在外部利益相关者（客户、候选人才、合作伙伴、投资者）心智中的认知资产。品牌池是"外部声誉的存量"——它不是企业说了什么，而是外部世界相信什么。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 品牌认知 | `GOAL` (goalType='mission'或'vision') + `ALIGNS_WITH` 边 | 使命/愿景与外部对齐度 |
| 雇主品牌 | `PERSON` 节点创建速率（代理——招聘转化率） | 外部候选人响应率 |
| 声誉事件 | `EVENT` (eventType='brand_incident') + `AFFECTS` 边 → `CLIENT` | 品牌事件对客户的影响 |
| 竞争位势 | `BUSINESS_MODEL` + `VALUE_PROPOSITION` 边 | 价值主张的市场独特性 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `brand_strength` | number | 计算 = f(雇主吸引力, 客户NPS代理, 媒体声量代理) | 品牌强度0-1 |
| `employer_attractiveness` | number | 计算 = hires_completed / applicants（E-07代理） | 雇主吸引力0-1 |
| `reputation_volatility` | number | EVENT.品牌事件频率的方差 | 声誉波动性 |
| `moat_strength` | number | SevenPowersReport.overallMoatStrength | 护城河强度0-1 |
| `value_prop_distinctiveness` | number | VALUE_PROPOSITION.monetized ? 1 : alignmentStrength | 价值主张可货币化程度 |

**动态行为**：
- `brand_strength` 是慢变量（变化周期3-12个月）——一次营销Campaign不会显著改变它，但一次产品重大事故可能让它在1个月内下跌30%。
- `employer_attractiveness` 下降 + `turnover_rate` 上升 → 人才获取困难形成恶性循环（E-07 → E-38负反馈）。
- `reputation_volatility` 高（月度波动>0.2）→ 品牌脆弱，容易受外部事件冲击。
- 10人企业：品牌几乎等同于创始人个人声誉——`brand_strength` 在0.3-0.5范围，高度依赖口碑。
- 100人企业：品牌开始独立于创始人——`brand_strength` 在0.4-0.7范围，需主动管理。
- 500人企业：品牌是独立资产——`brand_strength` 在0.5-0.9范围，`reputation_volatility` > 0.15 触发品牌危机管理。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-25 BRAND_CONSTRUCTION | 品牌建设写入brand_strength |
| **写** | E-40 REPUTATION_AMPLIFICATION | 声誉飞轮放大或缓冲品牌变化 |
| **读** | E-07 TALENT_ACQUISITION | 雇主品牌影响招聘效率 |
| **读** | E-30 VALUE_PROPOSITION_MATCH | 品牌认知影响价传匹配 |
| **读** | E-42 CROSS_DOMAIN_SPILLOVER | 品牌溢出到其他领域 |

---

### 池6：技术池 (TECH_POOL)

**定义**：企业拥有的工具、系统、软件、技术平台和技术能力。技术池是"生产力的物质基础"——它决定了企业能以多高效率将输入转化为输出。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 工具系统 | `TOOL` | 工具原生节点，category字段细分类型 |
| AI代理 | `AGENT` (agentType='internal') | 内部AI代理 |
| 技术能力 | `CAPABILITY` (category='technical') | 技术类能力 |
| 技术依赖 | `DEPENDS_ON` 边 (PROCESS/AGENT → TOOL) | 工具依赖关系 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `tool_count` | number | TOOL节点计数 | 工具总数 |
| `tech_stack_age_days` | number | avg(now - TOOL.created_at) | 技术栈平均年龄（天） |
| `integration_coverage` | number | 计算 = 有INTERACTS_WITH边（TOOL↔TOOL）的TOOL数 / total | 工具集成度0-1 |
| `agent_count` | number | AGENT节点计数 | AI代理数 |
| `agent_activity_rate` | number | AGENT.activityCount时间序列 | 代理活跃度 |
| `tech_debt_score` | number | 计算 = 0.3*(tech_stack_age_days/730) + 0.4*(1-integration_coverage) + 0.3*(agent_error_rate) | 技术债评分0-1 |

**动态行为**：
- `tech_debt_score` 随时间自然增长（每年增长0.05-0.10），除非有E-29 TECHNOLOGY_INFRASTRUCTURE投入维护。
- `agent_activity_rate` 突降（日环比<-50%）→ 检查AGENT.status是否大量'error' → 可能是API变更或token账户耗尽。
- `integration_coverage` < 0.5 → `software-health` 哨兵warning（信息孤岛）。
- 10人企业：`tool_count` 典型3-15，`tech_debt_score` 自然偏低——系统简单。
- 100人企业：`tool_count` 典型15-80，`integration_coverage` < 0.6 意味着存在多个不互通系统。
- 500人企业：`tool_count` 典型50-200，`tech_debt_score` > 0.5 → 系统性技术老化，迁移成本高。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-08 RESOURCE_ACQUISITION | 技术资源获取写入tool_count |
| **写** | E-29 TECHNOLOGY_INFRASTRUCTURE | 技术基础设施建设/维护 |
| **读** | E-16 INFO_TRANSMISSION | 工具集成度影响信息传递效率 |
| **读** | E-23 OPERATIONAL_EXECUTION | 工具可用性影响执行效率 |
| **读** | E-24 INNOVATION_CAPACITY | 技术基础影响创新空间 |

---

### 池7：信任池 (TRUST_POOL)

**定义**：组织内部成员之间、成员与组织之间的信任存量。信任是"协作的润滑剂"——高信任组织可以用更少的正式协调成本完成同样的事情。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 交互频率 | `INTERACTS_WITH` 边计数 (PERSON↔PERSON, PERSON↔TEAM) | 协作密度代理 |
| 交互质量 | `INTERACTS_WITH.weight` 均值 | 边权重代理信任深度 |
| 团队归属 | `BELONGS_TO` (PERSON → TEAM) | 归属感代理 |
| 目标对齐 | `ALIGNS_WITH` (PERSON/TEAM → GOAL) | 目标一致性代理信任 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `trust_level` | number | 计算（E-11）= (1 - internal_transaction_cost_ratio) * collaboration_frequency | 信任水平0-1 |
| `collaboration_frequency` | number | INTERACTS_WITH边计数/周期 | 协作频率 |
| `internal_transaction_cost_ratio` | number | 计算（E-11/E-28） | 内部交易成本比，<0.3为健康 |
| `goal_alignment_score` | number | ALIGNS_WITH.alignmentStrength均值 | 目标对齐度0-1 |
| `network_density` | number | HONAReport.density | 交互网络密度 |
| `isolated_count` | number | HONAReport.isolatedCount | 孤立节点数 |

**动态行为**：
- `trust_level` 是慢变量——建立需要6-12个月，破坏可以在1周内完成。
- `isolated_count` / `headcount` > 0.15 → 存在显著的组织碎片化风险。
- `goal_alignment_score` < 0.4 + `trust_level` < 0.3 → `incentive-alignment` 哨兵critical（激励失调+不信任=委托代理问题全面爆发）。
- 10人企业：`trust_level` 应>0.7——小团队信任是自然产物；<0.5 表示严重的人际冲突。
- 100人企业：`trust_level` 典型0.4-0.7——信任需要制度和流程支持。
- 500人企业：`trust_level` 典型0.3-0.6——信任主要依赖制度和文化而非个人关系；`network_density` < 0.1 表明组织碎片化。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-11 TRUST_CONSTRUCTION | 信任建设写入trust_level |
| **写** | E-14 DECISION_POWER | 权力集中度反向影响信任（权力越集中，信任越低） |
| **写** | E-28 CROSS_FUNCTIONAL_SYNERGY | 跨职能协同正向影响信任 |
| **读** | E-16 INFO_TRANSMISSION | 信任影响信息传递真实性 |
| **读** | E-17 INCENTIVE_ALIGNMENT | 信任是激励有效性的前置条件 |

---

### 池8：权力池 (POWER_POOL)

**定义**：组织内决策权的分布状态。权力池描述"谁说了算"——不是拥有权力的人，而是权力的结构和集中度。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 决策权归属 | `OWNS` 边 (PERSON → PROCESS, ownershipType='executes'或'manages'或'sponsors') | 谁拥有哪个流程 |
| 决策频率 | `PROCESS` (processType='approval') 时间戳序列 | 决策事件时间线 |
| 团队权力 | `TEAM` + OWNS边聚合 | 团队级决策权 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `power_gini` | number | 计算（E-12）= Gini(每人决策次数分布) | 权力基尼系数0-1，>0.6表示高度集中 |
| `decision_count_total` | number | PROCESS.approval总计数 | 总决策次数 |
| `decision_delay_avg_days` | number | PROCESS.approval的timestamp差值均值 | 平均决策延迟天数 |
| `top3_decision_share` | number | 计算 = top3个人的决策次数 / total | 前3人决策占比 |
| `sponsorship_concentration` | number | OWNS(sponsor)边按PERSON聚合后的HHI | 赞助权集中度 |

**动态行为**：
- `power_gini` > 0.6 且 `decision_delay_avg_days` > 7天 → `power-rigidity` 哨兵critical（权力集中且决策缓慢）。
- `top3_decision_share` > 0.75 且 `headcount` > 20 → 严重的决策瓶颈——无论招多少人，事情还是那3个人决定。
- `power_gini` 在企业规模从10人→50人时如果没有显著下降（<0.4）→ 创始人未授权，组织处于"伪规模化"状态。
- 10人企业：`power_gini` 典型0.3-0.5——少数人决策是高效的；>0.7表示过度集权。
- 100人企业：`power_gini` 典型0.2-0.4——需要分权机制；>0.5表示创始人瓶颈。
- 500人企业：`power_gini` 典型0.15-0.35——多层决策体系；>0.4表示授权不足。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-12 POWER_DISTRIBUTION | 权力分布计算写入power_gini |
| **写** | E-15 HUMAN_DEPLOYMENT | 人力部署改变OWNS边分布 |
| **读** | E-10 DECISION_ALLOCATION | 权力集中度影响决策质量 |
| **读** | E-14 DECISION_POWER | 权力分析的核心输入 |
| **读** | E-17 INCENTIVE_ALIGNMENT | 权力结构影响激励设计合理性 |

---

### 池9：数据池 (DATA_POOL)

**定义**：企业采集、存储、可用于分析的结构化和非结构化数据。数据池是"企业认知的原材料"——数据质量直接决定诊断精度。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 数据载体 | `DOCUMENT` (docType='report'或'contract'等) | 文档承载数据 |
| 数据语义 | `KNOWLEDGE_CHUNK` | 知识片段是数据的语义化结果 |
| 数据流转 | `CONSUMES` 边 (PROCESS → FINANCIAL.token_account) | 数据消费有成本 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `completeness` | number | 计算（E-09）= data_points_available / data_points_required | 数据完整度0-1 |
| `freshness` | number | 计算（E-09）= 1 / (1 + avg_data_age_days / 30) | 数据新鲜度0-1 |
| `accuracy` | number | 计算（E-09，默认0.95）= 1 - error_rate | 数据准确度0-1 |
| `data_quality` | number | completeness * freshness * accuracy | 综合数据质量0-1 |
| `data_point_count` | number | DOCUMENT节点计数 * 估算字段数 | 数据点总数 |
| `api_coverage` | number | 计算 = 有数据源的诊断维度 / 总诊断维度 | API数据覆盖率 |

**动态行为**：
- `freshness` 随DOCUMENT.timestamp老化递减，需要持续的数据采集维持。
- `completeness` < 0.5 → 大部分诊断模块将降级运行（输出含degraded: true）。
- `data_quality` < 0.3 → `data-health` 哨兵critical → 任何定量诊断结论都不可信。
- 10人企业：`data_point_count` 典型50-500，`completeness` 通常<0.3——小企业数据基础设施薄弱。
- 100人企业：`data_point_count` 典型500-5000，`completeness` 在0.3-0.7范围。
- 500人企业：`data_point_count` 典型2000-20000，`completeness` 应>0.6否则数据治理存在系统性问题。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-09 DATA_ACQUISITION | 数据采集写入completeness/freshness/accuracy |
| **写** | E-35 DATA_FEEDBACK | 客户反馈数据进入数据池 |
| **读** | E-01 ACTIVE_SCANNING | 扫描覆盖广度受数据完整度限制 |
| **读** | E-02 PASSIVE_SIGNAL | 被动信号依赖数据新鲜度 |
| **读** | 所有compute函数 | 数据质量是所有定量计算的前置条件 |

---


### 池10：配置池 (ALLOCATION_POOL)（活动池）

**定义**：企业将资源（资本、人力、时间）导向不同活动的决策过程。配置是"资源的路由器"——资源配置的质量决定整体投资回报率。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 配置决策 | `PROCESS` (processType='approval') | 预算审批流程节点 |
| 配置流向 | `CONSUMES` 边 (PROCESS → FINANCIAL) | 活动消费资金 |
| 配置目标 | `GOAL` (goalType='okr') + `ALIGNS_WITH` 边 | 配置是否与目标对齐 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `allocation_efficiency` | number | 计算（E-10）= productive_allocation / total_allocation | 配置效率0-1，>0.6为健康 |
| `allocation_ratio` | number | 计算 = productive_allocation / total_allocation | 生产性配置占比 |
| `allocation_roi_variance` | number | 各项目ROI的标准差 | 配置质量方差——高方差表示"撒胡椒面" |
| `budget_cycle_days` | number | PROCESS.approval的平均周期 | 预算审批周期（天） |
| `reallocation_frequency` | number | 配置变更次数/年 | 重新配置频率 |

**动态行为**：
- `allocation_roi_variance` 高 + `allocation_efficiency` 低 → 资源在"撒胡椒面"——投向太多方向，没有一个方向获得足够资源。
- `reallocation_frequency` < 0.5次/年 → 配置僵化（可能与E-21 ROUTINE_INERTIA联动）。
- `budget_cycle_days` > 30天 → 对小企业（<30人）是严重信号——决策周期超过环境变化周期。
- 10人企业：`allocation_efficiency` 应>0.8——小团队资源聚焦是自然的；<0.5表示严重的资源分散。
- 100人企业：`allocation_efficiency` 典型0.5-0.75——多项目并行必然有损耗。
- 500人企业：`allocation_efficiency` 典型0.4-0.7——大型组织的配置效率天然较低，`allocation_roi_variance` > 0.5则表示缺乏投资组合管理。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-10 DECISION_ALLOCATION | 决策机制写入allocation_efficiency |
| **写** | E-13 CAPITAL_ALLOCATION | 资本配置写入allocation_ratio |
| **读** | E-05 CAPITAL_ACQUISITION | 可配置资本总量来自资本池 |
| **读** | E-15 HUMAN_DEPLOYMENT | 人力配置是配置的子维度 |

---

### 池11：执行池 (EXECUTION_POOL)（活动池）

**定义**：企业将资源转化为产出的实际生产过程。执行池是"转化效率的衡量器"——它不关心"做什么"（那是配置的事），只关心"做得有多好"。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 执行流程 | `PROCESS` (processType='deployment'或'meeting'或'other') | 流程原生节点 |
| 产出能力 | `CAPABILITY` (category='domain') + `PROVIDES` 边 | 能力→执行产出 |
| 瓶颈代理 | `AGENT` (status='error'或'idle') | 代理故障或闲置指示执行瓶颈 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `efficiency_rate` | number | 计算（E-23）= throughput / (资源投入 * 标准产出率) | 运营执行效率0-1 |
| `throughput` | number | PROCESS.deployment节点完成数/周期 | 产出吞吐量 |
| `defect_rate` | number | PROCESS节点产生RISK边计数/总执行数 | 缺陷率 |
| `bottleneck_count` | number | AGENT.status='error' 或 queueDepth>阈值的节点数 | 瓶颈数 |
| `utilization_rate` | number | AGENT.activityCount / 设计上限 | 资源利用率0-1 |

**动态行为**：
- `efficiency_rate` 连续3周期下降 → `unit-economics` 哨兵warning（单位成本上升）。
- `defect_rate` 突增（月环比>50%）→ 检查近期是否有流程变更或人员变动（E-15 HUMAN_DEPLOYMENT可能错配）。
- `bottleneck_count` > 0.2 * `headcount` → 组织过载信号（E-28 CROSS_FUNCTIONAL_SYNERGY可能断裂）。
- 10人企业：`efficiency_rate` 应>0.7——小团队天然高效；`bottleneck_count` > 2 即严重。
- 100人企业：`efficiency_rate` 典型0.5-0.75，`throughput` 月环比波动<20%为正常。
- 500人企业：`efficiency_rate` 典型0.4-0.7，`defect_rate` > 0.05 触发质量管理系统审查。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-23 OPERATIONAL_EXECUTION | 执行效率写入efficiency_rate |
| **写** | E-19 ORG_LEARNING | 学习成果改善执行效率 |
| **读** | E-15 HUMAN_DEPLOYMENT | 人力配置影响执行能力 |
| **读** | E-29 PRICING_OPTIMIZATION | 执行效率影响成本→定价空间 |
| **读** | E-28 CROSS_FUNCTIONAL_SYNERGY | 跨职能协同影响执行流畅度 |

---

### 池12：定价池 (PRICING_POOL)（活动池）

**定义**：企业为其产品或服务设定价格的活动。定价池是"价值捕获的定价器"——它决定了企业能从创造的每单位价值中捕获多少。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 收入 | `FINANCIAL` (financialType='revenue') | 收入数据 |
| 成本 | `FINANCIAL` (financialType='cost') | 成本数据 |
| 价值主张 | `VALUE_PROPOSITION` 边 (GOAL → CLIENT) | 定价-价值匹配 |
| 商业模式 | `BUSINESS_MODEL` (canvasType) | 定价模式类型 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `price_elasticity` | number | 计算（E-29）= (需求变化%) / (价格变化%) | 需求价格弹性，<1为缺乏弹性（有定价权） |
| `gross_margin` | number | (revenue - cost) / revenue | 毛利率，正常范围因行业而异 |
| `margin_trend` | number | 毛利率月度变化（正/负） | 利润趋势 |
| `pricing_power` | number | 计算 = (price - marginal_cost) / price | 定价权Lerner指数，>0.3表示强定价权 |
| `unit_economics_health` | number | 计算 = (unit_revenue - unit_cost) / unit_cost | 单位经济健康度，>0表示盈利 |

**动态行为**：
- `price_elasticity` < 1 → 企业有定价权（提价不显著流失客户）→ 检查E-31 CLIENT_LOCK_IN是否有效。
- `margin_trend` 连续6个月为负 → `margin-health` 哨兵critical。
- `unit_economics_health` < 0 持续>3个月 → 商业模式不可持续（每卖一单亏一单）。
- 10人企业：`pricing_power` 通常低（<0.2）——小企业议价能力弱，`gross_margin` 行业差异大。
- 100人企业：`pricing_power` 在0.1-0.4范围——需通过品牌和差异化建立定价权。
- 500人企业：`pricing_power` 应>0.2才算健康——规模应转化为定价优势。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-29 PRICING_OPTIMIZATION | 定价活动写入price_elasticity/gross_margin |
| **读** | E-23 OPERATIONAL_EXECUTION | 执行效率决定成本下限 |
| **读** | E-25 BRAND_CONSTRUCTION | 品牌强度支撑定价溢价 |
| **读** | E-33 MARKET_COMPETITION | 竞争强度约束定价上限 |

---

### 池13：创新池 (INNOVATION_POOL)（活动池）

**定义**：企业探索新产品、新流程、新模式的尝试活动。创新池是"未来的种子"——它消耗今天的资源，但产出明天的增长曲线。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 创新活动 | `PROCESS` (processType='deployment'，标记为innovation) | 创新项目流程 |
| 研发能力 | `CAPABILITY` (category='technical') | 技术研发能力 |
| 创新成果 | `KNOWLEDGE_CHUNK`（新增知识片段） + `DOCUMENT` (docType='prd') | 创新产物 |
| 探索vs利用 | `GOAL` (goalType='okr' 区分探索性OKR和运营性OKR) | 资源配置的探索/利用比 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `r_and_d_intensity` | number | 计算 = 创新活动投入 / total_allocation | 研发强度0-1 |
| `explore_exploit_ratio` | number | 计算 = 探索性OKR数 / (探索性+运营性OKR数) | 探索/利用比 |
| `innovation_conversion_rate` | number | 计算 = 产生DOCUMENT(prd)的创新PROCESS / 总创新PROCESS | 创新→产品转化率 |
| `time_to_market_days` | number | 创新PROCESS.created_at → DOCUMENT(prd).created_at | 从设想到产品化的周期 |
| `new_revenue_share` | number | 计算 = 新产品收入 / 总收入 | 新产品收入占比 |

**动态行为**：
- `explore_exploit_ratio` > 0.5 → 可能过度探索，"样样都想做，样样没做好"。
- `explore_exploit_ratio` < 0.1 → 可能过度利用，"吃老本，没有未来"。
- `innovation_conversion_rate` < 0.1 且 `r_and_d_intensity` > 0.15 → 创新投入产出效率极低。
- `new_revenue_share` 连续12个月为0 → `growth-quality` 哨兵warning（增长全来自老产品）。
- 10人企业：`r_and_d_intensity` 典型0.05-0.20，核心是创始人时间和注意力。
- 100人企业：`r_and_d_intensity` 典型0.05-0.15，需专门的创新团队。
- 500人企业：`r_and_d_intensity` 典型0.03-0.12，`innovation_conversion_rate` > 0.2为优秀。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-24 INNOVATION_CAPACITY | 创新能力写入r_and_d_intensity/explore_exploit_ratio |
| **读** | E-04 PERCEPTION_LEARNING | 感知学习产生创新灵感 |
| **读** | E-19 ORG_LEARNING | 学习成果是创新基础 |
| **读** | E-13 CAPITAL_ALLOCATION | 配置决定创新资源投入 |

---

### 池14：学习池 (LEARNING_POOL)（活动池）

**定义**：企业从经验和外部信息中提取规律、更新认知、改善行为的过程。学习池是"组织的适应能力"——它决定了企业多快能从错误中恢复、多快能适应环境变化。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 学习曲线 | `CAPABILITY.proficiencyLevel` 时间序列 | 能力水平变化率 |
| 知识更新 | `KNOWLEDGE_CHUNK` 创建和更新速率 | 知识更新速度 |
| 错误修正 | `RISK` (status从'active'→'mitigated'的转换速率) | 从风险中学习 |
| 培训活动 | `PROCESS` (标记为training/learning) | 正式学习活动 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `learning_rate` | number | 计算（E-19）= 单位成本随累积产量下降的速率 | 学习率（Wright定律参数） |
| `knowledge_update_rate` | number | KNOWLEDGE_CHUNK更新数/周期 / total | 知识更新速率 |
| `error_recovery_speed_days` | number | RISK status (active→mitigated) 转换时间均值 | 错误恢复速度（天） |
| `capability_growth_rate` | number | CAPABILITY.proficiencyLevel月增长率 | 能力增长速度 |
| `lesson_codification_rate` | number | 计算 = RISK→mitigated→KNOWLEDGE_CHUNK转化数 / 总RISK.mitigated数 | 教训→知识的转化率 |

**动态行为**：
- `learning_rate` 低于行业基准50% → `learning-curve` 哨兵warning——组织学得比同行慢。
- `error_recovery_speed_days` 趋势性上升 → 组织"自愈能力"在下降。
- `lesson_codification_rate` < 0.3 → 组织在"重复犯错"——解决了问题但没有沉淀为知识。
- 10人企业：`learning_rate` 应极高（>0.10）——小团队天然学习快；`lesson_codification_rate` 通常低（口头传承）。
- 100人企业：`learning_rate` 典型0.03-0.10——依赖制度化学习；`knowledge_update_rate` > 0.05/月为健康。
- 500人企业：`learning_rate` 典型0.02-0.07——大组织学习慢但有规模效应；`lesson_codification_rate` 应>0.5。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-04 PERCEPTION_LEARNING | 感知→学习→knowledge更新 |
| **写** | E-19 ORG_LEARNING | 组织学习写入learning_rate |
| **读** | E-09 DATA_ACQUISITION | 数据质量影响学习精度 |
| **读** | E-20 KNOWLEDGE_SHARING | 知识共享影响学习效率 |
| **读** | E-21 ROUTINE_INERTIA | 惯例僵化抑制学习 |

---

### 池15：治理池 (GOVERNANCE_POOL)（活动池）

**定义**：企业通过规则、合规、监督机制来约束行为和降低风险的活动。治理池是"组织的免疫系统"——太弱则混乱，太强则僵化。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 合规要求 | `COMPLIANCE` (complianceType='regulation'或'standard'或'policy') | 合规原生节点 |
| 风险监控 | `RISK` (riskType, severity, status) | 风险节点 |
| 规则流程 | `PROCESS` (processType='approval' 标记为governance) | 治理审批流程 |
| 边界约束 | `LOCATION` (locationType) + `COMPLIANCE.jurisdiction` | 地域合规边界 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `compliance_score` | number | COMPLIANCE.status='compliant'占比 | 合规率0-1 |
| `active_risk_count` | number | RISK(status='active')计数 | 活跃风险数 |
| `risk_mitigation_rate` | number | RISK(status='mitigated') / 总RISK | 风险缓解率 |
| `governance_overhead_ratio` | number | 治理PROCESS数 / 总PROCESS数 | 治理开销占比 |
| `rule_constraint_index` | number | 计算 = 活跃合规要求数/headcount | 人均规则约束数 |

**动态行为**：
- `governance_overhead_ratio` > 0.3 → `cash-runway` 哨兵间接影响——治理消耗过多资源。
- `rule_constraint_index` 快速增长（年增长>30%）→ 组织正在"过度制度化"。
- `compliance_score` < 0.7 + `active_risk_count` > 10 → 治理体系失效——有规则但不被遵守。
- 10人企业：`governance_overhead_ratio` 应<0.05——小企业不需要重治理；`compliance_score` > 0.9。
- 100人企业：`governance_overhead_ratio` 典型0.05-0.15——需要在灵活与合规间平衡。
- 500人企业：`governance_overhead_ratio` 典型0.10-0.25——需要系统性合规体系；`rule_constraint_index` < 5/人为健康。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-18 RULE_CONSTRAINT | 规则约束写入governance_overhead_ratio |
| **读** | E-12 POWER_DISTRIBUTION | 权力分布影响治理设计 |
| **读** | E-17 INCENTIVE_ALIGNMENT | 激励对齐需要治理机制保障 |
| **读** | E-21 ROUTINE_INERTIA | 惯例与治理规则可能冲突 |

---


---

## 第二部分：事件池（第16个节点池）

---

### 池16：事件池 (EVENT_POOL)

**定义**：企业中离散发生的、对存量和活动产生显著影响的重大变化事件。事件池是企业的"日记"和"因果触发器"——它是42条边中TRIGGERS边类型的唯一合法源节点类型（SOG-Core v1.0: TRIGGERS的from端点只包含EVENT类型）。事件是离散的、不可逆的因果节点：它的occurred_at是一个不可修改的时间戳，它触发的因果链条从此时间点开始传导。

**补充评审指出的缺失**：研究方案v3.0的评审明确指出"事件池作为离散因果触发器是缺失的——42条边需要TRIGGERS边的源节点，而现有15个池中没有一个池的主节点类型是EVENT。"本事件池填补了这个空缺。

**SOGNodeType精确映射**：

| 属性维度 | SOGNodeType | 选择理由 |
|----------|-------------|---------|
| 事件主体 | `EVENT` | EVENT是SOG-Core v1.0原生节点类型，eventType + timestamp为必填属性 |
| 事件→流程触发 | `TRIGGERS` 边 (EVENT → PROCESS) | 事件触发审批/部署/会议流程 |
| 事件→事件级联 | `TRIGGERS` 边 (EVENT → EVENT) | 事件链（一个事件触发另一个事件） |
| 事件影响 | `AFFECTS` 边 (EVENT → FINANCIAL/CLIENT/RISK) | 事件对财务/客户/风险的影响 |

**关键属性**：

| 属性 | 类型 | 来源接口 | 语义 |
|------|------|---------|------|
| `occurred_at` | string (ISO 8601) | EventProps.timestamp | 事件发生的精确时间戳（不可变） |
| `event_type` | string (枚举) | EventProps.eventType | 事件类型：'funding_round' / 'key_person_departure' / 'product_launch' / 'crisis' / 'regulatory_change' / 'competitor_move' / 'strategic_pivot' / 'market_shift' / 'partnership' / 'acquisition' / 'other' |
| `impact_scope` | string[] | 自定义（非EventProps原生） | 事件影响的节点池列表，如 ['TALENT_POOL', 'CAPITAL_POOL'] |
| `predecessor_event_id` | string | 通过TRIGGERS边反向查询 | 前驱事件ID——形成事件因果链 |
| `magnitude` | number (0-1) | 自定义 | 事件影响量级，0.1=轻微 0.5=显著 1.0=颠覆性 |
| `resolution_status` | string | 自定义 | 'ongoing' / 'resolved' / 'escalated'——事件是否已结束 |

**动态行为**：
- 事件是不可逆的——`occurred_at`一经设置永不可修改（仅软删除valid_to标记）。
- 事件的因果效应通过`TRIGGERS`边向外传导：EVENT → TRIGGERS → PROCESS（如审批/部署流程）→ 改变存量和活动池。
- 事件之间可以形成因果链：E1 → TRIGGERS → E2 → TRIGGERS → E3。这条链的长度和magnitude乘积决定了事件的系统性影响。
- `impact_scope` 是事后标注的——事件发生时标注预期影响范围，resolution_status='resolved'后标注实际影响范围。两者差异反映组织的"因果感知精度"。
- 同一`event_type`的事件频率突增（如'market_shift'事件每季度1次→每月3次）→ 环境湍流度上升，触发`environment-rent-dependency`哨兵升级。
- 10人企业：事件总频率低（5-15次/年），但单次`key_person_departure`事件的magnitude可能达到0.7-0.9（小团队对单点依赖敏感）。
- 100人企业：事件频率中（20-60次/年），`impact_scope`通常跨3-5个池。
- 500人企业：事件频率高（50-150次/年），需要事件分级机制——magnitude<0.3的事件可能被忽略，但需警惕多个小事件的同时爆发（级联效应）。

**与42条边的关联**：

| 角色 | 边ID | 说明 |
|------|------|------|
| **写** | E-01 ACTIVE_SCANNING | 扫描发现的事件写入EVENT节点 |
| **写** | E-02 PASSIVE_SIGNAL | 被动接收的外部信号产生事件 |
| **写** | E-03 EXTERNAL_ECHO | 外部环境变化产生事件 |
| **写** | E-14 DECISION_POWER | 重大决策作为事件记录 |
| **读** | E-04 PERCEPTION_LEARNING | 事件序列是感知学习的输入 |
| **读** | E-22 ROUTINE_MUTATION | 事件触发惯例变异 |
| **读** | E-40 REPUTATION_AMPLIFICATION | 品牌事件进入声誉飞轮 |
| **触发** | 所有含TRIGGERS边的因果路径 | EVENT → TRIGGERS → 下游节点池 |

**SOG-Core合规性说明**：

| 检查项 | 状态 | 说明 |
|--------|------|------|
| SOGNodeType.EVENT存在 | ✓ | 已存在于SOG-Core v1.0枚举中 |
| EventProps.timestamp必填 | ✓ | 映射到occurred_at |
| EventProps.eventType必填 | ✓ | 映射到event_type |
| TRIGGERS from端点含EVENT | ✓ | EDGE_ENDPOINT_MAP已定义 |
| AFFECTS from端点含EVENT | ✓ | EDGE_ENDPOINT_MAP已定义 |
| CORRESPONDS_TO端点含EVENT | ✓ | 事件可与文档/目标对应 |
| `impact_scope`为自定义属性 | —— | 存储在props_json的扩展字段中，不影响SOG-Core schema合规 |

---

## 第三部分：10表达层实体

---

表达层是用户可理解的自然语言语义面。每个表达层实体通过聚合公式从存储层的一个或多个节点池计算得出。表达层不存储数据——查询时实时计算。

**设计原则**：（1）每个表达层实体对应一个用户在使用Synova时会讨论的"东西"。（2）聚合公式是具体的数学表达式，不是概念描述。（3）每个公式标注规模依赖——同样的公式在10人/100人/500人企业下有不同的参数语义。

---

### 实体1：客户 (Customer)

**定义**：为企业付费并消费企业价值的外部实体。表达层的"客户"不只是CLIENT节点计数的简单聚合——它综合了客户规模、质量、关系和健康度。

**映射到存储层节点池**：客户池(CLIENT_POOL) + 品牌池(BRAND_POOL)

**聚合公式**：
```
CustomerHealth = 0.40 * client_pool.active_clients/max(1, client_pool.total_clients)
               + 0.15 * (1 - client_pool.churn_rate/0.10)  // 月流失率10%为基准
               + 0.15 * client_pool.arpu / target_arpu
               + 0.15 * (1 - client_pool.concentration_hhi/2500)  // HHI>2500为高集中
               + 0.15 * brand_pool.value_prop_distinctiveness
```
其中target_arpu为GA设定的每客户目标收入。所有分项clamp至[0, 1]。

**规模依赖**：
- 10人企业：`active_clients`典型5-50，`concentration_hhi`默认取min(1, 实际值/4000)（小企业天然集中）。`target_arpu`通常较低（<1000元/月/客户）。
- 100人企业：`active_clients`典型50-500，`churn_rate`基准调整为0.05（月）。`target_arpu`按行业设定。
- 500人企业：`active_clients`典型200-5000，`concentration_hhi`基准调整为10000（大企业可承受更高集中度）。`target_arpu`按客户分层使用加权均值。

---

### 实体2：产品 (Product)

**定义**：企业提供给客户的价值载体——可以是实物产品、软件服务、咨询服务或平台。表达层的"产品"综合了产品的知识内涵、技术含量和品牌溢价。

**映射到存储层节点池**：知识池(KNOWLEDGE_POOL) + 技术池(TECH_POOL) + 品牌池(BRAND_POOL) + 创新池(INNOVATION_POOL)

**聚合公式**：
```
ProductStrength = 0.25 * knowledge_pool.codification_rate
                + 0.25 * tech_pool.integration_coverage
                + 0.20 * brand_pool.value_prop_distinctiveness
                + 0.15 * (1 - tech_pool.tech_debt_score)
                + 0.10 * innovation_pool.innovation_conversion_rate
                + 0.05 * (innovation_pool.new_revenue_share / 0.30)  // 30%新产品收入为基准
```
所有分项clamp至[0, 1]。

**规模依赖**：
- 10人企业：`tech_pool.integration_coverage`可能为null（只有1-3个工具）→ 该项自动取0.7（少量工具的集成度被视为高）。`innovation_pool.new_revenue_share`通常高（小企业产品少，新产品占比大）。
- 100人企业：`tech_pool.tech_debt_score` > 0.5 → ProductStrength该项显著降低。`codification_rate`权重上升——产品复杂度需要显性知识支撑。
- 500人企业：`knowledge_pool.codification_rate`权重提升至0.30，`tech_pool.integration_coverage`权重降至0.20——大型组织的产品力更多来自知识管理而非工具集成。

---

### 实体3：团队 (Team)

**定义**：执行企业活动的人群集合——不只是人头数，而是人才能力、信任关系和权力结构的综合体现。

**映射到存储层节点池**：人才池(TALENT_POOL) + 信任池(TRUST_POOL) + 权力池(POWER_POOL)

**聚合公式**：
```
TeamHealth = 0.35 * talent_pool.talent_density
           + 0.15 * (1 - talent_pool.turnover_rate/0.15)  // 15%月流失率为红色基准
           + 0.15 * (1 - talent_pool.skill_mismatch)
           + 0.15 * trust_pool.trust_level
           + 0.10 * trust_pool.goal_alignment_score
           + 0.10 * (1 - power_pool.power_gini/0.60)  // Gini>0.6为过度集中
```
所有分项clamp至[0, 1]。

**规模依赖**：
- 10人企业：`talent_pool.talent_density`为关键项——一个人的能力波动会显著影响TeamHealth。`trust_pool.trust_level`权重升至0.20，`power_pool.power_gini`权重降至0.05（小团队权力集中是正常且高效的）。`turnover_rate`基准调整为0.08（小团队单人离职影响更大）。
- 100人企业：标准公式适用。`power_gini`基准维持在0.6。`skill_mismatch`权重升至0.20——中等规模企业最易出现结构性能力缺口。
- 500人企业：`talent_density`权重降至0.25（大数定律使人均能力趋于稳定），`goal_alignment_score`权重升至0.15——大规模组织的核心挑战是目标一致性。

---

### 实体4：现金流 (CashFlow)

**定义**：企业资金的流入、流出和存量状态。表达层的"现金流"不是简单的银行余额——它综合了资本结构、配置效率和盈利质量。

**映射到存储层节点池**：资本池(CAPITAL_POOL) + 数据池(DATA_POOL)

**聚合公式**：
```
CashFlowHealth = 0.35 * min(1, capital_pool.cash_runway_months / 18)  // 18个月为满分
               + 0.15 * (2 - min(2, max(0, capital_pool.debt_equity_ratio)))  // D/E=0得1分, D/E=1得0.5分
               + 0.15 * capital_pool.health_score
               + 0.15 * (1 - capital_pool.fixed_cost_ratio)  // 固定成本越低越灵活
               + 0.10 * (1 - capital_pool.revenue_concentration)  // 集中度越低越健康
               + 0.10 * data_pool.data_quality  // 财务数据质量影响现金流可见性
```
所有分项clamp至[0, 1]。当`debt_equity_ratio`为Infinity（equity=0）时该项取0。

**规模依赖**：
- 10人企业：`cash_runway_months`典型3-12个月——小企业跑道短但灵活；`fixed_cost_ratio`通常<0.3（轻资产）。`debt_equity_ratio`大多数情况下equity=0（自有资金），直接取该项为0.5（中性）。
- 100人企业：`cash_runway_months`典型6-24个月——中等企业的死亡谷在12个月左右。`fixed_cost_ratio`典型0.3-0.5。
- 500人企业：`cash_runway_months`典型3-18个月——大企业烧钱快但融资渠道多。`revenue_concentration`权重升至0.15——大企业客户集中度是重大风险。

---

### 实体5：渠道 (Channel)

**定义**：企业将价值传递给客户的路径体系——包括销售渠道、分销网络、营销触达和客户获取方式。表达层的"渠道"目前主要通过客户池和品牌池间接测量，因为SOG-Core v1.0中没有独立的渠道节点类型。

**映射到存储层节点池**：客户池(CLIENT_POOL) + 品牌池(BRAND_POOL)

> **说明**：渠道实体在SOG-Core v1.0中暂无原生节点类型映射。此处使用CLIENT_POOL + BRAND_POOL作为代理映射，通过客户获取成本和品牌触达范围间接推算渠道健康度。**提案新增**：建议在SOG-Core v1.1中增加`CHANNEL`节点类型（如SOGNodeType.CHANNEL），包含channelType（'direct_sales'/'distributor'/'online'/'retail'/'partner'）、覆盖地域、转化效率等属性。在CHANNEL节点新增之前，渠道实体的聚合公式精度有限。

**聚合公式（当前代理版本）**：
```
ChannelHealth = 0.30 * (1 - client_pool.churn_rate/0.10)
              + 0.25 * (client_pool.active_clients / max(1, client_pool.total_clients))
              + 0.25 * brand_pool.brand_strength  // 品牌=渠道吸引力的代理
              + 0.20 * (client_pool.arpu / target_arpu)
```
所有分项clamp至[0, 1]。

**规模依赖**：
- 10人企业：渠道通常是创始人的个人网络——`ChannelHealth`本质上衡量创始人的关系资本。
- 100人企业：渠道开始系统化——需要专职销售/BD团队。`brand_pool.brand_strength`权重升至0.30。
- 500人企业：多渠道体系——需要渠道分层管理。`client_pool.concentration_hhi`也可作为渠道集中度的代理（如果80%客户来自1个渠道→渠道风险）。

---

### 实体6：供应链 (SupplyChain)

**定义**：企业获取输入资源（物料、服务、技术许可）的外部来源网络。表达层的"供应链"衡量企业外部依赖的稳定性和成本效率。

**映射到存储层节点池**：技术池(TECH_POOL) + 知识池(KNOWLEDGE_POOL)

> **说明**：供应链实体在SOG-Core v1.0中暂无独立节点类型。当前通过技术池的工具依赖关系和知识池的外部知识来源作为代理。**提案新增**：建议在SOG-Core v1.1中增加`SUPPLIER`节点类型（如SOGNodeType.CLIENT的entityType='external'可复用，但语义不够精确）以及独立的`SUPPLY_CHAIN`节点。同时建议增加SUPPLIES边类型（SUPPLIER → TOOL/PROCESS）。在SUPPLIER节点新增之前，供应链实体的聚合公式精度有限。

**聚合公式（当前代理版本）**：
```
SupplyChainHealth = 0.35 * tech_pool.integration_coverage
                  + 0.25 * (1 - tech_pool.tech_debt_score)
                  + 0.25 * knowledge_pool.accessibility_score  // 外部知识可获取性
                  + 0.15 * (1 - knowledge_pool.knowledge_island_count / max(1, knowledge_pool.chunk_count))
```
所有分项clamp至[0, 1]。

**规模依赖**：
- 10人企业：供应链即少数供应商关系——`SupplyChainHealth`本质上衡量关键供应商的可靠性。
- 100人企业：供应商数5-30——需要供应商评估体系。`tech_pool.tool_count`可作为供应商数量代理。
- 500人企业：供应商数30-200——需要供应商分级管理和风险对冲。单点供应商依赖度（任一供应商占采购>30%）触发`make-or-buy`哨兵。

---

### 实体7：技术 (Technology)

**定义**：企业的技术资产和能力——从基础设施到应用层、从自研到外购、从人力到AI代理。表达层的"技术"综合了工具完备性、技术债务和技术团队的交付能力。

**映射到存储层节点池**：技术池(TECH_POOL)（直接映射）

**聚合公式**：
```
TechnologyHealth = 0.25 * tech_pool.integration_coverage
                 + 0.20 * (1 - tech_pool.tech_debt_score)
                 + 0.20 * tech_pool.agent_activity_rate
                 + 0.15 * (1 - min(1, tech_pool.tech_stack_age_days / 1095))  // 3年为满分基准
                 + 0.10 * (tech_pool.agent_count / max(1, headcount))  // AI代理渗透率
                 + 0.10 * data_pool.api_coverage
```
所有分项clamp至[0, 1]。`headcount`从人才池读取。

**规模依赖**：
- 10人企业：`tech_pool.tool_count`典型3-15，`tech_debt_score`通常低——但`integration_coverage`可能为null→取0.7。`agent_count`通常0-2，`agent_activity_rate`项可能为null→取0.5。
- 100人企业：标准公式适用。`agent_count`典型2-15，`agent_activity_rate` > 0.8为健康。
- 500人企业：`tech_stack_age_days`权重升至0.25（大企业技术栈老化是核心风险）。`integration_coverage` > 0.7为硬性目标。

---

### 实体8：数据 (Data)

**定义**：企业的数据资产质量和数据驱动决策能力。表达层的"数据"不只是数据点的数量——更强调数据的可诊断性和对决策的支撑力。

**映射到存储层节点池**：数据池(DATA_POOL)（直接映射）

**聚合公式**：
```
DataMaturity = 0.30 * data_pool.data_quality
             + 0.25 * data_pool.completeness
             + 0.20 * data_pool.freshness
             + 0.15 * data_pool.api_coverage
             + 0.10 * min(1, data_pool.data_point_count / target_data_points)
```
其中`target_data_points`由GA基于行业基准设定。所有分项clamp至[0, 1]。

**规模依赖**：
- 10人企业：`data_pool.completeness`通常0.1-0.3——小企业数据基础设施薄弱是常态。`target_data_points`设为500。`data_quality` < 0.3时大部分诊断模块降级运行。
- 100人企业：`target_data_points`设为5000。`completeness`在0.3-0.7范围。`api_coverage` > 0.5为健康。
- 500人企业：`target_data_points`设为20000。`completeness`应>0.6。`api_coverage` > 0.7——大型企业应实现主要系统的API集成。

---

### 实体9：决策 (Decision)

**定义**：企业的关键选择及其质量。表达层的"决策"从治理活动和权力结构中提取——它衡量的是"企业做正确选择的能力"。

**映射到存储层节点池**：治理池(GOVERNANCE_POOL) + 权力池(POWER_POOL) + 配置池(ALLOCATION_POOL)

**聚合公式**：
```
DecisionQuality = 0.30 * (1 - power_pool.power_gini/0.60)
                + 0.25 * allocation_pool.allocation_efficiency
                + 0.20 * (1 - min(1, power_pool.decision_delay_avg_days / 14))  // 14天为红色基准
                + 0.15 * governance_pool.compliance_score
                + 0.10 * (1 - governance_pool.governance_overhead_ratio/0.30)  // 30%治理开销为红色
```
所有分项clamp至[0, 1]。

**规模依赖**：
- 10人企业：`power_pool.power_gini`权重降至0.20（集中决策在小团队是优点），`decision_delay_avg_days`基准调整为3天（小企业决策应更快）。`governance_pool.governance_overhead_ratio`权重降至0.05（小企业不需要重流程）。
- 100人企业：标准公式适用。`power_gini`基准0.5——中等规模需要适度分权。`allocation_efficiency`权重升至0.30——中等规模企业的核心决策挑战在资源配置。
- 500人企业：`power_gini`基准降至0.4（大企业需要更扁平决策），`decision_delay_avg_days`基准调整至21天（大企业决策天然慢但需要规范）。`governance_overhead_ratio`权重升至0.15——大企业的治理开销占比是核心效率指标。

---

### 实体10：事件 (Event)

**定义**：企业中离散发生的重大变化——既包括外部冲击（市场变化、监管变更），也包括内部转折（融资、人事变动、战略转型）。表达层的"事件"综合了事件的发生频率、影响范围和因果链效应。

**映射到存储层节点池**：事件池(EVENT_POOL)（直接映射）

**聚合公式**：
```
EventTurbulence = 0.30 * min(1, event_frequency_trailing_90d / baseline_event_frequency)
                + 0.25 * avg_magnitude_trailing_90d
                + 0.20 * (1 - event_pool.resolution_rate)  // 未解决事件占比
                + 0.15 * max_causal_chain_length  // TRIGGERS边链的最大长度 / 5
                + 0.10 * cross_pool_impact_score  // 跨池影响的池数 / 总池数
```
其中：
- `event_frequency_trailing_90d` = 过去90天内的事件数
- `baseline_event_frequency` = 过去12个月的月均事件数*3
- `resolution_rate` = resolution_status='resolved'事件数 / 总事件数
- `max_causal_chain_length` = 通过TRIGGERS边BFS遍历得到的最大事件链长度，上限clamp至5
- `cross_pool_impact_score` = 过去90天事件impact_scope覆盖的不重复池数 / 16

所有分项clamp至[0, 1]。EventTurbulence > 0.7 → 环境湍流度过高，触发`environment-rent-dependency`哨兵升级。

**规模依赖**：
- 10人企业：`baseline_event_frequency`通常10-30次/年，单次事件的`max_causal_chain_length`通常1-2。`avg_magnitude`在0.3-0.8范围——小企业单次事件的冲击力大。
- 100人企业：`baseline_event_frequency`典型30-80次/年，`max_causal_chain_length` 2-4，`cross_pool_impact_score`通常0.3-0.6。
- 500人企业：`baseline_event_frequency`典型60-200次/年，`max_causal_chain_length` 3-5+，`resolution_rate` < 0.7 表示事件积压（太多未解决事件）。

---


---

## 第四部分：表达层→存储层映射总表

下表每行列出一个表达层实体、映射到的存储层节点池、聚合公式（简洁形式）和查询权重。此表是表达层查询引擎的唯一真相来源——任何对表达层实体的查询必须通过此映射路由到存储层。

| 表达层实体 | 映射到的存储层节点池 | 聚合公式（简洁） | 查询权重 | 备注 |
|-----------|-------------------|-----------------|---------|------|
| **客户** (Customer) | 客户池 + 品牌池 | `CustomerHealth = 0.40*active_ratio + 0.15*(1-churn/0.10) + 0.15*arpu_ratio + 0.15*(1-HHI/2500) + 0.15*value_prop` | 客户池0.70, 品牌池0.30 | churn基准和HHI基准随规模调整（见实体1规模依赖） |
| **产品** (Product) | 知识池 + 技术池 + 品牌池 + 创新池 | `ProductStrength = 0.25*codification + 0.25*integration + 0.20*value_prop + 0.15*(1-tech_debt) + 0.10*innovation_conv + 0.05*new_rev_ratio` | 知识池0.25, 技术池0.40, 品牌池0.20, 创新池0.15 | 规模依赖调整tech_debt和codification权重 |
| **团队** (Team) | 人才池 + 信任池 + 权力池 | `TeamHealth = 0.35*density + 0.15*(1-turnover/0.15) + 0.15*(1-mismatch) + 0.15*trust_level + 0.10*goal_align + 0.10*(1-gini/0.60)` | 人才池0.50, 信任池0.30, 权力池0.20 | 核心公式——TeamHealth是Synova诊断的最常用表达层实体 |
| **现金流** (CashFlow) | 资本池 + 数据池 | `CashFlowHealth = 0.35*runway_ratio + 0.15*de_ratio_score + 0.15*health_score + 0.15*(1-fixed_cost) + 0.10*(1-rev_conc) + 0.10*data_quality` | 资本池0.90, 数据池0.10 | D/E=Infinity时de_ratio_score取0 |
| **渠道** (Channel) | 客户池 + 品牌池 | `ChannelHealth = 0.30*(1-churn/0.10) + 0.25*active_ratio + 0.25*brand_strength + 0.20*arpu_ratio` | 客户池0.70, 品牌池0.30 | ⚠️ 代理映射——无原生CHANNEL节点类型（提案新增SOGNodeType.CHANNEL） |
| **供应链** (SupplyChain) | 技术池 + 知识池 | `SupplyChainHealth = 0.35*integration + 0.25*(1-tech_debt) + 0.25*accessibility + 0.15*(1-island_ratio)` | 技术池0.60, 知识池0.40 | ⚠️ 代理映射——无原生SUPPLIER节点类型（提案新增） |
| **技术** (Technology) | 技术池 | `TechnologyHealth = 0.25*integration + 0.20*(1-tech_debt) + 0.20*agent_activity + 0.15*(1-age/1095) + 0.10*agent_penetration + 0.10*api_coverage` | 技术池1.00 | 直接映射——表达层实体=技术池的语义包装 |
| **数据** (Data) | 数据池 | `DataMaturity = 0.30*data_quality + 0.25*completeness + 0.20*freshness + 0.15*api_coverage + 0.10*point_ratio` | 数据池1.00 | 直接映射——target_data_points由GA按规模设定 |
| **决策** (Decision) | 治理池 + 权力池 + 配置池 | `DecisionQuality = 0.30*(1-gini/0.60) + 0.25*alloc_eff + 0.20*(1-delay/14) + 0.15*compliance + 0.10*(1-gov_overhead/0.30)` | 治理池0.30, 权力池0.40, 配置池0.30 | 权重随规模显著调整（见实体9规模依赖） |
| **事件** (Event) | 事件池 | `EventTurbulence = 0.30*freq_ratio + 0.25*avg_magnitude + 0.20*(1-resolution_rate) + 0.15*chain_length/5 + 0.10*cross_pool_impact` | 事件池1.00 | 直接映射——EventTurbulence > 0.7 触发环境湍流警报 |

---

## 五、映射关系关键设计决策

### 5.1 直接映射 vs 组合映射

- **直接映射**：技术(Technology)、数据(Data)、事件(Event)三个表达层实体直接映射到对应的单一存储层节点池。这些实体的聚合公式只是对单一池属性的语义重包装——不需要跨池查询。
- **组合映射**：客户、产品、团队、现金流、渠道、供应链、决策七个表达层实体需要跨多个存储层节点池的组合查询。这些实体的聚合公式包含跨池的算术运算。
- **代理映射**：渠道(Channel)和供应链(SupplyChain)两个实体的存储层映射是代理性质的——SOG-Core v1.0没有原生的CHANNEL/SUPPLIER节点类型，当前通过相关池间接推算。这两个实体的精度标注为"有限"，需要在SOG-Core v1.1中新增节点类型支持。

### 5.2 规模依赖的实现

表达层实体的聚合公式中包含规模依赖参数（如基准churn_rate、基准HHI、target_data_points），这些参数由GA在团队配置中按企业规模（10人/100人/500人）预设。查询表达层实体时，当前企业规模从人才池的headcount读取，自动选择对应规模的参数组。

### 5.3 查询权重

查询权重决定了当用户查询一个表达层实体时，底层GraphStore查询的优先级和并行度。权重越高的存储层节点池查询优先级越高。例如查询"团队健康度"时：人才池(0.50)先查→信任池(0.30)次之→权力池(0.20)最后。如果人才池查询返回degraded，则TeamHealth整体标记degraded: true。

### 5.4 SOG-Core v1.0 合规性总结

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 所有15+1个节点池映射到SOGNodeType枚举 | ✓ 符合 | 从17个枚举值中选取，未新增枚举值 |
| 所有10个表达层实体有聚合公式 | ✓ 符合 | 公式均为具体数学表达式 |
| 所有聚合公式含规模依赖 | ✓ 符合 | 10人/100人/500人三档，含具体数值参数 |
| 表达层不直接调用GraphStore | ✓ 符合 | 通过存储层节点池间接读取 |
| 事件池SOG合规 | ✓ 符合 | 核心属性映射到EVENT原生节点；impact_scope/magnitude/resolution_status为扩展字段 |
| CHANNEL和SUPPLIER为提案新增 | ⚠️ 标注 | 当前使用代理映射，精度有限，建议SOG-Core v1.1新增 |

---

## 六、验收对照

对照研究方案v3.0 §十（验收标准）中与本章相关的条目：

| 验收标准 | 状态 | 本章对应位置 |
|---------|------|------------|
| 15节点池全部映射到SOGNodeType | ✓ | 第一部分 池1-15，每个池含SOGNodeType精确映射表 |
| 10表达层实体全部有→存储层聚合公式 | ✓ | 第三部分 实体1-10，每个含具体数学表达式 |
| 聚合公式是具体数学表达式，不是概念描述 | ✓ | 每个聚合公式含权重系数、clamp规则、基准值 |
| 规模依赖是具体数值 | ✓ | 每个实体含10人/100人/500人三档规模下的参数调整 |
| 事件池作为第16个池补充 | ✓ | 第二部分，含SOG合规性说明 |
| 边→节点池关联完整 | ✓ | 第一部分每个池含"与42条边的关联"表 |
| 表达层→存储层映射总表 | ✓ | 第四部分完整表格 |

---

> **下一章**：第四章——边→节点映射矩阵（42×15），将42条因果边与15个节点池的读写关系系统化为一对二维矩阵（读取矩阵 + 写入矩阵）。

