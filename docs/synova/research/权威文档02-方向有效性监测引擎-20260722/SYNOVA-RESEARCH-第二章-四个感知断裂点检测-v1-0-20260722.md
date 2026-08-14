# 第二章：四个感知断裂点检测

> 权威文档02 — 方向有效性监测引擎 | v1.0 | 2026-07-22
> 依赖: 第一章 方向有效性监测引擎（方向锚定+趋势偏离检测+方向失效评估）
> 下游: 第三章 NCI子模块、第四章 02与03的诊断流程接口

---

## 一、定位与设计原理

### 1.1 为什么是"感知断裂点"

方向监测引擎的核心问题不是"参数偏离了没有"——第一章的趋势偏离检测已经解决了这个问题。真正的难题是：**参数偏离了，但企业感知到了吗？**

一个企业可能已经在走下坡路，但组织内部无人意识到、无人讨论、或者讨论了但被系统性地否认。这是"感知断裂"——不是数据层面的问题，是组织认知层面的问题。

四个感知断裂点分别检测组织认知的四种失效模式：

| 断裂点 | 检测问题 | 核心假设 |
|--------|---------|---------|
| 沉默检测 | 信号在组织中是否被讨论？ | 如果无人讨论，组织对该方向的信念可能在动摇 |
| 否认检测 | 讨论的结论是否过度归因于外部？ | 如果总是归咎外部，方向本身可能已不可持续 |
| 知行差距检测 | 决策是否落地为执行？ | 如果Goal停顿或完成但无效，执行存在障碍 |
| 验证断裂检测 | 执行了是否带来了改善？ | 如果多个Goal完成但指标未改善，方向本身不成立 |

### 1.2 断裂点与失效模式的映射

```
感知断裂点 → 失效模式
─────────────────────────
沉默检测   → 方向失效（组织对方向的信念动摇）
否认检测   → 方向失效（方向本身已不可持续，但组织拒绝承认）
知行差距   → 执行问题（方向可能对，但执行遇到障碍）
验证断裂   → 方向失效（方向本身已不再成立，做了但没结果）
```

**默认规则**：四个断裂点触发情况冲突时（例如同时触发沉默+知行差距），优先进入"执行问题"分支——先检查执行，再判断方向。避免过早启动高成本的NCI子模块。只有当验证断裂单独触发、或沉默+否认同时触发时，才直接判定为"方向失效"。

### 1.3 数据来源总览

| 数据项 | 来源文档 | 具体路径 |
|--------|---------|---------|
| 哨兵Finding | 权威文档03 | SentinelRunner生成的Finding信号池，含findingId、severity、timestamp、topic |
| 中层行为数据 | 权威文档07 | B1.3 部门导航循环——方案评估闭环 + 日常咨询闭环 + 告警响应闭环 |
| Goal追踪数据 | 权威文档13 | 第一章 Goal生命周期（创建/执行/暂停/完成/关闭）、第三章 方案级哨兵趋势 |
| 溢出趋势数据 | 权威文档15 | 第二章 溢出仪表盘数据、第四章 跨时间尺度交叉验证 |

---

## 二、断裂点一：沉默检测

### 2.1 核心定义

**沉默检测**回答：一个被系统检测到的异常信号，在组织内部是否被讨论过？

哨兵Finding在NCI信号生命周期中90天内无任何人讨论 → 标记为**沉默**。

### 2.2 检测逻辑

```typescript
/**
 * 沉默检测函数签名
 *
 * @param findingId - 哨兵Finding的唯一标识
 * @param signalLifecycleDays - NCI信号生命周期阈值，默认90天
 * @returns SilenceDetectionResult
 *
 * @dataSource 哨兵Finding: 权威文档03 SentinelRunner.getFindings()
 * @dataSource 中层行为数据: 权威文档07 B1.3 部门导航循环
 */
interface SilenceDetectionInput {
  findingId: string;
  signalLifecycleDays: number;  // 默认 90
}

interface SilenceDetectionResult {
  findingId: string;
  isSilent: boolean;
  silenceDurationDays: number;       // 自信号产生以来无声天数
  discussionMatches: Array<{
    source: 'goal_discussion' | 'proposal' | 'diagnosis_report' | 'meeting_minutes' | 'ga_interview';
    matchedAt: string;               // ISO-8601
    relevanceScore: number;          // 0-1，讨论话题与Finding主题的语义相似度
  }>;
  mappedFailureMode: 'directional_failure' | null;
  confidence: number;                // 0-1
}
```

### 2.3 检测步骤

**Step 1: 提取Finding主题向量**

从哨兵Finding中提取topic标签和关键词。消费文档03的 `SentinelFinding.topic` 字段和 `finding.severity`。

**Step 2: 扫描中层讨论空间**

消费文档07的中层行为数据，扫描以下空间：
- **Goal讨论记录**：文档13第一章 Goal.lifecycle中 `discussionTimeline` 字段，时间范围 `[finding.createdAt, finding.createdAt + 90天]`
- **Proposal讨论**：文档13第二章 Proposal.auditLog，按时间过滤
- **诊断报告引用**：文档03的诊断报告 `actionRecommendations` 是否引用该Finding的哨兵ID
- **部门工作台告警响应**：文档13第四章 WorkspaceAlert，中层对告警的处置记录（确认/误报/升级）
- **GA访谈记录**：SENSING实体采集的弱信号——GA手动标注的讨论记录

**Step 3: 语义匹配**

对每个讨论记录，计算其文本与Finding主题的语义相似度（使用LLM或向量相似度）。`relevanceScore >= 0.6` 视为"相关讨论"。

**Step 4: 判定**

```typescript
function detectSilence(input: SilenceDetectionInput): SilenceDetectionResult {
  const finding = SentinelRegistry.getFinding(input.findingId);
  const discussionWindow = {
    start: finding.createdAt,
    end: addDays(finding.createdAt, input.signalLifecycleDays),  // 90天
  };

  const matches = scanDiscussions(finding.topic, discussionWindow);

  if (matches.length === 0) {
    return {
      findingId: input.findingId,
      isSilent: true,
      silenceDurationDays: daysBetween(finding.createdAt, now()),
      discussionMatches: [],
      mappedFailureMode: 'directional_failure',
      confidence: 0.85,  // 高置信度：讨论空间全覆盖
    };
  }

  const relevantMatches = matches.filter(m => m.relevanceScore >= 0.6);
  if (relevantMatches.length === 0) {
    return {
      findingId: input.findingId,
      isSilent: true,
      silenceDurationDays: daysBetween(finding.createdAt, now()),
      discussionMatches: matches,
      mappedFailureMode: 'directional_failure',
      confidence: 0.70,  // 降置信度：有讨论但无关
    };
  }

  return {
    findingId: input.findingId,
    isSilent: false,
    silenceDurationDays: 0,
    discussionMatches: relevantMatches,
    mappedFailureMode: null,
    confidence: 0.90,
  };
}
```

### 2.4 边界条件

| 边界条件 | 处理方式 |
|---------|---------|
| 企业未启用中层工作台（无讨论数据） | 退化为仅扫描诊断报告引用 + GA访谈记录。`confidence -= 0.3`。标注"需要中层工作台数据以提高检测精度" |
| Finding主题为新兴领域（无历史讨论基准） | `signalLifecycleDays` 缩短为60天（信号更新颖，沉默周期应更短） |
| 企业规模 < 10人 | 不适用沉默检测——小型团队口头讨论不被系统捕获。标注"不适用" |

### 2.5 对抗性验证

| 案例 | 期望输出 | 验证逻辑 |
|------|---------|---------|
| 利润连续下滑3个月Finding | 沉默（无人讨论）→ 方向失效 | 90天窗口内Goal讨论+Proposal+诊断报告均无匹配 |
| 客户流失率上升Finding | 非沉默（已有Goal在追踪）→ 不触发 | Goal讨论记录中relevanceScore=0.85 |
| 虚假沉默（讨论过但语义不匹配） | GA手动标记覆盖 | GA手动标记"已讨论过"，覆盖系统判定 |

---

## 三、断裂点二：否认检测

### 3.1 核心定义

**否认检测**回答：组织对负面信号的归因是否系统性地偏向外部？

讨论了但结论归因于"外部环境"占比 > 80%，且行业数据不支持 → 标记为**"过度外部归因"**。

### 3.2 检测逻辑

```typescript
/**
 * 否认检测函数签名
 *
 * @param findingId - 哨兵Finding的唯一标识
 * @param discussionContext - 该Finding相关的所有讨论记录（来自沉默检测的输出）
 * @returns DenialDetectionResult
 *
 * @dataSource 行业基准: 权威文档01 E-03 EXTERNAL_ECHO (market_growth_j, baseline_growth_j)
 * @dataSource 哨兵Finding: 权威文档03
 * @dataSource 中层行为数据: 权威文档07 B1.3
 */
interface DenialDetectionInput {
  findingId: string;
  discussionContext: DiscussRecord[];  // 来自 SilenceDetectionResult.discussionMatches
  externalAttributionThreshold: number;  // 默认 0.80
}

interface DenialDetectionResult {
  findingId: string;
  isDenial: boolean;
  externalAttributionRatio: number;
  industrySupportsAttribution: boolean;
  industryBaseline: {
    marketGrowth: number;        // E-03 market_growth_j
    baselineGrowth: number;      // E-03 baseline_growth_j
    dataAvailable: boolean;
  };
  mappedFailureMode: 'directional_failure' | null;
  confidence: number;
}
```

### 3.3 检测步骤

**Step 1: 归因分类**

对每条讨论记录，使用LLM分类器判断归因方向：
- `internal`：归因于内部因素（执行力、决策错误、团队能力、资源配置）
- `external`：归因于外部因素（市场下行、政策变化、竞品冲击、客户需求变化）
- `mixed`：内外部因素兼有
- `unclear`：无法判断

**Step 2: 计算外部归因比例**

```typescript
externalAttributionRatio =
  count(external) / (count(internal) + count(external) + count(mixed))
```

`unclear` 不计入分母。如果总讨论数 < 3，`confidence -= 0.2`（样本量不足）。

**Step 3: 行业数据验证**

消费文档01 E-03 EXTERNAL_ECHO的 `market_growth_j` 和 `baseline_growth_j` 参数：

```typescript
function verifyExternalAttribution(ratio: number, industryData: IndustryBaseline): boolean {
  if (!industryData.dataAvailable) {
    return false;  // 行业数据不可用 → 无法验证 → 不触发否认检测
  }

  if (industryData.marketGrowth < industryData.baselineGrowth * 0.7) {
    return false;  // 行业数据支持外部归因
  }

  // 行业增长率正常或增长，外部归因不合理
  return ratio > 0.80;
}
```

**Step 4: 判定**

`externalAttributionRatio > 0.80` 且 `industrySupportsAttribution === false` → 标记为"过度外部归因"，映射到"方向失效"模式。

### 3.4 边界条件

| 边界条件 | 处理方式 |
|---------|---------|
| 讨论记录 < 3条 | `confidence -= 0.2`，仍需触发判断 |
| 行业基准数据不可用（E-03 dataAvailable=false） | 不触发否认检测。标注"需要ExternalBaseline数据" |
| 归因分类unclear占比 > 50% | 标记为"归因模糊"，`confidence -= 0.3`。不触发否认检测 |
| 所有讨论混合归因（mixed占比100%） | 不触发否认——组织未系统性否认 |

---
---

## 四、断裂点三：知行差距检测

### 4.1 核心定义

**知行差距检测**回答：企业认识到了问题并制定了Goal，但Goal是否推进了？

检测两种子模式：

**子模式A — Goal停顿检测**：Goal创建7天后，方案级哨兵检测到零进展（所有关联指标持续无变化）→ 标记为"方案空转"。

**子模式B — Goal完成但无效检测**：Goal标记为"已完成"，但闭环验证发现关联指标未改善（执行完了但没效果）。

### 4.2 检测逻辑

```typescript
/**
 * 知行差距检测函数签名
 *
 * @param goalIds - 当前活跃Goal的ID列表
 * @returns KnowingDoingGapResult
 *
 * @dataSource Goal追踪: 权威文档13 第一章 Goal.metrics + Goal.lifecycle
 * @dataSource 方案哨兵: 权威文档13 第三章 GoalSentinelManifest.deviationModel
 * @dataSource 闭环验证: 权威文档13 第一章 Goal.successCriteria + Goal.source
 */
interface KnowingDoingGapInput {
  goalIds: string[];
  stagnationThresholdDays: number;  // 默认 7 天
}

interface KnowingDoingGapResult {
  gaps: Array<{
    goalId: string;
    type: 'stagnation' | 'completed_but_ineffective';
    stagnationEvidence?: {
      daysSinceCreation: number;
      zeroProgressMetrics: string[];
      sentinelStatus: string;
    };
    inefficacyEvidence?: {
      completedAt: string;
      closedLoopMetrics: Array<{
        metricId: string;
        preGoalValue: number;
        postGoalValue: number;
        expectedImprovement: number;
        actualChange: number;
      }>;
    };
  }>;
  mappedFailureMode: 'execution_problem' | null;
  confidence: number;
}
```

### 4.3 子模式A：Goal停顿检测

**输入**：Goal创建时间、方案级哨兵的关联指标时序数据、Goal.timeline.proposedAt

**检测逻辑**：

```typescript
function detectGoalStagnation(
  goal: Goal,
  thresholdDays: number
): StagnationResult | null {
  const daysSinceCreation = daysBetween(goal.timeline.proposedAt, now());

  if (daysSinceCreation < thresholdDays) {
    return null;  // 未到检测窗口
  }

  const sentinelStatus = GoalSentinelRegistry.getLatest(goal.id);
  if (!sentinelStatus) {
    return {
      isStagnant: true,
      reason: 'no_sentinel_registered',
      confidence: 0.5
    };
  }

  const zeroProgressMetrics: string[] = [];
  for (const metric of goal.metrics) {
    const change = computeMetricChange(
      metric, goal.timeline.proposedAt, now()
    );
    if (Math.abs(change) < 0.01) {
      zeroProgressMetrics.push(metric.primary.measurement.sourceId);
    }
  }

  const allZero = zeroProgressMetrics.length === goal.metrics.length;

  if (!allZero) return null;

  return {
    isStagnant: true,
    goalId: goal.id,
    daysSinceCreation,
    zeroProgressMetrics,
    confidence: 0.80,
  };
}
```

### 4.4 子模式B：Goal完成但无效检测

**输入**：Goal.lifecycle = 'completed'，Goal.metrics的pre/post对比值，Goal.source（追溯原始诊断指标的改善情况）

**检测逻辑**：

```typescript
function detectCompletedButIneffective(
  goal: Goal
): InefficacyResult | null {
  if (goal.lifecycle !== 'completed') return null;

  const inefficacyMetrics: ClosedLoopMetric[] = [];

  for (const metric of goal.metrics) {
    const preValue = metric.primary.currentBaseline;
    const postValue = queryCurrentValue(
      metric.primary.measurement.sourceId
    );
    const expectedImprovement = metric.primary.targetValue - preValue;
    const actualChange = postValue - preValue;

    // 实际改善不足预期的30%
    if (
      expectedImprovement > 0 &&
      actualChange < expectedImprovement * 0.3
    ) {
      inefficacyMetrics.push({
        metricId: metric.primary.measurement.sourceId,
        preGoalValue: preValue,
        postGoalValue: postValue,
        expectedImprovement,
        actualChange,
      });
    }
  }

  if (inefficacyMetrics.length === 0) return null;

  return {
    isIneffective: true,
    goalId: goal.id,
    completedAt: goal.timeline.closedAt!,
    closedLoopMetrics: inefficacyMetrics,
    confidence:
      inefficacyMetrics.length / goal.metrics.length > 0.5
        ? 0.85
        : 0.60,
  };
}
```

### 4.5 知行差距到失效模式的映射

| Gap类型 | 映射到 | 原因 |
|---------|-------|------|
| Goal停顿（单个） | 执行问题 | 单个Goal停顿可能是资源配置问题 |
| Goal停顿（>=3个同时） | 执行问题（升级） | 组织结构性问题，先检查执行 |
| Goal完成但无效（单个） | 执行问题 | 可能是该Goal的度量绑定有误 |
| Goal完成但无效（>=3个同周期内） | 转到验证断裂检测 | 不再是个体问题 |

### 4.6 边界条件

| 边界条件 | 处理方式 |
|---------|---------|
| Goal尚未注册方案哨兵 | 使用Goal.metrics直接查询原始数据源。`confidence -= 0.2` |
| Goal创建不足7天 | 跳过检测 |
| 关联指标数据源不可用 | 标记degraded，使用fallback数据源（文档13 MeasurementDef.fallback） |
| Goal被手动暂停（lifecycle='paused'） | 排除出检测，不计入"零进展" |

---

## 五、断裂点四：验证断裂检测

### 5.1 核心定义

**验证断裂检测**回答：企业做了很多事（Goal完成），但整体方向是否在改善？

多个Goal（>=3个）在同一诊断周期内被标记为"已完成但无效" → 触发**"对某个方向的根因存在系统性误判"**。

### 5.2 检测逻辑

```typescript
/**
 * 验证断裂检测函数签名
 *
 * @param diagnosisCycleId - 当前诊断周期ID
 * @param completedGoals - 该周期内标记为completed的Goal列表
 * @returns ValidationFractureResult
 *
 * @dataSource Goal追踪: 权威文档13 第一章
 * @dataSource 溢出趋势: 权威文档15 第四章 -- 跨时间尺度交叉验证
 */
interface ValidationFractureInput {
  diagnosisCycleId: string;
  completedGoals: Goal[];
  inefficacyThreshold: number;  // 默认 3
}

interface ValidationFractureResult {
  isFractured: boolean;
  ineffectiveGoals: Array<{
    goalId: string;
    completedAt: string;
    ineffectiveMetrics: string[];
  }>;
  sameDirection: boolean;
  overflowCrossValidation: {
    directionId: string;
    overflowTrend: 'declining' | 'flat' | 'improving';
    overflowScoreChange: number;
  };
  mappedFailureMode: 'directional_failure' | null;
  confidence: number;
}
```

### 5.3 检测步骤

**Step 1: 筛选已完成但无效的Goal**

使用第四节的知行差距检测（子模式B）的结果。统计同一诊断周期内被标记为 `completed_but_ineffective` 的Goal数量。如果 `count >= 3`，进入Step 2。

**Step 2: 方向一致性检查**

检查这些无效Goal是否指向同一战略方向：

```typescript
function checkDirectionConsistency(goals: Goal[]): boolean {
  const diagnosisIds = goals.map(g => g.source.diagnosisReportId);

  // 来自同一份诊断报告 → 指向同一方向
  if (new Set(diagnosisIds).size === 1) return true;

  // 相同部门
  const departments = goals.map(g => g.department);
  if (new Set(departments).size === 1) return true;

  // 相同Goal类型
  const types = goals.map(g => g.type);
  if (new Set(types).size === 1) return true;

  return false;
}
```

如果 `sameDirection === true`，置信度0.90→触发方向失效。如果 `sameDirection === false`（方向不同但仍>=3个无效），置信度=0.70，仍需触发但标注为"多方向同时疲软"。

**Step 3: 溢出趋势交叉验证**

消费文档15的溢出趋势数据，检查该方向对应子循环的溢出是否持续为负：

```typescript
function crossValidateWithOverflow(
  directionId: string
): OverflowCrossCheck {
  const overflowData = OverflowEngine.getDirectionTrend(
    directionId,
    { window: '6_months' }
  );

  if (overflowData.overflowScoreChange < -0.1) {
    return {
      directionId,
      overflowTrend: 'declining',
      overflowScoreChange: overflowData.overflowScoreChange
    };
  }

  return {
    directionId,
    overflowTrend: overflowData.trend,
    overflowScoreChange: overflowData.overflowScoreChange
  };
}
```

### 5.4 验证断裂与知行差距的关系

验证断裂是知行差距（子模式B）的聚合升级。单个Goal完成但无效 → 执行问题。>=3个同方向Goal完成但无效 → 不再是执行问题 → 方向本身不成立。

```typescript
function mapValidationFracture(
  input: ValidationFractureInput
): FractureMapping {
  const result = detectValidationFracture(input);

  if (!result.isFractured) {
    return {
      mode: null,
      reason: 'insufficient_ineffective_goals'
    };
  }

  if (result.sameDirection) {
    return {
      mode: 'directional_failure',
      reason: '>=3 Goals在同一方向完成但无效 -- 对该方向的根因存在系统性误判',
      confidence: 0.90 + (
        result.overflowCrossValidation.overflowTrend === 'declining'
          ? 0.05 : 0
      ),
    };
  }

  return {
    mode: 'directional_failure',
    reason: '多方向同时疲软 -- 信号未收敛到单一方向但执行全面失效',
    confidence: 0.70,
  };
}
```

### 5.5 边界条件

| 边界条件 | 处理方式 |
|---------|---------|
| 诊断周期内完成Goal < 3 | 不触发（样本不足） |
| 溢出数据不可用（文档15数据未接入） | 跳过Step 3交叉验证。`confidence -= 0.1` |
| Goal类型为defensive型 | 排除出检测——防御型Goal的"无效"可能意味着风险未发生 |
| GA手动标记某Goal"验证有效" | 覆盖系统自动判定——该Goal从ineffective列表中移除 |

---

## 六、四断裂点的触发优先级与冲突解决

### 6.1 触发优先级

```
优先级（高→低）：
1. 验证断裂（>=3个Goal完成但无效） → 方向失效（最高置信度0.90+）
2. 沉默 + 否认同时触发 → 方向失效（双重确认）
3. 知行差距（>=3个Goal同时停顿） → 执行问题（升级为系统性执行问题）
4. 沉默单独触发 → 方向失效（中等置信度0.70-0.85）
5. 否认单独触发 → 方向失效（中等置信度0.70-0.85）
6. 知行差距（单个Goal停顿/无效） → 执行问题（低置信度）
```

### 6.2 冲突解决规则

```typescript
function resolveFractureConflicts(
  silence: SilenceDetectionResult,
  denial: DenialDetectionResult,
  gap: KnowingDoingGapResult,
  validation: ValidationFractureResult
): FinalAssessment {
  // 规则1: 验证断裂触发 → 直接方向失效（最高优先级）
  if (validation.isFractured && validation.sameDirection) {
    return {
      mode: 'directional_failure',
      trigger: 'validation_fracture',
      confidence: 0.90
    };
  }

  // 规则2: 沉默+否认同时触发 → 方向失效
  if (silence.isSilent && denial.isDenial) {
    return {
      mode: 'directional_failure',
      trigger: 'silence_and_denial',
      confidence: 0.88
    };
  }

  // 规则3: 知行差距升级 + 验证断裂（多方向） → 方向失效
  if (validation.isFractured && !validation.sameDirection) {
    return {
      mode: 'directional_failure',
      trigger: 'multi_direction_weakness',
      confidence: 0.70
    };
  }

  // 规则4: 沉默或否认单独触发 → 方向失效
  if (silence.isSilent) {
    return {
      mode: 'directional_failure',
      trigger: 'silence',
      confidence: silence.confidence
    };
  }
  if (denial.isDenial) {
    return {
      mode: 'directional_failure',
      trigger: 'denial',
      confidence: denial.confidence
    };
  }

  // 规则5: 知行差距单独触发 → 执行问题（默认分支）
  if (gap.gaps.length > 0) {
    return {
      mode: 'execution_problem',
      trigger: gap.gaps.length >= 3
        ? 'systemic_execution_gap'
        : 'single_goal_gap',
      confidence: gap.confidence,
    };
  }

  // 规则6: 无任何断裂点触发 → 方向有效
  return {
    mode: 'direction_valid',
    trigger: null,
    confidence: 1.0
  };
}
```

### 6.3 默认策略

无法判断时（例如所有检测结果confidence < 0.5）→ 默认进入"执行问题"分支。**先检查执行，再判断方向，避免过早启动高成本NCI。**

---

## 七、四断裂点综合状态接口

```typescript
/**
 * 四断裂点综合状态 -- 方向失效评估的核心输入
 *
 * 此接口定义02引擎消费的断裂点数据契约。
 * 数据由各来源系统（文档03/07/13/15）提供。
 *
 * @entity FracturePointState
 * @layer L3 (洞察层) -- DirectionMonitor消费
 */
export interface FracturePointState {
  diagnosisCycleId: string;
  evaluatedAt: string;

  silence: {
    detected: boolean;
    silentFindingCount: number;
    silentFindingIds: string[];
    confidence: number;
    dataSources: {
      sentinelFindings: string;    // "权威文档03 SentinelRunner"
      middleLayerBehavior: string; // "权威文档07 B1.3"
    };
  };

  denial: {
    detected: boolean;
    externalAttributionRatio: number;
    industrySupports: boolean;
    confidence: number;
    dataSources: {
      industryBaseline: string;    // "权威文档01 E-03 EXTERNAL_ECHO"
      discussionBehavior: string;  // "权威文档07 B1.3"
    };
  };

  knowingDoingGap: {
    detected: boolean;
    stagnationCount: number;
    ineffectiveCount: number;
    gaps: Array<{
      goalId: string;
      type: 'stagnation' | 'completed_but_ineffective';
    }>;
    confidence: number;
    dataSources: {
      goalTracking: string;     // "权威文档13 第一章"
      goalSentinels: string;    // "权威文档13 第三章"
      closedLoop: string;       // "权威文档13 第一章 Goal.successCriteria"
    };
  };

  validationFracture: {
    detected: boolean;
    ineffectiveGoalCount: number;
    sameDirection: boolean;
    overflowCrossCheck: {
      available: boolean;
      trend?: 'declining' | 'flat' | 'improving';
    };
    confidence: number;
    dataSources: {
      goalTracking: string;     // "权威文档13 第一章"
      overflowTrends: string;   // "权威文档15 第四章"
    };
  };

  finalAssessment: {
    mode: 'direction_valid' | 'directional_failure' | 'execution_problem';
    trigger: string | null;
    confidence: number;
  };

  degraded: boolean;
  degradedComponents: string[];
}
```

---

## 八、测试规范

### 8.1 测试层级

| 层级 | 测试类型 | 数量 | Fixture类型 |
|------|---------|------|-------------|
| L1 | 单元测试 -- 每个检测函数独立 | 4个函数x3场景=12 | Mock Finding + Mock Goal + Mock讨论记录 |
| L2a | 集成 -- 检测函数与数据源对接 | 4个 | 真实哨兵Finding fixture + 真实Goal fixture |
| L2c | 集成 -- 冲突解决器 | 3个 | 四个检测结果的混合场景（沉默+否认/知行+验证/全组合） |

### 8.2 接线要求

| 新export | 调用方文件路径 | 调用方函数 |
|----------|--------------|-----------|
| `detectSilence()` | `src/l3/direction-monitor/fracture-detector.ts` | `runAllFractureDetections()` |
| `detectDenial()` | `src/l3/direction-monitor/fracture-detector.ts` | `runAllFractureDetections()` |
| `detectKnowingDoingGap()` | `src/l3/direction-monitor/fracture-detector.ts` | `runAllFractureDetections()` |
| `detectValidationFracture()` | `src/l3/direction-monitor/fracture-detector.ts` | `runAllFractureDetections()` |
| `resolveFractureConflicts()` | `src/l3/direction-monitor/fracture-detector.ts` | `runAllFractureDetections()` |
| `FracturePointState` | `src/l3/direction-monitor/types.ts` | `DirectionValidityResult` 消费 |
