# 第三章：NCI子模块 — 备选方向探索

> 权威文档02 — 方向有效性监测引擎 | v1.0 | 2026-07-22
> 依赖: 第二章 四个感知断裂点检测（方向失效判定结果）
> 下游: 第四章 02与03的诊断流程接口（NCI候选方向→Proposal→三选一）
> NCI已有研究引用: `docs/synova/research/nci/`

---

## 零、NCI子模块在02中的位置

NCI（Non-Consensus Index，非共识指数）子模块是02方向有效性监测引擎的备用能力——默认不运行，仅在方向失效确认且企业明确需要重新选方向时才激活。

**NCI不是独立的系统。** 它是02引擎中的子模块，接收02的方向失效判定，产出候选方向列表，通过04接口输出给增长导航系统（文档13）的Proposal三选一机制。

### 0.1 NCI已有研究路径

以下NCI研究文档为本章提供理论基础和方法论。本章是对这些研究的工程化整合：

| 研究文档 | 路径 | 本章消费的内容 |
|---------|------|--------------|
| NCI非共识检测白皮书 | `docs/synova/research/nci/SYNOVA-WHITEPAPER-NCI非共识检测白皮书-20260705.html` | 三层公式、两种非共识类型、沉默五因分类器、成本模板 |
| 五路研究汇合报告 | `docs/synova/research/nci/SYNOVA-RESEARCH-NCI五路研究汇合报告-20260705.html` | 对抗性边界条件、消融验证、能力边界声明 |
| STM时机成熟度指数 | `docs/synova/research/nci/STM_INDEX_时机成熟度指数-20260704.html` | STM_Index公式、10项基础设施权重矩阵、AUC=0.87验证 |
| ODC消化能力研究 | `docs/synova/research/nci/RESEARCH-ODC-LastStand-20260704.html` | ODC四维公式、背水一战触发条件、资源约束过滤器 |
| 对抗性验证报告 | `docs/synova/research/nci/NCI-对抗性验证报告-Epsilon-20260704.html` | 6边界案例五维度评分、失效点暴露 |
| 沉默动力学研究 | `docs/synova/research/nci/RESEARCH-Silence-Alpha-20260704.html` | 沉默五因分类器（前置过滤——本章不重复定义，引用第二章沉默检测） |

---

## 一、NCI三层公式的形式化定义

### 1.1 核心公式

NCI是一个连续值（0-100），不是布尔值。回答"这个被低估的方向有多大的非共识潜力？"

```
NCI(direction) = 内部共识强度 × 外部市场逆强度 × 物理结构性优势

三者同时成立时，NCI达到峰值。
企业看多、市场看空、物理支撑——缺一不可。
```

**来源**：`SYNOVA-WHITEPAPER-NCI非共识检测白皮书-20260705.html` §2.1-2.2

### 1.2 第一层：内部共识强度 (Internal Consensus Strength)

企业内部对该方向有高度共识。范围0-1。

```typescript
interface InternalConsensusStrength {
  /** 基于中层行为数据的共识测量 */
  discussionFrequency: number;     // 0-1，该方向在Goal讨论/Proposal/诊断报告中出现的频率（标准化）
  actionCommitment: number;        // 0-1，该方向关联的Goal预算占比 + 人力分配
  internalAlignment: number;       // 0-1，不同部门对该方向的一致性评分（方差倒数）

  /**
   * 计算公式:
   * ICS = 0.4 * discussionFrequency + 0.3 * actionCommitment + 0.3 * internalAlignment
   */

  value: number;                   // 0-1

  /** 强制共识检测（见2.5节） */
  forcedConsensusDetected: boolean;
  adjustedValue?: number;          // 强制共识时使用讨论频率+内部一致性替代
}
```

**数据来源**：权威文档07 §B1.3 中层行为数据（部门工作台讨论记录）、权威文档13 Goal追踪数据（Goal预算分配）。

### 1.3 第二层：外部市场逆强度 (External Market Inverse Strength)

外部市场对该方向高度不看好。范围0-1。

```typescript
interface ExternalMarketInverseStrength {
  /** 行业共识信号 */
  industryConsensusPositive: boolean;  // 行业报告/分析师是否看多此方向
  competitorActivity: number;          // 0-1，竞品在该方向的资源投入强度（正常化）
  publicSentimentScore: number;        // 0-1，公开媒体/投资人对此方向的乐观度

  /**
   * 计算公式:
   * EMIS = 1 - (0.4 * industryConsensusPositive转换为0/1
   *           + 0.3 * competitorActivity
   *           + 0.3 * publicSentimentScore)
   *
   * 即：三项越低，EMIS越高（越不被看好，非共识潜力越大）
   */

  value: number;                   // 0-1
  dataAvailable: boolean;          // 是否启用外部数据源
}
```

**数据来源**：权威文档01 E-03 EXTERNAL_ECHO的 `market_growth_j`、`baseline_growth_j`、`competitor_aggressiveness` 参数。

### 1.4 第三层：物理结构性优势 (Physical Structural Advantage)

底层物理现实确实存在结构性优势。范围0-1。

```typescript
interface PhysicalStructuralAdvantage {
  /** 成本断裂度 */
  costFractureScore: number;       // 0-1，理论最小成本 vs 行业当前成本的比值

  /** 价值网络错配度 */
  valueNetworkMismatchScore: number; // 0-1，旧系统资产在新系统中的价值重定义度

  /**
   * 计算公式:
   * PSA = 0.55 * costFractureScore + 0.45 * valueNetworkMismatchScore
   *
   * 两者取max（非加和——任一成立即为"物理支撑存在"）
   * PSA_final = max(costFractureScore, valueNetworkMismatchScore)
   */

  value: number;                   // 0-1
  derivationType: 'cost_fracture' | 'value_network_mismatch' | 'both' | 'neither';
  firstPrincipleFallback: boolean; // 数据真空时启用第一性原理断层扫描
}
```

**数据来源**：
- 成本断裂度：权威文档01 E-23 EFFICIENCY_RATE、E-34 COST_STRUCTURE。数据不足时使用第一性原理成本模板（`SYNOVA-WHITEPAPER-NCI非共识检测白皮书-20260705.html` §5.2 8大行业理论最小成本公式）
- 价值网络错配度：权威文档01 E-38 ASSET_LOCKS 的 `second_life_ratio` 突变检测

### 1.5 NCI综合计算公式

```typescript
function computeNCI(
  direction: Direction,
  ics: InternalConsensusStrength,
  emis: ExternalMarketInverseStrength,
  psa: PhysicalStructuralAdvantage
): NCIResult {
  // 三层乘积
  const rawNCI = ics.value * emis.value * psa.value * 100;  // 0-100

  // 数据真空降级
  let confidence = 1.0;
  if (!emis.dataAvailable) {
    confidence -= 0.3;
    // 退化为两层计算（见2.4节）
  }
  if (psa.firstPrincipleFallback) {
    confidence -= 0.15;
  }

  // 强制共识降级
  if (ics.forcedConsensusDetected) {
    confidence -= 0.2;
  }

  return {
    directionId: direction.id,
    nciScore: Math.round(rawNCI),
    confidence,
    components: { ics, emis, psa },
    tier: classifyNCI(rawNCI),
  };
}

function classifyNCI(score: number): 'high' | 'medium' | 'low' | 'negligible' {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  if (score >= 10) return 'low';
  return 'negligible';
}
```

**NCI >= 60** 的方向进入候选列表。**NCI >= 30** 的方向保留在远期候选池。**NCI < 10** 的方向不推荐。

### 1.6 两种非共识类型

来源：`SYNOVA-WHITEPAPER-NCI非共识检测白皮书-20260705.html` §5.4

| 类型 | 定义 | 判定标准 | NCI子分数偏向 |
|------|------|---------|-------------|
| **成本断裂型** | 成本函数发生架构级跃迁——不是优化，是重写 | Pettitt突变检测 + 理论最小成本 < 行业当前成本 x 0.3 | PSA.costFractureScore主导 |
| **价值网络错配型** | 旧系统中被忽视/贬值的资产，在新系统中成为核心竞争优势 | ASSET_LOCKS `second_life_ratio` 突变 + AdversarialFrame权重差异 > 50% | PSA.valueNetworkMismatchScore主导 |

---

## 二、STM_Index — 时机成熟度指数

### 2.1 核心命题

"方向是对的"和"现在是对的时候"是两回事。电动车在2005年是对的但太早，在2010年才是对的且时机正好。

来源：`STM_INDEX_时机成熟度指数-20260704.html` §1.1-1.2

### 2.2 核心公式

```typescript
/**
 * STM_Index — 信号时机成熟度指数
 *
 * 100个非共识成功案例回溯验证 AUC=0.87
 * STM_Index > 0.6 的案例成功率 79%，< 0.3 的仅 11%
 *
 * 来源：STM_INDEX_时机成熟度指数-20260704.html §1.2
 */
function computeSTMIndex(
  direction: Direction,
  infrastructureData: InfrastructureData[]
): STMResult {
  // 加权求和: sum(weight_i * readiness_i)
  let weightedSum = 0;
  for (const infra of infrastructureData) {
    const weight = getWeight(direction, infra.id);  // 方向依赖权重
    const readiness = Math.min(
      1.0,
      infra.currentPenetration / infra.criticalThreshold
    );
    weightedSum += weight * readiness;
  }

  // 紧迫度因子
  const recentlyCrossed = countRecentlyCrossed(infrastructureData, 12); // 12个月内
  const urgencyFactor = 1.0 + Math.log(1 + recentlyCrossed);

  const stmScore = weightedSum * urgencyFactor;

  return {
    directionId: direction.id,
    stmScore,
    zone: classifySTM(stmScore),
    recentlyCrossedThresholds: recentlyCrossed,
    urgencyFactor,
  };
}

function classifySTM(score: number): STMZone {
  if (score < 0.3) return 'too_early';     // 太早——大概率成为先烈
  if (score < 0.6) return 'edge';           // 边缘——部分就绪，风险极高
  if (score < 0.8) return 'window_open';    // 窗口开启——接近或刚过临界
  return 'mature';                           // 成熟——警惕：可能是伪非共识
}
```

来源：`STM_INDEX_时机成熟度指数-20260704.html` §1.2 核心公式 + §1.4 方向权重矩阵

### 2.3 10项基础设施权重矩阵

来源：`STM_INDEX_时机成熟度指数-20260704.html` §1.4

| 基础设施 | 移动互联网权重 | AI应用权重 | 新能源权重 | 区块链权重 | 消费品权重 |
|---------|-------------|----------|----------|----------|----------|
| 智能手机渗透率 | **0.35** | 0.05 | 0.00 | 0.10 | 0.20 |
| 宽带覆盖率 | **0.25** | 0.05 | 0.00 | 0.00 | 0.05 |
| 移动支付渗透率 | 0.15 | 0.05 | 0.00 | 0.05 | 0.05 |
| 物流基础设施指数 | 0.05 | 0.00 | 0.10 | 0.00 | **0.30** |
| 电池能量密度 | 0.05 | 0.00 | **0.35** | 0.00 | 0.00 |
| 云计算成本指数 | 0.10 | **0.25** | 0.05 | 0.10 | 0.10 |
| AI芯片算力 | 0.00 | **0.40** | 0.00 | 0.00 | 0.00 |
| 5G覆盖率 | 0.05 | 0.10 | 0.05 | 0.00 | 0.05 |
| IoT传感器成本指数 | 0.00 | 0.05 | 0.15 | 0.00 | 0.15 |
| 区块链基础设施成熟度 | 0.00 | 0.05 | 0.00 | **0.75** | 0.00 |
| 供给端关键物料成本指数 | 0.00 | 0.00 | **0.30** | 0.00 | 0.10 |

**权重确定方法**：相似方向历史案例类比映射 + Perez(2002)技术-经济范式阶段判断。来源：`STM_INDEX_时机成熟度指数-20260704.html` §1.3

### 2.4 紧迫度因子

来源：`STM_INDEX_时机成熟度指数-20260704.html` §1.2

```typescript
function computeUrgencyFactor(
  infrastructureData: InfrastructureData[],
  windowMonths: number = 12
): number {
  // 统计最近12个月内跨越临界点的指标数量
  const recentlyCrossed = infrastructureData.filter(infra => {
    const monthsSinceCross = infra.monthsSinceThresholdCrossed;
    return monthsSinceCross !== null && monthsSinceCross <= windowMonths;
  }).length;

  // urgency_factor = 1.0 + log(1 + n_thresholds_crossed_recently)
  // 跨越得越多，先发窗口正在关闭的紧迫性越高
  return 1.0 + Math.log(1 + recentlyCrossed);
}
```

---

## 三、数据真空运行模式

### 3.1 问题定义

外部市场数据（行业报告、竞品投入、公开媒体情绪）不可用 → 外部市场逆强度（EMIS）无法计算。

**本章策略**（来源：研究方案 v3.0 功能五-边界1）：退化为两层计算 + 显式标注"需要GA补充外部数据"。候选不删除 → 进入远期候选池。

### 3.2 运行逻辑

```typescript
/**
 * 数据真空运行模式
 *
 * 外部数据不可用时，NCI退化为两层计算：
 * NCI_vacuum = 内部共识强度 * 物理结构性优势 * 100
 *
 * 强制标注"需要GA补充外部数据，当前NCI仅为内部信号+物理现实评估"
 */
function computeNCIVacuum(
  direction: Direction,
  ics: InternalConsensusStrength,
  psa: PhysicalStructuralAdvantage
): NCIVacuumResult {
  const rawNCI = ics.value * psa.value * 100;

  return {
    directionId: direction.id,
    nciScore: Math.round(rawNCI),
    confidence: 0.5,  // 两层的置信度上限
    mode: 'vacuum',
    missingData: ['external_market_data'],
    needsGA: '需要GA补充行业报告数据、竞品投入数据、公众媒体情绪数据以启用完整三层NCI计算',
    /** 候选不删除，进入远期候选池 */
    targetPool: 'long_term',
    /** 重新评估条件 */
    reEvaluationCriteria: '外部数据源接入后自动重新评估',
  };
}
```

### 3.3 远期候选池管理

```typescript
interface LongTermCandidatePool {
  /** 池中的候选方向 */
  candidates: Array<{
    directionId: string;
    vacuumNciScore: number;
    addedAt: string;
    /** 重新评估触发条件 */
    reEvaluationTriggers: Array<
      | { type: 'external_data_available'; sourceName: string }
      | { type: 'dormant_signal_activated'; signalId: string }
      | { type: 'ga_manual_mark'; markedAt: string }
    >;
  }>;

  /** 定期清理规则 */
  cleanupPolicy: {
    /** 超期未重新评估的候选：180天后降级为归档 */
    archiveAfterDays: 180;
    /** 归档候选保留策略：不可删除，标注"曾评估但外部数据不可用" */
  };
}
```

---

## 四、休眠信号激活条件

### 4.1 核心定义

一个方向曾经被评估过（NCI < 30），但外部条件发生变化 → 重新进入评估队列。

来源：研究方案 v3.0 功能五-边界2

### 4.2 激活条件

```typescript
/**
 * 休眠信号激活条件
 *
 * 三个触发条件为OR关系——任一满足即激活。
 */
interface DormantSignalActivation {
  /** 激活条件1: E-01~E-04感知边参数2sigma跳变 + 方向一致性 */
  condition1?: {
    /** 触发边 */
    edges: ['E-01', 'E-02', 'E-03', 'E-04'];
    /** 参数跳变幅度 */
    sigmaJump: number;  // >= 2.0
    /** 跳变方向是否与该休眠方向一致 */
    directionConsistent: boolean;
    triggeredAt: string;
  };

  /** 激活条件2: 该方向90天内被重新提及 >= 3次 */
  condition2?: {
    mentionCount: number;  // >= 3
    mentionSources: string[];  // Goal讨论/Proposal/诊断报告/GA访谈
    windowDays: 90;
    triggeredAt: string;
  };

  /** 激活条件3: GA手动标记 */
  condition3?: {
    markedBy: string;  // GA标识
    markedAt: string;
    reason: string;
  };
}
```

### 4.3 激活函数

```typescript
function checkDormantSignalActivation(
  directionId: string,
  edgeParams: EdgeParamSnapshot,
  discussionData: DiscussionData
): DormantSignalActivation | null {
  const result: DormantSignalActivation = {};

  // 条件1: 感知边参数2sigma跳变
  const e01Jump = checkSigmaJump(edgeParams, 'E-01', 2.0);
  const e02Jump = checkSigmaJump(edgeParams, 'E-02', 2.0);
  const e03Jump = checkSigmaJump(edgeParams, 'E-03', 2.0);
  const e04Jump = checkSigmaJump(edgeParams, 'E-04', 2.0);

  if (e01Jump || e02Jump || e03Jump || e04Jump) {
    // 检查跳变方向是否与该休眠方向一致
    const directionConsistent = checkDirectionConsistency(
      directionId,
      [e01Jump, e02Jump, e03Jump, e04Jump].filter(Boolean)
    );
    if (directionConsistent) {
      result.condition1 = {
        edges: ['E-01', 'E-02', 'E-03', 'E-04'].filter(
          (e, i) => [e01Jump, e02Jump, e03Jump, e04Jump][i]
        ) as ('E-01' | 'E-02' | 'E-03' | 'E-04')[],
        sigmaJump: 2.0,
        directionConsistent: true,
        triggeredAt: new Date().toISOString(),
      };
    }
  }

  // 条件2: 90天内重新提及 >= 3次
  const recentMentions = discussionData.getMentions(directionId, 90);
  if (recentMentions.length >= 3) {
    result.condition2 = {
      mentionCount: recentMentions.length,
      mentionSources: recentMentions.map(m => m.source),
      windowDays: 90,
      triggeredAt: new Date().toISOString(),
    };
  }

  // 条件3: GA手动标记（由GA操作入口触发，不在此函数内处理）

  return Object.keys(result).length > 0 ? result : null;
}
```

**数据来源**：
- E-01~E-04感知边参数：权威文档01 第二章 42条因果边定义（E-01 ACTIVE_SCANNING, E-02 PASSIVE_SIGNAL, E-03 EXTERNAL_ECHO, E-04 PERCEPTION_LEARNING）
- 讨论数据：权威文档07 §B1.3 中层行为数据

---

## 五、共识测量反作弊

### 5.1 问题定义

行动承诺（预算分配+人力投入）很高，但讨论频率很低、内部一致性很差 → 这不是真正的共识，是**"强制共识"**——老板拍板了但团队并不认同。

来源：研究方案 v3.0 功能五-边界3

### 5.2 反作弊检测

```typescript
/**
 * 共识测量反作弊 — 强制共识检测
 *
 * 检测条件: actionCommitment > 0.7
 *         && discussionFrequency < 0.3
 *         && internalAlignment < 0.4
 * → 标记为"强制共识"
 * → 使用 discussionFrequency (0.6) + internalAlignment (0.4) 替代原 ICS 公式
 */
function detectForcedConsensus(
  ics: InternalConsensusStrength
): ForcedConsensusResult {
  if (
    ics.actionCommitment > 0.7 &&
    ics.discussionFrequency < 0.3 &&
    ics.internalAlignment < 0.4
  ) {
    // 强制共识：行动承诺虚高
    const adjustedValue =
      0.6 * ics.discussionFrequency + 0.4 * ics.internalAlignment;

    return {
      detected: true,
      reason: 'action_commitment_high_but_discussion_low_and_unaligned',
      originalICS: ics.value,
      adjustedICS: adjustedValue,
      evidence: {
        actionCommitment: ics.actionCommitment,
        discussionFrequency: ics.discussionFrequency,
        internalAlignment: ics.internalAlignment,
      },
    };
  }

  return { detected: false };
}
```

### 5.3 反作弊的影响

强制共识检测触发后：
1. ICS使用 `adjustedICS` 替代原始值（降低约0.3-0.5）
2. NCI整体 `confidence -= 0.2`
3. 该方向在候选列表中标注"强制共识—使用讨论频率+内部一致性替代行动承诺权重"
4. 不删除候选——GA可能确实看到了团队没看到的东西。标注而非移除。

---

## 六、ODC资源约束过滤器

### 6.1 核心定义

一个非共识方向即使方向对、时机对——企业有能力消化吗？

来源：`RESEARCH-ODC-LastStand-20260704.html`

### 6.2 ODC消化能力指数

```typescript
/**
 * ODC (Organizational Digestion Capacity) — 组织消化能力指数
 *
 * 来源：RESEARCH-ODC-LastStand-20260704.html 公式定义
 */
function computeODC(team: TeamSnapshot): ODCResult {
  // E_m: 执行动量 — 从决策到一线执行的平均速度
  const executionMomentum = computeExecutionMomentum(team);

  // S_r: 结构冗余度 — 当前资源池中可自由调配的比例
  const structuralRedundancy = computeStructuralRedundancy(team);

  // talent_density: 关键岗位高绩效员工占比
  const talentDensity = computeTalentDensity(team);

  // data_readiness: 企业数据完整度 x 连通率
  const dataReadiness = computeDataReadiness(team);

  const odc =
    0.35 * executionMomentum +
    0.30 * structuralRedundancy +
    0.20 * talentDensity +
    0.15 * dataReadiness;

  return {
    odc,
    components: {
      executionMomentum,
      structuralRedundancy,
      talentDensity,
      dataReadiness,
    },
  };
}
```

来源：`RESEARCH-ODC-LastStand-20260704.html` §核心公式

**数据来源**：
- E_m（执行动量）：权威文档01 E-28 DEPLOYS `deployment_period` 倒数
- S_r（结构冗余度）：权威文档01 E-38 ASSET_LOCKS `asset_second_life_ratio` 均值
- talent_density：权威文档01 Person节点池 `competency_vector` skill_level > 0.7 占比
- data_readiness：权威文档01 Data节点池 `completeness` x `(1 - silo_status)`

### 6.3 ODC资源约束过滤器

```typescript
/**
 * ODC资源约束过滤器
 *
 * 基于ODC消化能力指数，自动过滤企业当前无法消化的方向。
 * 过滤掉的保留标注"需要补充能力X/Y/Z后才可行"。
 */
function applyODCFilter(
  candidates: NCICandidate[],
  odc: ODCResult
): FilteredCandidates {
  const feasible: NCICandidate[] = [];
  const filtered: FilteredDirection[] = [];

  for (const candidate of candidates) {
    const requiredODC = estimateRequiredODC(candidate.direction);

    if (odc.odc >= requiredODC * 0.7) {
      // 当前能力可消化
      candidate.odcAssessment = {
        currentODC: odc.odc,
        requiredODC,
        gap: Math.max(0, requiredODC - odc.odc),
        feasible: true,
      };
      feasible.push(candidate);
    } else {
      // 能力不足，标注需要补充什么
      const gaps = identifyODCGaps(odc.components, requiredODC);
      filtered.push({
        directionId: candidate.directionId,
        nciScore: candidate.nciScore,
        odcGap: requiredODC - odc.odc,
        requiredCapabilities: gaps.map(g => ({
          capability: g.name,
          currentLevel: g.current,
          requiredLevel: g.required,
          estimatedTimeToBuild: g.estimatedMonths,
        })),
        annotation: `需要补充 ${gaps.map(g => g.name).join('/')} 后才可行`,
        /** 不删除，进入远期候选池 */
        targetPool: 'long_term',
      });
    }
  }

  return { feasible, filtered };
}
```

### 6.4 背水一战场景

来源：`RESEARCH-ODC-LastStand-20260704.html`

当企业面临以下条件时，ODC过滤器放宽：
- 当前方向溢出持续为负超过6个月（文档15溢出数据）
- 现金跑道 < 12个月（文档01 E-05 CAPITAL_ACQUISITION `cash_runway_months`）
- 行业增长率 < -5%（文档01 E-03 EXTERNAL_ECHO）

此时 `requiredODC` 阈值从 0.7 降低到 0.4。标注"背水一战场景——建议接受高于当前消化能力的方向"。

---

## 七、长期验证归因分解

### 7.1 核心定义

一个方向执行后的ROI改善，有多少是物理优势带来的，有多少是外部事件驱动的？

来源：研究方案 v3.0 功能五-边界4

### 7.2 归因分解公式

```typescript
/**
 * 长期验证归因分解
 *
 * 因果反事实推理分解ROI变化：
 * ROI_change = physical_advantage_attribution + external_event_driver + residual_noise
 *
 * 无法分解的标注"归因噪声过大"。
 */
function decomposeROIAttribution(
  directionId: string,
  preROI: number,
  postROI: number,
  periodStart: string,
  periodEnd: string
): AttributionResult {
  const roiChange = postROI - preROI;

  // 物理优势归因：基于PSA的costFractureScore + valueNetworkMismatchScore
  const physicalAttribution = estimatePhysicalAttribution(
    directionId,
    periodStart,
    periodEnd
  );

  // 外部事件驱动：基于E-03 EXTERNAL_ECHO的env_rent变化
  const externalAttribution = estimateExternalAttribution(
    directionId,
    periodStart,
    periodEnd
  );

  // 残差噪声 = 总变化 - 物理归因 - 外部归因
  const residualNoise = roiChange - physicalAttribution - externalAttribution;

  const totalExplained = Math.abs(physicalAttribution) + Math.abs(externalAttribution);

  // 残差占比 > 40% → 标记"归因噪声过大"
  if (Math.abs(residualNoise) / Math.abs(roiChange) > 0.4) {
    return {
      directionId,
      roiChange,
      physicalAttribution,
      externalAttribution,
      residualNoise,
      noiseRatio: Math.abs(residualNoise) / Math.abs(roiChange),
      decomposable: false,
      annotation: '归因噪声过大——物理优势和外部事件合计解释不足60%',
      recommendation: '需要GA补充更多因果变量数据以提高归因精度',
    };
  }

  return {
    directionId,
    roiChange,
    physicalAttribution,
    externalAttribution,
    residualNoise,
    noiseRatio: Math.abs(residualNoise) / Math.abs(roiChange),
    decomposable: true,
    primaryAttribution:
      Math.abs(physicalAttribution) > Math.abs(externalAttribution)
        ? 'physical_advantage'
        : 'external_event',
  };
}
```

### 7.3 归因分解的数据来源

| 分解项 | 数据来源 | 路径 |
|--------|---------|------|
| ROI变化 | 权威文档01 E-37 PROFIT_REINVEST | `retention_ratio` x 利润 |
| 物理优势归因 | NCI PSA层的costFractureScore + valueNetworkMismatchScore | 本章 §1.4 |
| 外部事件驱动 | 文档01 E-03 EXTERNAL_ECHO `env_rent` 时间序列 | E-03 transfer_function |
| 残差噪声 | 计算得出 = ROI_change - physical - external | — |

---

## 八、NCI循环调度优先级

### 8.1 三个循环的优先级

NCI循环是02引擎中的第八个出厂内置循环。它与现有循环的调度关系：

```
优先级（高→低）：
1. 溢出监控循环（文档15 — 持续运行，检测子循环溢出）
2. NCI循环（本章 — 方向失效时激活，评估备选方向）
3. 知识积累循环（文档07 — 最低优先级，批量运行）
```

来源：研究方案 v3.0 第四节

### 8.2 唯一耦合点

溢出监控循环和NCI循环只在一点耦合：

> **溢出监控检测到某子循环溢出持续为负超过2个诊断周期 → 即使02方向有效性未触发"方向失效"，仍需自动触发NCI循环评估"该子循环是否应被放弃"。**

```typescript
/**
 * NCI循环调度器
 *
 * @cycle NCI循环 — 第八个出厂内置循环
 * @priority 低于溢出监控（文档15），高于知识积累（文档07）
 */
interface NCICycleScheduler {
  /** 正常触发：02确认方向失效 + 企业明确需要重新选方向 */
  normalTrigger: {
    directionFailureConfirmed: boolean;
    enterpriseRequestsNewDirection: boolean;
  };

  /** 耦合触发：溢出监控检测到子循环溢出持续为负 */
  couplingTrigger: {
    /** 触发源 */
    source: 'overflow_monitor';  // 权威文档15
    /** 溢出持续为负的子循环ID */
    negativeOverflowCycleId: string;
    /** 持续为负的周期数 */
    consecutiveNegativeCycles: number;
  };

  /** 调度参数 */
  scheduling: {
    /** 正常触发时：NCI在一次调度窗口内完成 */
    normalWindow: 'single_cycle';  // 一次调度周期
    /** 耦合触发时：NCI优先执行（跳过其他非紧急任务） */
    couplingPriority: 'high';
    /** 知识积累循环在NCI运行期间降级 */
    knowledgeCycleDuringNCI: 'degraded';
  };
}
```

### 8.3 NCI循环调度时序

```typescript
function scheduleNCICycle(
  scheduler: NCICycleScheduler
): ScheduleResult {
  // 规则1: 溢出监控循环优先级最高 — 不被打断
  if (scheduler.couplingTrigger.source === 'overflow_monitor') {
    // 耦合触发：等待当前溢出监控周期完成
    const nextOverflowSlot = OverflowScheduler.nextAvailableSlot();
    return {
      scheduledAt: nextOverflowSlot,
      priority: 'high',
      conflictsWith: ['knowledge_cycle'],  // 知识积累推迟
    };
  }

  // 规则2: 正常触发 — 在下一个调度窗口运行
  return {
    scheduledAt: CronScheduler.nextAvailableSlot('nci'),
    priority: 'normal',
    conflictsWith: [],
  };
}
```

---

## 九、测试规范

### 9.1 测试层级

| 层级 | 测试类型 | 数量 | Fixture类型 |
|------|---------|------|-------------|
| L1 | 单元 — computeNCI三层计算 | 4 | Mock Direction + InternalConsensus + ExternalMarket + Physical |
| L1 | 单元 — STM_Index计算 | 3 | Mock InfrastructureData（正常/临界/未就绪） |
| L1 | 单元 — 数据真空模式 | 2 | EMIS不可用场景 + 无PSA数据场景 |
| L1 | 单元 — 强制共识检测 | 3 | 正常共识/强制共识/边界（actionCommitment=0.69） |
| L1 | 单元 — ODC过滤器 | 3 | 可消化/不可消化/背水一战 |
| L2a | 集成 — NCI子模块端到端 | 2 | 完整方向候选列表输入→过滤后输出 |
| L2c | 集成 — ODC+NCI+STM综合 | 1 | 三层综合打分排序 |

### 9.2 接线要求

| 新export | 调用方文件路径 | 调用方函数 |
|----------|--------------|-----------|
| `computeNCI()` | `src/l3/nci/nci-engine.ts` | `runNCI()` |
| `computeSTMIndex()` | `src/l3/nci/stm-index.ts` | `evaluateTiming()` |
| `computeNCIVacuum()` | `src/l3/nci/nci-engine.ts` | `runNCI()`（EMIS不可用时分支） |
| `checkDormantSignalActivation()` | `src/l3/nci/dormant-signal.ts` | `NCIEngine.monitorDormant()` |
| `detectForcedConsensus()` | `src/l3/nci/nci-engine.ts` | `computeNCI()` 内部调用 |
| `computeODC()` | `src/l3/nci/odc-filter.ts` | `applyODCFilter()` |
| `applyODCFilter()` | `src/l3/nci/nci-engine.ts` | `runNCI()`（候选过滤阶段） |
| `decomposeROIAttribution()` | `src/l3/nci/attribution.ts` | `runLongTermValidation()` |
| `scheduleNCICycle()` | `src/cron/nci-scheduler.ts` | `NCICronJob.execute()` |
