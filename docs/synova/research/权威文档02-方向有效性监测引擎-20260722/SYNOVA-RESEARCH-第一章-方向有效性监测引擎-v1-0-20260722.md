<!-- status: 定稿 | version: v1.0 | date: 2026-07-22 | author: Synova 研究组 -->
<!-- 上级文档: SYNOVA-RESEARCH-研究方案-v3-0-20260722.md §六第一章 -->
<!-- 依赖文档: 01(42边) / 03(哨兵+compute) / 13(Goal) / 15(循环溢出) / 07(时间尺度-当前文件夹内容为空) -->

# 第一章：方向有效性监测引擎

> 权威文档02 -- 方向有效性监测引擎 | 2026-07-22 | v1.0
> 定位：持续回答"企业当前的方向还成立吗"。不诊断根因，只判断方向是否仍在预期轨迹上。
> 与01(因果骨架)和03(诊断引擎)的关系：01提供42边参数，02方向失效时触发03诊断并携带已识别的偏离范围。

---

## 一、引擎总览

方向有效性监测引擎是一个持续运行的L2编排层组件，部署在 `src/agent/direction-monitor/`（待创建），由CronScheduler按诊断周期频率调度。引擎消费01的42条因果边参数、13的Goal集合、15的循环溢出数据，输出三个状态之一（方向有效/风险/失效）。方向失效时触发03诊断流程并携带偏离范围约束。

### 1.1 三个输出状态

| 状态 | 含义 | 对03诊断的触发 | 对15循环的影响 |
|------|------|---------------|-------------|
| `DIRECTION_VALID` | 运行数据在预期轨迹内 | 不触发 | 继续监测 |
| `DIRECTION_AT_RISK` | 偏离积累中，或行业基准恶化 | 不触发全量诊断，生成预警信号 | 在溢出仪表盘标注风险标签 |
| `DIRECTION_FAILED` | 偏离持续超过阈值 | 触发03诊断流程，携带偏离范围约束 | 子循环溢出持续为负时联动触发NCI |

### 1.2 引擎运行频率

诊断周期引用文档03的定义值。文档03第二章compute规范中，多个哨兵的严重度阈值均使用"连续3周期"作为激活条件（参见 `SYNOVA-RESEARCH-第二章-compute规范-20260710.html`：sentinel-breakeven/sentinel-operating-leverage/sentinel-margin-trend/sentinel-price-elasticity 等哨兵均以"连续N周期"为判定窗口）。方向监测引擎复用该诊断周期，在每次 Sentinel 检查完成后运行：

```
Sentinel.check() -> SignalAggregator -> 方向监测引擎
        | CronScheduler 调度（周期引用文档03 SentinelRunner.runAll 频率）
```

> **引用说明**：文档07 `权威文档07-Agent工程能力对标-20260710` 文件夹当前内容为空，不存在可引用的时间尺度定义。方向监测引擎以文档03的诊断周期为唯一基准。若未来文档07补充时间尺度内容且与文档03存在差异，需更新此节。

---

## 二、方向锚定

方向锚定是方向监测的"锁定"——没有锁定当前方向，就无从判断偏离。方向锚定包括两部分：活跃Goal集合（已注册的正式方向）和创始人关注信号（弱信号、尚未注册为Goal的方向前兆）。

### 2.1 活跃Goal集合数据结构

消费文档13的Goal工程规范（`SYNOVA-RESEARCH-第一章-Goal工程规范-v1-0-20260714.md` §一，28字段Goal接口）。方向监测引擎从文档13获取的数据需求清单如下：

```typescript
/**
 * DirectionAnchor — 方向锚定快照。
 * 在每次诊断周期结束时生成，用于方向有效性对比。
 * 消费: 文档13 Goal接口 (src/growth/goal.ts -> Goal)
 * 消费: 文档15 子循环溢出数据 (src/cycles/)
 * 实现位置（标注）: 文档13需实现 DirectionAnchorRepository
 */
interface DirectionAnchor {
  id: string;
  capturedAt: string;
  activeGoals: ActiveGoalRecord[];
  resourceSnapshot: ResourceSnapshot;
  directionChanges: DirectionChange[];
}

/**
 * ActiveGoalRecord — 单个活跃Goal的方向锚定快照。
 * 字段来源标注: 文档13 Goal接口 §一
 */
interface ActiveGoalRecord {
  goalId: string;
  type: 'efficiency' | 'growth' | 'structural' | 'defensive';
  department: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  lifecycle: string;
  createdAt: string;
  targetDate: string;
  approvedAt: string | null;
  resourceAllocation: GoalResourceAllocation;
  linkedCycles: LinkedCycleRef[];
}

/**
 * GoalResourceAllocation — Goal级资源配置（本节2.3定义数据颗粒度）。
 * 实现标注: 需在文档13 Goal接口中新增此字段。
 */
interface GoalResourceAllocation {
  budgetRatio: number;
  budgetAmount: number | null;
  monthlyPersonMonths: number;
  headcount: number;
  source: 'fms' | 'hrms' | 'ga_manual' | 'estimated';
  gaAnnotatedAt: string | null;
  degraded: boolean;
  degradationReason: string | null;
}

/**
 * LinkedCycleRef — 关联的子循环引用。
 * 消费: 文档15 第一章循环配置规范 §二（三条正交性检验） + §三（JSON Schema）
 */
interface LinkedCycleRef {
  cycleId: string;
  cycleName: string;
  edgeIds: string[];
}

/**
 * ResourceSnapshot — 企业级资源配置快照。
 * 消费: 文档13 Goal集合聚合 + 文档15 各子循环溢出仪表盘 §二
 */
interface ResourceSnapshot {
  totalBudget: number;
  budgetRatios: Record<string, number>;
  totalHeadcount: number;
  personMonths: Record<string, number>;
  source: string;
  degraded: boolean;
}

/**
 * DirectionChange — 方向变更记录。
 * 消费: 文档13 GoalLifecycle状态机 §二（17条状态转换）
 */
interface DirectionChange {
  changedAt: string;
  type: 'goal_approved' | 'goal_completed' | 'goal_abandoned' | 'direction_pivot' | 'ga_override';
  goalId: string | null;
  fromAnchorId: string;
  description: string;
  isDirectionSwitch: boolean;
  transitionPeriodStarts: string | null;
}
```

#### 数据需求清单总结（由文档13实现）

| 序号 | 字段组 | 来源 | 字段级需求 | 文档13实现位置 |
|------|--------|------|-----------|-------------|
| D1 | 活跃Goal列表 | 文档13 Goal接口 | `Goal.id`, `Goal.type`, `Goal.department`, `Goal.title`, `Goal.priority`, `Goal.lifecycle`, `Goal.timeline.proposedAt`, `Goal.timeline.targetDate`, `Goal.timeline.approvedAt` | Goal接口 §一（已存在） |
| D2 | Goal资源配置 | **新增** | `GoalResourceAllocation.budgetRatio`, `.budgetAmount`, `.monthlyPersonMonths`, `.headcount`, `.source`, `.gaAnnotatedAt`, `.degraded`, `.degradationReason` | **需在文档13 Goal接口中新增** |
| D3 | 资源配置快照 | **新增** | `ResourceSnapshot.totalBudget`, `.budgetRatios`, `.totalHeadcount`, `.personMonths`, `.source`, `.degraded` | **需在文档13中新增独立接口** |
| D4 | 方向变更历史 | **新增** | `DirectionChange.changedAt`, `.type`, `.goalId`, `.fromAnchorId`, `.description`, `.isDirectionSwitch`, `.transitionPeriodStarts` | **需在文档13中新增独立存储** |

> **实现标注**：D1字段已在文档13 Goal接口中定义。D2/D3/D4需在文档13中新增实现——在Goal接口中追加 `resourceAllocation` 字段、新增 `DirectionAnchor` 存储与查询接口。

### 2.2 创始人关注信号数据结构

创始人关注信号是**不局限于已注册Goal**的弱信号。这些信号来自创始人对话、会议纪要、GA访谈等非结构化源，尚未形成正式Goal，但可能是方向即将变化的早期指标。

信号采集使用SENSING实体模型——消费E-01 ACTIVE_SCANNING 和 E-02 PASSIVE_SIGNAL 两条感知边的输出（参见文档01 `SYNOVA-RESEARCH-第二章-42条因果边权威定义-v1-0-20260714.md` E-01章节：transfer_function = `scan_frequency * scan_breadth * signal_sensitivity` 和 E-02章节：被动信号收集效率）。

```typescript
/**
 * FounderSignal — 创始人关注信号。
 * 消费: E-01 ACTIVE_SCANNING (scan_frequency, scan_breadth)
 * 消费: E-02 PASSIVE_SIGNAL (signal_collection_efficiency)
 * 来源: GA访谈记录、会议纪要、对话转录
 * 实现标注: 需在 src/sentinel/sensing/ 中新增 SENSING 实体采集器
 */
interface FounderSignal {
  id: string;
  source: 'conversation' | 'meeting_minutes' | 'ga_interview' | 'email' | 'board_memo';
  sourceRef: string;
  capturedAt: string;
  summary: string;
  directionThemes: DirectionTheme[];
  signalStrength: number;
  convertedToGoal: string | null;
  inputMethod: 'auto' | 'ga_manual';
  relatedEdges: string[];
}

interface DirectionTheme {
  theme: string;
  confidence: number;
  mentionCount: number;
  firstMentionedAt: string;
  lastMentionedAt: string;
}
```

#### 信号强度计算公式

```
signalStrength = w1 * mentionCount/maxMentions + w2 * explicitness + w3 * urgency

w1 = 0.3  // 讨论频次权重
w2 = 0.4  // 明确度权重（GA标注: 0="老板随口一提", 1="正式讨论过")
w3 = 0.3  // 紧迫性权重（GA标注: 0="无时间压力", 1="有明确deadline")
```

> **实现标注**：FounderSignal采集器需在 `src/sentinel/sensing/` 下新建。SENSING实体采集器消费E-01/E-02两条感知边的参数（`scan_frequency`、`scan_breadth`、`signal_collection_efficiency`），不从这两条边采集时降级为GA手动输入模式。

### 2.3 资源数据颗粒度

资源数据是方向锚定的定量基础。方向监测引擎需要两类资源数据：

| 资源维度 | 数据项 | 颗粒度 | 获取方式 | 数据源 |
|---------|--------|--------|---------|--------|
| 财务资源 | 预算分配（万元/占比） | Goal级 | 自动接入FMS/ERP API | `CAPITAL_POOL.allocation_ratio` (E-13) |
| 人力资源 | 工时投入（人·月） | Goal级 | 自动接入HRMS API 或 GA手动标注 | `HUMAN_CAPITAL.deployment_map` (E-15) |

**降级方案**：当企业无法提供FMS/HRMS数据接入时，GA通过中层工作台手动标注。降级时：

- `GoalResourceAllocation.source = 'ga_manual'`
- `GoalResourceAllocation.degraded = true`
- `GoalResourceAllocation.degradationReason` 填写原因（如"企业无FMS系统"或"HR系统未开放API"）
- 监测引擎内部：对GA手动标注数据的偏离阈值从1.5sigma放宽至2.0sigma（补偿人工标注误差）

> **实现标注**：降级方案需文档13在Goal接口中新增 `GoalResourceAllocation` 字段，并在中层工作台（文档13第四章 `SYNOVA-RESEARCH-第四章-中层工作台数据模型-v1-0-20260714.md`）中提供资源配置标注入口。

---

## 三、趋势偏离检测

趋势偏离检测是方向监测的核心计算。分为绝对偏离（企业自身轨迹）和相对偏离（行业基准对比），两者分别独立判定，任一触发即为"方向存在风险"。

### 3.1 绝对偏离检测算法

#### 3.1.1 P0级边基线维护

消费文档01的42条因果边中标记为 `硬度：hard` 的10条P0级边。这10条边的参数是方向监测的核心指标：

| P0边 | 名称 | 关键参数 | 隶属因果链 |
|------|------|---------|-----------|
| E-05 | CAPITAL_ACQUISITION | debt_equity_ratio, cash_runway_months | CC-FINANCE-01 |
| E-06 | FINANCING_MIX | equity_ratio | CC-FINANCE-01 |
| E-09 | DATA_ACQUISITION | data_completeness, data_timeliness, data_accuracy | CC-DATA-01 |
| E-14 | DECISION_POWER | power_concentration_index, decision_speed | CC-ORG-01 |
| E-24 | INNOVATION | innovation_output_rate, innovation_roi | CC-INNOVATE-01 |
| E-30 | PRICING | price_elasticity, unit_margin | CC-MARKET-01 |
| E-31 | CLIENT_RETENTION | switching_cost_index, churn_rate | CC-MARKET-01 |
| E-33 | MARKET_COMPETITION | market_share, competitive_pressure_index | CC-MARKET-02 |
| E-37 | PROFIT_REINVEST | reinvestment_ratio, marginal_roic | CC-FINANCE-02 |
| E-38 | TALENT_RETENTION | voluntary_turnover, key_person_risk | CC-ORG-02 |

> **引用来源**：P0边列表来自文档01 `SYNOVA-RESEARCH-第二章-42条因果边权威定义-v1-0-20260714.md`，硬度=hard 的10条边，行号174/211/320/468/809/1052/1088/1159/1300/1336。

#### 3.1.2 移动平均基线

每条P0边的每个可量化参数维护一个12个月移动平均基线：

```
对于参数 p 在月份 t：
  baseline_t(p) = (value_{t-11} + value_{t-10} + ... + value_t) / 12
  sigma_t(p)    = stddev(value_{t-11}, ..., value_t)
```

基线初始化期（MVS简化）：
- 数据不足12个月时，使用可用数据的完整窗口（最少3个月）建立初始基线
- 数据不足3个月时，延迟基线建立，标注 `baselineStatus: 'accumulating'`

#### 3.1.3 偏离标记规则

```
IF value_t(p) < baseline_t(p) - 1.5 * sigma_t(p)  THEN
  mark_deviated(p, t, 'below_baseline')
ELSE IF value_t(p) > baseline_t(p) + 1.5 * sigma_t(p)  THEN
  mark_deviated(p, t, 'above_baseline')  // 正偏离不触发预警但记录日志
```

连续3个月标记为"偏离"→参数进入 `SUSTAINED_DEVIATION` 状态。

#### 3.1.4 因果链聚合

方向失效不是单参数问题——一个参数偏离可能是局部波动。但当**同一因果链**上3个以上参数同时偏离时，说明链本身在断裂。

聚合步骤：
1. 收集所有处于 `SUSTAINED_DEVIATION` 状态的参数
2. 按因果链分组（引用文档01中各边的"关联的因果链"字段）
3. 若某因果链上偏离参数数 >= 3 → 触发 `CHAIN_DEVIATION_ALERT`

```pseudocode
function aggregateChainDeviations(deviations: ParamDeviation[]): ChainAlert[] {
  const byChain = groupBy(deviations, d => d.causalChain);
  const alerts: ChainAlert[] = [];

  for (const [chain, params] of byChain) {
    if (params.length >= 3) {
      alerts.push({
        chainId: chain,
        deviatedParams: params.map(p => ({ edgeId: p.edgeId, param: p.paramName })),
        maxDeviationSigma: max(params.map(p => p.sigmaDeviation)),
        severity: params.length >= 5 ? 'CRITICAL' : 'WARNING',
        timestamp: now(),
      });
    }
  }
  return alerts;
}
```

### 3.2 相对偏离检测

相对偏离检测回答"即使企业在增长，相比行业是否在落后"。

#### 3.2.1 行业基准恶化判定

消费ExternalBaseline数据（来自文档01 E-36 COMPETITIVE_POSITION + E-33 MARKET_COMPETITION，对应哨兵 `competitive-position` 和 `competitive-moat`）：

```
触发条件（满足任一）：
1. industryGrowthRate < 0  AND  enterpriseGrowthRate >= 0
   -> "行业萎缩但企业仍在成长" -> 预警: INDUSTRY_HEADWIND
2. leaderGrowthRate - enterpriseGrowthRate > 2.0 * sigma_leader
   -> "行业领先者增速远超企业" -> 预警: COMPETITIVE_LAGGARD
3. substitutionIndex > 0.7
   -> "替代性技术/模式正快速侵蚀行业" -> 预警: DISRUPTION_RISK
```

其中 `substitutionIndex` 是复合指标，来自：
- E-33 MARKET_COMPETITION 的 `disruption_velocity` 参数
- E-36 COMPETITIVE_POSITION 的 `competitive_pressure_index` 参数
- 哨兵 `competitive-position` 的 HHI 集中度检查

```
substitutionIndex = w1 * disruption_velocity_norm + w2 * competitive_pressure_norm
                    + w3 * (1 - HHI_norm)
其中 w1=0.4, w2=0.35, w3=0.25
```

#### 3.2.2 数据就绪状态与降级

| 数据可用性 | 行为 | 标注 |
|-----------|------|------|
| ExternalBaseline数据充足（>=12月） | 完整相对偏离检测 | `relativeStatus: 'active'` |
| ExternalBaseline数据不足（3-11月） | 仅报告趋势，不触发预警 | `relativeStatus: 'accumulating'` |
| ExternalBaseline数据不可用（<3月） | 相对偏离检测关闭 | `relativeStatus: 'insufficient'` |

当 `relativeStatus` 为 `'accumulating'` 或 `'insufficient'` 时，方向有效性判定退化为仅依赖绝对偏离检测。

> **MVS简化**（来自研究方案 §五）：MVS阶段不启用相对偏离检测（需ExternalBaseline数据积累），仅使用绝对偏离检测的P0边12个月基线。

---

## 四、方向失效评估

### 4.1 失效判定时序

```
偏离标记 -> 因果链聚合预警 -> 持续2个诊断周期 -> 方向失效
                                                  |
                                         触发03诊断流程
```

诊断周期引用文档03的定义值。文档03第二章compute规范中，哨兵严重度阈值（sentinel-breakeven、sentinel-operating-leverage等）均以"周期"为单位（"连续3周期"、"月环比"），方向监测引擎复用该周期。

> **引用说明**：文档03 `SYNOVA-RESEARCH-第二章-compute规范-20260710.html` 定义了严重度阈值的周期窗口。例如 `sentinel-operating-leverage` 严重度阈值行："warning: DOL变化>30%(月环比) 或 毛利率连续3月下降; critical: DOL>3且收入下降>5%"。方向监测引擎的"诊断周期"对应此月度检查窗口。

**判定规则**：
1. 因果链聚合预警（§3.1.4 `CHAIN_DEVIATION_ALERT`）在**2个连续诊断周期**中保持激活状态
2. 第一个周期触发预警 -> 引擎输出 `DIRECTION_AT_RISK`，不触发03诊断
3. 第二个周期预警仍在 -> 引擎输出 `DIRECTION_FAILED`，触发03诊断并携带偏离范围约束

> **约束携带**：触发诊断时传递 `{ deviatedChainIds, deviatedEdgeIds, maxSigma, deviationStartCycle }` 给03诊断引擎，限制诊断范围为偏离链及其相邻因果边（非全量42边遍历）。

### 4.2 断裂点→失效模式映射表

来自研究方案 §三功能三。四个感知断裂点的触发状态映射为方向失效或执行问题：

| 断裂点 | 触发条件 | 默认映射 | 判断依据 | 文档来源 |
|--------|---------|---------|---------|---------|
| **沉默检测** | 关键方向主题90天内无讨论记录 | `DIRECTION_FAILED` | 信号被压制->组织对方向的信念可能在动摇 | 文档03哨兵 `sentinel-org-trust`；文档01 E-21 ORG_TRUST |
| **否认检测** | 外因归因占比 > 80% 且无行业数据支撑 | `DIRECTION_FAILED` | 拒绝负面信号->方向本身可能已不可持续 | 文档03哨兵 `sentinel-agency-cost`；文档01 E-17 INCENTIVE_ALIGNMENT |
| **知行差距检测** | Goal停顿（lifecycle='deviated'且超30天）或Goal完成但指标未改善 | `EXECUTION_ISSUE` | 方向可能对，但执行遇到障碍 | 文档13 Goal生命周期 §二；哨兵 `sentinel-goal-delay` |
| **验证断裂检测** | >=3个Goal lifecycle='completed'但关联指标未达 successCriteria | `DIRECTION_FAILED` | 做了但没结果->方向本身已不再成立 | 文档13 Goal.successCriteria §一；文档15子循环溢出 |
| **无法判断** | 断裂点信号矛盾 | `EXECUTION_ISSUE` | 先检查执行再判断方向，避免过早启动高成本NCI | — |

当"沉默检测"和"否认检测"同时激活 + 任一"知行差距"或"验证断裂"也激活时，方向失效信号升级为 `DIRECTION_FAILED_SEVERE`，触发03全量诊断（不受偏离范围约束限制），同时通知GA评估是否启动NCI子模块。

### 4.3 方向切换过渡期

方向切换是企业主动变更方向（而非被动偏离）的场景——例如企业宣布新战略、放弃现有Goal集合、正式注册新方向。过渡期内监测规则放宽以允许新方向建立基线。

```
过渡期参数:
  DEFAULT_TRANSITION_DAYS = 90  // 默认90天
  DEVIATION_SIGMA_RELAXED  = 2.5  // 偏离阈值从1.5sigma放宽至2.5sigma
  BLOCK_FAILURE_SIGNAL     = true // 过渡期内不触发DIRECTION_FAILED
```

过渡期行为：
- 每年最多触发2次过渡期。第3次触发时->警告GA"方向切换频率异常"并自动触发03诊断（全量42边）
- 过渡期开始时->重置基线计算窗口，从0开始积累
- 过渡期结束时->建立新方向基线，sigma阈值恢复至1.5sigma
- 过渡期内->`DirectionChange.isDirectionSwitch = true`, `transitionPeriodStarts` 记录开始时间
- 过渡期内->偏离阈值放宽至2.5sigma，不触发方向失效
- 过渡期内->若任何P0级参数偏离超过3.5sigma（极端偏离），仍触发 `DIRECTION_AT_RISK` 但不触发失效

```pseudocode
function evaluateTransitionRelaxation(
  deviation: number,
  sigma: number,
  transitionStart: Date | null,
  params: ParamValue[]
): { isRelaxed: boolean; effectiveThreshold: number; isExtreme: boolean } {

  const inTransition = transitionStart !== null
    && (Date.now() - transitionStart.getTime()) < DEFAULT_TRANSITION_DAYS * 86400000;

  if (!inTransition) {
    return { isRelaxed: false, effectiveThreshold: 1.5, isExtreme: false };
  }

  const sigmaDev = Math.abs(deviation) / sigma;
  return {
    isRelaxed: true,
    effectiveThreshold: 2.5,
    isExtreme: sigmaDev > 3.5,
  };
}
```

> **过渡期结束验证**：结束时执行一次"2.5sigma->1.5sigma收缩检查"：将过渡期积累数据用1.5sigma标准回溯检验。若回溯检验仍触发偏离，方向切换可能失败->触发GA复审。

---

## 五、方向失效→03诊断触发的接口契约

方向监测引擎与03诊断引擎之间的接口定义（完整接口规范见第四章）：

```typescript
/**
 * DirectionFailureTrigger — 方向失效时传递给03诊断引擎的触发载荷。
 * 完整接口定义: 权威文档02-第四章-02与03的诊断流程接口
 */
interface DirectionFailureTrigger {
  triggeredAt: string;
  failureMode: 'DIRECTION_FAILED' | 'DIRECTION_FAILED_SEVERE';
  activeRupturePoints: ('silence' | 'denial' | 'knowing_doing_gap' | 'verification_break')[];
  deviatedChainIds: string[];
  deviatedEdgeIds: string[];
  maxSigma: number;
  deviationStartCycle: number;
  relatedSentinelFindingIds: string[];
  anchorSnapshotIds: string[];
  inTransitionPeriod: boolean;
}
```

> **第5章完整消费清单**：方向监测引擎消费的文档接口汇总见第五章"与现有体系对齐"。

---

## 六、MVS简化范围标注

根据研究方案 §五，以下功能纳入MVS（Minimum Viable System）阶段，其余标记为非MVS：

| 功能 | MVS | 说明 |
|------|-----|------|
| 方向锚定 — 活跃Goal集合 | MVS | 消费文档13已有Goal接口 |
| 方向锚定 — FounderSignal采集 | 非MVS | 需SENSING实体采集器（待开发） |
| 方向锚定 — 资源配置数据 | MVS | 使用GA手动标注模式 |
| 绝对偏离检测 — P0边12月基线 | MVS | 使用3个月初始化基线（简化） |
| 绝对偏离检测 — 因果链聚合 | MVS | 依赖P0边基线 |
| 相对偏离检测 | 非MVS | 需ExternalBaseline数据积累 |
| 方向失效评估 — 2周期判定 | MVS | 依赖绝对偏离检测 |
| 方向失效评估 — 四个感知断裂点 | 非MVS | 需中层行为数据积累（文档02第二章实现） |
| 方向切换过渡期 | MVS | 基础90天+2.5sigma放宽 |
| 触发03诊断（带偏离范围约束） | MVS | 依赖方向失效判定 |

**MVS数据简化为**："Goal集合 + 10条P0边参数基线（3个月初始化）"。不使用相对偏离检测和四个感知断裂点。NCI不纳入MVS——是MVS后第一个扩展目标。

---

> **下一章**：第二章 — 四个感知断裂点检测（沉默/否认/知行差距/验证断裂），消费文档03/07/13/15数据。
> **交叉引用**：第三章 — NCI子模块（备选方向探索）；第四章 — 02与03的诊断流程接口；第五章 — 与现有体系对齐。
