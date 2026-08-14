# 第四章：02与03的诊断流程接口

> 权威文档02 — 方向有效性监测引擎 | v1.0 | 2026-07-22
> 依赖: 第一章 方向失效评估、第二章 四个感知断裂点检测、第三章 NCI子模块
> 下游: 权威文档03 诊断引擎（消费方向失效信号+偏离范围约束）

---

## 零、接口定位

本章定义02（方向有效性监测引擎）与03（诊断引擎）之间的完整函数签名级接口。每一个函数签名都是契约——02产出什么数据，03消费什么数据，在什么条件下触发，以什么格式传递。

**核心设计原则**：
- 02不直接调用03——通过事件总线（`DiagnosisTriggerEvent`）传递信号
- 03收到触发信号后，根据02携带的`constraint`决定诊断范围（缩量诊断/全量诊断）
- 所有接口返回`Promise<ResultType>`，异常通过degraded标记传播

---

## 一、方向失效 → 触发03诊断的完整链路

### 1.1 核心契约

```typescript
/**
 * 方向失效触发诊断事件
 *
 * 02引擎检测到方向失效后，通过事件总线将此事件发射给03诊断编排器。
 * 03收到后决定诊断策略（缩量/全量）。
 *
 * @emitter  DirectionMonitor (src/l3/direction-monitor/monitor.ts)
 * @consumer DiagnosisOrchestrator (packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator.ts)
 * @eventName 'synova:direction-failure-detected'
 *
 * @contract 铁律47: 此接口为02→03的唯一边界契约。新增/修改字段必须同步双方。
 */
interface DirectionFailureTriggerEvent {
  /** 事件唯一标识 */
  eventId: string;
  /** 事件类型 */
  eventType: 'direction_failure_detected';

  /** 触发此事件的方向监测结果 */
  source: {
    /** 方向监测引擎实例 */
    monitorId: string;
    /** 方向有效性判定 */
    directionValidity: DirectionValidityResult;
    /** 触发的断裂点 */
    fracturePoints: FracturePointState;       // 来源：第二章 §七接口
  };

  /** ═══ 关键：约束诊断范围 ═══ */
  constraint: DiagnosisConstraint;

  /** 时间 */
  detectedAt: string;                          // ISO-8601
  emittedAt: string;                           // ISO-8601

  /** 降级 */
  degraded: boolean;
  degradedReason?: string;
}
```

### 1.2 方向有效性判定结果

```typescript
/**
 * 方向有效性判定结果
 *
 * 这是02引擎的核心输出，从方向锚定+趋势偏离+断裂点检测综合得出。
 */
interface DirectionValidityResult {
  /** 当前诊断周期ID — 引用文档03的诊断周期定义 */
  diagnosisCycleId: string;           // 来源：权威文档03 CronScheduler诊断周期

  /** 判定结果 */
  assessment: {
    /** 方向状态 */
    status: 'direction_valid' | 'direction_at_risk' | 'direction_failed';
    /** 是否触发诊断 */
    triggerDiagnosis: boolean;
    /** 触发原因：断裂点或趋势偏离 */
    triggerReason: string;
    /** 置信度 */
    confidence: number;               // 0-1
  };

  /** 偏离范围 — 02监测阶段已识别的偏离参数和子循环 */
  deviationScope: {
    /** 偏离的因果边ID列表（P0级） */
    deviatedEdges: string[];           // 如 ['E-23', 'E-30', 'E-37']
    /** 偏离的子循环ID列表 */
    deviatedSubCycles: string[];       // 如 ['cash-flow', 'customer']
    /** 偏离持续周期数 */
    consecutiveDeviatedCycles: number;
    /** 各偏离边的sigma值 */
    edgeDeviations: Record<string, {
      currentSigma: number;
      baselineMean: number;
      deviationDirection: 'positive' | 'negative';
    }>;
  };

  /** 断裂点触发详情 */
  fractureTrigger: {
    /** 触发断裂点 */
    triggeredPoints: ('silence' | 'denial' | 'knowing_doing_gap' | 'validation_fracture')[];
    /** 最终失效模式映射 */
    mappedFailureMode: 'directional_failure' | 'execution_problem';
    /** 映射依据 */
    mappingReason: string;
  };

  /** 是否处于方向切换过渡期 */
  inTransitionPeriod: boolean;
  transitionPeriod?: {
    startedAt: string;
    endsAt: string;
    relaxedThreshold: number;         // 2.5sigma（正常1.5sigma）
  };

  /** 时间 */
  evaluatedAt: string;
}
```

### 1.3 诊断约束

```typescript
/**
 * 诊断约束 — 02传递给03的范围限定
 *
 * 03收到此约束后，不跑全量42边+8专家。
 * 只诊断已偏离的子循环和相关因果边。
 *
 * @contract 铁律47: 此接口的每个字段必须与03诊断编排器的接收参数对齐。
 */
interface DiagnosisConstraint {
  /** 约束类型 */
  type: 'scoped' | 'full';

  /** 缩量诊断参数（type='scoped'时必填） */
  scoped?: {
    /** 仅诊断这些因果边 */
    edgeIds: string[];                // 如 ['E-23', 'E-30', 'E-37', 'E-13']
    /** 仅运行这些子循环的溢出评估 */
    subCycleIds: string[];
    /** 仅激活与这些边相关的专家 */
    expertTypes: ExpertType[];        // 如 ['finance', 'strategy']
    /** 缩量原因 */
    reason: string;                   // 如 'direction_failure_scoped_diagnosis'
  };

  /** 全量诊断条件（type='full'时） */
  full?: {
    /** 全量诊断触发原因 */
    reason: 'regular_checkup' | 'ga_manual_request' | 'emergency';
  };

  /** 02已识别的已知信息 — 传递给03避免重复计算 */
  knownContext: {
    /** 已偏离边的最新参数值 */
    deviatedEdgeParams: Record<string, number>;
    /** 已触发的断裂点信息 */
    fracturePointSummary: string;     // 人话描述，供专家参考
    /** 该方向的NCI评分（如果已计算） */
    nciScore?: number;
  };
}
```

---

## 二、03诊断编排器的接收接口

### 2.1 诊断触发入口

```typescript
/**
 * 03诊断编排器 — 接收02方向失效信号
 *
 * 此函数是03诊断系统的入口，消费DirectionFailureTriggerEvent。
 *
 * @function receiveDirectionFailureTrigger
 * @entry 03诊断编排器入口
 * @param event - 02发射的方向失效事件
 * @returns Promise<DiagnosisTriggerAck> — 03的响应确认
 *
 * @layer L2 (编排层) — DiagnosisOrchestrator
 * @location packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator.ts
 */
function receiveDirectionFailureTrigger(
  event: DirectionFailureTriggerEvent
): Promise<DiagnosisTriggerAck>;

interface DiagnosisTriggerAck {
  /** 诊断执行ID */
  diagnosisExecutionId: string;
  /** 诊断策略 */
  strategy: 'scoped' | 'full';
  /** 约束摘要 */
  constraint: {
    edges: string[];
    subCycles: string[];
    experts: ExpertType[];
  };
  /** 预估完成时间 */
  estimatedCompletionAt: string;
  /** 诊断入口URL */
  statusCheckUrl: string;             // GET /api/diagnosis/{executionId}/status
}
```

### 2.2 缩量诊断运行

```typescript
/**
 * 缩量诊断运行器
 *
 * 只诊断02指定的偏离边和子循环，不跑全量42边+8专家。
 * 全量诊断只在定期体检时运行（默认14天一次，引用文档07 §B1.2）。
 *
 * @function runScopedDiagnosis
 * @param constraint - 02传递的诊断约束
 * @param context - 02已知的偏离上下文（避免重复计算）
 * @returns Promise<ScopedDiagnosisReport>
 *
 * @layer L2 (编排层) — DiagnosisOrchestrator
 */
function runScopedDiagnosis(
  constraint: DiagnosisConstraint,
  context: KnownDeviatedContext
): Promise<ScopedDiagnosisReport>;

interface ScopedDiagnosisReport {
  diagnosisExecutionId: string;
  constraint: DiagnosisConstraint;

  /** 缩量诊断的根因分析 */
  findings: Array<{
    /** 根因类型 */
    rootCauseType: 'execution_problem' | 'directional_problem' | 'mixed';
    /** 涉及的因果边 */
    edgesAnalyzed: string[];
    /** 根因结论 */
    conclusion: string;
    /** 置信度 */
    confidence: number;
  }>;

  /** 激活的专家（缩量——只激活相关专家） */
  activatedExperts: ExpertType[];

  /** 与02的断裂点判定对比 */
  fractureValidation: {
    /** 03诊断是否确认了02的断裂点判定 */
    fractureConfirmed: boolean;
    /** 差异说明（如03发现不同的根因） */
    discrepancyNote?: string;
  };

  /** 降级 */
  degraded: boolean;
}
```

---

## 三、诊断两种输出分支

### 3.1 分支路由

```typescript
/**
 * 诊断输出分支路由器
 *
 * 03诊断完成后，根据根因类型路由到不同处理分支。
 *
 * @function routeDiagnosisOutcome
 * @param report - 03诊断报告（缩量或全量）
 * @returns Promise<DiagnosisOutcomeRoute>
 *
 * @layer L2 (编排层) — ConversationEngine
 */
function routeDiagnosisOutcome(
  report: ScopedDiagnosisReport | FullDiagnosisReport
): Promise<DiagnosisOutcomeRoute>;
```

### 3.2 分支一：执行问题 → 调整Goal

```typescript
/**
 * 执行问题分支
 *
 * 03诊断确认根因是执行问题（而非方向问题）。
 * 动作：直接调整现有Goal——修改度量/资源/时间线。
 * 不触发NCI。
 */
interface ExecutionProblemBranch {
  branch: 'execution_problem';

  /** 诊断结论 */
  diagnosisConclusion: {
    /** 根因是执行问题 */
    rootCause: 'execution_problem';
    /** 具体问题类型 */
    problemType: 'resource_misallocation' | 'metric_misbinding' | 'timeline_unrealistic' | 'capability_gap' | 'coordination_failure';
    /** 03确认02的断裂点：知行差距 */
    confirmedFracturePoint: 'knowing_doing_gap';
  };

  /** Goal调整动作 */
  goalAdjustments: Array<{
    /** 目标Goal ID */
    goalId: string;
    /** 调整类型 */
    adjustmentType: 'reallocate_resources' | 'rebaseline_metrics' | 'extend_timeline' | 'split_goal' | 'reassign_owner';
    /** 调整详情 */
    adjustmentDetail: string;
    /** 调整后预期效果 */
    expectedEffect: string;
  }>;

  /** 下一步 */
  nextAction: {
    action: 'adjust_goals';
    /** 调整后进入重新监测（不触发方向失效过渡期） */
    reMonitor: boolean;
    /** 下次检查时间 */
    nextCheckAt: string;
  };
}
```

### 3.3 分支二：方向问题 → 确认方向失效 → 启动NCI

```typescript
/**
 * 方向问题分支
 *
 * 03诊断确认根因是方向问题。
 * 动作：确认方向失效 → 询问企业是否需要重新选方向 → 如需→启动NCI。
 */
interface DirectionalProblemBranch {
  branch: 'directional_problem';

  /** 诊断结论 */
  diagnosisConclusion: {
    rootCause: 'directional_problem';
    /** 03确认02的断裂点（可以是沉默/否认/验证断裂任一） */
    confirmedFracturePoint: 'silence' | 'denial' | 'validation_fracture';
    /** 可选的行业基准交叉验证（如果E-03 EXTERNAL_ECHO可用） */
    industryCrossValidation?: {
      available: boolean;
      marketGrowthTrend: 'declining' | 'flat' | 'growing';
      competitivePressure: number;      // 0-1
    };
  };

  /** 下一步分支 */
  nextAction: {
    /** 动作：确认方向失效 */
    action: 'confirm_direction_failure';

    /** 询问企业 */
    enterpriseQuery: {
      question: string;                // "当前方向已失效。是否需要探索新的方向？"
      options: [
        { choice: 'yes', trigger: 'launch_nci' },
        { choice: 'no', trigger: 'continue_monitoring_with_warning' },
        { choice: 'defer', trigger: 'schedule_reassessment', delayDays: 30 }
      ];
    };
  };

  /** 如果企业选yes → 启动NCI */
  nciLaunch?: {
    /** 携带02+03已识别的全部上下文 */
    context: {
      deviationScope: DirectionValidityResult['deviationScope'];
      diagnosisRootCause: string;
      failedDirectionId: string;
    };
    /** NCI启动参数 */
    parameters: {
      /** 从NCI候选池启动（含休眠信号重新激活检查） */
      activateDormantSignals: boolean;
      /** 当前ODC（来自NCI子模块预计算） */
      currentODC: number;
      /** 是否处于背水一战场景（ODC放宽） */
      lastStandMode: boolean;
    };
  };
}
```

### 3.4 分支路由函数实现

```typescript
function routeDiagnosisOutcome(
  report: ScopedDiagnosisReport | FullDiagnosisReport
): Promise<DiagnosisOutcomeRoute> {
  // 取第一个根因分析的结论（缩量诊断通常只有1-2条finding）
  const primaryFinding = report.findings[0];

  switch (primaryFinding.rootCauseType) {
    case 'execution_problem':
      return Promise.resolve({
        branch: 'execution_problem',
        diagnosisConclusion: {
          rootCause: 'execution_problem',
          problemType: classifyExecutionProblem(primaryFinding),
          confirmedFracturePoint: 'knowing_doing_gap',
        },
        goalAdjustments: generateGoalAdjustments(primaryFinding),
        nextAction: {
          action: 'adjust_goals',
          reMonitor: true,
          nextCheckAt: addDays(new Date(), 30).toISOString(),
        },
      });

    case 'directional_problem':
      return Promise.resolve({
        branch: 'directional_problem',
        diagnosisConclusion: {
          rootCause: 'directional_problem',
          confirmedFracturePoint: deriveFracturePoint(primaryFinding),
          industryCrossValidation: queryIndustryBaseline(),
        },
        nextAction: {
          action: 'confirm_direction_failure',
          enterpriseQuery: {
            question: '当前方向已失效。是否需要探索新的方向？',
            options: [
              { choice: 'yes', trigger: 'launch_nci' },
              { choice: 'no', trigger: 'continue_monitoring_with_warning' },
              { choice: 'defer', trigger: 'schedule_reassessment', delayDays: 30 },
            ],
          },
        },
        nciLaunch: {
          context: {
            deviationScope: report.constraint.scoped?.deviatedEdgeParams || {},
            diagnosisRootCause: primaryFinding.conclusion,
            failedDirectionId: report.constraint.scoped?.subCycleIds[0] || '',
          },
          parameters: {
            activateDormantSignals: true,
            currentODC: getPrecomputedODC(),
            lastStandMode: checkLastStandMode(),
          },
        },
      });

    case 'mixed':
      // 混合型：执行问题 + 方向问题
      return resolveMixedBranch(primaryFinding);

    default:
      throw new Error(`Unknown rootCauseType: ${primaryFinding.rootCauseType}`);
  }
}

type DiagnosisOutcomeRoute = ExecutionProblemBranch | DirectionalProblemBranch;
```

---

## 四、NCI候选方向 → Proposal → 三选一 → Goal创建

### 4.1 完整链路

```typescript
/**
 * NCI候选方向 → Proposal → Goal的完整链路
 *
 * 此链路消费NCI子模块输出的候选列表，复用文档13的增长导航Proposal三选一机制。
 *
 * 链路: NCI候选列表 → Proposal(带'高风险-高回报'标签) → 三选一确认 → Goal创建
 *
 * @layer L2 (编排层) — ConversationEngine
 */
```

### 4.2 NCI候选到Proposal的转换

```typescript
/**
 * NCI候选方向 → Proposal转换器
 *
 * @function convertNCICandidatesToProposals
 * @param nciCandidates - NCI子模块输出的候选方向列表
 * @param enterpriseContext - 企业当前上下文（ODC、资源约束、过渡期状态）
 * @returns Promise<NCIDerivedProposal[]>
 *
 * @layer L2 — ConversationEngine
 */
function convertNCICandidatesToProposals(
  nciCandidates: NCICandidate[],
  enterpriseContext: EnterpriseContext
): Promise<NCIDerivedProposal[]>;

/**
 * NCI衍生的Proposal
 *
 * 继承文档13 Proposal的类型定义，增加NCI特定字段。
 * 复用文档13第二章 ProposalTypeScript接口的所有字段。
 */
interface NCIDerivedProposal {
  /** ═══ 继承文档13第二章 Proposal的所有字段 ═══ */
  id: string;
  diagnosisReportId: string;
  title: string;
  department: string;
  paths: [ProposalPath, ProposalPath, ProposalPath];  // 三选一
  selectedPathIndex: number;
  confirmedByGa: boolean;
  context: ProposalContext;
  status: ProposalStatus;
  timeline: ProposalTimeline;

  /** ═══ NCI特有字段 ═══ */
  nciContext: {
    /** NCI评分 */
    nciScore: number;
    /** NCI分层：high/medium/low */
    nciTier: 'high' | 'medium' | 'low';
    /** 非共识类型 */
    nonConsensusType: 'cost_fracture' | 'value_network_mismatch';
    /** STM时机成熟度 */
    stmScore: number;
    stmZone: 'too_early' | 'edge' | 'window_open' | 'mature';
    /** ODC消化能力评估 */
    odcAssessment: {
      currentODC: number;
      requiredODC: number;
      feasible: boolean;
    };
    /** 高风险-高回报标签 */
    riskRewardLabel: string;         // 如 '高风险-高回报：成本断裂型非共识，理论成本可降至行业30%'
    /** 强制共识标记 */
    forcedConsensusDetected: boolean;
    /** 数据真空标记 */
    dataVacuumMode: boolean;
  };

  /** 三选一路径中的NCI增强 */
  paths: [
    NCIDerivedProposalPath,    // 路径1: 激进投入 — 立即设定Goal
    NCIDerivedProposalPath,    // 路径2: 试点验证 — 小规模验证后决定
    NCIDerivedProposalPath     // 路径3: 保留观望 — 进入远期候选池，条件满足时重新评估
  ];
}

interface NCIDerivedProposalPath extends ProposalPath {
  /** NCI路径增强 */
  nciPathAnnotation: {
    riskLevel: 'high' | 'medium' | 'low';
    nciAlignment: string;     // 该路径如何利用/规避NCI识别到的风险
    stmConsideration: string; // 时机考虑（"基础设施已就绪" vs "可能太早"）
  };
}
```

### 4.3 Proposal三选一 → Goal创建

```typescript
/**
 * NCI Proposal三选一确认 → Goal创建
 *
 * 复用文档13第二章的Proposal确认机制和第一章的Goal创建流程。
 *
 * 唯一差异：NCI衍生的Goal增加nciContext字段用于长期验证归因分解。
 *
 * @function createGoalFromNCIProposal
 * @param proposal - 已确认选择的NCI Proposal
 * @param selectedPathIndex - 中层选择的路径索引 (0-2)
 * @returns Promise<Goal> — 带nciContext的Goal
 *
 * @layer L2 — ConversationEngine
 */
function createGoalFromNCIProposal(
  proposal: NCIDerivedProposal,
  selectedPathIndex: number
): Promise<Goal>;

/**
 * NCI衍生的Goal扩展字段
 *
 * 继承文档13第一章 Goal的完整28字段接口，增加：
 */
interface NCIDerivedGoal extends Goal {
  /** NCI上下文 — 用于长期验证归因分解 */
  nciContext: {
    nciScore: number;
    nciTier: 'high' | 'medium' | 'low';
    nonConsensusType: 'cost_fracture' | 'value_network_mismatch';
    stmScore: number;
    /** ODC评估 */
    odcAtCreation: number;
    /** 归因分解基线 */
    attributionBaseline: {
      preGoalROI: number;
      physicalAdvantageAttributionEstimate: number;
      externalEventAttributionEstimate: number;
    };
    /** 来源NCI候选ID */
    sourceCandidateId: string;
  };

  /** 高风险-高回报标记（在Goal title和priority中体现） */
  highRiskHighReward: boolean;

  /** 验证周期缩短标记 */
  validationPolicy: {
    /** NCI Goal的验证周期比普通Goal短：30天（普通Goal 90天） */
    closedLoopValidationDays: 30;
    /** 需要更密集的方案哨兵监测：每日 -> 每日+每4小时关键指标快照 */
    sentinelFrequency: 'daily' | '4hour_key_metrics';
  };
}
```

---

## 五、方向切换过渡期

### 5.1 过渡期定义

方向切换后90天内为过渡期。在此期间的诊断阈值和方向失效判定有特殊规则。

```typescript
/**
 * 方向切换过渡期管理器
 *
 * @function manageDirectionTransition
 * @param newDirectionId - 新方向ID
 * @param previousDirectionId - 被替换的旧方向ID
 * @returns Promise<TransitionPeriod>
 *
 * @layer L3 (洞察层) — DirectionMonitor
 */
function manageDirectionTransition(
  newDirectionId: string,
  previousDirectionId: string
): Promise<TransitionPeriod>;

interface TransitionPeriod {
  /** 过渡期ID */
  transitionId: string;

  /** 旧方向信息 */
  previousDirection: {
    directionId: string;
    failureConfirmedAt: string;
    failureReason: string;             // 来自DirectionFailureTriggerEvent
  };

  /** 新方向信息 */
  newDirection: {
    directionId: string;
    goalSetAt: string;
    goalId: string;                    // 新方向的第一个Goal
    nciProposalId?: string;           // 如果是NCI选出的方向
  };

  /** 过渡期参数 */
  parameters: {
    /** 过渡期时长 */
    durationDays: 90;
    /** 开始时间 */
    startedAt: string;
    /** 结束时间 */
    endsAt: string;
    /** 放宽的偏离阈值 — 从1.5sigma放宽到2.5sigma */
    relaxedThresholdSigma: 2.5;
    /** 正常阈值（过渡期结束后恢复） */
    normalThresholdSigma: 1.5;
  };

  /** 过渡期规则 */
  rules: {
    /** 不触发方向失效信号 */
    suppressDirectionFailure: true;
    /** 趋势偏离检测继续运行（使用放宽阈值） */
    trendDeviationActive: true;
    /** 感知断裂点检测继续运行（但结果降级为warning而非方向失效） */
    fractureDetectionDowngraded: true;
    /** 过渡期结束时自动建立新方向基线 */
    autoEstablishBaseline: true;
  };

  /** 过渡期状态 */
  status: 'active' | 'completed';
}
```

### 5.2 过渡期与方向失效检测的交互

```typescript
/**
 * 过渡期内方向监测的阈值调整
 *
 * 在过渡期内，方向有效性判定使用放宽的2.5sigma阈值。
 * 断裂点检测继续运行但结果不触发方向失效——转为warning。
 *
 * @function evaluateInTransition
 * @param monitorInput - 方向监测输入（与正常周期相同）
 * @param transition - 当前过渡期参数
 * @returns Promise<DirectionValidityResult>
 */
function evaluateInTransition(
  monitorInput: DirectionMonitorInput,
  transition: TransitionPeriod
): Promise<DirectionValidityResult> {
  const now = new Date().toISOString();

  // 检查是否仍在过渡期内
  if (now > transition.parameters.endsAt) {
    // 过渡期结束 → 恢复正常监测 + 建立新基线
    establishNewBaseline(transition.newDirection.goalId);
    return evaluateDirectionValidity(monitorInput);  // 正常评估
  }

  // 使用放宽阈值
  const result = await evaluateDirectionValidity(
    monitorInput,
    { sigmaThreshold: transition.parameters.relaxedThresholdSigma }
  );

  // 即使检测到偏离，也不标记为"方向失效"
  if (result.assessment.status === 'direction_failed') {
    return {
      ...result,
      assessment: {
        ...result.assessment,
        status: 'direction_at_risk',          // 降级为风险
        triggerDiagnosis: false,              // 不触发诊断
        triggerReason: `${result.assessment.triggerReason}（过渡期内，不触发方向失效）`,
      },
      inTransitionPeriod: true,
      transitionPeriod: transition,
    };
  }

  return result;
}
```

### 5.3 过渡期结束时的基线建立

```typescript
/**
 * 过渡期结束时自动建立新方向基线
 *
 * @function establishNewBaseline
 * @param newGoalId - 新方向的第一个Goal ID
 * @returns Promise<BaselineEstablished>
 */
function establishNewBaseline(
  newGoalId: string
): Promise<BaselineEstablished>;

interface BaselineEstablished {
  goalId: string;
  /** 基线建立时间 */
  establishedAt: string;
  /** 基线参数 — 各P0边在过渡期末的值 */
  baselineParams: Record<string, {
    edgeId: string;
    meanValue: number;
    sigmaValue: number;
    /** 样本量（过渡期90天内的数据点数） */
    sampleSize: number;
  }>;
  /** 恢复正常监测 */
  resumedNormalMonitoring: boolean;
  resumedAt: string;
}
```

---

## 六、02引擎与主Agent的通信接口

### 6.1 HTTP API端点

```typescript
/**
 * 02方向监测引擎对外暴露的HTTP端点
 *
 * @layer L1 (交互层) — routes/
 */

/** GET /api/direction/status — 获取当前方向有效性状态 */
interface GetDirectionStatusResponse {
  directionValidity: DirectionValidityResult;
  fracturePoints: FracturePointState;
  inTransition: boolean;
  lastEvaluatedAt: string;
  nextScheduledEvaluationAt: string;
  degraded: boolean;
}

/** POST /api/direction/trigger — GA手动触发方向有效性评估 */
interface TriggerDirectionCheckRequest {
  enterpriseId: string;
  reason?: string;                     // GA可选备注
}
interface TriggerDirectionCheckResponse {
  evaluationId: string;
  startedAt: string;
  estimatedCompletionAt: string;
  statusCheckUrl: string;              // GET /api/direction/status/{evaluationId}
}

/** POST /api/direction/new-direction — GA确认选新方向（触发NCI链路） */
interface RequestNewDirectionRequest {
  enterpriseId: string;
  confirmedFailure: boolean;           // GA确认方向失效
  preferNCI: boolean;                  // 是否通过NCI选择新方向
}
interface RequestNewDirectionResponse {
  nciLaunched: boolean;
  nciExecutionId: string;
  /** 如果preferNCI=false，返回手动输入新方向的指引 */
  manualDirectionPrompt?: string;
}
```

### 6.2 事件总线接口

```typescript
/**
 * 02引擎通过事件总线发射的关键事件
 *
 * @layer L2-L3
 */

/** 方向有效 → 静默（不发射事件——继续监测） */

/** 方向存在风险 → 发射预警 */
interface DirectionRiskWarningEvent {
  eventType: 'direction_risk_warning';
  directionId: string;
  riskLevel: 'moderate' | 'elevated';
  deviations: string[];               // 偏离的边/子循环名称（人话）
  recommendedAction: 'continue_monitoring' | 'schedule_early_diagnosis';
}

/** 方向失效 → 发射方向失效（触发03诊断） */
type DirectionFailureEvent = DirectionFailureTriggerEvent;  // 见 §1.1

/** 方向失效 + 需重新选 → 发射NCI启动 */
interface NCIRequiredEvent {
  eventType: 'nci_required';
  directionId: string;
  failedDirectionName: string;
  failureContext: DirectionValidityResult;
  enterpriseConfirmed: boolean;        // 企业是否已确认需要新方向
  nciParameters: NCILaunchParameters;
}

/** 过渡期开始 */
interface TransitionStartedEvent {
  eventType: 'direction_transition_started';
  transitionId: string;
  previousDirectionId: string;
  newDirectionId: string;
  startedAt: string;
  endsAt: string;
}

/** 过渡期结束 + 基线建立 */
interface TransitionCompletedEvent {
  eventType: 'direction_transition_completed';
  transitionId: string;
  newDirectionId: string;
  baselineEstablished: BaselineEstablished;
  completedAt: string;
}
```

---

## 七、测试规范

### 7.1 测试层级

| 层级 | 测试类型 | 数量 | Fixture类型 |
|------|---------|------|-------------|
| L1 | 单元 — DirectionFailureTriggerEvent序列化/反序列化 | 2 | Mock DirectionValidityResult + FracturePointState |
| L1 | 单元 — routeDiagnosisOutcome分支路由 | 4 | execution/mixed/directional:yes/directional:no |
| L1 | 单元 — evaluateInTransition过渡期阈值 | 3 | 过渡期内（不触发）/过渡期结束（建立基线）/未在过渡期 |
| L1 | 单元 — convertNCICandidatesToProposals | 2 | ODC可行方向 / ODC不可行方向 |
| L2a | 集成 — 完整02→03触发链路 | 1 | 真实DirectionFailureTriggerEvent → 03 receiveDirectionFailureTrigger |
| L2a | 集成 — NCI候选→Proposal→Goal | 1 | NCI候选fixture → Proposal → Goal创建 |
| L2c | 集成 — 过渡期完整生命周期 | 1 | 过渡期开始→方向监测→过渡期结束→基线建立 |

### 7.2 接线要求

| 新export | 调用方文件路径 | 调用方函数 |
|----------|--------------|-----------|
| `DirectionFailureTriggerEvent` | `packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator.ts` | `receiveDirectionFailureTrigger()` |
| `DiagnosisConstraint` | `packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator.ts` | `runScopedDiagnosis()` |
| `routeDiagnosisOutcome()` | `packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator.ts` | `handleDiagnosisComplete()` |
| `convertNCICandidatesToProposals()` | `src/agent/conversation-engine.ts` | `handleNCIResults()` |
| `createGoalFromNCIProposal()` | `src/agent/conversation-engine.ts` | `handleProposalConfirmation()` |
| `manageDirectionTransition()` | `src/l3/direction-monitor/transition-manager.ts` | `startTransition()` |
| `evaluateInTransition()` | `src/l3/direction-monitor/monitor.ts` | `evaluateDirectionValidity()` |
| `establishNewBaseline()` | `src/l3/direction-monitor/baseline.ts` | `resetBaseline()` |
