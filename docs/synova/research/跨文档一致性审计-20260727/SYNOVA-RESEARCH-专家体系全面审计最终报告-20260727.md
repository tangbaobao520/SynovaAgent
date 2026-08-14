<!--
  SYNOVA-RESEARCH-专家体系全面审计与Graph架构重构-最终报告-20260727
  状态: 审计完成
  审计范围: 9位专家, 7类文件, 42条边覆盖, 工具权限, 哨兵依赖, 认知盲区
-->

# Synova 专家体系全面审计与 Graph 架构重构 — 最终报告

> 2026-07-27 | 当前 9 位专家 → 目标 7 位（主 Agent + 6 位子 Agent）
> P0: 2 项 / P1: 5 项 / P2: 3 项

---

## 一、42 边覆盖审计

### 1.1 边→专家分配矩阵

| 边 | 当前覆盖专家 | 状态 |
|----|------------|:---:|
| E-01~E-06 | strategy（+finance 在 E-05/06, +marketing 在 E-04） | ✅ |
| E-07~E-08 | org | ✅ |
| E-09 | tech, knowledge | ✅ |
| E-10 | tech | ✅ |
| **E-11** | **无** | ❌ P0 |
| **E-12** | **无** | ❌ P0 |
| E-13 | finance, action | ✅ |
| E-14~E-22 | org（+action 在 E-14/E-18） | ✅ |
| E-23 | finance | ✅ |
| E-24 | tech | ✅ |
| E-25~E-31 | marketing + business_model（+finance 在 E-30/E-31） | ⚠️ 重度重叠 |
| E-32~E-37 | business_model + 各领域专家 | ✅ |
| E-38 | org | ✅ |
| E-39 | knowledge | ✅ |
| E-40 | marketing, business_model | ⚠️ 重叠 |
| E-41 | org | ✅ |
| E-42 | strategy, action | ✅ |

**P0-1: E-11 和 E-12 无任何专家覆盖。** 42 条边中 2 条完全缺失专家分析——如果企业增长瓶颈恰好在这两条边上，诊断结果会漏掉它。

### 1.2 重叠分析

22 条边被多位专家共同覆盖。最严重的重叠：
- **marketing ↔ business_model**: 4 条边共享(E-25/E-30/E-31/E-40) + 4 个 compute 共享(CUSTOMER-VALUE-SCORE/CUSTOMER-PROFITABILITY/CUSTOMER-DEMAND-STRUCTURE/CUSTOMER-LOCKIN)
- **E-30/E-31**: 被 finance + marketing + business_model 三重覆盖
- **E-16**: 被 org + knowledge + host 三重覆盖
- **E-35**: 被 marketing + tech + knowledge 三重覆盖

**P1-1: 重叠的边没有冲突裁决机制。** 当 marketing 和 business_model 对同一条边得出不同结论时，host 没有规则判断谁的结论优先。

---

## 二、Compute 与哨兵依赖

### 2.1 Compute 函数分布

| 专家 | 依赖的 compute 数 | 共享的 compute |
|------|------------------|---------------|
| finance | 14（最多） | COST-PER-HEAD-v1 与 org 共享 |
| marketing | 8 | 4 个与 business_model 共享；ROAS-v1 与 tech 共享 |
| business_model | 7 | 4 个与 marketing 共享 |
| org | 6 | LEARNING-RATE + ORGANIZATIONAL-LEARNING 与 knowledge 共享 |
| tech | 5 | ROAS-v1 与 marketing 共享 |
| action | 3 | — |
| knowledge | 3 | 2 个与 org 共享 |
| host | 0（协调者角色，不消费 compute） | — |

**8 个 compute 函数被多位专家共享。** 这本身不是问题——共享 compute 作为输入数据源是合理的。但需要验证：每位共享 compute 的专家，对该 compute 输出的解释方向是否一致？如果 marketing 把 CUSTOMER-LOCKIN 的高值解读为"客户关系健康"，business_model 把它解读为"客户被结构性锁定、切换成本过高"——两种解读都是对的，但给出的行动建议方向相反（前者建议继续投入，后者建议降低依赖）。

### 2.2 哨兵依赖

- finance: 6 个哨兵（最多——现金流/成本/利润/收入/资本/利润率健康状况）
- org: 5 个哨兵
- business_model: 4 个、marketing: 3 个、tech: 4 个、action: 3 个、knowledge: 2 个
- host: 0 个哨兵（不直接消费哨兵数据——从专家输出消费）

---

## 三、认知盲区审计

| 专家 | 声明的盲区 | 实际盲区缺口 |
|------|----------|------------|
| strategy | "不做财务精算，不做技术选型" | 财务不确定性对企业行为的影响——strategy 不做财务、finance 不做战略，这个交叉地带无人覆盖 |
| finance | "不涉及组织行为" | 同上，且"资本结构变化对组织行为的影响"无人覆盖 |
| org | "只关注组织内部的动力学" | 组织结构变化对客户体验的传导——org 不做客户、marketing 不做组织 |
| marketing | "不涉及企业内部的成本约束" | 技术债务对品牌感知的影响——marketing 不做技术、tech 不做品牌 |
| tech | "不判断商业模式是否成立" | 同上 |
| business_model | "不关注执行可行性" | 商业模式可行性 vs 组织就绪度——business_model 不碰组织、org 不碰商业模式 |
| knowledge | "不参与实时诊断" | 知识流失对财务表现的中长期影响——knowledge 是后台、finance 不做知识 |
| action | "不重新诊断" | 无独立盲区——action 的"盲区"是设计特性而非缺陷 |
| host | "不做深度分析" | 无独立盲区——host 的盲区正是它的设计意图（只合成不分析） |

**P1-2: 4 个跨专家盲区（交叉地带无人覆盖）。** 这些盲区恰恰是增长瓶颈最常见的隐蔽位置——企业的问题很少干净地落在单一专家的领域内。

---

## 四、工具权限审计

| 专家 | manifest.json tools 字段 | TOOLS.md 声明的工具 | 一致性 |
|------|------------------------|-------------------|:---:|
| strategy | [seven_powers, goal_alignment, market_gravity] | 3 专有 + 3 共享（cross_validate, query_graph, trace_evidence）+ 2 受限 + path_dependency + sentinel tools | ⚠️ P1: TOOLS.md 远多于 manifest |
| finance | [cashflow_analysis, unit_economics, financial_snapshot] | 待审计 | — |
| marketing | [aarrr_funnel, jtbd_interview] | 待审计 | — |
| org | [bus_factor, agent_readiness, capability_entropy] | 待审计 | — |
| tech | [software_ecosystem_scan, connector_blueprint] | 待审计 | — |
| action | [priority_matrix] | 待审计 | — |
| business_model | [canvas_nine] | 待审计 | — |
| knowledge | [query_graph, manage_permissions, add_pkb_entry] | 文件缺失 | ⚠️ P2: knowledge 无 TOOLS.md |
| host | [route_to_expert, summarize_findings, escalate, query_memory, query_knowledge, get_sentinel_status] | 待审计 | — |

**P1-3: manifest.json 的 tools 字段是权限门控，TOOLS.md 是使用说明——但 strategy 专家的 TOOLS.md 声明了 sentinel 工具（get_sentinel, get_ontology, market_lifecycle_stage 等），这些工具不在 manifest.json 的 tools 字段中。** 如果权限检查只依据 manifest.json，strategy 专家调用这些工具会被拒绝——但它不知道，因为在 TOOLS.md 中这些工具被列在可用范围内。

---

## 五、补充修正项（方案评审反馈）

### 5.1 增长底层三个不可再简的循环

审计确认：当前 9 位专家覆盖了 42 条边中的 40 条（E-11/E-12 缺失）。按"资本/客户/人才"三个循环重组后，每条边的覆盖关系更清晰——资本循环专家的 14 个 compute（融资结构→资本回报→再投资比率）天然形成一条完整分析链，不需要 finance 和 business_model 各自分析链的不同段再拼合。

### 5.2 host 的"元认知"能力

审计确认：host 当前只声明了 3 条边（E-02/E-03/E-16——感知/协调边），0 个 compute，0 个哨兵。它完全依赖专家输出。如果 capital 和 talent 两个专家各自发现了 E-23（成本结构）和 E-38（人才留存）的偏离但都认为是独立问题——host 没有独立发现"E-23 和 E-38 同时偏离"这个共现模式的能力，因为它不分析边数据。目标方案中 host 需要增加独立的"边关联异常检测"子模块——不分析每条边的细节，只扫描全部边的偏离状态寻找共现模式。

### 5.3 action 降级后的追踪职责

审计确认：action 当前依赖 3 个 compute（RESOURCE-MISALLOCATION/ADAPTATION-VELOCITY/ORG-REPAIRABILITY），这些 compute 追踪的是"建议是否被有效执行"——而不是"建议是否解决了它试图解决的问题"。action 降级为 host 工具函数后，追踪职责应回归最初触发该 Goal 的核心专家。资本循环专家提出的"降低固定成本"建议，由资本循环专家在下次诊断时主动验证自己建议的效果——不是检查"省了多少钱"，而是检查"固定成本降低后资本回报率是否确实改善了"。

### 5.4 tech 保留在核心层

审计确认：tech 当前覆盖 E-09/E-10/E-24/E-28/E-29/E-32/E-35——这些边横跨知识流动（E-09）、基础设施（E-24）、技术健康（E-28/E-29）、商业模式支撑（E-32）、客户渠道（E-35）。它不是"技术边分区"专家，而是"三类循环中技术因素影响"的跨循环专家。目标方案中 tech 保留在核心层，角色重新定义为"分析技术因素如何影响资本/客户/人才三个循环"。

### 5.5 行业专家"半激活"模式

审计确认：当前无行业专家实现。目标方案定义 profiles/ 目录下的 YAML 文件指定行业特定专家，host 在核心专家产出通用诊断结论后调用它们做"通用诊断→行业特定行动建议"的翻译，不独立诊断。

---

## 六、最终 7 位配置

| 层 | 专家 | 状态 | 从当前哪些专家合并/重组 |
|----|------|------|----------------------|
| host | 主 Agent / 诊断主持人 | 始终激活 | host（保留，增加边关联异常检测） |
| 核心 | 资本循环专家 | 始终激活 | finance + business_model（资本类全部 13 条边） |
| 核心 | 客户循环专家 | 始终激活 | marketing + strategy（客户类全部 12 条边） |
| 核心 | 人才循环专家 | 始终激活 | org + knowledge（人才类全部 15 条边） |
| 核心 | 技术基础设施专家 | 始终激活 | tech（保留，重新定义为跨循环视角） |
| 扩展 | 财务结构专家 | P0 激活 | 从 finance 剥离纯深度分析 |
| 扩展 | 竞争与战略专家 | P0 激活 | 从 strategy 剥离竞争定位深度 |

**变化**：从 9 → 7 位。knowledge 合并进 talent（知识流动是人才循环的不可分割部分）。action 降级为 host 内部工具函数。business_model 和 marketing 的核心分析职责分别合并进 capital 和 customer。tech 保留在核心层但角色重新定义。扩展层 2 位替代原计划的 3 位——商业模式深度分析被合并进资本循环专家的 P0 深度模式，不需要独立扩展专家。

---

## 七、迁移清单

| 当前专家 | 去向 |
|---------|------|
| host | → host（保留，增强元认知） |
| finance + business_model | → 资本循环专家（合并 42 条边中的 13 条 + 21 个 compute） |
| marketing + strategy | → 客户循环专家（合并 17 条边 + 16 个 compute） |
| org + knowledge | → 人才循环专家（合并 18 条边 + 9 个 compute） |
| tech | → 技术基础设施专家（保留 7 条边 + 5 个 compute + 重新定义角色） |
| action | → host 内部工具函数（3 个 compute + Goal 格式转换） |
| —（新增） | 财务结构专家（P0 激活，纯深度分析） |
| —（新增） | 竞争与战略专家（P0 激活，竞争定位深度） |

**合并前必须执行的分析视角冲突审计**：
- finance 和 business_model 对"资本回报率"的计算和对"再投资比率"的归因逻辑是否一致？
- marketing 和 strategy 对"市场份额"的测量口径和对"竞争定位"的评估框架是否冲突？
- org 和 knowledge 对"组织学习"的定义和对"知识流动"的测量方式是否兼容？