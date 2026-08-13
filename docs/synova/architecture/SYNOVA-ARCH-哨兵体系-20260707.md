---
title: "SynovaAgent 哨兵体系架构"
version: "v1.1"
date: "2026-07-07"
status: "现状白皮书 — 从代码反推。v1.1增加正向信号放大设计"
---

# 哨兵体系架构

> 哨兵是 Synova "主动发现异常"的载体。它们 24 小时轮巡，
> 检查关键指标的基线偏离，发现异常时触发专家推理，生成诊断报告或告警。
> 在产品全景中，哨兵是"免疫系统"的实现层。

---

## 一、当前实际状态

### 1.1 规模

| 指标 | 数值 |
|------|------|
| 哨兵目录总数 | 61 |
| 有 aggregate.ts（真正可运行） | 50 |
| 无 aggregate.ts（空壳） | 11 |
| aggregate.ts 总代码量 | ~2,860 行（50个文件） |
| 最小/最大 aggregate | 21 行 (key-person-risk) / 179 行 (software-health) |
| 平均 aggregate 行数 | 57 行 |

### 1.2 注册体系（三重入口）

哨兵被加载和注册有三个独立路径：

```
路径1: builtins.ts
  → 扫描 src/sentinel/adapters/*-sentinel.ts（5个旧版哨兵，全部@deprecated）
  → getSentinelRegistry().register()

路径2: file-driven-loaders.ts (init/)
  → 扫描 extensions/sentinels/*/manifest.json（61个目录）
  → 动态 import aggregate.ts
  → getSentinelRegistry().register()

路径3: runner.ts
  → 运行时再次调用 loadSentinels()
```

路径2是主力（61个哨兵），路径1是遗留（5个旧版），路径3是冗余。
如果同一个哨兵同时存在于路径1和路径2，会被注册两次。

### 1.3 按专家分布

| 专家 | 哨兵数 | 说明 |
|------|--------|------|
| org（组织） | 21 | 组织健康、协作、信任、权力结构 |
| strategy（战略） | 14 | 竞争壁垒、护城河、产业生命周期 |
| finance（财务） | 11 | 资本结构、现金流、成本利润 |
| tech（技术） | 9 | AI成熟度、SaaS健康、连接器 |
| business_model | 5 | 商业模式一致性、价值捕获、单位经济 |
| marketing（市场） | 1 | 渠道容量 |

### 1.4 按优先级

| 优先级 | 数量 | 说明 |
|--------|------|------|
| P0 | 4 | 最高优先级（cash-runway, revenue-health, profit-health, cost-health） |
| P1 | 49 | 常规哨兵 |
| P2 | 8 | 低优先级（探索性哨兵、专项框架） |

注：4个P0哨兵的 compute 函数全部缺失或部分缺失。

### 1.5 按调度频率

| 频率 | 数量 | 说明 |
|------|------|------|
| 每月 (0 0 1 * *) | 42 | 大多数哨兵按月轮巡 |
| 每周 (0 9 * * 1) | 9 | 周度检查 |
| 每日 (0 9 * * *) | 3 | 日度检查 |
| 每6小时 (0 */6 * * *) | 2 | 高频检查 |
| 其他 | 4 | 各种定制调度 |

### 1.6 已知质量问题

| 问题 | 数量 | 详情 |
|------|------|------|
| 空壳（有 manifest 无 aggregate） | 11 | collaboration-health, eob, financial-snapshot, gap-dynamics, hacd, hona, htm, path-dependency, self-awareness, seven-powers, token-economics |
| 描述为空 | 13 | 哨兵名称仅为"S1"/"O1"等形式，无产品语义 |
| 查询不存在的实体类型 | 14 | Goal, Product, Capability, Market, Supplier, Location, Compliance 等 |
| 使用大写类型名（可能查不到数据） | 5 | TOOL, CLIENT, FINANCIAL |
| compute 函数缺失 | 9 | 4个哨兵受影响（cash-runway, cost-health, profit-health, revenue-health） |
| export 名不匹配 | 3 | power-rigidity, explore-exploit-balance, path-dependency |
| 硬编码假数据 | 4 | competitive-moat-structural, competitive-dynamics, market-lifecycle, internal-transaction-cost |
| 空吞异常（catch 无 return） | 4 | cash-runway, cost-health, profit-health, revenue-health |
| 不检查 degraded | 11 | 多个哨兵 |

---

## 二、哨兵和产品角色的映射

根据产品全景定义的三个用户场景，哨兵按功能分为：

### 诊断型（26个）— 发现异常 → 触发诊断

| 哨兵 | 检测目标 | 当前状态 |
|------|----------|---------|
| cash-runway | 现金跑道+应收逾期 | ❌ 受损（compute缺失） |
| cost-health | 成本结构恶化 | ❌ 受损（compute缺失） |
| revenue-health | 收入增长放缓+客户集中度 | ⚠️ 受损（1/2 compute缺失） |
| profit-health | 利润率vs行业基准 | ❌ 受损（compute缺失） |
| key-person-risk | 独占知识域的关键人 | ⚠️ 受损（compute缺失） |
| customer-demand-shift | 客户流失率/收入集中度/NPS | ✅ |
| competitive-dynamics | 竞争强度/份额变动 | ⚠️ 硬编码假数据 |
| capital-structure | 负债权益比/利息覆盖 | ✅ |
| capital-efficiency | ROIC/WACC/资本周转 | ✅ |
| growth-quality | 现金流转化/有机增长 | ✅ |
| financing-constraint | 融资约束(KZ指数) | ✅ |
| api-coverage | API可达率/协议覆盖 | ✅ |
| data-health | 数据质量/连通性 | ✅ |
| software-health | SaaS利用率/授权合规 | ✅ |
| internal-transaction-cost | 管理成本率/协调成本 | ⚠️ 硬编码假数据 |
| structural-change | 技术-经济范式变化 | ✅ |
| environment-rent-dependency | 环境红利依赖 | ✅ |
| opportunity-window | 结构性机会信号 | ✅ |
| niche-squeeze | 生态位挤压 | ✅ |
| market-lifecycle | 产业生命周期 | ⚠️ 硬编码假数据 |
| 及其他 | | |

### 导航型（3个）— 跟踪执行 → 辅助决策

| 哨兵 | 导航功能 | 当前状态 |
|------|----------|---------|
| channel-capacity | 渠道容量监控 | 描述为空 |
| unit-economics | LTV/CAC趋势跟踪 | ✅ |
| time-penetration | 跨哨兵聚合 | ✅ |

### 混合型（12个）— 诊断 + 导航

包括 business-model-coherence, niche-breadth, competitive-moat-structural,
competitive-moat-perceptual, moat-dependency, network-power, value-capture,
incentive-alignment, info-distortion, resource-misallocation, talent-density,
adaptation-velocity。每个既有诊断面（检测当前异常），又有导航面（跟踪变化趋势）。

### 专项型（9个）— 特定理论框架

seven-powers (7 Powers), HACD (人机协作深度), HTM (混合信任模型),
HONA (异质节点网络), EOB (组织弹性边界), collaboration-health (协作协议),
make-or-buy (自制外购), explore-exploit-balance (探索-利用),
agent-deployment-maturity (Agent部署成熟度)。

其中前7个是空壳（无aggregate.ts），3个可用。

---


## 二点五、正向信号放大（设计修正）

> 这不是代码现状——当前代码不支持。这是产品设计层面的待修正项。

### 为什么需要

哨兵目前只做一件事：检测指标是否低于阈值 → 触发告警。这是"坏消息机器"。用户用久了会产生"Synova只会报忧"的疲劳感。

但企业里每天都在发生值得被放大的好事：某个部门的客户留存率远超目标、某个渠道的ROI在没有额外投入的情况下持续提升、某个产品线的利润率逆势上升。这些信号如果不被系统捕捉，就只存在于中层管理者的直觉里。Synova应该做的不是找到问题才开口——而是任何值得关注的偏离，无论正向负向，都应该被检测和报告。

### 改动方案

哨兵的 manifest.json 的 `thresholds` 字段当前只有两个阈值（warning + critical）。增加第三个阈值 `excellence`——正向偏离阈值。当哨兵检测到指标 ≥ excellence 阈值时，产生 `severity: 'positive'` 的 Finding，不进告警流程，进"亮点报告"。

对 `SentinelFinding` 的改动：`severity` 字段从 4 个值扩展为 5 个：`'emergency' | 'critical' | 'warning' | 'info' | 'positive'`。

对 `SentinelCheckResult` 的改动：增加 `positiveFindings` 字段，与负向 `findings` 分开路由——正向发现路由到"亮点专家"，分析"为什么这个指标这么好"，给出复制建议。

### 首批应配置 excellence 阈值的哨兵

| 哨兵 | 检测的 excellence 信号 | 价值 |
|------|----------------------|------|
| unit-economics | LTV/CAC > 5 | 获客效率远超行业基准 |
| customer-demand-shift | NDR > 120% | 客户增购远超流失 |
| revenue-health | 收入增速 > 行业平均 × 2 | 增长引擎强劲 |
| capital-efficiency | ROIC - WACC > 10% | 资本配置卓越 |
| talent-density | 高绩效员工占比 > 80% | 人才密度极高 |
| routine-diffusion | 最佳实践采用率 > 90% | 组织学习能力卓越 |

### 对产品全景的影响

产品全景中 Synova 的三个类比——免疫系统、驻扎的麦肯锡、最强大脑——都需要这个能力。"免疫系统"不只是发烧预警，也是锻炼后肌肉增长的信号。"麦肯锡"不只是指出问题，也告诉管理层"你们这个部门值得所有人学习"。"最强大脑"不只是纠偏，也是发现和放大组织内部已经存在的优势。

---
## 三、哨兵的数据流

```
CronScheduler (src/cron/scheduler.ts)
  → 按 manifest.json 的 schedule 字段定时唤醒
  → sentinel-loader.ts 扫描 extensions/sentinels/*/manifest.json
    → 动态 import aggregate.ts 的 exportKey 对应函数
    → 包装为 check(store, teamId, traversal?) → SentinelCheckResult
  → SentinelRegistry.register()
  → SentinelRunner 执行 check()
    → aggregate.ts 调用 store.queryNodes() / traversal.traverse()
      → 获取 L4 本体层数据
    → aggregate.ts 调用 compute 函数（来自 shared/computes/ 或本目录 computes/）
    → 与 manifest.json 的 thresholds 字段对比
    → 产生 SentinelFinding[]
  → SignalAggregator 聚合多个哨兵的 Finding
  → 按照 expert 字段路由到对应专家
  → 专家 ReAct 推理 → 诊断报告
```

### 3.1 aggregate.ts 的真实签名

哨兵的 aggregate.ts 有且只有一个导出，签名必须匹配：

```typescript
export const xxxSentinel = {
  async check(
    store: GraphStoreReader,       // 图查询接口（queryNodes, queryEdges）
    teamId: string,                // 团队ID
    traversal?: GraphTraversal     // V4.3.0+ 图遍历实例
  ): Promise<SentinelFinding[]>
}
```

当前50个 aggregate 全部实现了此签名（其中6个使用缩写参数名 `s: GSR, tid: string`，
但语义一致）。

### 3.2 manifest.json 的结构

```json
{
  "name": "adaptation-velocity",
  "displayName": "S2 战略调适速度",
  "description": "...",
  "schedule": "0 9 * * 1",
  "expert": "org",
  "priority": "P1",
  "computes": ["compute-adaptation-velocity"],
  "thresholds": { "score": { "warning": 0.4, "critical": 0.2 } },
  "entryPoint": "./aggregate.ts",
  "exportKey": "adaptationVelocitySentinel"
}
```

---

## 四、哨兵与本体层的关系

哨兵通过两种方式消费本体层数据：

1. **store.queryNodes('Person', { teamId })** — 按节点类型名查询。
   当前使用的类型名来自旧SOG枚举（Person, Financial, Tool 等）。
   14个哨兵使用的类型名（Goal, Product, Capability 等）不在旧SOG枚举中。

2. **traversal.traverse([teamId], ['DEPLOYS', 'FUNDS'])** — 按边类型名遍历。
   当前使用的边名是混合的：DEPLOYS, FUNDS, SIGNAL_TRANSMITS 等是新JSON的边名，
   但旧SOG枚举中没有这些边。

这导致一个矛盾：哨兵的 queryNodes 用旧类型名，traverse 用新边名。
两套命名体系在同一个 aggregate 中共存。

---

## 五、哨兵与 JTBD 研究的关系

JTBD 研究发现中层管理者需要10个新哨兵（O10-O15, E6, F5, C1, C2）。
这些哨兵填补了"导航型"的关键缺口：

| JTBD新增 | 产品角色 | 填补的缺口 |
|----------|---------|-----------|
| O10 客户盈利能力 | 导航型 | ALLOCATE(Customer) — 按利润分配客户资源 |
| O11 产能调度优化 | 导航型 | ALLOCATE(Operation) — 产能利用率+排程 |
| O12 供应商绩效归因 | 诊断型 | DIAGNOSE(Product/Supplier) — 质量可追溯 |
| O13 客户流失归因 | 诊断型 | DIAGNOSE(Customer) — Shapley分解流失原因 |
| O14 排期策略模拟 | 导航型 | ALLOCATE(Customer/Operation) — 排期反事实模拟 |
| O15 履约质量 | 诊断型 | DIAGNOSE(Customer/Product) — 履约绩效 |
| E6 客户需求结构 | 诊断型 | DIAGNOSE(Market) — 需求结构变化 |
| F5 报价协同 | 导航型 | EVALUATE(Customer) — 全成本+竞品报价 |
| C1 多渠道ROI对比 | 导航型 | ALLOCATE(Channel) — 渠道ROI归因 |
| C2 客户分级冲突 | 导航型 | DESIGN(Product) — 客户价值分级 |

**仍然缺失的导航能力**：执行跟踪（"诊断建议的行动，做了吗？"）、
前提假设监控（"诊断时的假设被打破了吗？"）。这两者在任何现有或规划中的哨兵
都没有覆盖。

---

## 六、结论

**哨兵体系当前状态：有一套主力运行系统（extensions/sentinels/ 文件驱动），
但质量参差不齐，导航型严重不足。**

- 50个有效哨兵中，4个P0哨兵因compute缺失而无法正常工作
- 诊断型（26个）是主力，导航型（3个）是短板
- 三重注册入口需要统一为文件驱动模式
- JTBD新增10个哨兵填补了大部分导航缺口，但"执行跟踪"和"假设监控"仍为空

---

## 七、学术基础与推导链

> 哨兵体系的理论根基来自 7 个学科的系统文献侦察。
> 本文档仅提供索引和关键映射：每篇文献的理论如何转化为可计算的哨兵指标。
> 完整文献综述（含公式推导、实证证据、适用边界）见研究文档。

### 7.1 理论来源学科分布

| 学科 | 文献数 | 对应哨兵 | 研究文档 |
|------|--------|---------|---------|
| 产业组织（IO） | 6 | market-lifecycle, competitive-dynamics, structural-change | 见本体层竞争差异化研究 |
| 战略管理 | 4 | competitive-moat, niche-squeeze, seven-powers | 见本体层竞争差异化研究 |
| 演化经济学 | 3 | adaptation-velocity, environment-rent-dependency, resilience | 见本体层竞争差异化研究第一部分 |
| 组织经济学 | 3 | internal-transaction-cost, delegation-surface, info-distortion | 见管理经济学研究（路线C理论融合矩阵） |
| 行为经济学 | 2 | cognitive-friction, incentive-alignment | 见管理经济学研究（委托-代理/信息不对称） |
| 创新管理 | 3 | explore-exploit-balance, opportunity-window, make-or-buy | 见本体层竞争差异化研究（动态能力） |
| 金融经济学 | 2 | capital-structure, financing-constraint | 见本体层竞争差异化研究第二部分 |

### 7.2 14 篇核心文献及 Synova 推导链

以下文献来自产业生命周期与结构机会窗口文献调查（industry-lifecycle-survey-20260624.md，14篇论文体系）。完整推导见：[本体层深度研究：竞争差异化](docs/synova/research/本体层深度研究-竞争差异化-20260708.md) 和 [管理经济学融入研究](docs/synova/research/管理经济学融入研究-20260708/SYNOVA-RESEARCH-管理经济学融入Synova体系-最终方案-20260708.html)。

| # | 文献 | 核心发现 | Synova 推导链 | 对应哨兵 |
|---|------|---------|-------------|---------|
| 1 | Gort & Klepper (1982) — 产业生命周期 | 五阶段生命周期（进入→增长→洗牌→成熟→衰退） | 竞争者数量轨迹 → 洗牌风险指数 | market-lifecycle, competitive-dynamics |
| 2 | Klepper (1996) — 进入、退出与创新 | 过程R&D积累→大企业成本优势→洗牌时机可预测 | R&D组成比（产品vs过程专利）+ 企业规模分布 → 洗牌预警 | competitive-dynamics |
| 3 | Perez (2002) — 技术革命与金融资本 | 50-60年大爆发周期（冲击→狂热→转折→协同→成熟） | 企业所在范式阶段定位 → 结构性机会窗口判断 | structural-change, opportunity-window |
| 4 | Tushman & Anderson (1986) — 技术不连续性 | 能力增强型 vs 能力破坏型技术变革 | 专利引用模式 → 变革类型 → 应对策略建议 | structural-change |
| 5 | Christensen (1997) — 创新者困境 | 破坏性创新从低端/新市场开始，沿轨迹追上主流 | 低端替代品+轨迹交叉点 → 破坏风险预警 | competitive-moat-perceptual |
| 6 | Solow (1956) — 经济增长理论 | 技术进步是长期增长的唯一源泉 | 全要素生产率（TFP）分解 → 资本深化vs创新问题 | growth-quality |
| 7 | Solow (1957) — 技术变化与生产函数 | 87.5%的增长来自技术进步（索洛残差） | 索洛残差分解 → 投资问题 vs 结构性问题 | growth-quality |
| 8 | Abernathy & Utterback (1978) — 产业创新模式 | 产品创新→主导设计→过程创新的三阶段模式 | 主导设计出现阶段 → 产业演变定位 | market-lifecycle |
| 9 | Henderson & Clark (1990) — 架构创新 | 架构性创新（组件关系重组）不改变组件但颠覆系统 | 架构变更检测 → 跨界风险预警 | structural-change |
| 10 | Dosi (1982) — 技术范式与技术轨迹 | 技术范式定义"做什么和怎么做"的边界 | 范式切换检测 → 能力过时预警 | structural-change |
| 11 | Freeman & Perez (1988) — 结构调整危机 | 制度框架与技术范式匹配/失配 → 增长/危机 | 制度-技术匹配度 → 结构调整建议 | environment-rent-dependency |
| 12 | Agarwal & Gort (1996) — 市场演化 | 市场演化的进入/退出/生存模式 | 市场密度 → 竞争演化阶段 | competitive-dynamics |
| 13 | TAM估计方法论（综合） | 市场规模估算的三种方法（自上而下/自下而上/类比） | TAM/SAM/SOM → 增长天花板判断 | niche-breadth |
| 14 | Jovanovic (1982) — 选择与产业演化 | 企业通过学习效率高低实现"选择" | 效率分布 → 竞争压力指数 | internal-transaction-cost |

### 7.3 NCI 与哨兵的关联

哨兵体系与 NCI（非共识检测）共享理论根——NCI 检测"哨兵漏报的信号"，二者在以下文献中被共同支撑：

- **沉默五因理论**（Morrison & Milliken 2000）：为 NCI 信号来源分类提供基础，同时解释哨兵为何漏检某些组织沉默信号
- **STM 框架**（Klein & Sorra 1996）：为创新采纳预测提供组织氛围测量指标
- **ODC 模型**（Pettigrew 1985, 1987）：为战略变化情境分析提供流程框架

详见：[NCI 非共识检测架构](docs/synova/architecture/SYNOVA-ARCH-NCI非共识检测-20260707.md)

### 7.4 理论融合矩阵

行为经济学（Kahneman & Tversky 1979）、交易成本经济学（Williamson 1975）和信息理论（Arrow 1974）在管理经济学研究中被融合理论化，形成了五大融合路线：

| 融合路线 | 理论输入 | 哨兵输出 |
|---------|---------|---------|
| 路线A | 交易成本 + 行为偏差 | internal-transaction-cost, info-distortion |
| 路线B | 委托-代理 + 信息不对称 | incentive-alignment, delegation-surface |
| 路线C | 代理理论 + 成本经济学 | resource-misallocation |
| 路线D | 博弈论 + 产业组织 | competitive-dynamics, competitive-moat |
| 路线E | 演化经济学 + 制度理论 | adaptation-velocity |

详见：[管理经济学融入 Synova 体系](docs/synova/research/管理经济学融入研究-20260708/SYNOVA-RESEARCH-管理经济学融入Synova体系-最终方案-20260708.html)

---

> **文档位置**：docs/synova/architecture/SYNOVA-ARCH-哨兵体系-20260707.md
> **数据来源**：extensions/sentinels/ 下61个目录的全部 manifest.json 和 aggregate.ts
> **下一步**：计算模块架构文档

