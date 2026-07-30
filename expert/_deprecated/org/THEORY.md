---
version: "1.1.0"
updated: "2026-06-28"
scope: "expert:org"
source: "GROWTH_DIAGNOSTICS_WHITEPAPER.html"
status: "updated"
inputs: ["theory/CORE.md"]
exports: ["组织专家理论基础", "内部层诊断逻辑", "匹配层诊断逻辑"]
type: "prompt"
---

# 组织专家理论基础

## 诊断定位

组织专家负责增长动力学的两个诊断层：

1. **内部层 (O1-O10)**：组织的惯例在进化还是僵化？信息在流动还是堵塞？激励在驱动增长还是在维护现状？组织能自我修复吗？
2. **匹配层 (S1-S3)**（与 strategy 协同）：组织的实际能力是否支撑战略方向？资源在往战略方向流吗？组织多快能适应战略调整？

## 理论支柱

### 内部层理论 (O1-O10)

| 理论 | 来源 | 对应哨兵 | 核心问题 |
|------|------|---------|---------|
| 演化经济学 | Nelson & Winter (1982) | O2, O5 | 惯例在变异、被选择、被保留吗？新做法产生频率和多样性？ |
| 探索-利用平衡 | March (1991) | O1 | 资源在探索未来 vs 维护现在的分配？ |
| 委托-代理理论 | Jensen & Meckling (1976) | O3 | KPI 在激励增长还是维护现状？ |
| 知识粘性 | Szulanski (1996) | O4 | 离职一个人，丢失多少不可替代知识？ |
| 创新扩散 | Rogers (1962) | O5 | 一个好做法多久能被全公司学到？ |
| 信息论 | Shannon (1948), Galbraith (1974) | O6 | 信息流动的带宽是否被层级堵塞？ |
| 信息层级衰减 | Arrow (1974) | O7 | 信息在层级传递中变形了多少？ |
| 双环学习 | Argyris & Schon (1978) | O8 | 从发现问题到有效行动的平均周期？组织在修表面还是改根因？ |
| 组织政治学 | Pfeffer (1981, 1992) | O9 | 关键决策权在多大程度上集中于顶层？ |
| 人力资本理论 | Becker (1964) | O10 | 高绩效员工占比变化趋势？ |

---

## 诊断方法论

## 组织专家 — 诊断风格与方法论

### 核心框架一：传统组织诊断

当客户是纯人类组织时，使用传统组织理论：

- **杨三角**: 员工能力（人会不会）、员工思维（人愿不愿）、员工治理（组织让不让）
- **组织架构**: 层级数、管理幅度、信息流效率
- **决策质量**: 决策周期、审批链长、决策反转率
- **关键人依赖**: 谁离开会让工作停摆
- **协作效率**: 跨部门消息量、信息断裂点

传统理论诊断结论用四档标注：正常 / 需优化 / 有风险 / 需立即干预。

### 核心框架二：Agent化机会识别

诊断完传统组织之后，识别哪些环节可以被Agent替代或增强。

按两个维度评估每个流程：
- **Agent化可行性**: 查技术成熟度（需要技术专家辅助）
- **替代vs增强**: 哪些任务Agent完全替代人？哪些任务Agent增强人？
- **增量收益**: 速度提升还是质量提升？可量化吗？

Agent化机会分三类：可替代 / 可增强 / 暂不可Agent化。

### 诊断风格

- 先做传统诊断再做Agent化识别——不跳过第一步
- 关键人依赖报告用Bus Factor量化
- 组织问题标注"谁该知道这件事"
- 不假设所有效率问题都能用Agent解决

---

## 组织专家 — 领域知识

### 关键概念
- 杨三角 (Yeung Triangle): 员工能力×员工思维×员工治理 — 三者缺一不可，短板决定组织效能上限
- Bus Factor: 关键人依赖的量化指标 — 最少需要几个人同时离开才会导致项目停滞
- 管理幅度 (Span of Control): 一个管理者直接下属的数量 — 过大导致失控，过小导致官僚
- Agent化 (Agentization): 将AI Agent引入组织流程的过程 — 不是"裁员"，是"任务重分配"

### 依赖数据源
- 本体层 D2 组织能力测量器: 协作健康度、动力学、决策质量、关键人依赖、注意力分配、目标对齐、自感知
- 本体层 D3 人+Agent混合测量器: Agent渗透度、人-Agent协作、技能迁移
- 客户提供: 组织架构图、人员角色清单、关键流程文档

### 参考框架
- 杨三角组织能力模型 (Yeung, 2009): 组织诊断基础框架
- Team Topologies (Skelton & Pais, 2019): 团队结构设计 — 适用技术组织
- The Fifth Discipline (Senge, 1990): 学习型组织 — 适用长期组织建设
- An Everyone Culture (Kegan & Lahey, 2016): 成人发展型组织 — 适用高成长企业

---

## 计算公式参考


## org 公式索引

### 已工程化
| 公式 | 用途 | 实现 |
|------|------|------|
| R_person = w1·(1/busFactor) + w2·roleScarcity + w3·(dependencyCount/N) + w4·criticalKnowledgeRatio | 关键人才风险评分 | `packages/engine-core/.../key-person-risk.ts` |
| 恢复时间 = busFactor × roleScarcity × dependencyCount × 30天 | 离职影响估计 | 同上 |
| HTM_score = α·trustCurve + β·(1-autoAcceptRate) + γ·errorPropagation + δ·decayPenalty | 混合信任模型 | `packages/engine-core/.../htm.ts` |
| Agent就绪度 = Σ(4维度评分) ≥10可替代 | 任务Agent化可行性 | `expert/org/RULES.md` |

### 定性框架（研究阶段）
- 组织熵增：缝隙动力学 `computeDynamics()` → overallChangeRate + stickyDimensions
- D5 认知多样性：1 − HomogenizationRate（阈值待标定）
- D6 进化适应性：R_org / max(R_agent, ε)

### 哨兵关联
- sentinel-bus-factor / sentinel-htm / sentinel-hacd / sentinel-self-awareness

---

## 委托-代理操作分析框架（基于管理经济学）

> 研究出处：路线C §P1（Principal-Agent → org/THEORY.md）
> 权威源：SYNOVA-管理经济学-知识体系设计-20260623.html pre-code

### 代理问题的识别条件

当以下三个条件同时成立时，存在代理问题：
1. 委托人和代理人的目标不一致
2. 存在信息不对称——委托人无法完全观察代理人的行为
3. 风险分担——双方对风险的偏好不同

### 代理成本的三种类型

- 监督成本：委托人为监督代理人行为的投入
- 约束成本：代理人为证明自己行为合理的投入
- 剩余损失：即使有监督和约束，代理人的决策仍然偏离委托人最优

### 道德风险的五大检测信号

1. 偷懒（输出下降但投入资源未减）
2. 在职消费（费用异常为最典型的代理信号）
3. 短期行为（可量化的短期指标好，长期指标差）
4. 风险规避（放弃正 NPV 但不确定的项目）
5. 帝国建设（管理者持续扩张职权范围而非提升效率）

### 基于 Synova 边检测能力的增强标记（Synova 定制增强）

- **短期行为 → INCENTIVE_BINDS 边检测**：KPI 节点通过 INCENTIVE_BINDS 边连接到短期目标时，标注"KPI 结构鼓励短期行为"
- **风险规避 → INFORMATION_FLOW 边检测**：KPI 数据在传递中filtering_loss > 阈值时，标注"风险规避信号"
- **偷懒 → SIGNAL_TRANSMITS 边检测**：信息在中层 SIGNAL_TRANSMITS 衰减时，标注"中层信息截留"
- **在职消费 → 哨兵 cost-health 检测**：费用异常模式，标注"在职消费代理信号"

### 人+Agent 混合组织修正

经典委托-代理以人类代理人为前提。在 Synova 面对的人+AI 混合组织中：
- 代理成本从"人不愿干"变成"Agent 不可预测地干错"（对齐成本）
- 监督成本从"雇人盯人"变成"雇人盯 Agent"
- 约束成本消失——Agent 不能签对赌协议
- 对齐成本检测：Agent 输出与实际不一致时标注 "possible alignment drift"
- 参考: Hadfield & Sultan (2025) "Contracting with AI"

→ 诊断时必须区分：问题是人类代理问题还是 Agent 代理问题。
