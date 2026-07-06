---
title: "JTBD 去重后统一 JTBD 集 — v2（全6场景）"
version: "v2.0"
date: "2026-07-06"
status: "步骤 1.7 产出 — 跨场景语义等价去重完成"
input_scenes: "S1(消费品中小) + S2(消费品中大) + S3(制造中小) + S4(制造中大) + S5(SaaS中小) + S6(SaaS中大)"
methodology: "语义等价判定矩阵 v1.0 — 三步判定法 (S1决策动词 x S2实体类型 x S3信息缺口同源)"
---

# JTBD 去重后统一 JTBD 集 — v2（全6场景）

> 第二次运行。覆盖全部6个场景（S1-S6），按语义等价判定矩阵三步法逐格去重。

---

## 1. 处理验证

| 场景 | 输入文件 | 原始 JTBD 数 | 去重后贡献数 | 处理状态 |
|------|---------|-------------|------------|---------|
| S1 | 消费品中小 | 58 | 42 | OK |
| S2 | 消费品中大 | 53 | 42 | OK |
| S3 | 制造中小 | 48 | 38 | OK |
| S4 | 制造中大 | 68 | 53 | OK |
| S5 | SaaS中小 | 30 | 25 | OK |
| S6 | SaaS中大 | 59 | 48 | OK |

**确认**: 全部6个场景均被处理，S2（59个）和S3（50个）已包含在内。

---

## 2. 总览

| 指标 | 数值 |
|------|------|
| 去重前总数 | **316** |
| 去重后总数 | **177** |
| 合并率 | **44.0%** |
| 占用格子数 | **43 / 49** |
| 两两判定次数 | **1945** |

---

## 3. 按格子分布（49格矩阵）

# 7x7 matrix header
| 格子 | ALLOCATE | DIAGNOSE | PREDICT | EVALUATE | DESIGN | CONTROL | NEGOTIATE |
|------|----------|----------|---------|----------|--------|---------|-----------|
| **Customer** | 15→**8** | 19→**8** | 12→**5** | 10→**5** | 3→**2** | 4→**3** | 2→**2** |
| **Channel** | 16→**9** | 12→**8** | 4→**3** | 2→**2** | 3→**2** | 1→**1** | — |
| **Product** | 16→**10** | 23→**9** | 5→**5** | 10→**8** | 4→**4** | 1→**1** | — |
| **Resource** | 18→**5** | 20→**10** | 16→**9** | 5→**4** | 1→**1** | 4→**3** | — |
| **Market** | 12→**7** | 5→**3** | 3→**3** | 4→**4** | 1→**1** | 1→**1** | — |
| **Operation** | 6→**4** | 24→**4** | 2→**2** | 2→**2** | 7→**3** | 6→**4** | 2→**2** |
| **Supplier** | — | 6→**4** | 4→**1** | 3→**3** | 1→**1** | — | 1→**1** |

---

## 4. 去重后 JTBD 列表

### ALLOCATE × Customer (8 U-JTBDs)

**U-JTBD-0010** | `ALLOCATE` | `Customer` | `BUYS_FROM,FLOWS_TO`
> 我需要决定是否要对中小客户群全面推行纯自助Onboarding（零人手介入），以释放CSM资源给大客户——但我不确定自助Onboarding的激活率能否维持在可接受水平。现在混合模式（轻CSM+自动化）的激活率是68%，如果纯自助降到50%以下，省下来的CSM成本都被流失了。
> 等价变体 (8个): S1-JTBD-005, S1-JTBD-024, S1-JTBD-042, S1-JTBD-046, S1-JTBD-058, S2-JTBD-007, S6-JTBD-014, S6-JTBD-031
> 来源场景: S1, S2, S6

**U-JTBD-0011** | `ALLOCATE` | `Customer` | `COMPETES_WITH`
> 我需要决定是否对新款产品做"前期低价冲量→后期提价"的螺旋策略，但我不确定当前类目的竞品价格天花板和用户价格敏感度。
> 来源场景: S1

**U-JTBD-0012** | `ALLOCATE` | `Customer` | `DEPENDS_ON,FLOWS_TO`
> 我需要决定是否应该拉紧对某大客户的账期政策（缩短账期或要求预付款），但我没有该客户的综合价值评估——包括累计利润率、坏账风险和客户关系重要性。
> 来源场景: S1

**U-JTBD-0013** | `ALLOCATE` | `Customer` | `FLOWS_TO`
> 我需要决定是否值得给A大客户降价5%来保住这个订单，但我不确定这个客户现在的真实利润贡献、降价后还能不能覆盖固定成本、以及丢了A客户的后果有多大。
> 来源场景: S3

**U-JTBD-0014** | `ALLOCATE` | `Customer` | `AFFECTS`
> 我需要决定临时插单对整体交期的冲击——某个大客户要求加急，插进去意味着哪些其他订单要延期、延多久、延了会不会被罚款。
> 来源场景: S4

**U-JTBD-0015** | `ALLOCATE` | `Customer` | `PRODUCES,AFFECTS,COMPETES_WITH,FLOWS_TO`
> 我需要决定给客户B的报价策略——报高了丢单，报低了做完才发现亏本。我不确定这个产品的真实制造成本是多少，也不知道竞争对手大概报什么价。
> 来源场景: S4

**U-JTBD-0016** | `ALLOCATE` | `Customer` | `UNKNOWN`
> "我需要为产品定价或调整定价模型，但我不确定不同客群的价格敏感度、以及提价会损失多少客户。"
> 来源场景: S5

**U-JTBD-0017** | `ALLOCATE` | `Customer` | `COMPETES_WITH,FLOWS_TO`
> 我需要判断哪些客户是该重点做增购（upsell/cross-sell）的——CS团队说"A客户正在用竞品的XX模块，我们可以抢过来"，但我不确定A客户对当前产品的满意度是否足够高、以及竞品模块的替换成本。去年尝试对3个"高潜力"客户做增购全部失败。
> 来源场景: S6

---

### ALLOCATE × Channel (9 U-JTBDs)

**U-JTBD-0001** | `ALLOCATE` | `Channel` | `BUYS_FROM,CONSUMES,FLOWS_TO`
> 我需要决定天猫旗舰店的直通车/引力魔方预算明天是否要加投，但我不确定当前计划的ROI是否在盈利线以上（扣掉产品成本和退货损耗后的真实ROI）。
> 等价变体 (4个): S1-JTBD-001, S1-JTBD-010, S2-JTBD-001, S2-JTBD-025
> 来源场景: S1, S2

**U-JTBD-0002** | `ALLOCATE` | `Channel` | `DEPENDS_ON`
> 我需要决定本周直播间排品顺序和话术重点，但我不确定每一款产品当前的真实库存深度和发货能力（超卖风险有多大）。
> 来源场景: S1

**U-JTBD-0003** | `ALLOCATE` | `Channel` | `COMPETES_WITH`
> 我需要决定竞品突然大幅度降价/推新品时我们要不要跟进、怎么跟，但我没有竞品价格变动、新品节奏和渠道策略的系统监控。
> 来源场景: S1

**U-JTBD-0004** | `ALLOCATE` | `Channel` | `AFFECTS`
> 我需要决定是否在小红书/抖音上有负面舆情发酵时需要官方回应、还是冷处理，但我无法判断当前负面声量的传播速度和真实影响力。
> 来源场景: S1

**U-JTBD-0005** | `ALLOCATE` | `Channel` | `UNKNOWN`
> 我需要判断哪些公域客户值得引导到私域、用什么样的钩子（优惠券/内容/服务）引导，但我不确定不同渠道来源的客户在私域中的长期价值差异。
> 等价变体 (4个): S1-JTBD-022, S1-JTBD-044, S2-JTBD-045, S4-JTBD-027
> 来源场景: S1, S2, S4

**U-JTBD-0006** | `ALLOCATE` | `Channel` | `PRODUCES,FLOWS_TO`
> 我需要决定日常运营成本中哪些费用可以削减，但我不确定每项费用与业务产出的关联度（比如：某笔差旅费是否带来了对应的渠道签约）。
> 等价变体 (2个): S1-JTBD-025, S1-JTBD-037
> 来源场景: S1

**U-JTBD-0007** | `ALLOCATE` | `Channel` | `BUYS_FROM,FLOWS_TO`
> 我需要和品牌/电商运营协调大促期间"降价促销→走量→利润损失"的平衡点——到底降到什么价格既能冲GMV又不会亏太多，但我不确定不同降价幅度对转化率和毛利的边际效应。
> 来源场景: S1

**U-JTBD-0008** | `ALLOCATE` | `Channel` | `COMPETES_WITH,FLOWS_TO`
> 我需要决定是否关停某个持续亏损的电商平台店铺，但我不确定关停后该平台的存量客户会流向竞品还是回流到我们的其他渠道。
> 来源场景: S2

**U-JTBD-0009** | `ALLOCATE` | `Channel` | `CONSUMES,AFFECTS`
> 我需要决定是否要在Q3启动一个大型品牌战役（预算800万）——上一次品牌战役花了600万，但归因分析显示对Pipeline的贡献不到10%。我不确定是品牌战役本身无效还是归因模型低估了品牌的长期影响。
> 来源场景: S6

---

### ALLOCATE × Product (10 U-JTBDs)

**U-JTBD-0029** | `ALLOCATE` | `Product` | `BUYS_FROM,FLOWS_TO`
> 我需要决定下个月的电商平台大促（618/双11/年货节）报名哪些SKU、报什么价格，但我不确定每个SKU扣除平台满减+券后补贴+退货后的到手利润率是多少。
> 等价变体 (2个): S1-JTBD-003, S1-JTBD-018
> 来源场景: S1

**U-JTBD-0030** | `ALLOCATE` | `Product` | `BUYS_FROM`
> 我需要决定品牌下一季度的内容策略方向（情感故事/使用场景/产品功能），但我无法量化不同内容类型的实际获客效率和目标人群匹配度。
> 来源场景: S1

**U-JTBD-0031** | `ALLOCATE` | `Product` | `COMPETES_WITH`
> 我需要决定是否收购或自建一个竞品目前领先而我们空白的功能模块，但我不确定自建需要多少工程师·月——工程VP评估12个月，竞品只用了8个月。到底是低估了复杂度还是工程效率确实不如竞品？
> 等价变体 (2个): S1-JTBD-019, S6-JTBD-009
> 来源场景: S1, S6

**U-JTBD-0032** | `ALLOCATE` | `Product` | `UNKNOWN`
> 我需要决定某款产品是否应该做差异化版本（如材料升级版/简装版），但我不确定不同客群的价格敏感度和功能需求差异是否大到值得分线。
> 等价变体 (2个): S1-JTBD-021, S5-JTBD-010
> 来源场景: S1, S5

**U-JTBD-0033** | `ALLOCATE` | `Product` | `FLOWS_TO`
> 我需要决定三条产品线之间的工程师资源如何分配，但我不确定每条产品线的真实边际贡献率和增长弹性——财务口径、产品后台口径、销售口径的ARR增速相差8个百分点。
> 等价变体 (2个): S1-JTBD-036, S6-JTBD-001
> 来源场景: S1, S6

**U-JTBD-0034** | `ALLOCATE` | `Product` | `PRODUCES`
> 我需要决定明年新品开发管线中哪个SKU优先级最高，但我不确定哪类消费者需求是高增长且我们供应链能力能支撑的。
> 来源场景: S2

**U-JTBD-0035** | `ALLOCATE` | `Product` | `AFFECTS`
> 我需要决定线下终端陈列费用投到哪些KA系统和哪些单品上，但我不确定不同陈列形式（端架/堆头/收银台）对不同品类产品的实际销售拉动效果。
> 等价变体 (3个): S2-JTBD-019, S2-JTBD-025, S5-JTBD-001
> 来源场景: S2, S5

**U-JTBD-0036** | `ALLOCATE` | `Product` | `PRODUCES,REPORTS_TO`
> 我需要决定工程变更（ECN）的审批优先级——产线等着改、采购等着调BOM、质量等着更新标准。ECN流程卡在哪个环节、积压了多少、哪些是紧急的。
> 来源场景: S4

**U-JTBD-0037** | `ALLOCATE` | `Product` | `PRODUCES,DEPENDS_ON,FLOWS_TO`
> 我需要分配'“瓶颈设备”'的使用时间——某台关键设备（如大型注塑机/CNC/贴片机）多个产品线抢着用。销售催交期、生产要效率、财务要利用率。谁该优先？按客户利润？按订单紧急度？按设备效率？
> 来源场景: S4

**U-JTBD-0038** | `ALLOCATE` | `Product` | `BUYS_FROM,REPORTS_TO`
> 我需要判断CEO说"All in AI"战略下，三条产品线各应该投入多少AI功能研发，但我不确定客户愿意为AI功能多付多少钱、以及哪个产品线的AI化能带来最大的NDR提升——销售说"客户天天要AI"，产品说"客户不知道AI能解决什么"。
> 来源场景: S6

---

### ALLOCATE × Resource (5 U-JTBDs)

**U-JTBD-0039** | `ALLOCATE` | `Resource` | `BUYS_FROM,CONSUMES`
> 我需要决定品牌年度营销预算在"种草"和"收割"之间怎么分配，但我不确定过去一年种草内容对最终成交的延迟贡献有多少。
> 来源场景: S1

**U-JTBD-0040** | `ALLOCATE` | `Resource` | `PRODUCES`
> 我需要决定这个月是否给某个部门的招聘需求开绿灯，但我不确定该部门当前的人均产出是否已经达到行业合理水平（还是可以通过提效替代增人）。
> 等价变体 (5个): S1-JTBD-027, S1-JTBD-038, S1-JTBD-040, S3-JTBD-009, S4-JTBD-053
> 来源场景: S1, S3, S4

**U-JTBD-0041** | `ALLOCATE` | `Resource` | `UNKNOWN`
> 我需要评估自动化改造的投资回收期——上机器人和视觉检测能省几个人工、几年回本，但我不确定当前设备的真实OEE和人工费用算对了没有。
> 等价变体 (5个): S1-JTBD-029, S1-JTBD-030, S4-JTBD-003, S4-JTBD-015, S4-JTBD-024
> 来源场景: S1, S4

**U-JTBD-0042** | `ALLOCATE` | `Resource` | `FLOWS_TO`
> 我需要评估本BU是否应该在下一财年申请新增30%的headcount，但我不确定当前团队的人均ARR是否在行业合理区间内——HR给的benchmark是去年数据，中台的人效看板和财务报表差了15%。
> 等价变体 (6个): S2-JTBD-021, S2-JTBD-030, S3-JTBD-010, S4-JTBD-013, S4-JTBD-021, S6-JTBD-003
> 来源场景: S2, S3, S4, S6

**U-JTBD-0043** | `ALLOCATE` | `Resource` | `COMPETES_WITH`
> 我需要制定下一财年全公司的薪酬策略——该跟互联网大厂对标（贵但能抢到人），还是跟SaaS同行对标（合理但可能被挖角）。我不确定当前薪酬在各岗位上的市场竞争力，以及"薪酬不具竞争力"对离职率的真实贡献权重。
> 来源场景: S6

---

### ALLOCATE × Market (7 U-JTBDs)

**U-JTBD-0018** | `ALLOCATE` | `Market` | `UNKNOWN`
> 我需要评估在研项目的优先级——同时跑8个项目，但研发只有15个人。哪个项目最有可能量产、哪个项目市场最大、哪个项目技术最成熟——我不知道该用哪套标准排优先级。
> 等价变体 (3个): S1-JTBD-014, S2-JTBD-040, S4-JTBD-032
> 来源场景: S1, S2, S4

**U-JTBD-0019** | `ALLOCATE` | `Market` | `COMPETES_WITH`
> 我需要判断我们的定价在市场上是否有竞争力——竞品最近降价了20%，销售说"客户拿竞品报价来压我们"。但我不知道竞品的降价是促销还是永久降价、以及降价后竞品的毛利率还能撑多久。如果我们也跟进降价20%，ARR会先跌再涨吗？
> 等价变体 (4个): S1-JTBD-017, S1-JTBD-023, S1-JTBD-053, S6-JTBD-053
> 来源场景: S1, S6

**U-JTBD-0020** | `ALLOCATE` | `Market` | `FLOWS_TO`
> 我需要决定老业务（婴儿手足印）的利润中有多少比例应该投向新业务探索，但我没有一个"老业务利润衰减曲线"和"新业务盈利拐点预测"的量化模型。
> 来源场景: S1

**U-JTBD-0021** | `ALLOCATE` | `Market` | `BUYS_FROM,COMPETES_WITH,FLOWS_TO`
> 我需要判断这次618大促是追求GMV规模还是保利润率，但我不确定竞品这次的价格战力度和平台的品类补贴政策。
> 来源场景: S2

**U-JTBD-0022** | `ALLOCATE` | `Market` | `DEPENDS_ON,FLOWS_TO,REPORTS_TO`
> 我需要判断今年该不该启动国际化（东南亚/日本）——CEO在董事会上承诺了"国际化战略"，但我不确定现有产品对海外市场的适配成本、当地合规风险和真实TAM。咨询公司给的报告和公司内部测算差了3倍。
> 来源场景: S6

**U-JTBD-0023** | `ALLOCATE` | `Market` | `DEPENDS_ON`
> 我需要评估公司是否应该通过收购进入一个我们目前没有涉足但客户需求强烈的相邻赛道——自建需要2年，收购可以6个月上线但整合风险高。但我不确定收购后客户重叠度、技术整合难度、和团队文化匹配度。
> 来源场景: S6

**U-JTBD-0024** | `ALLOCATE` | `Market` | `BUYS_FROM,AFFECTS`
> 我需要决定公司的ESG/可持续发展报告策略——投资人开始要求ESG披露，大客户RFP中出现了碳排放问题。但我不确定在这方面的投入对股价/客户获取的真实影响——花100万做碳审计和ESG报告，对估值的影响是多少？
> 来源场景: S6

---

### ALLOCATE × Operation (4 U-JTBDs)

**U-JTBD-0025** | `ALLOCATE` | `Operation` | `PRODUCES,FLOWS_TO`
> 我需要评估各生产工序的'“自制vs外协”'决策——哪些工序自己做得比外协好、哪些外协性价比更高。生产觉得应该自己做（保质量），财务觉得该外协（省成本），但缺乏系统的对比数据。
> 等价变体 (3个): S2-JTBD-043, S4-JTBD-063, S4-JTBD-065
> 来源场景: S2, S4

**U-JTBD-0026** | `ALLOCATE` | `Operation` | `PRODUCES,AFFECTS`
> 大客户突然下了一个急单要求一周交货，我需要协调厂长（产能是否允许插单）、跟单员（其他客户交期是否受影响）、采购（急单物料能否到位）一起判断：这个急单该不该接、接了之后哪些订单要被推迟、推迟的后果是什么。（协同角色：R1+R2+R3）
> 来源场景: S3

**U-JTBD-0027** | `ALLOCATE` | `Operation` | `PRODUCES,DEPENDS_ON`
> 我需要决定下周三条产线的排产优先级，但我不确定各产线的真实瓶颈节拍和换模时间——MES报工数据和现场实际情况差多少。
> 来源场景: S4

**U-JTBD-0028** | `ALLOCATE` | `Operation` | `UNKNOWN`
> 我需要判断是否应该建立一个系统化的增长实验（Growth Experiment）流程——现在每个团队都在做自己的A/B测试，但实验设计质量参差不齐，样本量不足就下结论的事经常发生。我不确定投入一个正式的实验平台和增长团队能带来多大的增量ARR。
> 来源场景: S6

---

### DIAGNOSE × Customer (8 U-JTBDs)

**U-JTBD-0079** | `DIAGNOSE` | `Customer` | `BUYS_FROM,AFFECTS`
> 我需要诊断为什么A客户最近三个月下单量逐月下降，但我不确定是客户自身业务萎缩、客户找到了更便宜的替代供应商、还是我们上次交货延迟导致客户不满了。
> 等价变体 (4个): S1-JTBD-004, S1-JTBD-045, S3-JTBD-005, S4-JTBD-008
> 来源场景: S1, S3, S4

**U-JTBD-0080** | `DIAGNOSE` | `Customer` | `PRODUCES,AFFECTS,FLOWS_TO`
> 我需要判断目前的生产排期方式是否合理——是按订单时间先到先做、还是按客户价值优先、还是按产品利润优先，但我不确定三种排期逻辑对客户满意度和整体利润的影响。
> 来源场景: S1

**U-JTBD-0081** | `DIAGNOSE` | `Customer` | `PRODUCES`
> 我需要判断质量问题的责任归属——客户投诉来了，销售说是生产的问题、生产说是来料的问题、采购说是供应商的问题、质量说你当时IQC怎么没检出来。各部门形成了完美的'责任闭环'——每个部门都没责任。
> 等价变体 (3个): S1-JTBD-050, S4-JTBD-064, S5-JTBD-021
> 来源场景: S1, S4, S5

**U-JTBD-0082** | `DIAGNOSE` | `Customer` | `BUYS_FROM,AFFECTS,COMPETES_WITH`
> 我需要找出客户群X（年付费10-50万的中型客户）NDR在过去6个月从112%下降到97%的根本原因，但我不确定是产品价值递减、竞品升级、还是我们的Onboarding质量下降——三组数据在不同团队的看板里，没人拼起来。
> 等价变体 (2个): S2-JTBD-047, S6-JTBD-010
> 来源场景: S2, S6

**U-JTBD-0083** | `DIAGNOSE` | `Customer` | `UNKNOWN`
> "我需要找出哪个销售人员的业绩下滑是能力问题还是区域/客群分配问题，但我不确定怎么拆解——是给他分到了难啃的客户、还是他的销售方法论出了问题？"
> 等价变体 (4个): S3-JTBD-022, S5-JTBD-014, S5-JTBD-017, S5-JTBD-022
> 来源场景: S3, S5

**U-JTBD-0084** | `DIAGNOSE` | `Customer` | `DEPENDS_ON,FLOWS_TO`
> 我需要诊断哪些客户的应收账款有坏账风险，但我不确定每个客户的账龄分布、历史回款规律、以及最近的异常信号（如延期次数增加、金额波动）。
> 来源场景: S3

**U-JTBD-0085** | `DIAGNOSE` | `Customer` | `FLOWS_TO`
> 我需要评估大客户A的真实价值——它在我们的营收中占比25%，但它的毛利率可能是所有客户中最低的（扣掉特殊要求产生的返工和加急成本后）。我想知道它到底是利润贡献者还是利润黑洞。
> 等价变体 (2个): S4-JTBD-025, S4-JTBD-041
> 来源场景: S4

**U-JTBD-0086** | `DIAGNOSE` | `Customer` | `BUYS_FROM`
> 我需要找出为什么产品线的"多部门使用渗透率"（同一客户内不同部门购买率）在过去一年停滞在1.2个部门——目标是将渗透率提升到2.5个部门。是销售没在推动多部门扩展？是产品没有适合其他部门的功能？还是客户组织内部采购流程的阻碍？
> 等价变体 (2个): S5-JTBD-030, S6-JTBD-032
> 来源场景: S5, S6

---

### DIAGNOSE × Channel (8 U-JTBDs)

**U-JTBD-0071** | `DIAGNOSE` | `Channel` | `BUYS_FROM,AFFECTS,COMPETES_WITH`
> 我需要决定本周店铺主图/详情页改版是否对转化率有效果，但我无法区分是改版造成的转化变化还是大促/竞品动作/季节因素造成的。
> 来源场景: S1

**U-JTBD-0072** | `DIAGNOSE` | `Channel` | `UNKNOWN`
> 我需要判断哪些经销商在窜货，但我不确定窜货的源头是经销商主动套利、区域销售为完成KPI默许跨区销售、还是线上低价品流入了线下渠道。
> 等价变体 (3个): S1-JTBD-007, S2-JTBD-006, S2-JTBD-023
> 来源场景: S1, S2

**U-JTBD-0073** | `DIAGNOSE` | `Channel` | `COMPETES_WITH`
> 我需要诊断为什么E区域线下销售额连续两个季度下滑，但我不确定是消费力下降、竞品在该区域加大了终端投入、区域销售团队执行不力、还是经销商自身经营出了问题。
> 等价变体 (3个): S1-JTBD-009, S2-JTBD-014, S2-JTBD-027
> 来源场景: S1, S2

**U-JTBD-0074** | `DIAGNOSE` | `Channel` | `COMPETES_WITH,FLOWS_TO`
> 我需要诊断为什么抖音渠道这个月的ROI突然从1:3.5跌到1:1.8，但我不确定是平台算法变了、竞品投流加码了，还是我们的素材疲劳了。
> 来源场景: S2

**U-JTBD-0075** | `DIAGNOSE` | `Channel` | `AFFECTS,FLOWS_TO`
> 我需要诊断为什么毛利率从58%下滑到52%而各事业部都说'不是我的问题'，但我不确定是原材料成本上升、促销折扣力度加大、低毛利渠道占比上升、还是汇率波动导致的。
> 来源场景: S2

**U-JTBD-0076** | `DIAGNOSE` | `Channel` | `BUYS_FROM,FLOWS_TO`
> 我需要诊断为什么BI看板上的GMV和财务账上的收入每个月都差5-10%，但我不确定差异来源是数据同步延迟、退款未剔除、渠道口径不一致、还是某些渠道的GMV含税/财务收入不含税。
> 来源场景: S2

**U-JTBD-0077** | `DIAGNOSE` | `Channel` | `CONSUMES,AFFECTS,REPORTS_TO`
> 我需要判断当前的市场营销花费是否在有效驱动Pipeline——CMO汇报"MQL增长40%"，但销售VP说"MQL质量越来越差，SDR都不想跟了"。我不知道是市场定位偏差还是销售团队出了什么问题。
> 来源场景: S6

**U-JTBD-0078** | `DIAGNOSE` | `Channel` | `BUYS_FROM,DEPENDS_ON`
> 我需要判断公司增长是否过度依赖单一获客渠道——当前65%的新客户来自一个合作伙伴渠道，但我不确定该渠道的可持续性和依赖风险。如果该渠道明天中断，我们的增长会从+30%变成什么？
> 来源场景: S6

---

### DIAGNOSE × Product (9 U-JTBDs)

**U-JTBD-0094** | `DIAGNOSE` | `Product` | `AFFECTS`
> 客户投诉了质量问题，我需要协调质检（根因分析）、厂长（改进措施）、跟单员（客户安抚和补偿）一起完成：问题到底是什么、怎么防止再犯、怎么跟客户交代。（协同角色：R4+R1+R2）
> 等价变体 (9个): S1-JTBD-020, S3-JTBD-004, S3-JTBD-034, S3-JTBD-046, S4-JTBD-002, S4-JTBD-005, S4-JTBD-054, S4-JTBD-059, S5-JTBD-004
> 来源场景: S1, S3, S4, S5

**U-JTBD-0095** | `DIAGNOSE` | `Product` | `UNKNOWN`
> 我需要评估当前产品组合中哪些功能模块实际上没人用、该砍掉——工程团队维护着200+个功能模块，但产品使用数据显示40%的模块月度活跃用户不到5%。但我不确定哪些"低使用"模块是客户签约时要求的条款（不能砍）、哪些是真的没人要。
> 等价变体 (4个): S1-JTBD-043, S2-JTBD-018, S4-JTBD-030, S6-JTBD-042
> 来源场景: S1, S2, S4, S6

**U-JTBD-0096** | `DIAGNOSE` | `Product` | `PRODUCES,AFFECTS,DEPENDS_ON`
> 我需要和产品/生产协调新品开发→试产→上市的完整周期控制，但我不确定哪一个环节是周期瓶颈、以及延期对上市时机的影响有多大。
> 来源场景: S1

**U-JTBD-0097** | `DIAGNOSE` | `Product` | `BUYS_FROM`
> 我需要判断当前的产品Roadmap是否在被"最大声的客户"牵着走——过去6个月Top 5需求全部来自3个大客户，但中小客户的NDR在同时期下降了。我不确定我们是在为所有人做产品还是只为3个客户做定制。
> 等价变体 (3个): S2-JTBD-016, S5-JTBD-011, S6-JTBD-027
> 来源场景: S2, S5, S6

**U-JTBD-0098** | `DIAGNOSE` | `Product` | `PRODUCES,AFFECTS,FLOWS_TO`
> 我需要确定BOM里哪些物料的定额需要更新——研发改了设计、产线改了工艺，但PLM到ERP的BOM同步是断的。我不知道当前有多少处BOM失真、失真对成本核算的影响有多大。
> 来源场景: S4

**U-JTBD-0099** | `DIAGNOSE` | `Product` | `BUYS_FROM,FLOWS_TO`
> 我需要诊断样品转化率为什么这么低——去年做了60个样品但只有5个量产。问题出在“样品本身就不行”还是“样品可以但没人推”还是“量产成本太高下不去”。
> 来源场景: S4

**U-JTBD-0100** | `DIAGNOSE` | `Product` | `PRODUCES,FLOWS_TO`
> 我需要评估研发部门的ROI——老板觉得研发在花钱但看不到产出。我需要一种方式量化：去年研发投入800万，带来了多少新产品营收、多少成本节约、多少专利价值。
> 来源场景: S4

**U-JTBD-0101** | `DIAGNOSE` | `Product` | `FLOWS_TO`
> 我需要评估当前的产品组合中是否存在"僵尸产品"——产品还在运行、客户还在续约、但团队已经不再投入任何新功能。这些产品的ARR合计可能占总收入的5-10%，在分散工程团队的注意力。但我不确定砍掉这些产品会不会引发连锁反应。
> 等价变体 (2个): S4-JTBD-040, S6-JTBD-059
> 来源场景: S4, S6

**U-JTBD-0102** | `DIAGNOSE` | `Product` | `BUYS_FROM,AFFECTS,COMPETES_WITH`
> 我需要判断产品线B是否已经进入衰退期应该缩减投入，但我不确定它的NDR下降是暂时的竞品冲击还是结构性需求转移——CS团队说"客户关系很好"，数据中台却显示健康度持续走低。
> 来源场景: S6

---

### DIAGNOSE × Resource (10 U-JTBDs)

**U-JTBD-0103** | `DIAGNOSE` | `Resource` | `AFFECTS`
> 我需要追踪我上次做的重大决策（给BU A追加了30个工程师）是否产生了预期的效果——6个月过去了，BU A的ARR增速从15%变成了18%。但这3个点的提升中，有多少是追加资源带来的、有多少是市场自然增长？如果没有投入这30个工程师，ARR增速会是多少？
> 等价变体 (2个): S1-JTBD-028, S6-JTBD-051
> 来源场景: S1, S6

**U-JTBD-0104** | `DIAGNOSE` | `Resource` | `FLOWS_TO`
> 我需要判断标准成本与实际成本的偏差到底有多大——财务按标准成本报价，但实际成本可能高20%。偏差来自BOM不准、工时不准、还是物料价格波动？各占多少？
> 等价变体 (3个): S1-JTBD-034, S4-JTBD-042, S4-JTBD-043
> 来源场景: S1, S4

**U-JTBD-0105** | `DIAGNOSE` | `Resource` | `UNKNOWN`
> 我需要评估如果全力转型"母婴服务平台"，现有的手工技师团队和能力能不能复用，需要重新招聘或培训多少人，但我没有现有团队能力的技能清单和缺口分析。
> 等价变体 (4个): S1-JTBD-039, S1-JTBD-055, S3-JTBD-008, S4-JTBD-045
> 来源场景: S1, S3, S4

**U-JTBD-0106** | `DIAGNOSE` | `Resource` | `PRODUCES`
> 我需要判断核心代工厂的交付稳定性是否在恶化，但我不确定最近三个月的交付延迟是偶发性问题（如限电、疫情）还是工厂产能已经见顶的早期信号。
> 等价变体 (4个): S2-JTBD-020, S4-JTBD-006, S4-JTBD-014, S4-JTBD-050
> 来源场景: S2, S4

**U-JTBD-0107** | `DIAGNOSE` | `Resource` | `COMPETES_WITH`
> 我需要诊断为什么电商运营团队的离职率突然从15%飙到35%，但我不确定是薪酬问题、加班强度太大、中层管理风格有问题、还是竞品在定向挖人。
> 等价变体 (2个): S2-JTBD-037, S4-JTBD-052
> 来源场景: S2, S4

**U-JTBD-0108** | `DIAGNOSE` | `Resource` | `BUYS_FROM,PRODUCES`
> 我需要判断当前销售团队的效率是在提升还是下降——招了15个新销售后总签约额涨了，但我不确定人均ARR产出和CAC回收期是否在恶化。销售VP说"新人在爬坡"，但爬坡曲线没人量化。
> 来源场景: S6

**U-JTBD-0109** | `DIAGNOSE` | `Resource` | `BUYS_FROM`
> 我需要判断新招的空降高管（入职6个月）是否在有效融入——他带的团队流失率上升了，"老员工"反馈他不了解公司文化。但我不确定这是正常的磨合阵痛还是他不适合。再等6个月可能团队都被干掉了。
> 来源场景: S6

**U-JTBD-0110** | `DIAGNOSE` | `Resource` | `CONSUMES,AFFECTS,FLOWS_TO`
> 我需要预测哪个产品线的月度云成本（AWS/Azure）会在下个月超预算，以及超支的根本原因——最近三个月总云成本月环比+12%，但财务和工程各有一套成本归因，差异达20%。我需要知道是业务增长带来的合理增长还是架构/代码效率问题。
> 来源场景: S6

**U-JTBD-0111** | `DIAGNOSE` | `Resource` | `REPORTS_TO`
> 我需要判断季节性波动是否在正常范围内——每年Q1都有"季节性低迷"的说法，但我从数据中看不到季节性是否在逐年恶化。如果是结构性恶化而非季节性波动，我需要提前向董事会预警。
> 来源场景: S6

**U-JTBD-0112** | `DIAGNOSE` | `Resource` | `FLOWS_TO,REPORTS_TO`
> 我需要评估公司的现金流是否能支撑我们同时做三件事：国际扩张、收购目标公司、和维持现有业务的正常运营——CFO说"现金流紧张"，但CEO坚持三件事都要做。我不确定如果现金流断裂，最快多长时间会传导到无法发工资。
> 来源场景: S6

---

### DIAGNOSE × Market (3 U-JTBDs)

**U-JTBD-0087** | `DIAGNOSE` | `Market` | `AFFECTS`
> 我需要判断婴儿手足印品类的天花板是否真的到了——是出生率下降导致的、还是我们的市场渗透率还不够，但我没有品类总市场规模的可靠数据和我们的真实市占率。
> 来源场景: S1

**U-JTBD-0088** | `DIAGNOSE` | `Market` | `COMPETES_WITH`
> 我需要系统性地了解我们到底在跟谁竞争、怎么赢、怎么输——销售在客户现场听到竞品名字，产品团队track竞品功能更新，市场部看SEO关键词，CFO看竞品财报。但所有这些信息散落在不同人的脑子里，从未汇聚成一张完整的竞争地图。我连Win/Loss的真实比例都不知道。
> 等价变体 (3个): S2-JTBD-009, S6-JTBD-033, S6-JTBD-034
> 来源场景: S2, S6

**U-JTBD-0089** | `DIAGNOSE` | `Market` | `UNKNOWN`
> 我需要评估2024年整体业务表现，并为2025年设定各BU的目标——但我不确定每个BU的增长潜力是"已经触顶"还是"投入不够"。BU A说"市场饱和了"，BU B说"再多给50个工程师就能翻倍"。我怎么判断谁在说真话？
> 来源场景: S6

---

### DIAGNOSE × Operation (4 U-JTBDs)

**U-JTBD-0090** | `DIAGNOSE` | `Operation` | `AFFECTS`
> 我需要评估三条产品线之间的技术中台共享程度是否合理——产品线A和B共享了80%的代码但产品线C完全独立，我不确定C的独立性是在拖累整体工程效率还是在保护C的快速迭代能力。工程VP说"共享中台拖慢了C"，产品VP说"C太独立浪费了资源"。
> 等价变体 (9个): S1-JTBD-041, S3-JTBD-007, S3-JTBD-021, S3-JTBD-035, S6-JTBD-015, S6-JTBD-023, S6-JTBD-030, S6-JTBD-056, S6-JTBD-058
> 来源场景: S1, S3, S6

**U-JTBD-0091** | `DIAGNOSE` | `Operation` | `COMPETES_WITH,FLOWS_TO`
> 我需要评估当前"自研 vs 外采"的边界是否合理——我们自研了内部CRM、自研了数据分析工具、甚至自研了HR系统。工程师VP说"自己造的更灵活"，但CFO说"每年3000万维护成本，买SaaS可能只要500万"。我不确定哪些自研系统是在创造竞争优势、哪些只是"Not Invented Here"综合症。
> 等价变体 (10个): S1-JTBD-056, S1-JTBD-057, S2-JTBD-029, S2-JTBD-035, S3-JTBD-006, S3-JTBD-039, S5-JTBD-028, S6-JTBD-019, S6-JTBD-038, S6-JTBD-054
> 来源场景: S1, S2, S3, S5, S6

**U-JTBD-0092** | `DIAGNOSE` | `Operation` | `UNKNOWN`
> 我需要判断数据中台的"单一真相来源"建设进度是否已经到了可以让业务部门放弃自己Excel报表的程度——过去两年投入了2000万建设数据中台，但每个BU仍然在维护自己的Excel模型。数据VP说"中台数据是准确的"，但BU GM说"你们的数字跟我们业务实际感受不符"。谁对？
> 等价变体 (3个): S5-JTBD-003, S6-JTBD-036, S6-JTBD-039
> 来源场景: S5, S6

**U-JTBD-0093** | `DIAGNOSE` | `Operation` | `DEPENDS_ON,REPORTS_TO`
> 我需要评估当前组织200人扩展到400人的过程中，管理带宽是否已经成为瓶颈——过去6个月决策周期从平均3天延长到了7天。跨部门审批需要经过4个层级。我不确定这是规模增长的必然代价还是组织设计有问题——我们是不是在用100人公司的管理方式运营200人的公司？
> 等价变体 (2个): S6-JTBD-040, S6-JTBD-050
> 来源场景: S6

---

### DIAGNOSE × Supplier (4 U-JTBDs)

**U-JTBD-0113** | `DIAGNOSE` | `Supplier` | `UNKNOWN`
> 我需要评估现有供应商的综合表现——不是看采购金额排名，而是看谁质量好、谁交期稳、谁价格合理、谁出了问题配合度好。哪些供应商该重点维护、哪些该逐步淘汰。
> 等价变体 (3个): S3-JTBD-028, S3-JTBD-029, S4-JTBD-020
> 来源场景: S3, S4

**U-JTBD-0114** | `DIAGNOSE` | `Supplier` | `AFFECTS`
> 我需要诊断这批来料不合格的根因——是供应商批次问题、运输过程损坏、还是我们的验收标准有问题，但我不确定供应商历史质量表现、该物料的历史合格率趋势、以及我们的验收标准是否需要调整。
> 来源场景: S3

**U-JTBD-0115** | `DIAGNOSE` | `Supplier` | `PRODUCES,DEPENDS_ON`
> 我需要评估单一来源供应商的风险——这个关键部件只有一家供应商能做。万一它出问题（火灾/环保关停/质量事故），我们有多久能恢复生产、有没有替代方案。
> 来源场景: S4

**U-JTBD-0116** | `DIAGNOSE` | `Supplier` | `DEPENDS_ON,FLOWS_TO`
> 我需要评估我们对关键供应商（云服务商/第三方API/数据提供商）的依赖风险——如果AWS明天涨价20%，我们的毛利会从75%跌到多少？我们的架构在多大程度上是多云可迁移的？工程VP说"迁移成本很高但可行"，CFO需要量化这个风险。
> 来源场景: S6

---

### PREDICT × Customer (5 U-JTBDs)

**U-JTBD-0153** | `PREDICT` | `Customer` | `BUYS_FROM,PRODUCES,FLOWS_TO`
> 我需要评估"母婴服务平台"这个第二曲线方向的单位经济模型是否成立——获客成本、转化率、客单价、复购频次、服务交付成本各是多少，但没有任何实际运营数据做测算。
> 等价变体 (7个): S1-JTBD-052, S3-JTBD-003, S3-JTBD-020, S4-JTBD-028, S4-JTBD-051, S5-JTBD-012, S5-JTBD-029
> 来源场景: S1, S3, S4, S5

**U-JTBD-0154** | `PREDICT` | `Customer` | `BUYS_FROM,AFFECTS`
> 我需要预测Q4双十一的GMV目标应该定多少，但我不确定今年的消费降级趋势对客单价的影响幅度和各平台的活动力度。
> 来源场景: S2

**U-JTBD-0155** | `PREDICT` | `Customer` | `COMPETES_WITH`
> 我需要预测新技术路线的可行性——客户在问我们能不能做XX工艺，但我不知道团队能力够不够、设备需不需要投资、竞争对手是不是已经在做了。
> 来源场景: S4

**U-JTBD-0156** | `PREDICT` | `Customer` | `DEPENDS_ON`
> "我需要评估产品改版（UI重构/流程变更）的风险，但我不确定多少用户依赖旧流程、以及那些用户中高价值客户的占比。"
> 来源场景: S5

**U-JTBD-0157** | `PREDICT` | `Customer` | `UNKNOWN`
> "我需要发现哪些现有客户有增购潜力（Land and Expand），但我不确定怎么从现有客户中筛选——按使用量增长、按工单频率、还是按公司规模增长？"
> 等价变体 (2个): S5-JTBD-020, S5-JTBD-025
> 来源场景: S5

---

### PREDICT × Channel (3 U-JTBDs)

**U-JTBD-0150** | `PREDICT` | `Channel` | `PRODUCES`
> 我需要决定下周的生产排期优先级——哪些订单先做哪些缓做，但我无法准确预测未来两周的新订单量（平台和直播间随时可能有爆单）。
> 来源场景: S1

**U-JTBD-0151** | `PREDICT` | `Channel` | `FLOWS_TO`
> 我需要预测未来三个月的现金流能否支撑运营（工资+供应商货款+平台保证金+投流费），但我不确定各渠道的应收账款回款时间和各平台提现周期。
> 来源场景: S1

**U-JTBD-0152** | `PREDICT` | `Channel` | `UNKNOWN`
> 我需要预测线下渠道下季度的营收目标，但我不确定有多少经销商会在年底前压货冲返利，以及压货后Q1会不会出现断崖式回落。
> 等价变体 (2个): S2-JTBD-026, S4-JTBD-031
> 来源场景: S2, S4

---

### PREDICT × Product (5 U-JTBDs)

**U-JTBD-0163** | `PREDICT` | `Product` | `BUYS_FROM`
> 我需要预测本次旺季（如618/年货节）的爆款产品需求峰值，但我不确定今年旺季的流量和转化率会相比去年同期增长还是下降。
> 来源场景: S1

**U-JTBD-0164** | `PREDICT` | `Product` | `AFFECTS`
> 我需要预测Q4旺季各SKU的备货量，但我不确定销售端给的预测有多少水分，以及今年各平台大促节奏会不会导致需求脉冲叠加。
> 来源场景: S2

**U-JTBD-0165** | `PREDICT` | `Product` | `PRODUCES,DEPENDS_ON,FLOWS_TO`
> 我需要识别哪些应收账款有坏账风险——客户回款越来越慢，但我不确定是客户资金紧张还是对我们的产品质量有意见。
> 来源场景: S4

**U-JTBD-0166** | `PREDICT` | `Product` | `DEPENDS_ON`
> "我需要判断当前系统架构能否支撑未来12个月的业务增长，但我不确定性能瓶颈会在哪个组件先出现。"
> 来源场景: S5

**U-JTBD-0167** | `PREDICT` | `Product` | `UNKNOWN`
> "我需要预测未来6个月需要招聘多少工程师、什么技术栈的工程师，但我不确定业务需求的增长速度和技术债的累积速度。"
> 来源场景: S5

---

### PREDICT × Resource (9 U-JTBDs)

**U-JTBD-0168** | `PREDICT` | `Resource` | `PRODUCES,AFFECTS,FLOWS_TO`
> 我需要预测用工政策变化（最低工资调整、社保基数上涨、环保限产）对成本和产能的影响——这些外部变化发生时，各部门都在焦虑但没人量化影响。财务能算成本影响但不知道生产弹性，生产知道产能影响但不知道成本。
> 等价变体 (2个): S1-JTBD-047, S4-JTBD-066
> 来源场景: S1, S4

**U-JTBD-0169** | `PREDICT` | `Resource` | `FLOWS_TO`
> 我需要预测未来3个月的现金流缺口，但我不确定双十一大促的备货资金需求峰值是多少、经销商年底回款会不会延迟、以及有一笔银行贷款到期后银行还会不会续贷。
> 等价变体 (4个): S2-JTBD-031, S2-JTBD-031, S3-JTBD-041, S4-JTBD-044
> 来源场景: S2, S3, S4

**U-JTBD-0170** | `PREDICT` | `Resource` | `UNKNOWN`
> 我需要预测今年应交的增值税和企业所得税大概多少、什么时候交，但我不确定未来几个月的开票金额、可抵扣进项、以及是否有税收优惠政策适用。
> 等价变体 (2个): S3-JTBD-002, S3-JTBD-042
> 来源场景: S3

**U-JTBD-0171** | `PREDICT` | `Resource` | `CONSUMES,FLOWS_TO`
> 我需要预测公司整体是否能达到盈亏平衡的时间点，但我不确定各产品线的成本增长曲线是否按预算走——工程VP说"云成本在优化"，但实际AWS账单过去3个月涨了25%。各BU的成本归集口径不一致。
> 等价变体 (2个): S3-JTBD-026, S6-JTBD-012
> 来源场景: S3, S6

**U-JTBD-0172** | `PREDICT` | `Resource` | `AFFECTS`
> 我需要预测某种原材料未来三个月的价格走势，但我不确定历史价格波动规律、上游原材料价格变化、行业供需变化、以及政策影响。
> 来源场景: S3

**U-JTBD-0173** | `PREDICT` | `Resource` | `PRODUCES`
> 我需要预测下季度产能是否够用——销售预测一直在涨但我不确定哪些订单会落地、哪些是“预计可能”的。如果产能不够，我需要提前三个月招人还是开外包。
> 等价变体 (2个): S4-JTBD-004, S5-JTBD-026
> 来源场景: S4, S5

**U-JTBD-0174** | `PREDICT` | `Resource` | `BUYS_FROM`
> 我需要预测下月关键原材料的采购量——销售预测不准、BOM不准、库存不准，这三个不准叠在一起，我到底该按哪个数下单。
> 来源场景: S4

**U-JTBD-0175** | `PREDICT` | `Resource` | `BUYS_FROM,CONSUMES,REPORTS_TO`
> 我需要预测下个季度的ARR能否达到董事会预期（QoQ +8%），但我不确定当前的Pipeline转化率是不是虚高——销售为了冲季度目标把"口头承诺"标成了"预算已批"。历史数据显示每季度最后一月有40%的Pipeline魔幻消失。
> 来源场景: S6

**U-JTBD-0176** | `PREDICT` | `Resource` | `BUYS_FROM,DEPENDS_ON`
> 我需要判断哪些关键岗位的人才流失风险最高，并在他们提离职前主动干预——去年两位资深工程经理在同一周离职，团队震荡了三个月。但我不确定哪些信号（加班时长/会议拒绝率/Push频率下降/工位孤立度）能有效预测离职。
> 来源场景: S6

---

### PREDICT × Market (3 U-JTBDs)

**U-JTBD-0158** | `PREDICT` | `Market` | `AFFECTS`
> 我需要预测品牌在下个季度的自然搜索流量趋势，但我不确定出生率持续下降对"婴儿手足印"品类搜索量的长期影响曲线。
> 来源场景: S1

**U-JTBD-0159** | `PREDICT` | `Market` | `BUYS_FROM`
> 我需要准备季度财报电话会议的Q&A预案——分析师会问什么？哪些指标可能被质疑？上次分析师问"你们的NDR计算包含了新客户增购吗？"我当场没回答好。我需要提前预判所有可能被质疑的数字和口径问题。
> 来源场景: S6

**U-JTBD-0160** | `PREDICT` | `Market` | `CONSUMES,AFFECTS`
> 我需要预测如果宏观经济进入衰退（客户IT预算削减10-20%），我们的ARR会受多大影响——SaaS行业已经有信号，但我不确定我们的客户群中哪些会首当其冲、以及我们的产品在客户预算中是"必须保留"还是"可以砍掉"。
> 来源场景: S6

---

### PREDICT × Operation (2 U-JTBDs)

**U-JTBD-0161** | `PREDICT` | `Operation` | `PRODUCES`
> 我需要预测未来两周的产能是否够交付在手订单，但我不确定各产线的实际产能利用率、工人出勤率、以及设备可用状态。
> 来源场景: S3

**U-JTBD-0162** | `PREDICT` | `Operation` | `PRODUCES,AFFECTS`
> 我需要预测这批货能不能在承诺交期内完成，但我不确定当前生产进度到哪了、有没有产线异常会影响交期、以及有没有其他急单插队。
> 来源场景: S3

---

### PREDICT × Supplier (1 U-JTBDs)

**U-JTBD-0177** | `PREDICT` | `Supplier` | `PRODUCES,DEPENDS_ON`
> 我需要预测供应链中断的风险——某个关键物料全球缺货、或者某家核心供应商出现质量问题。各部门都有自己的信息碎片（采购知道供应商动态、质量知道来料趋势、生产知道现场用料情况），但没人拼成完整图景。
> 等价变体 (4个): S3-JTBD-036, S4-JTBD-009, S4-JTBD-018, S4-JTBD-061
> 来源场景: S3, S4

---

### EVALUATE × Customer (5 U-JTBDs)

**U-JTBD-0119** | `EVALUATE` | `Customer` | `BUYS_FROM`
> 我需要判断这次跨界联名合作要不要签续约，但我不确定首期合作带来的增量销售中有多少是一次性尝鲜、有多少转化成了品牌忠实用户。
> 等价变体 (3个): S2-JTBD-010, S5-JTBD-019, S5-JTBD-023
> 来源场景: S2, S5

**U-JTBD-0120** | `EVALUATE` | `Customer` | `UNKNOWN`
> 我需要判断管培生项目到底值不值得继续投入，但我不确定过去3年管培生的留存率、成长为中层骨干的比例、以及管培生和外部招聘同岗位人员的能力差异。
> 等价变体 (4个): S2-JTBD-039, S3-JTBD-025, S4-JTBD-039, S5-JTBD-018
> 来源场景: S2, S3, S4, S5

**U-JTBD-0121** | `EVALUATE` | `Customer` | `FLOWS_TO`
> 我需要评估哪些客户真正在赚钱、哪些在亏钱，但我不确定每个客户扣除返工成本、延期罚款、特殊要求额外成本后的真实利润。
> 来源场景: S3

**U-JTBD-0122** | `EVALUATE` | `Customer` | `PRODUCES,FLOWS_TO`
> 来了一个新订单询价，我需要协调采购（原材料成本）、厂长（工时和产能评估）、财务（成本核算）一起算出真实成本，才能给出一个有利润的报价。（协同角色：R3+R1+R5）
> 来源场景: S3

**U-JTBD-0123** | `EVALUATE` | `Customer` | `PRODUCES`
> 我需要决定大客户插单的优先级——销售当然希望所有客户都优先，但产能不能无限弹性。我需要在客户压力和生产现实之间找一个站得住脚的理由。
> 来源场景: S4

---

### EVALUATE × Channel (2 U-JTBDs)

**U-JTBD-0117** | `EVALUATE` | `Channel` | `UNKNOWN`
> 我需要决定是否削减一个连续三个季度未达成目标的经销商的信用额度或终止合作，但我不确定这家经销商覆盖的终端门店有没有其他经销商可以接手。
> 来源场景: S2

**U-JTBD-0118** | `EVALUATE` | `Channel` | `FLOWS_TO`
> 我需要决定要不要自建CDP以打通公域和私域数据，但我不确定自建成本、运维复杂度和业务价值（打通后能解决哪些现在解决不了的决策问题）是否值得投入。
> 来源场景: S2

---

### EVALUATE × Product (8 U-JTBDs)

**U-JTBD-0130** | `EVALUATE` | `Product` | `AFFECTS,FLOWS_TO`
> 我需要判断是否终止一个持续亏损的子品牌/新产品线，但我不确定终止决策对渠道关系、品牌矩阵完整性、团队士气和财务报表的多维度影响。
> 等价变体 (2个): S2-JTBD-013, S2-JTBD-030
> 来源场景: S2

**U-JTBD-0131** | `EVALUATE` | `Product` | `FLOWS_TO`
> 我需要决定是否提高某产品线的出货抽检比例——近期客户投诉增加，但全检成本太高。加抽到AQL 0.65是否足够挡住不良品，还是会漏掉太多。
> 来源场景: S4

**U-JTBD-0132** | `EVALUATE` | `Product` | `UNKNOWN`
> 我需要判断新上的MES质量追溯模块是否值得——它能追溯到每道工序的每个操作员，但车间工人抱怨录入太繁琐，数据填得准不准是个问号。
> 来源场景: S4

**U-JTBD-0133** | `EVALUATE` | `Product` | `PRODUCES`
> 我需要评估新产品的'可制造性'——研发设计出来了，但生产说做不了、工程说要改工艺、采购说物料买不到。在新品立项时就该评估，而不是样品做出来了才发现。
> 等价变体 (2个): S4-JTBD-022, S4-JTBD-062
> 来源场景: S4

**U-JTBD-0134** | `EVALUATE` | `Product` | `DEPENDS_ON,FLOWS_TO`
> "我需要决定是否引入新技术栈（如微服务拆分、新语言、新数据库），但我不确定现有团队的学习成本和迁移风险有多大。"
> 来源场景: S5

**U-JTBD-0135** | `EVALUATE` | `Product` | `PRODUCES,COMPETES_WITH`
> "我需要对比我们与竞品的技术架构能力和交付速度，但我不确定竞品的技术选型和发布节奏。"
> 来源场景: S5

**U-JTBD-0136** | `EVALUATE` | `Product` | `COMPETES_WITH`
> "我需要判断我们的产品与竞品的功能差距在扩大还是缩小，但我不确定竞品的产品更新速度和我们漏掉了多少关键功能。"
> 来源场景: S5

**U-JTBD-0137** | `EVALUATE` | `Product` | `BUYS_FROM,COMPETES_WITH`
> 我需要评估是否有必要自建PaaS平台开放API和ISV生态——竞品两年前开放了平台，生态合作伙伴数量是我们的5倍。但我不确定我们当前的技术架构是否支持、ISV生态的真实获客贡献有多大、以及开放平台会不会削弱我们自己的产品价值。
> 来源场景: S6

---

### EVALUATE × Resource (4 U-JTBDs)

**U-JTBD-0138** | `EVALUATE` | `Resource` | `BUYS_FROM,PRODUCES`
> 我需要评估是否值得购买一台新设备来替代人工，但我不确定当前产线的实际人效、设备的投资回收期、以及买了之后是否有足够订单来保证设备利用率。
> 来源场景: S3

**U-JTBD-0139** | `EVALUATE` | `Resource` | `PRODUCES,AFFECTS,FLOWS_TO`
> 我需要决定是接受一个超大批量的订单还是拒绝——销售说这是千载难逢的大单子，但生产说接了会挤占所有产能导致其他客户断供，财务说账期太长现金流扛不住。三个部门各说各的，没有统一的评估框架。
> 等价变体 (2个): S3-JTBD-031, S4-JTBD-056
> 来源场景: S3, S4

**U-JTBD-0140** | `EVALUATE` | `Resource` | `FLOWS_TO`
> 我需要判断当前的资金成本是否合理——银行贷款利率、票据贴现率、供应商账期隐含的资金成本——有没有更优的融资组合。
> 来源场景: S4

**U-JTBD-0141** | `EVALUATE` | `Resource` | `UNKNOWN`
> 我需要评估税务筹划空间——研发费用加计扣除我们用了多少、固定资产加速折旧是否划算、有没有不该交的冤枉税。
> 来源场景: S4

---

### EVALUATE × Market (4 U-JTBDs)

**U-JTBD-0124** | `EVALUATE` | `Market` | `DEPENDS_ON`
> 我需要选择下一年度的品牌代言人，但我不确定候选人的粉丝画像与我们的目标客群的重叠度，以及代言人舆情风险的概率。
> 来源场景: S2

**U-JTBD-0125** | `EVALUATE` | `Market` | `FLOWS_TO`
> 我需要评估主要物料的采购成本是否合理——去年签的价格，今年市场价跌了15%，但供应商没主动降价。我不知道哪些物料该重新议价、议价空间多大。
> 来源场景: S4

**U-JTBD-0126** | `EVALUATE` | `Market` | `COMPETES_WITH`
> 我需要评估产品技术路线图是否与市场方向一致——我们规划了三年后的产品，但客户需求和竞争对手动态在变。我不知道该坚持原路线还是调整方向。
> 来源场景: S4

**U-JTBD-0127** | `EVALUATE` | `Market` | `BUYS_FROM,COMPETES_WITH`
> "我需要判断是否应该进入一个新垂直行业（如从服务零售业扩展到服务业），但我不确定这个行业的客户获取难度、竞品强度和我们产品的适配度。"
> 来源场景: S5

---

### EVALUATE × Operation (2 U-JTBDs)

**U-JTBD-0128** | `EVALUATE` | `Operation` | `FLOWS_TO`
> 我需要评估工厂现在的真实盈亏情况——不是税务报表上的利润，而是经营层面的真实利润，但我不确定固定资产折旧、老板自己的工资、不良品损失、以及隐性费用（如客户招待）的真实金额。
> 来源场景: S3

**U-JTBD-0129** | `EVALUATE` | `Operation` | `AFFECTS,DEPENDS_ON`
> "我需要量化安全漏洞和合规风险的优先级，但我不确定哪些漏洞正在被利用、以及修复每个漏洞的业务影响。"
> 来源场景: S5

---

### EVALUATE × Supplier (3 U-JTBDs)

**U-JTBD-0142** | `EVALUATE` | `Supplier` | `FLOWS_TO`
> 我需要对比三家原料供应商的报价并选择最优方案，但我不确定只按单价选会不会忽略隐性成本（最小起订量、交货周期、质量稳定性、付款条件）。
> 来源场景: S2

**U-JTBD-0143** | `EVALUATE` | `Supplier` | `PRODUCES,COMPETES_WITH`
> 我需要评估现有供应商的可靠性——该不该继续用、要不要开发备选，但我不确定每个供应商的历史交货准时率、质量合格率、价格竞争力、以及在紧急情况下的响应速度。
> 来源场景: S3

**U-JTBD-0144** | `EVALUATE` | `Supplier` | `UNKNOWN`
> 我需要判断关键零部件的国产替代方案是否可行——进口件交期越来越长、价格在涨，但国产件的质量能不能顶上去、需要多少验证时间。
> 来源场景: S4

---

### DESIGN × Customer (2 U-JTBDs)

**U-JTBD-0059** | `DESIGN` | `Customer` | `UNKNOWN`
> 我需要决定私域会员等级体系的设计——分几级、每一级的权益和升级门槛怎么设，但我不确定不同权益（折扣/优先购/专属服务/积分翻倍）对不同客群的实际吸引力。
> 等价变体 (2个): S2-JTBD-044, S2-JTBD-048
> 来源场景: S2

**U-JTBD-0060** | `DESIGN` | `Customer` | `PRODUCES,FLOWS_TO`
> 我需要建立一套统一的'“客户分级标准”'——销售按营收排名、财务按利润排名、生产按'好不好做'排名。三个排名矛盾时，到底听谁的？
> 来源场景: S4

---

### DESIGN × Channel (2 U-JTBDs)

**U-JTBD-0057** | `DESIGN` | `Channel` | `UNKNOWN`
> 我需要决策新品的上市路线图——从研发立项到全渠道铺货的全流程时间线和资源分配，但我不确定研发周期、供应链备货能力、品牌推广窗口和渠道铺货节奏是否能对齐。
> 等价变体 (2个): S2-JTBD-028, S2-JTBD-015
> 来源场景: S2

**U-JTBD-0058** | `DESIGN` | `Channel` | `BUYS_FROM,AFFECTS,COMPETES_WITH`
> 我需要判断是否该采用产品驱动增长（PLG）模式作为销售驱动增长（SLG）的补充——我们一直是SLG为主，但竞品通过"免费试用+自助升级"拿走了我们很多中小客户。我不确定我们的产品是否适合PLG（上手门槛有多高？自助购买意愿有多强？），以及PLG会不会蚕食我们的SLG价格体系。
> 来源场景: S6

---

### DESIGN × Product (4 U-JTBDs)

**U-JTBD-0065** | `DESIGN` | `Product` | `COMPETES_WITH`
> 我需要决定产品配方/包装升级的时间窗口，但我不确定老版本库存消化需要多久，以及升级期间消费者是否会因为'新旧版本交替'而转向竞品。
> 来源场景: S2

**U-JTBD-0066** | `DESIGN` | `Product` | `PRODUCES`
> 我需要决定新产线布局方案——U型线还是直线、在哪放缓冲区——但我不确定各工序之间的物流强度和不平衡率。
> 来源场景: S4

**U-JTBD-0067** | `DESIGN` | `Product` | `BUYS_FROM,AFFECTS,FLOWS_TO`
> 我需要决定产品A的定价是否应该从"按用户数"改为"按用量"——销售说大客户天天抱怨按用户贵，但我不确定Packaging变更会如何影响净收入留存率（NDR）和中小客户的流失。定价委员会开了三次会没结论。
> 来源场景: S6

**U-JTBD-0068** | `DESIGN` | `Product` | `CONSUMES,AFFECTS`
> 我需要决定产品生命周期各阶段的资源投入标准——新产品从"孵化"到"成长"到"成熟"到"衰退"，每个阶段该配置多少工程师/多少营销预算/什么样的组织形态？现在每个BU GM凭感觉定，导致有些产品过早获得了太多资源，有些产品被过早放弃。
> 来源场景: S6

---

### DESIGN × Resource (1 U-JTBDs)

**U-JTBD-0069** | `DESIGN` | `Resource` | `CONSUMES`
> 我需要制定一个合理的设备维护计划，避免'坏了再修'的被动局面，但我不确定每台设备的故障历史、维修频率、关键备件消耗规律。
> 来源场景: S3

---

### DESIGN × Market (1 U-JTBDs)

**U-JTBD-0061** | `DESIGN` | `Market` | `AFFECTS,COMPETES_WITH`
> 我需要决定给关键岗位（电商运营总监/品牌经理/私域负责人）定多少薪酬才有竞争力，但我不确定同规模同品类企业的薪酬分位数据，以及候选人跳槽的真正驱动力是钱还是发展空间。
> 来源场景: S2

---

### DESIGN × Operation (3 U-JTBDs)

**U-JTBD-0062** | `DESIGN` | `Operation` | `FLOWS_TO`
> 我需要评估销售团队是否有必要按照大客户/中小客户拆分成两个独立团队——大客户销售需要深度行业知识和关系维护，中小客户需要高效的标准化销售流程。当前混在一起，两边都做不好。但我不确定拆分后的管理成本和组织摩擦是否会抵消效率提升。
> 等价变体 (4个): S2-JTBD-034, S2-JTBD-038, S3-JTBD-038, S6-JTBD-028
> 来源场景: S2, S3, S6

**U-JTBD-0063** | `DESIGN` | `Operation` | `PRODUCES`
> 我需要设计一个更合理的产线布局，减少在制品的搬运时间，但我不确定各工序之间的流转距离、在制品积压点、以及搬运耗时占比。
> 来源场景: S3

**U-JTBD-0064** | `DESIGN` | `Operation` | `BUYS_FROM,FLOWS_TO`
> 我需要判断销售团队应该继续"按行业垂直"还是改为"按区域"组织——两种模式都试过，但我不确定哪种组织方式对Pipeline转化率和人均ARR更有效。销售VP说按行业好（客户关系深），新来的销售总监说按区域好（出差成本低）。
> 等价变体 (2个): S6-JTBD-013, S6-JTBD-046
> 来源场景: S6

---

### DESIGN × Supplier (1 U-JTBDs)

**U-JTBD-0070** | `DESIGN` | `Supplier` | `PRODUCES,FLOWS_TO`
> 我需要搭建一个'经营数据共享平台'——当前各部门的数据在各自的Excel和系统里，没人能看到全局。生产总监不知道销售在谈什么单子，销售不知道生产成本是多少，供应链不知道研发在改什么BOM。我不是要替代ERP，是要让数据在部门间流动起来。
> 来源场景: S4

---

### CONTROL × Customer (3 U-JTBDs)

**U-JTBD-0045** | `CONTROL` | `Customer` | `BUYS_FROM`
> 我需要决定年底是否要进行一次"大促"（年底签单折扣）——销售VP说"年底冲业绩必须打折"，但我不确定折扣对ARR的长期伤害有多大。去年大促签了800万，但其中35%在次年Q1就流失了——这些客户本来就不该签。
> 等价变体 (2个): S2-JTBD-046, S6-JTBD-044
> 来源场景: S2, S6

**U-JTBD-0046** | `CONTROL` | `Customer` | `UNKNOWN`
> "我需要确保SLA在客户侧的实际可用率达到承诺标准，但我不确定哪些客户在经历性能降级而我们尚未察觉。"
> 来源场景: S5

**U-JTBD-0047** | `CONTROL` | `Customer` | `CONSUMES`
> 我需要评估当前所有在途销售线索中，哪些是高概率且高价值的、需要我亲自介入推动，但我不确定CRM中哪些"高意向"线索是真实的——销售习惯把所有超过10万的线索标成"预算已批"。我做为BU GM的时间有限，不能每个都亲自跟。
> 来源场景: S6

---

### CONTROL × Channel (1 U-JTBDs)

**U-JTBD-0044** | `CONTROL` | `Channel` | `AFFECTS`
> 我需要建立全渠道价格管控体系以消除线上线下的互相伤害，但我不确定窜货的源头、各渠道的真实价格执行情况、以及收紧管控后的销售影响。
> 来源场景: S2

---

### CONTROL × Product (1 U-JTBDs)

**U-JTBD-0053** | `CONTROL` | `Product` | `AFFECTS`
> 我需要决定一个被社交媒体负面舆论冲击的产品是公开道歉/召回还是冷处理，但我不确定舆情的扩散速度和情绪烈度是否会演变成品牌危机。
> 来源场景: S2

---

### CONTROL × Resource (3 U-JTBDs)

**U-JTBD-0054** | `CONTROL` | `Resource` | `CONSUMES`
> 我需要准备下年度的预算——各部门报上来的数字水分有多大？销售预测打几折、费用预算砍多少才合理？去年预算偏差最大的部门是哪个？
> 等价变体 (2个): S3-JTBD-013, S4-JTBD-046
> 来源场景: S3, S4

**U-JTBD-0055** | `CONTROL` | `Resource` | `PRODUCES`
> 我需要监控每个工人的产出效率变化，在效率持续下降时及时介入，但我不确定每个工人近期的日均产出、不良率、以及出勤率趋势。
> 来源场景: S3

**U-JTBD-0056** | `CONTROL` | `Resource` | `UNKNOWN`
> 我需要监控每月的费用是否异常——有没有不该发生的支出、有没有费用突然翻倍，但我不确定各费用科目的正常波动范围、哪些是季节性的合理变化、哪些是管理漏洞。
> 来源场景: S3

---

### CONTROL × Market (1 U-JTBDs)

**U-JTBD-0048** | `CONTROL` | `Market` | `AFFECTS,COMPETES_WITH,FLOWS_TO`
> 我需要决定公司的应收账款信用政策——给经销商/KA客户的账期应该收紧还是放宽，但我不确定收紧信用会不会导致大客户流向竞品，以及放宽信用对现金流的冲击有多大。
> 来源场景: S2

---

### CONTROL × Operation (4 U-JTBDs)

**U-JTBD-0049** | `CONTROL` | `Operation` | `PRODUCES`
> 我需要在手头所有在途订单中，优先关注那些交期最紧张、最可能出问题的订单，但我不确定哪些订单的生产进度落后于计划、哪些有质量问题在返工、哪些原材料还没到齐。
> 等价变体 (3个): S3-JTBD-012, S3-JTBD-023, S3-JTBD-037
> 来源场景: S3

**U-JTBD-0050** | `CONTROL` | `Operation` | `UNKNOWN`
> 我需要确保安全管理合规——上个月出了一起轻伤事故、环保局下个月要来检查。我不知道哪些环节还有安全隐患、整改到位了没有。
> 来源场景: S4

**U-JTBD-0051** | `CONTROL` | `Operation` | `PRODUCES,AFFECTS,REPORTS_TO`
> 我需要协调'研发设计→工程变更→采购调BOM→生产切换'这条链路——每次ECN都要经过4个部门、每个部门都有审批节点。我不知道卡在谁手里、卡了多久、对下游有什么影响。
> 来源场景: S4

**U-JTBD-0052** | `CONTROL` | `Operation` | `AFFECTS,REPORTS_TO`
> 我需要统一全公司对"活跃用户"（MAU/DAU）的定义——产品和市场对MAU的计算方式不同，导致两个部门汇报的数字相差40%。CFO在董事会上引用了产品团队的数字，市场VP当场提出质疑。我需要一套所有利益相关方都认可的指标字典。
> 来源场景: S6

---

### NEGOTIATE × Customer (2 U-JTBDs)

**U-JTBD-0145** | `NEGOTIATE` | `Customer` | `PRODUCES`
> 我需要解决生产→销售的'“能做多少”vs“想卖多少”'矛盾——生产说'这个月产能满了别再接单'，销售说'客户得罪不起必须接'。我需要一个双方都能接受的数据基础。
> 来源场景: S4

**U-JTBD-0146** | `NEGOTIATE` | `Customer` | `BUYS_FROM`
> "我需要决定是否要给一个大客户延期账期或提供折扣来促成签约，但我不确定这个客户未来的NDR潜力能不能覆盖折扣损失。"
> 来源场景: S5

---

### NEGOTIATE × Operation (2 U-JTBDs)

**U-JTBD-0147** | `NEGOTIATE` | `Operation` | `PRODUCES,AFFECTS`
> 我需要和客户谈判调整交期，但我不确定工厂现在的真实产能利用率、哪些订单可以往后排、以及延期对客户的实际影响有多大。
> 来源场景: S3

**U-JTBD-0148** | `NEGOTIATE` | `Operation` | `UNKNOWN`
> 客户催单了，我需要协调厂长（排期）、采购（缺料）、跟单员（客户沟通）一起决定：能不能按时交货？不能的话延期多久？怎么跟客户解释？（协同角色：R1+R2+R3）
> 来源场景: S3

---

### NEGOTIATE × Supplier (1 U-JTBDs)

**U-JTBD-0149** | `NEGOTIATE` | `Supplier` | `UNKNOWN`
> 我需要和供应商谈判下一年的采购价格，但我不确定供应商的底线在哪里、市场上同类供应商的报价、以及我们自己的采购量是否达到了可以要求折扣的规模。
> 来源场景: S3

---

## 5. 场景覆盖统计

| 场景 | 原始 JTBD 数 | 去重后贡献 U-JTBD 数 | 保留率 |
|------|-------------|-------------------|-------|
| S1 (消费品中小) | 58 | 42 | 72.4% |
| S2 (消费品中大) | 53 | 42 | 79.2% |
| S3 (制造中小) | 48 | 38 | 79.2% |
| S4 (制造中大) | 68 | 53 | 77.9% |
| S5 (SaaS中小) | 30 | 25 | 83.3% |
| S6 (SaaS中大) | 59 | 48 | 81.4% |

---

## 6. 判定过程摘要

# Per-cell S3 analysis summary
- **ALLOCATExCustomer**: 15→8 (合并7个) | low_overlap: 86, partial_overlap_same_node_retention: 8, partial_overlap_diff_node_general_vs_retention: 4
- **ALLOCATExChannel**: 16→9 (合并7个) | low_overlap: 103, high_overlap: 8, partial_overlap_same_node_roi: 5
- **ALLOCATExProduct**: 16→10 (合并6个) | low_overlap: 105, high_overlap: 7, partial_overlap_diff_node_pricing_vs_general: 2
- **ALLOCATExResource**: 18→5 (合并13个) | low_overlap: 123, high_overlap: 18, partial_overlap_same_node_cost: 3
- **ALLOCATExMarket**: 12→7 (合并5个) | low_overlap: 57, high_overlap: 6, partial_overlap_same_node_competitive: 3
- **ALLOCATExOperation**: 6→4 (合并2个) | low_overlap: 8, partial_overlap_diff_node_data_vs_general: 1, partial_overlap_diff_node_data_vs_efficiency: 1
- **DIAGNOSExCustomer**: 19→8 (合并11个) | low_overlap: 131, high_overlap: 16, partial_overlap_diff_node_general_vs_retention: 7
- **DIAGNOSExChannel**: 12→8 (合并4个) | low_overlap: 57, high_overlap: 6, partial_overlap_diff_node_general_vs_roi: 1
- **DIAGNOSExProduct**: 23→9 (合并14个) | low_overlap: 205, high_overlap: 15, partial_overlap_same_node_quality: 9
- **DIAGNOSExResource**: 20→10 (合并10个) | low_overlap: 165, high_overlap: 12, partial_overlap_diff_node_capacity_vs_general: 4
- **DIAGNOSExMarket**: 5→3 (合并2个) | low_overlap: 7, partial_overlap_same_node_competitive: 2, high_overlap: 1
- **DIAGNOSExOperation**: 24→4 (合并20个) | low_overlap: 217, high_overlap: 21, partial_overlap_same_node_data: 6
- **DIAGNOSExSupplier**: 6→4 (合并2个) | low_overlap: 12, high_overlap: 3
- **PREDICTxCustomer**: 12→5 (合并7个) | low_overlap: 49, partial_overlap_same_node_retention: 6, partial_overlap_diff_node_acquisition_vs_retention: 4
- **PREDICTxChannel**: 4→3 (合并1个) | low_overlap: 5, high_overlap: 1
- **PREDICTxProduct**: 5→5 (合并0个) | low_overlap: 10
- **PREDICTxResource**: 16→9 (合并7个) | low_overlap: 105, high_overlap: 9, partial_overlap_diff_node_cashflow_vs_cost: 4
- **PREDICTxMarket**: 3→3 (合并0个) | low_overlap: 2, partial_overlap_diff_node_brand_vs_entry: 1
- **PREDICTxOperation**: 2→2 (合并0个) | partial_overlap_diff_node_general_vs_general: 1
- **PREDICTxSupplier**: 4→1 (合并3个) | low_overlap: 2, partial_overlap_same_node_risk: 2, high_overlap: 1
- **EVALUATExCustomer**: 10→5 (合并5个) | low_overlap: 34, high_overlap: 9, partial_overlap_diff_node_general_vs_general: 2
- **EVALUATExChannel**: 2→2 (合并0个) | low_overlap: 1
- **EVALUATExProduct**: 10→8 (合并2个) | low_overlap: 37, partial_overlap_diff_node_general_vs_development: 2, partial_overlap_same_node_lifecycle: 1
- **EVALUATExResource**: 5→4 (合并1个) | low_overlap: 9, high_overlap: 1
- **EVALUATExMarket**: 4→4 (合并0个) | low_overlap: 5, partial_overlap_diff_node_competitive_vs_entry: 1
- **EVALUATExOperation**: 2→2 (合并0个) | low_overlap: 1
- **EVALUATExSupplier**: 3→3 (合并0个) | low_overlap: 3
- **DESIGNxCustomer**: 3→2 (合并1个) | low_overlap: 2, high_overlap: 1
- **DESIGNxChannel**: 3→2 (合并1个) | low_overlap: 2, high_overlap: 1
- **DESIGNxProduct**: 4→4 (合并0个) | low_overlap: 6
- **DESIGNxResource**: 1→1 (合并0个) | 无合并
- **DESIGNxMarket**: 1→1 (合并0个) | 无合并
- **DESIGNxOperation**: 7→3 (合并4个) | low_overlap: 10, high_overlap: 3, partial_overlap_same_node_efficiency: 2
- **DESIGNxSupplier**: 1→1 (合并0个) | 无合并
- **CONTROLxCustomer**: 4→3 (合并1个) | low_overlap: 5, partial_overlap_same_node_retention: 1
- **CONTROLxChannel**: 1→1 (合并0个) | 无合并
- **CONTROLxProduct**: 1→1 (合并0个) | 无合并
- **CONTROLxResource**: 4→3 (合并1个) | low_overlap: 5, high_overlap: 1
- **CONTROLxMarket**: 1→1 (合并0个) | 无合并
- **CONTROLxOperation**: 6→4 (合并2个) | low_overlap: 11, high_overlap: 3, partial_overlap_diff_node_general_vs_org: 1
- **NEGOTIATExCustomer**: 2→2 (合并0个) | low_overlap: 1
- **NEGOTIATExOperation**: 2→2 (合并0个) | low_overlap: 1
- **NEGOTIATExSupplier**: 1→1 (合并0个) | 无合并

---

> **生成时间**: 2026-07-06 | **方法**: 语义等价判定矩阵 v1.0 (S1→S2→S3 三步判定)
> **输出文件**: SYNOVA-RESEARCH-JTBD-去重后统一JTBD集-v2-20260706.md