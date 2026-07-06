---
title: "JTBD 语义等价判定矩阵"
version: "v1.0"
date: "2026-07-06"
status: "Gate 1 产出 — 前置标准定义"
role: "跨场景 JTBD 去重的唯一判定依据"
scope: "6 场景 × 3 类型 × 多角色 → 去重后统一 JTBD 集合"
---

# JTBD 语义等价判定矩阵

> 本文件是 Gate 1 的唯一产出。6个场景独立穷举完成后，所有 JTBD 汇合至此，
> 按本文定义的三步法逐对判定——哪些是"同一件事的不同表述"，哪些是独立需求。
> 判定结果直接决定去重后的 JTBD 数量与 Synova 产品形态（通用 vs 垂直）。

---

## 1. 核心原则

**JTBD 的"语义等价"不是字面相似度——是两个 JTBD 所指向的决策行动是否可被同一组因果信息满足。**

判断标准只有一条：**如果两个 JTBD 的因果信息需求集合的交集覆盖率 > 0.8（Jaccard 相似度），则它们语义等价。**

但 6 个场景独立穷举时，JTBD 还不是标准化语法——我们无法直接计算信息需求交集。因此需要三步判定法：从粗到细，逐步缩小等价空间，最终由信息需求交集确认。

```
JTBD-A (消费品-中小)  ──┐
JTBD-B (制造-中大)    ──┤
JTBD-C (SaaS-中小)    ──┤ → 三步判定 → 等价 / 不等价 → 去重后统一 JTBD 集
JTBD-D (消费品-中大)  ──┤
...                   ──┘
```

---

## 2. 三步判定逻辑

### 概览

| 步骤 | 判定维度 | 问题 | 通过条件 | 失败后果 |
|------|---------|------|---------|---------|
| S1 | 决策动词 | 两个 JTBD 指向同一种决策行为吗？ | 动词属于同一决策动词类 | 不等价 — 直接结束 |
| S2 | 作用对象 | 两个 JTBD 作用在同一类本体实体上吗？ | 实体类型匹配 | 不等价 — 直接结束 |
| S3 | 信息缺口 | 两个 JTBD 的认知盲区是否同源？ | 信息缺口源的因果边类型重叠 >= 70% | 等价 |

三步是序列判定：任何一步判定为"不等价"，立即终止，不进入下一步。

---

## 3. 步骤一：核心决策动词判定

### 3.1 判定规则

决策动词是 JTBD 句式的谓语核心——"我需要 **[做什么决策]**"。

**规则：将自然语言动词映射到 7 个标准决策动词类。同类的两个 JTBD 通过 S1；不同类的不等价。**

### 3.2 七个标准决策动词类

| 决策动词类 | 语义核心 | 包含的自然语言动词 | 对应的 JTBD 类型 |
|-----------|---------|-------------------|-----------------|
| **ALLOCATE** | 分配资源到选项上 | 分配、投入、配置、预算、调配、倾斜 | 干预型 |
| **PREDICT** | 基于已知推未知 | 预测、预估、推算、展望、模拟、期望 | 预测型 |
| **DIAGNOSE** | 找出现象的原因 | 诊断、排查、定位、归因、找出、弄清楚 | 诊断型 |
| **EVALUATE** | 判断选项的优劣 | 评估、比较、选择、筛选、权衡、评价 | 干预型 / 诊断型 |
| **DESIGN** | 构造新方案或结构 | 设计、规划、制定、构建、搭建、重组 | 干预型 |
| **CONTROL** | 监控并调整偏差 | 监控、管控、调整、纠偏、优化、修正 | 干预型 |
| **NEGOTIATE** | 在多方之间达成协议 | 谈判、定价、协商、签约、续约 | 干预型 |

### 3.3 正例：通过 S1 的 JTBD 对

**正例 1：ALLOCATE 类内匹配**

```
JTBD-A (消费品-中小): "我需要决定下季度营销预算怎么分配到三个渠道"
JTBD-B (SaaS-中大):    "我需要配置50人销售团队的地域分布"

判定: 都映射到 ALLOCATE 类 -> 通过 S1，进入 S2
```

**正例 2：DIAGNOSE 类内匹配**

```
JTBD-A (制造-中小): "我需要找出B产线良率下降的根本原因"
JTBD-B (SaaS-中小): "我需要定位客户A续费率暴跌的根因"

判定: 都映射到 DIAGNOSE 类 -> 通过 S1，进入 S2
```

**正例 3：PREDICT 类内匹配**

```
JTBD-A (消费品-中大): "我需要预测Q4旺季的库存需求"
JTBD-B (制造-中小):   "我需要推算下月原材料采购量"

判定: 都映射到 PREDICT 类 -> 通过 S1，进入 S2
```

### 3.4 反例：不通过 S1 的 JTBD 对

**反例 1：DIAGNOSE vs PREDICT — 不等价**

```
JTBD-A (制造-中小): "我需要找出B产线良率下降的原因"         -> DIAGNOSE
JTBD-B (制造-中小): "我需要预测B产线下周良率是否会继续下降" -> PREDICT

判定: 动词类不同 -> 不等价，终止。这是两个不同的 JTBD。
原因: 诊断需要追溯因果链（断裂检测），预测需要趋势外推（时序模型）。
      信息需求完全不同，不可合并。
```

**反例 2：CONTROL vs DESIGN — 不等价**

```
JTBD-A (消费品-中大): "我需要实时监控各渠道ROI并调整投放"    -> CONTROL
JTBD-B (消费品-中大): "我需要规划明年全新的渠道组合策略"     -> DESIGN

判定: 动词类不同 -> 不等价，终止。
原因: CONTROL 是反馈循环（监控->对比->纠偏），DESIGN 是空白画布（构建全新结构）。
      时间约束和信息需求完全不同。
```

**反例 3：EVALUATE vs NEGOTIATE — 不等价**

```
JTBD-A (SaaS-中大): "我需要评估三家供应商的性价比"         -> EVALUATE
JTBD-B (SaaS-中大): "我需要和选定的供应商谈最终合同条款"   -> NEGOTIATE

判定: 动词类不同 -> 不等价，终止。
原因: EVALUATE 需要多维度比较信息，NEGOTIATE 需要对方底牌和备选方案。
      虽然业务上连续（先评估再谈判），但在 JTBD 维度上是两个独立需求。
```

### 3.5 S1 边界条件：动词模糊时的处理

当一个 JTBD 包含两个可能的决策动词时，取其**主要决策动词**——即如果不做这个决策会导致最大损失的动词。

```
示例: "我需要评估新市场的潜力并决定是否进入"

候选1: EVALUATE ("评估新市场的潜力")
候选2: ALLOCATE ("决定是否进入" -> 资源分配)

主要决策动词: ALLOCATE（"不进入"的决策结果是零资源分配，损失可量化；
            "评估"只是前置动作，不是最终决策）

映射: ALLOCATE 类
```

---

## 4. 步骤二：作用对象判定

### 4.1 判定规则

作用对象是 JTBD 句式的宾语核心——"我需要[对 **什么对象**]做[决策]"。

**规则：在 Synova 本体层中，每个作用对象映射到一个本体实体类型 + 一组属性维度。两个 JTBD 的作用对象属于同一实体类型 -> 通过 S2。**

### 4.2 Synova 本体层实体类型映射

| 实体类型 | 业务含义 | 典型属性维度 | JTBD 示例 |
|---------|---------|-------------|----------|
| **Customer** | 客户 / 客户群 | 复购率、LTV、流失风险、满意度、账期 | "A客户的复购率为什么在下降" |
| **Channel** | 渠道 / 触点 | ROI、转化率、覆盖率、获客成本 | "三个渠道的预算怎么分配" |
| **Product** | 产品 / SKU / 产线 | 良率、毛利率、周转率、生命周期阶段 | "B产线要不要继续投" |
| **Resource** | 资金 / 人力 / 物料 | 现金流、产能、技能分布、库存水位 | "现金流能不能撑到Q3" |
| **Market** | 市场 / 区域 / 赛道 | 市场规模、增长率、竞争密度、进入壁垒 | "E区域值不值得进入" |
| **Operation** | 流程 / 工单 / 项目 | 瓶颈、SLA达成率、效率、异常率 | "交付延迟卡在哪个环节" |
| **Supplier** | 供应商 / 合作伙伴 | 可靠性、价格趋势、替代选项、依赖度 | "核心原材料供应商要不要换" |

### 4.3 S2 的判定逻辑

```
判定逻辑:
  entity_type(A) == entity_type(B) ?
    NO  -> 不等价，终止
    YES -> 通过 S2，进入 S3
```

### 4.4 正例：通过 S2 的 JTBD 对

**正例 1：同一实体类型 Customer**

```
JTBD-A (消费品-中小): "我需要找出A客户复购率下降的原因"
  -> 作用对象: Customer, 属性: retention_rate
JTBD-B (SaaS-中小):   "我需要定位B客户流失风险上升的根因"
  -> 作用对象: Customer, 属性: churn_risk

判定: 实体类型同 Customer -> 通过 S2，进入 S3
      （retention_rate 和 churn_risk 的重叠在 S3 中判定）
```

**正例 2：同一实体类型 Channel**

```
JTBD-A (消费品-中大): "我需要把营销预算分配到三个渠道"
  -> 作用对象: Channel, 属性: marketing_roi
JTBD-B (SaaS-中小):   "我需要评估销售团队的渠道覆盖是否合理"
  -> 作用对象: Channel, 属性: coverage_rate

判定: 实体类型同 Channel -> 通过 S2，进入 S3
```

**正例 3：同一实体类型 Resource — 但业务领域不同**

```
JTBD-A (制造-中小): "我需要预测下月原材料采购的资金需求"
  -> 作用对象: Resource (物料->资金), 属性: procurement_cost
JTBD-B (SaaS-中大):  "我需要推算出差旅预算能否撑到年底"
  -> 作用对象: Resource (资金), 属性: budget_consumption_rate

判定: 实体类型同 Resource -> 通过 S2，进入 S3
      （虽然一个是物料采购、一个是差旅预算，但都在 Resource 实体下）
```

### 4.5 反例：不通过 S2 的 JTBD 对

**反例 1：Customer vs Product — 不等价**

```
JTBD-A (消费品-中小): "我需要找出A客户复购率下降的原因"
  -> 作用对象: Customer
JTBD-B (消费品-中小): "我需要分析为什么B产品退货率在上升"
  -> 作用对象: Product

判定: 实体类型不同 -> 不等价，终止。
原因: 虽然是同一家公司，但 Customer 的因果信息需求沿 BUYS_FROM 边展开，
      Product 的因果信息需求沿 PRODUCES 边展开——图遍历路径完全不同。
```

**反例 2：Channel vs Market — 不等价**

```
JTBD-A (SaaS-中小): "三个渠道的预算怎么分配"
  -> 作用对象: Channel
JTBD-B (SaaS-中小): "E区域市场值不值得进入"
  -> 作用对象: Market

判定: 实体类型不同 -> 不等价，终止。
原因: Channel 是"怎么卖"，Market 是"在哪卖"——一个是战术、一个是战略。
      Channel 需要 ROI/转化率，Market 需要规模/增长率/竞争密度。
```

**反例 3：Resource(资金) vs Operation(流程) — 不等价**

```
JTBD-A (制造-中大): "现金流能不能撑到Q3"       -> Resource
JTBD-B (制造-中大): "交付延迟卡在哪个环节"      -> Operation

判定: 实体类型不同 -> 不等价，终止。
原因: 一个是资金链（财务维度），一个是流程瓶颈（运营维度）。
      虽然"交付延迟"可能导致"现金流紧张"（因果关联），
      但 JTBD 的作用对象不同——这是两个独立需求。
```

---

## 5. 步骤三：信息缺口同源判定

### 5.1 判定规则

信息缺口是 JTBD 句式的从句核心——"但我 **[不确定什么信息]**"。

**规则：提取两个 JTBD 各自所需的因果信息需求（即使还不是标准化语法，也推断其图遍历路径），计算两个路径的边类型重叠度。重叠度 >= 70% -> 等价。**

### 5.2 信息缺口源的分类——因果边类型

在 Synova 本体层中，每个信息缺口对应一张或几张因果边类型的遍历。标准边类型如下：

| 边类型 | 语义 | 典型信息需求 |
|--------|------|-------------|
| PRODUCES | 实体->产出 | 产出量、产出质量、单位成本 |
| CONSUMES | 实体->消耗 | 消耗量、消耗速率、消耗效率 |
| BUYS_FROM | 客户->渠道->产品 | 复购率、客单价、流失率 |
| AFFECTS | 实体->影响 | 因果推断、归因权重、影响传播 |
| DEPENDS_ON | 实体->依赖 | 依赖强度、替代选项、脆弱性 |
| COMPETES_WITH | 实体->竞争 | 竞争强度、市场份额变化、替代威胁 |
| FLOWS_TO | 资金流 | 现金流入/流出、账期、坏账 |
| REPORTS_TO | 组织汇报 | 审批链、信息传递延迟、决策权限 |

### 5.3 信息缺口同源的三级判定

| 重叠等级 | 条件 | 判定 |
|---------|------|------|
| 完全重叠 | 边类型集合完全相同 | 等价 |
| 高度重叠 | 边类型集合重叠 >= 70% | 等价 |
| 部分重叠 | 50% <= 重叠 < 70% | 进入子判定 |
| 低重叠 | 重叠 < 50% | 不等价 |

**子判定（部分重叠时）：检查两个 JTBD 的核心因果链是否汇聚到同一节点。**

```
如果 JTBD-A 和 JTBD-B 的共同因果链 >= 2 层且汇聚到同一实体 -> 等价
否则 -> 不等价
```

### 5.4 正例：通过 S3 的 JTBD 对

**正例 1：完全重叠 — Customer 复购/流失（经典案例）**

```
JTBD-A (消费品-中小): "我需要找出A客户复购率下降的原因"
  信息缺口推断: BUYS_FROM(retention_rate, trend, 6个月)
               + AFFECTS(causal_factor -> retention)

JTBD-B (SaaS-中小): "我需要定位B客户流失风险上升的根因"
  信息缺口推断: BUYS_FROM(churn_rate, trend, 3个月)
               + AFFECTS(causal_factor -> churn)

边类型集合: {BUYS_FROM, AFFECTS} = {BUYS_FROM, AFFECTS}
重叠度: 100% -> 等价

判定: 语义等价。两者都是"客户为什么不再买了"。
      消费品叫"复购率下降"，SaaS叫"流失风险上升"——同一个 JTBD。
```

**正例 2：高度重叠 — Channel 预算分配**

```
JTBD-A (消费品-中大): "我需要分配三个渠道的营销预算"
  信息缺口推断: BUYS_FROM(channel_roi, aggregate, Q)
               + AFFECTS(competitor_action -> channel_performance)
               + CONSUMES(marketing_spend, per_channel)

JTBD-B (SaaS-中小): "我需要判断销售团队的地域覆盖是否合理"
  信息缺口推断: BUYS_FROM(lead_conversion, per_region)
               + CONSUMES(sales_headcount, per_region)
               + AFFECTS(market_saturation -> conversion)

边类型集合: {BUYS_FROM, CONSUMES, AFFECTS} ∩ {BUYS_FROM, CONSUMES, AFFECTS}
重叠度: 100% -> 等价

判定: 语义等价。都是"资源（预算/人力）怎么分配到渠道/区域"。
      消费品叫"营销预算分配"，SaaS叫"销售覆盖"——同一个 JTBD。
```

**正例 3：高度重叠 — Resource 现金流预测**

```
JTBD-A (制造-中小): "我需要预测下月原材料采购的资金需求"
  信息缺口推断: CONSUMES(material_quantity, forecast, 30d)
               + FLOWS_TO(cash_outflow, projected)
               + DEPENDS_ON(supplier_price, trend)

JTBD-B (消费品-中大): "我需要预测旺季备货的现金流缺口"
  信息缺口推断: CONSUMES(inventory_build, forecast, 60d)
               + FLOWS_TO(cash_outflow, projected)
               + DEPENDS_ON(seasonal_demand, pattern)

边类型集合: {CONSUMES, FLOWS_TO, DEPENDS_ON} ∩ {CONSUMES, FLOWS_TO, DEPENDS_ON}
重叠度: 100% -> 等价

判定: 语义等价。都是"未来的资金消耗预测"。
      制造叫"采购资金需求"，消费品叫"备货现金流缺口"——同一个 JTBD。
```

### 5.5 反例：不通过 S3 的 JTBD 对

**反例 1：S1+S2 通过但 S3 低重叠 — Channel 预算 vs Channel 绩效**

```
JTBD-A (消费品-中大): "我需要分配三个渠道的营销预算"
  边类型: {BUYS_FROM, CONSUMES, AFFECTS}

JTBD-B (消费品-中大): "我需要找出D渠道转化率暴跌的根因"
  边类型: {BUYS_FROM, AFFECTS, COMPETES_WITH}

重叠: {BUYS_FROM, AFFECTS} / {BUYS_FROM, CONSUMES, AFFECTS, COMPETES_WITH}
     = 2/4 = 50% -> 进入子判定

子判定: JTBD-A 的核心因果链-> channel.roi -> allocate_budget (ALLOCATE逻辑)
         JTBD-B 的核心因果链-> channel.conversion -> competitor_attack -> root_cause (DIAGNOSE逻辑)
         汇聚节点不同 -> 不等价

判定: 不等价。虽然都是 Channel 实体，但一个是"投多少钱"（ALLOCATE），
      一个是"为什么变差了"（DIAGNOSE）。
```

**反例 2：S1+S2 通过但 S3 低重叠 — Product 良率 vs Product 退市**

```
JTBD-A (制造-中小): "我需要找出B产线良率下降的原因"
  边类型: {PRODUCES, AFFECTS, DEPENDS_ON}

JTBD-B (制造-中小): "我需要判断C产品线是否应该退出市场"
  边类型: {COMPETES_WITH, FLOWS_TO, BUYS_FROM}

重叠: {} / {PRODUCES, AFFECTS, DEPENDS_ON, COMPETES_WITH, FLOWS_TO, BUYS_FROM}
     = 0/6 = 0% -> 不等价

判定: 不等价。虽然都是 Product 实体，但一个关注"质量根因"，
      一个关注"市场生存"——完全不同的因果信息网络。
```

---

## 6. 边界条件：看似相似但不等价的场景

以下是经过对抗性验证的边界案例——两两之间表面相似，但三步法判定为不等价。

### 边界 1：同决策动词 + 同实体类型 + 不同空间尺度

```
JTBD-A: "我需要调整A客户的账期"         -> Customer x 个体
JTBD-B: "我需要评估客户群的账期策略"     -> Customer x 群体

S1: 都映射到 CONTROL/EVALUATE -> 可能同类
S2: 同 Customer 实体 -> 通过
S3: JTBD-A 需要 BUYS_FROM(A客户, 账期历史, 个体) + FLOWS_TO(现金流影响, 增量)
     JTBD-B 需要 BUYS_FROM(所有客户, 账期分布, 聚合) + FLOWS_TO(现金流影响, 总量)
     边类型相同但聚合方式不同 -> 重叠度: {BUYS_FROM, FLOWS_TO} = 100%

S3 粒度补救规则: 当实体类型相同但粒度不同（个体 vs 群体）时，
            检查因果链是否可相互推导:
            - 从群体推导个体: NO（群体平均值不能代替个体判断）
            - 从个体推导群体: NO（个体案例不能代替群体策略）
            -> 不等价

判定: 不等价。一个是个体信用决策，一个是群体策略决策。
```

### 边界 2：同决策动词 + 相邻实体类型 + 业务连续性

```
JTBD-A: "我需要优化交付流程中的瓶颈环节"      -> Operation
JTBD-B: "我需要减少交付延迟对客户流失的影响"  -> Customer

S1: 都映射到 CONTROL/DIAGNOSE -> 可能同类
S2: Operation vs Customer -> 不同实体类型 -> 不等价

虽然业务上连续（交付延迟 -> 客户流失），但 JTBD 是独立的。
JTBD-A 需要流程瓶颈信息，JTBD-B 需要客户行为信息。

判定: 不等价。作用对象不同，因果路径不同。
```

### 边界 3：同实体类型 + 同决策动词 + 不同时间窗口导致因果路径分化

```
JTBD-A (制造-中小): "我需要实时监控产线异常并立即调整"   -> CONTROL, 实时
JTBD-B (制造-中小): "我需要月度分析产线整体效率并优化"   -> CONTROL, 月度

S1: 同 CONTROL 类 -> 通过
S2: 同 Product(产线) 实体 -> 通过
S3: JTBD-A 需要 PRODUCES(anomaly_detection, real-time, per_machine)
     JTBD-B 需要 PRODUCES(oee_trend, monthly, per_line)
     边类型相同，但 compute 函数不同:
     - 实时需要流式 anomaly_detection（滑动窗口、阈值告警）
     - 月度需要 OEE 聚合 + 趋势对比（统计分析、帕累托）

边类型集合重叠: {PRODUCES} ∩ {PRODUCES} = 100%
但 S3 细化规则: 时间窗口差异导致 compute 函数集重叠度 = 0% -> 不等价

判定: 不等价。虽然都是"产线控制"，但实时监控和月度优化需要完全不同的
      compute 函数和因果信息结构。

S3 细化规则: 时间窗口的差异不仅影响数据聚合方式，还可能导致因果边类型
            虽然相同但遍历方式完全不同。此时在 S3 中增加一个子判定——
            compute 函数集的重叠度 > 50% 才等价。
```

### 边界 4：行业术语相似但映射到不同实体类型

```
JTBD-A (SaaS-中小): "我需要降低客户获取成本（CAC）"       -> Customer, BUYS_FROM
JTBD-B (制造-中小): "我需要降低原材料单位采购成本"          -> Resource, CONSUMES

S1: 都映射到 CONTROL 类 -> 通过
S2: Customer vs Resource -> 不同实体类型 -> 不等价

虽然都是"降低成本"，但：CAC 是获客效率问题（BUYS_FROM 边），
采购成本是供应链效率问题（CONSUMES 边）——完全不同的因果网络。

判定: 不等价。行业术语"降低成本"只是字面相似，
      在 Synova 本体层中映射到不同实体和不同因果边。
```

### 边界 5：同一 JTBD 在不同角色视角下的信息维度拆分

```
JTBD: "评估新市场机会"

CFO 视角:      "我需要评估新市场机会的ROI和现金流影响"
产品经理视角:  "我需要评估新市场机会的技术可行性和用户需求匹配度"
销售VP视角:    "我需要评估新市场机会的渠道可达性和客户关系"

S1: 同 EVALUATE 类 -> 通过
S2: 同 Market 实体 -> 通过
S3: CFO 需要 {FLOWS_TO, DEPENDS_ON}
     产品经理需要 {PRODUCES, BUYS_FROM, COMPETES_WITH}
     销售VP需要 {BUYS_FROM, DEPENDS_ON}

三者边类型并集: {FLOWS_TO, DEPENDS_ON, PRODUCES, BUYS_FROM, COMPETES_WITH}
任意两者交集最多: 2/5 = 40% -> 低重叠

判定: 这是同一个 JTBD 的 3 个信息维度，不是 3 个不同的 JTBD。

特殊规则: 当 S3 判定为不等价但 S1+S2 通过且 JTBD 的核心决策问题（语句主干）
         完全相同时，标记为"同一 JTBD x 多角色信息维度" -> 不拆分。

对应研究方案的步骤 1.4。
```

---

## 7. 判定矩阵：决策动词 x 作用对象 x 信息缺口源

### 7.1 三维矩阵总览

```
                    决策动词 (S1)
                   ALLOCATE PREDICT DIAGNOSE EVALUATE DESIGN CONTROL NEGOTIATE
                  ┌────────┬───────┬────────┬────────┬──────┬───────┬─────────┐
   Customer       │  A1    │  P1   │  D1    │  E1    │ De1  │  C1   │  N1    │
   Channel        │  A2    │  P2   │  D2    │  E2    │ De2  │  C2   │  N2    │
S2 Product        │  A3    │  P3   │  D3    │  E3    │ De3  │  C3   │  N3    │
   Resource       │  A4    │  P4   │  D4    │  E4    │ De4  │  C4   │  N4    │
   Market         │  A5    │  P5   │  D5    │  E5    │ De5  │  C5   │  N5    │
   Operation      │  A6    │  P6   │  D6    │  E6    │ De6  │  C6   │  N6    │
   Supplier       │  A7    │  P7   │  D7    │  E7    │ De7  │  C7   │  N7    │
                  └────────┴───────┴────────┴────────┴──────┴───────┴─────────┘

每个格子 (S1xS2) 是一个"JTBD 类"。
同一格子内的 JTBD 通过 S1 和 S2，进入 S3（信息缺口重叠度精算）。
不同格子的 JTBD -> 不等价（在 S1 或 S2 已终止）。
```

### 7.2 格子内 S3 判定子矩阵

以 A2 格子 (ALLOCATE x Channel) 为例：

```
JTBD 信息缺口边类型: BUYS_FROM | CONSUMES | AFFECTS | DEPENDS_ON | COMPETES_WITH | FLOWS_TO
                    ───────────┼──────────┼─────────┼────────────┼───────────────┼──────────
JTBD-A2-01          ●          │ ●        │ ●       │            │               │
JTBD-A2-02          ●          │ ●        │         │ ●          │               │
JTBD-A2-03          ●          │          │ ●       │            │ ●             │
JTBD-A2-04                     │ ●        │ ●       │            │               │ ●

等价判定:
  A2-01 vs A2-02: {BUYS_FROM, CONSUMES, AFFECTS} ∩ {BUYS_FROM, CONSUMES, DEPENDS_ON}
                 = {BUYS_FROM, CONSUMES} / {BUYS_FROM, CONSUMES, AFFECTS, DEPENDS_ON}
                 = 2/4 = 50% -> 子判定

子判定: 两者核心因果链都汇聚到 channel.roi -> allocate
       -> 汇聚节点相同 -> 等价

  A2-01 vs A2-03: {BUYS_FROM, CONSUMES, AFFECTS} ∩ {BUYS_FROM, AFFECTS, COMPETES_WITH}
                 = {BUYS_FROM, AFFECTS} / {BUYS_FROM, CONSUMES, AFFECTS, COMPETES_WITH}
                 = 2/4 = 50% -> 子判定

子判定: A2-01 汇聚到 allocate_budget, A2-03 汇聚到 competitive_position
       -> 汇聚节点不同 -> 不等价

  A2-01 vs A2-04: {BUYS_FROM, CONSUMES, AFFECTS} ∩ {CONSUMES, AFFECTS, FLOWS_TO}
                 = {CONSUMES, AFFECTS} / {BUYS_FROM, CONSUMES, AFFECTS, FLOWS_TO}
                 = 2/4 = 50% -> 子判定

子判定: A2-01 汇聚到 allocate_budget, A2-04 汇聚到 cash_flow_projection
       -> 汇聚节点不同 -> 不等价
```

### 7.3 各格子的典型 JTBD 示例（供穷举阶段参考）

| 格子 | 典型 JTBD | 典型场景 |
|------|----------|---------|
| A1 | 把服务资源分配给高价值客户和问题客户 | 消费品、SaaS |
| A2 | 把营销预算分配到渠道/区域 | 消费品、SaaS |
| A3 | 把研发资源分配到产品线 | 制造、SaaS |
| A4 | 把现金流分配到应付账款和投资 | 通用 |
| A5 | 把扩张资源分配到新市场 | 通用 |
| A6 | 把改进资源分配到瓶颈环节 | 制造 |
| P1 | 预测客户流失/复购趋势 | 消费品、SaaS |
| P2 | 预测渠道/区域销售达成 | 消费品、SaaS |
| P3 | 预测产能/库存需求 | 制造、消费品 |
| P4 | 预测现金流/资金缺口 | 通用 |
| D1 | 诊断客户流失/复购下降的根因 | 消费品、SaaS |
| D2 | 诊断渠道绩效异常 | 消费品、SaaS |
| D3 | 诊断产品质量/良率问题 | 制造 |
| D6 | 诊断交付/服务延迟的瓶颈 | 制造、SaaS |
| E1 | 评估客户信用/价值分级 | 通用 |
| E3 | 评估产品线生命周期/退出时机 | 制造、SaaS |
| E5 | 评估新市场进入可行性 | 通用 |
| C1 | 监控客户健康度并触发干预 | 消费品、SaaS |
| C2 | 实时调整渠道投放策略 | 消费品 |
| C3 | 实时监控产线异常并调整 | 制造 |
| C4 | 监控现金流偏离并触发警报 | 通用 |
| N1 | 与大客户谈判续约条款 | SaaS |
| N7 | 与供应商谈判采购价格 | 制造 |

---

## 8. 判定流程速查——操作手册

### 8.1 单对 JTBD 判定流程

```
输入: JTBD-A, JTBD-B (来自不同场景或同一场景)

S1: 提取决策动词 -> 映射到 7 个标准决策动词类
    A.class == B.class ? -> YES: 继续 / NO: 输出 "不等价 (决策动词不同)"

S2: 提取作用对象 -> 映射到 Synova 本体层实体类型
    A.entity_type == B.entity_type ? -> YES: 继续 / NO: 输出 "不等价 (作用对象不同)"

S3: 提取信息缺口 -> 推断因果边类型集合 + 图遍历路径
    overlap = |A.edges ∩ B.edges| / |A.edges ∪ B.edges|
    overlap >= 70% ? -> YES: 输出 "等价"
    overlap >= 50% ? -> 子判定: 汇聚节点相同? -> YES: "等价" / NO: "不等价"
    overlap < 50% ? -> 检查特殊规则 (边界5: 多角色信息维度) -> 输出判定

输出: 等价 / 不等价 (+ 判定路径 + 原因)
```

### 8.2 批量去重流程（第一阶段完成后执行）

```
1. 汇合 6 个场景的所有 JTBD -> 初始集合 S (预计 N 个)
2. 对 S 中的每个 JTBD，标注 (S1_class, S2_entity, S3_edges)
3. 将 S 按 (S1_class, S2_entity) 分组 -> 最多 7x7 = 49 个格子
4. 每个格子内，逐对运行 S3 判定
5. 合并等价 JTBD 对 -> 保留一个代表 JTBD + 标注等价变体列表
6. 应用边界条件特殊规则（边界 5: 多角色同 JTBD 不拆分）
7. 去重后输出统一 JTBD 集 -> 进入 Gate 2（跨场景重叠度分析）
```

### 8.3 判定结果的编码格式

每个等价判定输出为一行：

```
{代表JTBD-ID} | {决策动词类} | {实体类型} | {主要边类型} | {等价变体列表} | {判定路径}
```

示例：

```
JTBD-D1 | DIAGNOSE | Customer | BUYS_FROM,AFFECTS | [D1-消费品-中小,D1-SaaS-中小,D1-消费品-中大] | S1+S2+S3:100%
```

---

## 9. 注意事项与常见误判

1. **字面相似不等于语义等价。** "降低成本"可以映射到 4 种不同的 JTBD 类（取决于降的是什么成本——获客、采购、运营、人力）。
2. **业务连续不等于 JTBD 同一。** "评估供应商" -> "谈判合同" -> "监控交付"是连续流程，但分属 EVALUATE、NEGOTIATE、CONTROL 三个 JTBD。
3. **行业术语差异不等于 JTBD 不同。** 消费品说"复购率下降"，SaaS说"续费率暴跌"，制造说"客户流失"——只要有相同的 (决策动词 + 实体类型 + 边集合)，就是同一个 JTBD。
4. **角色视角差异不等于 JTBD 不同。** CFO 和销售VP看"新市场"需要不同信息，但这是同一个 JTBD 的多维度——不拆分成多个 JTBD。
5. **S3 的边类型推断需要保守。** 穷举阶段的 JTBD 还不是标准化语法——边类型推断可能的范围会偏大。宁可保守（多归为不等价），不可激进（不该合并的合并了）。第二阶段标准化语法建立后，可以回溯修正。

---

> 本文件将在第一阶段 JTBD 穷举完成后，作为 `步骤 1.7` 的唯一操作手册使用。
> 任何两个 JTBD 的等价判定必须引用本文件的具体判定路径——不允许凭感觉判断。
