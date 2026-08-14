<!--
  Synova 增长导航系统工程规范 第五章 — 与主Agent和Skill/Tool体系集成
  版本: v1.0 | 日期: 2026-07-14
-->

# 第五章：与主Agent和Skill/Tool体系集成

> "导航消费诊断输出，产出知识输入。诊断→导航→GA进化→系统自检→知识积累，五个循环首尾相连。" — 研究方案 v2.0

---

## 一、导航循环在主Agent(L2)的5循环架构位置

### 1.1 五循环全景图

```
+-----------------------------------------------------------------------------+
|                          主Agent (L2 编排层)                                  |
|                                                                             |
|  +------------------+    +------------------+    +------------------+       |
|  |  诊断循环         |    |  导航循环         |    |  GA进化循环       |       |
|  |  (Diagnosis)     |--->|  (Navigation)    |--->|  (GA Evolution)  |       |
|  |                  |    |                  |    |                  |       |
|  |  FDE按需/哨兵定时 |    |  诊断->Proposal  |    |  领域知识注入     |       |
|  |  42边因果+8专家  |    |  ->Goal->追踪    |    |  阈值校准         |       |
|  |  -> 诊断报告     |    |  ->偏离->调整    |    |  Playbook进化    |       |
|  +------------------+    +------------------+    +------------------+       |
|           |                      |                        |                 |
|           v                      v                        v                 |
|  +------------------+    +------------------+                               |
|  |  系统自检循环     |    |  知识积累循环     |                               |
|  |  (Self-Check)    |    |  (Knowledge)     |                               |
|  |                  |    |                  |                               |
|  |  哨兵健康检查     |    |  PKB写入         |                               |
|  |  数据源可用性     |    |  联邦进化        |                               |
|  |  模型漂移检测     |    |  跨企业聚合      |                               |
|  +------------------+    +------------------+                               |
+-----------------------------------------------------------------------------+
```

### 1.2 导航循环在五循环中的角色

| 循环 | 输入 | 输出 | 与导航的关系 |
|------|------|------|------------|
| **诊断** | 原始数据/哨兵Finding | StandardExpertReport | 导航的**上游**：导航消费诊断的 actionRecommendations |
| **导航** | StandardExpertReport | Goal + Proposal + 偏离告警 | **主体**：完整管理Goal生命周期 |
| **GA进化** | Goal执行数据 + 导航偏差日志 | 校准参数 + Playbook更新 | 导航的**反馈**：导航偏差数据用于优化诊断模型 |
| **系统自检** | 哨兵健康 + 数据源可用性 | 自检报告 | 导航的**保障**：保证方案哨兵的数据源可用 |
| **知识积累** | Goal关闭数据 + 跨企业基准 | PKB条目 + 行业基准 | 导航的**下游**：导航产出可复用知识 |

### 1.3 导航消费诊断输出的具体路径

```
StandardExpertReport
        |
        |-- findings[] -> 不直接消费（中层不需要看原始Finding）
        |-- actionRecommendations[] -> Proposal.options[]
        |       |-- recommendation.description -> ProposalOption.description
        |       |-- recommendation.priority -> ProposalOption排序
        |       |-- recommendation.estimatedImpact -> ProposalOption.stressTest
        |
        |-- crossExpertContradictions[] -> Goal.conflictsWith 预警
        |-- overallAssessment -> DiagnosticReference.relevantFindings
        |-- uncertainties[] -> ProposalOption.keyRisks
```

---

## 二、诊断报告 -> Proposal -> Goal 字段级映射

### 2.1 StandardExpertReport -> Proposal 映射表

| StandardExpertReport 字段 | Proposal 字段 | 映射规则 |
|--------------------------|--------------|---------|
| `meta.diagnosisId` | `sourceDiagnosisId` | 直接复制 |
| `meta.orgName` | (不映射，由 TEAM 节点提供) | — |
| `findings[]` | (不映射) | Finding 是专家内部产物，中层不需要 |
| `actionRecommendations[].description` | `options[].description` | 每条建议转为一个 ProposalOption |
| `actionRecommendations[].priority` | `options[].isDefault` | priority=highest 的设为默认选项 |
| `actionRecommendations[].estimatedCost` | `options[].estimatedCost` | 直接复制 |
| `actionRecommendations[].riskLevel` | `options[].riskLevel` | 直接复制 |
| `actionRecommendations[].expectedImpact` | `options[].stressTest` | 转化为假设压力测试输入 |
| `hypotheses[].rootCause` | `rootCause` | 选置信度最高的 hypothesis |
| `uncertainties[]` | 压力测试的 `keyRisks` | 不确定性 = 风险 |
| `crossExpertContradictions[]` | (不映射到 Proposal, 映射到 Goal) | 见 2.3 |
| `dimensions[]` | Goal 的 `metrics[].name` | 每个受影响维度 -> 一个指标 |

### 2.2 Proposal -> Goal 映射表

| Proposal 字段 | Goal 字段 | 映射规则 |
|--------------|----------|---------|
| `proposalId` | `proposalId` | 直接引用 |
| `options[selected].description` | `title` | 提取标题（前30字符） |
| `rootCause` | (存储到 props.rootCause) | 用于轻量级再诊断上下文 |
| `options[selected].estimatedCost.timeline` | `deadline` | 解析为 ISO-8601 截止日期 |
| `options[selected].riskLevel` | `priority` | high->P0, medium->P1, low->P2 |
| `sourceDiagnosisId` | `diagnosisId` | 直接复制 |
| 受影响的维度 | `metrics[]` | 每个维度创建一个 GoalMetric |
| — | `successCriteria[]` | 从 options[selected].expectedImpact 推导 |
| — | `dependsOn` | 检测同部门其他 Goal（同诊断产出的兄弟Goal默认依赖）|
| — | `conflictsWith` | 从 crossExpertContradictions 检测（涉及同一部门的冲突）|

### 2.3 跨专家矛盾 -> Goal 冲突检测

```typescript
/**
 * 从诊断报告的跨专家矛盾推导 Goal 冲突
 * 
 * 检测逻辑：
 *   如果 crossExpertContradictions 涉及的两个维度都映射到同一个部门，
 *   则这两个维度对应的 Goal 标记为 conflictsWith。
 */
function deriveGoalConflicts(
  contradictions: CrossExpertContradiction[],
  dimensionToDeptMap: Map<string, string>
): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();

  for (const c of contradictions) {
    const deptA = dimensionToDeptMap.get(c.dimensionA);
    const deptB = dimensionToDeptMap.get(c.dimensionB);
    if (deptA && deptB && deptA === deptB) {
      // 同一部门内的矛盾 -> Goal 冲突
      const goalA = findGoalByDimension(c.dimensionA);
      const goalB = findGoalByDimension(c.dimensionB);
      if (goalA && goalB) {
        addConflict(conflicts, goalA.id, goalB.id);
      }
    }
  }
  return conflicts;
}
```

---

## 三、触发时机与筛选规则

### 3.1 诊断报告产出后的分流决策树

```
诊断报告产出
    |
    v
主Agent 评估每条 actionRecommendation
    |
    +---> 该建议是否可执行？
    |       条件1: 有明确的责任部门 (GraphStore TEAM 节点存在)
    |       条件2: 有可量化的指标 (recommendation 包含具体数字)
    |       条件3: 有时限 (recommendation 包含时间范围)
    |
    +--[任一不满足]--> GA 确认
    |                    |
    |                    +--> GA确认通过 -> 手动转 Proposal
    |                    +--> GA确认拒绝 -> 记录原因，不进入导航
    |
    +--[全部满足]--> 自动转换
                       |
                       +--> 跨部门？ -> YES -> GA确认
                       +--> 需外部资源？ -> YES -> GA确认
                       +--> 效果无法验证？ -> YES -> GA确认
                       +--> 以上全NO -> 自动生成 Proposal -> 推送中层工作台
```

### 3.2 筛选规则引擎

```typescript
interface AutoConversionDecision {
  canAutoConvert: boolean;
  reason?: string;
  requiresGA: boolean;
}

function evaluateAutoConversion(
  recommendation: ActionRecommendation,
  orgContext: OrgContext
): AutoConversionDecision {
  const checks = {
    hasOwnerDept: !!findTeamForRecommendation(recommendation, orgContext),
    hasQuantifiableMetric: /\d+/.test(recommendation.description),
    hasTimeline: !!recommendation.estimatedCost?.timeline,
    isCrossDept: countAffectedTeams(recommendation, orgContext) > 1,
    needsExternalResource: recommendation.estimatedCost?.budget?.includes('外部'),
    isVerifiable: recommendation.expectedImpact !== undefined,
  };

  if (!checks.hasOwnerDept || !checks.hasQuantifiableMetric || !checks.hasTimeline) {
    return { canAutoConvert: false, reason: '不可执行条件不满足', requiresGA: true };
  }

  if (checks.isCrossDept || checks.needsExternalResource || !checks.isVerifiable) {
    return { canAutoConvert: false, reason: '需GA确认', requiresGA: true };
  }

  return { canAutoConvert: true, requiresGA: false };
}
```

---

## 四、轻量级再诊断完整工程边界

### 4.1 触发条件

中层在证据链弹窗点击"提出异议"后，或方案哨兵 P0 告警触发后，启动轻量级再诊断。

### 4.2 工程边界定义

```typescript
/**
 * LightweightReDiagnosis — 轻量级再诊断边界定义
 * 
 * 契约:
 *   输入: goalId + disputeReason (可选)
 *   输出: GoalAdjustmentProposal
 *   硬约束: 1位专家 + 3-5条因果边 + 5分钟超时
 *   降级: 超时或专家返回失败 -> 自动升级为全量诊断
 */
interface LightweightReDiagnosisConfig {
  /** 最大专家数 */
  maxExperts: 1;
  /** 因果边数量范围 */
  causalEdges: { min: 3; max: 5 };
  /** 超时时间 (ms) */
  timeoutMs: 300_000;  // 5分钟
  /** 模型 */
  model: 'deepseek-chat' | 'gpt-4o-mini';
  /** 上下文：仅载入 Goal + 最近3条哨兵Finding */
  contextStrategy: 'minimal';
}

interface LightweightReDiagnosisInput {
  goalId: string;
  /** 中层提交的异议理由（如果有） */
  disputeReason?: string;
  /** 关联的 Proposal ID */
  proposalId: string;
  /** 触发来源 */
  triggeredBy: 'dispute' | 'p0_alert' | 'manual';
}

interface GoalAdjustmentProposal {
  /** 调整类型 */
  adjustmentType: 'adjust_target' | 'abandon_goal' | 'escalate_to_full_diagnosis';
  /** 调整后的目标值（adjust_target时） */
  newTarget?: { metricName: string; newTargetValue: number; unit: string; reason: string };
  /** 废弃理由（abandon_goal时） */
  abandonReason?: string;
  /** 升级理由（escalate_to_full_diagnosis时） */
  escalationReason?: string;
  /** 再诊断专家 */
  expert: ExpertType;
  /** 使用的因果边 */
  causalEdgesUsed: string[];
  /** 置信度 0-1 */
  confidence: number;
  /** 再诊断摘要 */
  summary: string;
  /** 完成时间 */
  completedAt: string;
  /** 耗时 (ms) */
  durationMs: number;
}
```

### 4.3 专家选择规则

| Goal 所属维度 | 轻量级专家 |
|-------------|----------|
| 财务 (fixed_cost_ratio, operating_leverage 等) | `finance` |
| 市场 (customer_churn, revenue_growth 等) | `marketing` |
| 组织 (employee_turnover, key_person_risk 等) | `org` |
| 技术 (process_efficiency, tech_debt 等) | `tech` |
| 战略 (competitive_position 等) | `strategy` |

### 4.4 轻量级再诊断完整伪代码

```typescript
async function lightweightReDiagnosis(
  input: LightweightReDiagnosisInput
): Promise<GoalAdjustmentProposal> {
  const startTime = Date.now();

  // 1. 确定专家
  const goal = await getGoal(input.goalId);
  const expert = selectExpertForDimension(goal.primaryDimension);

  // 2. 选取因果边（3-5条，取与该Goal维度最相关的）
  const causalEdges = selectRelevantCausalEdges(goal.primaryDimension, {
    min: 3,
    max: 5,
  });

  // 3. 构建最小化上下文
  const context = {
    goal,
    recentFindings: await getRecentFindings(`sentinel-goal-${goal.goalId}`, 3),
    disputeReason: input.disputeReason,
    causalEdges,
  };

  // 4. 调用专家（带5分钟超时）
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Lightweight diagnosis timeout')), 300_000)
  );

  try {
    const expertResult = await Promise.race([
      runExpertReDiagnosis(expert, context),
      timeoutPromise,
    ]);

    // 5. 判断调整类型
    const adjustmentType = determineAdjustmentType(expertResult, goal);

    return {
      adjustmentType,
      newTarget: adjustmentType === 'adjust_target' ? expertResult.proposedTarget : undefined,
      abandonReason: adjustmentType === 'abandon_goal' ? expertResult.abandonReason : undefined,
      escalationReason: adjustmentType === 'escalate_to_full_diagnosis' ? expertResult.escalationReason : undefined,
      expert,
      causalEdgesUsed: causalEdges,
      confidence: expertResult.confidence,
      summary: expertResult.summary,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    // 超时或失败 -> 自动升级为全量诊断
    log.warn('[lightweight-diagnosis] failed, escalating to full diagnosis', {
      goalId: input.goalId,
      error: (err as Error).message,
    });
    return {
      adjustmentType: 'escalate_to_full_diagnosis',
      escalationReason: `轻量级再诊断失败: ${(err as Error).message}`,
      expert,
      causalEdgesUsed: causalEdges,
      confidence: 0,
      summary: '自动升级为全量诊断',
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }
}
```


---

## 五、升级协议：轻量级 -> 全量诊断

### 5.1 升级触发条件

| # | 条件 | 触发动作 |
|---|------|---------|
| 1 | 同一Goal轻量级再诊断 >= 3次 | 自动升级全量诊断 |
| 2 | Goal执行超原定周期 + 效果持续偏离 | 自动升级全量诊断 |
| 3 | 轻量级再诊断超时 (5分钟) | 自动升级全量诊断 |
| 4 | Goal依赖的其他Goal被废弃 | 级联检测 -> 可升级全量诊断 |
| 5 | GA手动触发 | 立即全量诊断 |

### 5.2 升级决策引擎

```typescript
function shouldEscalateToFull(goal: ActiveGoal, history: ReDiagnosisHistory[]): EscalationDecision {
  // 条件1: 轻量级 >= 3次
  if (goal.reDiagnosisCount >= 3) {
    return {
      escalate: true,
      reason: `已执行 ${goal.reDiagnosisCount} 次轻量级再诊断，仍未解决`,
      trigger: 'count_threshold',
    };
  }

  // 条件2: 超周期 + 持续偏离
  const daysSinceStart = daysBetween(goal.createdAt, new Date().toISOString());
  const plannedDays = goal.plannedDurationDays ?? 90;
  if (daysSinceStart > plannedDays && goal.deviationStatus === 'critical') {
    return {
      escalate: true,
      reason: `已超计划周期 ${plannedDays} 天 (实际 ${daysSinceStart} 天) 且持续偏离`,
      trigger: 'duration_exceeded',
    };
  }

  // 检查最近3次诊断是否都遇到超时
  const recentTimeouts = history.filter(h => h.outcome === 'timeout').length;
  if (recentTimeouts >= 2) {
    return {
      escalate: true,
      reason: '最近轻量级再诊断频繁超时，可能问题复杂度过高',
      trigger: 'timeout_pattern',
    };
  }

  return { escalate: false };
}
```

### 5.3 全量诊断后的可能结果

| 结果 | Goal 状态 | 后续动作 |
|------|----------|---------|
| 诊断确认原判断 | 保持不变 | Goal 继续执行，偏差归因到执行 |
| 诊断调整参数 | `active` | 更新 Goal.metrics 目标值 |
| 诊断推翻原判断 | `abandoned` | Goal 标记 abandoned，重新生成 Proposal |
| 诊断发现新问题 | 原 Goal 继续 + 新 Goal 产生 | 级联生成 |

### 5.4 Goal 废弃后的善后处理

```typescript
interface AbandonmentProtocol {
  /** 废弃的 Goal */
  abandonedGoalId: string;
  /** 新替代方案 Proposal ID */
  replacementProposalId?: string;
  /** 废弃原因 */
  reason: string;
  /** 废弃诊断报告 ID */
  abandonmentDiagnosisId: string;
  /** 依赖此 Goal 的受影响 Goals */
  affectedDependents: string[];
  /** 已产生的部分成果是否保留 */
  preservePartialResults: boolean;
  /** 历史执行数据归档 */
  archiveExecutionData: boolean;  // 默认 true
}
```

---

## 六、导航 -> 学习循环回流

### 6.1 Goal关闭后的知识提取

```typescript
/**
 * GoalExecutionKnowledge — Goal关闭后自动提取的执行知识条目
 * 
 * 写入 PKB（Persistent Knowledge Base），用于联邦进化和跨企业聚合。
 */
interface GoalExecutionKnowledge {
  /** 知识条目ID */
  knowledgeId: string;
  /** 来源 Goal ID */
  goalId: string;
  /** 来源诊断 ID */
  diagnosisId: string;
  
  /** Goal 基本信息 */
  goalTitle: string;
  dimension: string;
  rootCause: string;
  
  /** 执行结果 */
  outcome: 'achieved' | 'partially_achieved' | 'not_achieved';
  /** 是否在计划周期内完成 */
  onTime: boolean;
  /** 实际执行天数 vs 计划天数 */
  actualDays: number;
  plannedDays: number;
  
  /** 偏差分析 */
  deviationClassifier: DeviationClassifier;
  /** 偏差详情 */
  deviationDetail: string;
  /** 关键经验教训 */
  lessons: string[];
  
  /** 数据：用于跨企业聚合 */
  metrics: {
    metricName: string;
    baselineValue: number;
    targetValue: number;
    finalValue: number;
    unit: string;
  }[];
  
  /** 提取时间 */
  extractedAt: string;
}

type DeviationClassifier = 
  | 'execution_failure'   // 执行不力
  | 'market_change'       // 市场变化
  | 'target_too_high'     // 目标过高
  | 'target_too_low'      // 目标过低
  | 'external_shock'      // 外部冲击
  | 'measurement_error';  // 测量误差
```

### 6.2 偏差分类规则

| 偏差模式 | 分类器 | 判定条件 |
|---------|--------|---------|
| 指标持续低于目标但无哨兵异常 | `execution_failure` | deviation < 0 且 无同行业对标异常的哨兵Finding |
| 指标持续低于目标且同行业也下降 | `market_change` | deviation < 0 且 行业基准也下降 (来自联邦数据) |
| 指标持续低于目标且基线建立期数据就不理想 | `target_too_high` | deviation < 0 且 baseline 阶段已预警 |
| 指标显著优于目标 | `target_too_low` | deviation > +30% 持续2个周期 |
| 突然大幅偏离 | `external_shock` | 单次采样偏离 > 50% |
| 数据源不可靠 | `measurement_error` | compute contract 多次 degraded |

### 6.3 ME偏差模式库

```typescript
/**
 * ME偏差模式库 — Mission Execution偏差模式库
 * 
 * 存储在企业级 PKB，GA可查询。
 * >= 3个同类 Goal 产生相同偏差模式 -> 生成行业基准汇总 -> 通知GA。
 */
interface MEDeviationPattern {
  /** 模式ID */
  patternId: string;
  /** 偏差分类器 */
  classifier: DeviationClassifier;
  /** 维度 */
  dimension: string;
  /** 涉及 Goal 数量 */
  goalCount: number;
  /** 行业 */
  industry: string;
  /** 企业规模 */
  teamSizeRange: string;
  /** 模式描述 */
  description: string;
  /** 典型偏差幅度 */
  typicalDeviationRange: { min: number; max: number };
  /** 出现频率 */
  frequency: 'rare' | 'occasional' | 'common' | 'systemic';
  /** 最近一次出现时间 */
  lastOccurredAt: string;
  /** 关联的改进建议 */
  recommendedResponse: string;
}
```

### 6.4 行业基准汇总触发

```typescript
/**
 * 当 PKB 中同一维度+同一偏差分类器+同行业的 Goal 数量 >= 3 时，
 * 自动生成行业基准汇总记录。
 */
function checkBenchmarkThreshold(dimension: string, classifier: DeviationClassifier, industry: string): void {
  const similarGoals = queryPKB({
    dimension,
    classifier,
    industry,
  });

  if (similarGoals.length >= 3) {
    const summary: IndustryBenchmark = {
      dimension,
      classifier,
      industry,
      sampleCount: similarGoals.length,
      avgDeviation: average(similarGoals.map(g => g.metrics[0].finalValue / g.metrics[0].targetValue)),
      pattern: inferPattern(similarGoals),
      generatedAt: new Date().toISOString(),
    };
    storeIndustryBenchmark(summary);
    notifyGA(`新行业基准: ${dimension}/${classifier}/${industry} (样本=${similarGoals.length})`);
  }
}
```

---

## 七、方案哨兵注册 API

### 7.1 registerGoalSentinel

```typescript
/**
 * registerGoalSentinel — 为 Goal 注册专属方案哨兵
 * 
 * 注册到 SentinelRegistry 的独立命名空间：goal-{goalId}-%
 * 与通用哨兵（如 sentinel-cash-flow）隔离，互不干扰。
 * 
 * 契约:
 *   输入: Goal 对象
 *   输出: 注册成功的哨兵 config.id
 *   约束: 每 Goal 最多1个哨兵，每企业最多5个活跃方案哨兵
 */
async function registerGoalSentinel(goal: ActiveGoal): Promise<string> {
  const sentinelId = `sentinel-goal-${goal.goalId}`;

  // 检查企业活跃方案哨兵上限
  const activeCount = await countActiveGoalSentinels(goal.orgId);
  if (activeCount >= 5) {
    throw new GoalSentinelLimitError(
      `企业活跃方案哨兵已达上限 (${activeCount}/5)。请关闭不再需要的 Goal 后重试。`
    );
  }

  // 检查是否已注册
  const existing = getSentinelRegistry().get(sentinelId);
  if (existing) {
    log.warn('[goal-sentinel] already registered', { goalId: goal.goalId });
    return sentinelId;
  }

  const config: SentinelConfig = {
    id: sentinelId,
    name: `方案哨兵: ${goal.title}`,
    description: `追踪 Goal "${goal.title}" 的偏离情况`,
    category: 'growth',
    priority: goal.priority,  // 继承 Goal 优先级
    mode: 'cron',
    cron: goal.priority === 'P0' ? '0 * * * *' : '0 */4 * * *',  // P0: 每小时, 其他: 每4小时
    requiredDataSources: goal.metrics.map(m => m.computeContractId),
    confidenceModel: 'statistical',
    version: '1.0.0',
    computeKind: 'aggregate',  // 聚合三因子
  };

  const sentinel: Sentinel = {
    config,
    async check(context: SentinelContext): Promise<SentinelCheckResult> {
      return goalSentinelCheck(context, goal);
    },
  };

  getSentinelRegistry().register(sentinel);
  
  // 记录注册日志
  await logGoalSentinelRegistration(goal.goalId, sentinelId);

  return sentinelId;
}
```

### 7.2 方案哨兵注销

```typescript
/**
 * unregisterGoalSentinel — Goal 关闭/废弃后注销方案哨兵
 * 
 * 注销后哨兵数据保留30天，可查询但不再执行新的检查。
 * 30天后哨兵数据归档，60天后物理删除。
 */
async function unregisterGoalSentinel(goalId: string): Promise<void> {
  const sentinelId = `sentinel-goal-${goalId}`;
  getSentinelRegistry().unregister(sentinelId);
  await markForArchive(sentinelId);  // 30天后归档
}
```

### 7.3 独立命名空间

| 哨兵分类 | 命名空间前缀 | 示例 | 生命周期管理 |
|---------|------------|------|------------|
| 通用哨兵 | 无前缀 | `sentinel-cash-flow` | CronScheduler 管理 |
| 方案哨兵 | `sentinel-goal-` | `sentinel-goal-g_20260714_001` | Goal 生命周期管理 |
| 自定义哨兵 | `sentinel-custom-` | `sentinel-custom-user-001` | 用户手动管理 |

---

## 八、PolicyEngine(D38)集成

### 8.1 Goal 相关操作权限矩阵

| 操作 | 角色 | SOI | dataLevel | 规则 |
|------|------|-----|-----------|------|
| 创建 Goal | middle_manager, GA | `ontology.write` | S2 | allow |
| 调整 Goal 目标值 | middle_manager (owner) | `ontology.write` | S2 | allow（仅自己的Goal）|
| 调整 Goal 目标值 | middle_manager (非owner) | `ontology.write` | S2 | deny |
| 废弃 Goal | GA | `admin.configure` | S3 | allow |
| 废弃 Goal | middle_manager | `admin.configure` | S3 | deny |
| 触发轻量级再诊断 | middle_manager | `diagnosis.report` | S2 | allow（需 PolicyEngine 检查再诊断权限）|
| 触发全量诊断 | GA | `diagnosis.report` | S3 | allow |
| 查看部门工作台 | middle_manager | `diagnosis.report` | S1 | allow（仅本部门）|
| 查看跨部门工作台 | GA | `diagnosis.report` | S2 | allow |

### 8.2 Goal创建时的PolicyEngine检查

```typescript
async function createGoalWithPolicyCheck(
  proposal: Proposal,
  actor: { role: string; departmentId: string }
): Promise<Goal | PolicyDeniedError> {
  const request: AccessRequest = {
    role: actor.role,
    dataLevel: 'S2',
    soi: StandardOperations.ONTOLOGY_WRITE,
  };

  const decision = policyEngine.evaluate(request);

  if (!decision.allow) {
    return new PolicyDeniedError({
      code: 'POLICY_DENIED',
      phase: 'goal_creation',
      retryable: false,
      message: `无权创建Goal: ${decision.denyReason}`,
    });
  }

  return createGoal(proposal, actor);
}
```

### 8.3 Proposal确认时的PolicyEngine检查

```typescript
async function confirmProposalWithPolicy(
  proposalId: string,
  selectedOption: number,
  actor: { role: string }
): Promise<ProposalConfirmResult> {
  // 检查：只有 middle_manager 和 GA 可以确认方案
  const decision = policyEngine.evaluate({
    role: actor.role,
    dataLevel: 'S2',
    soi: StandardOperations.ONTOLOGY_WRITE,
  });

  if (!decision.allow) {
    throw new PolicyDeniedError({
      code: 'POLICY_DENIED',
      phase: 'proposal_confirmation',
      retryable: false,
      message: `无权确认方案: ${decision.denyReason}`,
    });
  }

  return confirmProposal(proposalId, selectedOption);
}
```

### 8.4 再诊断权限检查

```typescript
async function checkReDiagnosisPermission(
  goalId: string,
  actor: { role: string; departmentId: string }
): Promise<boolean> {
  const goal = await getGoal(goalId);
  
  // 中层只能对自己部门的 Goal 发起再诊断
  if (actor.role === 'middle_manager') {
    if (goal.ownerDeptId !== actor.departmentId) {
      return false;
    }
    // 且该Goal的再诊断次数未超限（< 3次，超过自动升级全量）
    if (goal.reDiagnosisCount >= 3) {
      return false;  // 需 GA 触发全量诊断
    }
  }

  // PolicyEngine 最终裁决
  const decision = policyEngine.evaluate({
    role: actor.role,
    dataLevel: 'S2',
    soi: StandardOperations.DIAGNOSIS_REPORT,
  });

  return decision.allow;
}
```

---

## 九、代码改动清单

### 9.1 需修改的文件（7个）

| # | 文件路径 | 修改内容 | 影响 |
|---|---------|---------|------|
| 1 | `packages/engine-core/src/pipeline/diagnosis/types.ts` | 新增 `ActionRecommendation` 接口（如果不存在）；`StandardExpertReport` 增加 `actionRecommendations` 字段 | 诊断报告产出增加可执行建议 |
| 2 | `src/agent/sentinel-service.ts` | 新增 `getGoalWorkspaceAlerts(goalId)` / `getDepartmentWorkspace(deptId)` 方法 | L2 编排层暴露工作台数据接口 |
| 3 | `src/sentinel/types.ts` | `SentinelCategory` 联合类型增加 `'growth'`；`SentinelConfig` 增加 `computeKind?: 'aggregate'` | 方案哨兵注册兼容 |
| 4 | `src/sentinel/sentinel-runner.ts` | `runSentinelForTeam` 增加 Goal 命名空间过滤逻辑 | 方案哨兵隔离于通用哨兵 |
| 5 | `src/security/policy-engine.ts` | `StandardOperations` 增加 `GOAL_ADJUST: 'goal.adjust'` / `GOAL_ABANDON: 'goal.abandon'`；策略规则表增加 Goal 操作规则 | 导航操作的权限控制 |
| 6 | `src/routes/sentinel.ts` | 新增 `GET /api/workspace/:deptId` 路由 | L1 暴露工作台 API |
| 7 | `packages/engine-core/src/pipeline/diagnosis/expert-prompts.ts` | 增加轻量级再诊断 prompt 模板（minimal context 模式） | 轻量级再诊断的专家调度 |

### 9.2 需新增的文件（7个）

| # | 文件路径 | 内容 | 说明 |
|---|---------|------|------|
| 1 | `src/growth/workspace-types.ts` | 第四章全部 TypeScript 接口定义 | 工作台数据模型，契约优先 |
| 2 | `src/growth/workspace-builder.ts` | `buildDepartmentWorkspace(deptId)` — 聚合 GraphStore + Sentinel + Proposal 数据构建工作台 | 工作台数据聚合器 |
| 3 | `src/growth/next-action-engine.ts` | `computeNextAction(workspace)` — 第三节决策树完整实现 | nextAction 推荐引擎 |
| 4 | `src/growth/dnd-engine.ts` | `shouldDeliver(alert, dnd)` — 第四节免打扰规则引擎完整实现 | 免打扰规则引擎 |
| 5 | `src/growth/goal-sentinel.ts` | `registerGoalSentinel(goal)` / `goalSentinelCheck(context, goal)` — 方案哨兵注册+三因子检查 | 方案哨兵适配器 |
| 6 | `src/growth/lightweight-diagnosis.ts` | `lightweightReDiagnosis(input)` — 轻量级再诊断完整实现 | 轻量级再诊断调度 |
| 7 | `src/growth/knowledge-feedback.ts` | `extractGoalKnowledge(goal)` / `checkBenchmarkThreshold(...)` — 知识回流+行业基准汇总 | 导航->学习循环回流 |

### 9.3 测试文件清单

| # | 文件路径 | 覆盖 |
|---|---------|------|
| 1 | `src/growth/__tests__/workspace-builder.test.ts` | 正常/降级/边界 |
| 2 | `src/growth/__tests__/next-action-engine.test.ts` | 10条决策规则 |
| 3 | `src/growth/__tests__/dnd-engine.test.ts` | P0/P1/P2 + 免打扰时段 + 融合 |
| 4 | `src/growth/__tests__/goal-sentinel.test.ts` | 注册/三因子/上限/注销 |
| 5 | `src/growth/__tests__/lightweight-diagnosis.test.ts` | 正常/超时/升级 |
| 6 | `src/growth/__tests__/knowledge-feedback.integration.test.ts` | PKB写入/基准汇总 |
| 7 | `src/growth/__tests__/e2e-navigation-loop.integration.test.ts` | 端到端：诊断->Proposal->Goal->偏离->再诊断 |

---

## 十、接口与路由总结

### 10.1 新增 L1 API 路由

| 方法 | 路径 | 功能 | 返回类型 |
|------|------|------|---------|
| `GET` | `/api/workspace/:deptId` | 获取部门工作台全量数据 | `DepartmentWorkspace` |
| `GET` | `/api/workspace/:deptId/goals` | 获取部门活跃目标列表 | `ActiveGoal[]` |
| `GET` | `/api/workspace/:deptId/alerts` | 获取部门告警（受免打扰过滤） | `WorkspaceAlert[]` |
| `GET` | `/api/workspace/:deptId/next-action` | 获取推荐下一步行动 | `NextAction` |
| `POST` | `/api/goals/:goalId/dispute` | 提交异议 | `DisputeSubmission` |
| `POST` | `/api/goals/:goalId/trigger-re-diagnosis` | 手动触发轻量级再诊断 | `GoalAdjustmentProposal` |
| `PUT` | `/api/goals/:goalId/adjust` | 调整Goal（需权限检查） | `Goal` |
| `DELETE` | `/api/goals/:goalId` | 废弃Goal（仅GA） | `AbandonmentProtocol` |
| `GET` | `/api/goals/:goalId/evidence-chain` | 获取证据链 | `DeviationDetail` |
