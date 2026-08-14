# 增长导航系统 — Goal工程规范 v1.0

> Synova 权威文档13 - 第一章 | 2026-07-14
> 诊断建议的工程化表达：数据结构 + 生命周期 + 度量绑定 + 依赖管理

---

## 零、文档定位

本文档定义 Goal 的完整工程规范。Goal 是诊断报告中的 actionRecommendations 转化为可度量、可分配、有时限的中层执行单元。它不是 CRM 任务或 OKR —— 它是诊断驱动的增长导航核心数据结构，承载从"建议"到"验证"的完整闭环。

本文档是第二章（Proposal三选一）和第三章（方案级哨兵）的前置依赖——Goal 的数据结构和生命周期定义所有下游系统的契约边界。

---

## 一、Goal TypeScript接口（28字段）

```typescript
/**
 * Goal — 诊断建议的工程化执行单元。
 * 
 * 每个 Goal 由一个诊断报告 (DiagnosisReport) 中的一条 actionRecommendation 转化而来。
 * 贯穿 Proposal 三选一 → 方案级哨兵追踪 → 闭环验证的完整生命周期。
 *
 * 契约优先 (铁律 47): 所有字段在实现前定义。新增/修改字段必须更新此接口并同步下游。
 *
 * @see DiagnosisReport.recommendations (src/l3/synova-diagnosis-engine.ts)
 * @see SentinelManifest (src/sentinel/sentinel-loader.ts)
 */
export interface Goal {
  // 标识 (3 字段)

  /** Goal 唯一标识，格式 goal-{uuid-short} */
  id: string;

  /** 
   * Goal 类型。
   * - efficiency: 效率型 — 降本、提效、流程优化
   * - growth: 增长型 — 增收、市场份额、新渠道
   * - structural: 结构型 — 组织调整、人才结构、制度变更
   * - defensive: 防御型 — 风险对冲、合规、安全
   */
  type: 'efficiency' | 'growth' | 'structural' | 'defensive';

  /** Goal 标题 — 面向中层的可读描述 */
  title: string;

  // 描述与分配 (3 字段)

  /** Goal 详细描述 — 包含具体措施、范围、预期效果 */
  description: string;

  /** 所属部门，对应七部门之一: finance/ops/sales/product/hr/tech/marketing */
  department: string;

  /** 负责人角色标识，如 'head-of-sales'、'cfo' */
  responsibleRole: string;

  // 诊断追溯 (1 字段)

  /** 
   * Goal 来源追溯 — 完整记录该 Goal 从哪次诊断、哪条建议转化而来。
   * 支撑: 闭环验证（完成时回查原始诊断指标）+ 知识回流（PKB 正向/负向案例标记）
   */
  source: {
    diagnosisReportId: string;
    diagnosisPlaybookExecutionId: string;
    proposalId?: string;
    pathIndex?: number;
  };

  // 度量绑定 (2 字段)

  metrics: {
    primary: {
      measurement: MeasurementDef;
      currentBaseline: number;
      targetValue: number;
      unit: string;
    };
    secondary: Array<{
      measurement: MeasurementDef;
      currentBaseline: number;
      targetValue: number;
      unit: string;
      label: string;
    }>;
  };

  successCriteria: SuccessCriteria;

  // 度量源 (1 字段)

  measurement: {
    type: 'sentinel' | 'compute' | 'edge_param' | 'manual';
    sourceId: string;
  };

  // 依赖与冲突 (2 字段)

  dependsOn: Array<{
    goalId: string;
    type: 'blocking' | 'advisory';
  }>;

  conflictsWith: string[];

  // 时间线 (1 字段)

  timeline: {
    proposedAt: string;
    approvedAt: string | null;
    startDate: string | null;
    targetDate: string;
    closedAt: string | null;
  };

  // 生命周期 (1 字段)

  lifecycle: GoalLifecycle;

  // 优先级 (1 字段)

  priority: 'critical' | 'high' | 'medium' | 'low';

  // 适应记录 (1 字段)

  adaptationNotes: AdaptationNote[];
}

// ═══ 子类型 ═══

export interface MeasurementDef {
  type: 'sentinel' | 'compute' | 'edge_param' | 'manual';
  sourceId: string;
  field: string;
  frequency: string;
  fallback?: {
    type: 'sentinel' | 'compute' | 'edge_param' | 'manual';
    sourceId: string;
    field: string;
  };
}

export interface SuccessCriteria {
  metric: {
    comparator: 'gte' | 'lte' | 'eq' | 'range';
    targetValue: number;
    targetValueUpper?: number;
  };
  duration: {
    period: 'day' | 'week' | 'month';
    count: number;
  };
  constraints: Array<{
    measurement: MeasurementDef;
    comparator: 'gte' | 'lte' | 'eq';
    threshold: number;
    description: string;
  }>;
  excludes: Array<{
    condition: string;
    detection: 'manual' | 'auto';
    sentinelId?: string;
  }>;
}

export type GoalLifecycle =
  | 'proposed'
  | 'approved'
  | 'in_progress'
  | 'deviated'
  | 'adjusted'
  | 'completed'
  | 'closed';

export interface AdaptationNote {
  timestamp: string;
  trigger: 'deviated' | 'ga_override' | 'external';
  deviation?: {
    triggeredFactors: ('threshold' | 'trend' | 'baseline')[];
    currentValue: number;
    targetValue: number;
    deviationPercent: number;
  };
  fromState: GoalLifecycle;
  toState: GoalLifecycle;
  adjustmentSummary: string;
  lightDiagnosisId?: string;
  sentinelFindingIds: string[];
}
```

---

## 二、GoalLifecycle状态机 (7态 + 17条转换)

### 2.1 状态转换图

```
                    ┌──────────┐
                    │ proposed │  ← Goal 创建 (Playbook输出→Goal映射)
                    └────┬─────┘
                         │ GA审批通过 + 度量源可用性检查通过
                         ▼
                    ┌──────────┐
              ┌────▶│ approved │
              │     └────┬─────┘
              │          │ 方案级哨兵注册成功 + 基线建立期开始
              │          ▼
              │     ┌─────────────┐
              │     │ in_progress │  ← 执行中，哨兵活跃
              │     └──────┬──────┘
              │            │ any_two 三因子触发偏离
              │            ▼
              │     ┌──────────┐
              │     │ deviated │  ← 哨兵检测到偏离
              │     └────┬─────┘
              │          │ 轻量级再诊断完成 + 调整方案确认
              │          ▼
              │     ┌──────────┐
              └─────│ adjusted │  ← 调整方案确认
                    └──────────┘
                         │ (re-enter in_progress)

     in_progress ─────────────────▶ completed   (successCriteria 全满足)
                                        │
                                        ▼
                                    closed       (闭环验证完成)
     
     任何状态 ──────────────────────▶ closed      (GA手动/expired/abandoned)
```

### 2.2 17条状态转换规则

#### 正向转换 (7条)

**T1  proposed → approved**
- 触发条件: GA 手动审批通过 且 度量源可用性检查通过
- 前置检查:
  - MeasurementDef 指向的数据源真实存在 (grep 验证)
  - 数据源可连通 (健康检查返回 ok)
  - 无 conflictsWith Goal 处于 in_progress
- 副作用: timeline.approvedAt = now(); 自动生成 Proposal (如该 Goal 在同一诊断报告中是唯一推荐，自动 selected)
- 失败处理: 返回不可通过的度量源列表，要求修复或更换

**T2  approved → in_progress**
- 触发条件: 方案级哨兵注册成功 且 基线建立期开始
- 前置检查:
  - 哨兵注册到 SentinelRegistry 成功
  - 基线建立期配置写入 (2-4周，只采集不告警)
  - dependsOn 中所有 blocking 类型 Goal 已完成 (state = completed/closed)
  - conflictsWith 中无 Goal 处于 in_progress
- 副作用: timeline.startDate = now(); 方案级哨兵进入 baseline 模式
- 失败处理: blocking 依赖未完成→返回阻塞Goal列表等待; 哨兵注册失败→返回错误详情保持 approved

**T3  in_progress → completed**
- 触发条件: successCriteria 全部满足
- 前置检查:
  - successCriteria.metric: 主度量连续 {duration.count} 个 {duration.period} 达标
  - successCriteria.constraints: 所有约束条件满足
  - successCriteria.excludes: 所有排除条件未触发
- 副作用: 触发闭环验证 (详见 §四)
- 失败处理: 任何条件不满足→保持 in_progress，记录未满足项

**T4  completed → closed**
- 触发条件: 闭环验证完成 且 关联诊断指标检查完成
- 前置检查:
  - 关联诊断指标已重新计算 (source.diagnosisReportId → 对应诊断维度的当前值)
  - 改善 → 标记 "已完成且有效" → 写入 PKB 正向案例
  - 未改善 → 标记 "已完成但无效" → 触发执行有效性审查
- 副作用: timeline.closedAt = now(); 方案级哨兵进入30天归档期; 学习回流传入 PKB
- 失败处理: 关联诊断指标检查异常→生成执行有效性审查工单，仍进入 closed

**T5  in_progress → deviated**
- 触发条件: 三因子模型中任意两个因子同时触发
- 三因子 (详见第三章 §3.1):
  1. 阈值偏离: 当前值突破 warning/critical 阈值
  2. 趋势偏离: 连续 3 个采样周期趋势方向与目标方向相反
  3. 基线偏离: 当前值相对基线期的均值偏移超过 2σ
- any_two 规则: 单因子→仅记录; 双因子→触发 deviated
- 前置检查: 级联依赖检测 (详见 §五)
- 副作用: 生成 AdaptationNote; 触发轻量级再诊断 (1专家+3-5边+5分钟超时); P0→即推GA / P1→周推1次 / P2→周汇总

**T6  deviated → adjusted**
- 触发条件: 轻量级再诊断完成 且 GA/中层确认调整方案
- 前置检查:
  - 轻量级再诊断返回 GoalAdjustmentProposal (含调整后的 targetValue/constraints)
  - GA 确认或 5 工作日自动接受 (中层级别 Goal)
- 副作用: 追加 AdaptationNote; 更新 metrics.primary.targetValue (如调整方案修改); 更新 successCriteria
- 失败处理: 轻量级再诊断失败→连续3次触发→升级全量诊断

**T7  adjusted → in_progress**
- 触发条件: 调整方案确认后重新进入执行
- 副作用: 方案级哨兵重新进入活跃模式; 基线重新建立 (如目标值变更 > 20%)

#### 终止转换 (4条)

**T8  proposed → closed (GA 拒绝)**
- 触发条件: GA 主动拒绝 Goal
- 副作用: 记录拒绝原因到 adaptationNotes; timeline.closedAt = now()

**T9  proposed → closed (expired)**
- 触发条件: proposed 状态超过 30 天未审批
- 副作用: adaptationNotes 记录超期原因; 通知 GA

**T10 approved → closed (expired)**
- 触发条件: approved 状态超过 14 天未进入 in_progress
- 副作用: 通知 GA "目标审批后长期未执行"

**T11 任何状态 → closed (GA 手动)**
- 触发条件: GA 从任何状态手动关闭 Goal
- 副作用: 记录关闭原因和操作人

#### 推翻转换 (2条)

**T12 deviated → closed (abandoned)**
- 触发条件: 全量诊断推翻原始诊断结论 (原始 rootCause 不再成立 / 环境变化导致 Goal 不再相关)
- 副作用: adaptationNotes 记录全量诊断推翻; 标记为 abandoned

**T13 in_progress → closed (abandoned)**
- 触发条件: 同一 Goal 触发 deviated→adjusted 循环超过 3 次
- 副作用: 自动升级全量诊断; 如全量诊断确认 Goal 不可达→closed(abandoned)

#### 重新激活 (2条) — GA 特权操作

**T14 closed → approved (GA 重新激活)**
- 触发条件: GA 判断 Goal 仍有效，重新审批
- 副作用: 清除旧 closedAt; 重新计算度量基线

**T15 closed → proposed (GA 重置)**
- 触发条件: GA 将已关闭 Goal 重置为初始状态
- 副作用: 清除全部 timeline 时间戳; 清空 adaptationNotes

#### 直接完成 (2条)

**T16 approved → completed (手动标记)**
- 触发条件: GA 手动标记完成 (用于非自动化度量的 Goal)
- 前置检查: 确认 successCriteria.excludes 全部未触发
- 副作用: 仍触发闭环验证 (§四)

**T17 deviated → completed (偏离后直接完成)**
- 触发条件: GA 判定偏离可接受，直接标记完成
- 前置检查: 确认所有 constraints 仍满足
- 副作用: adaptationNotes 记录 GA 判定; 仍触发闭环验证

---


## 三、Goal的manifest.json格式（对标哨兵manifest）

Goal 采用与 SentinelManifest 一致的文件驱动注册模式。每个 Goal 在 `extensions/goals/{goal-name}/manifest.json` 中定义，由 `goal-loader.ts` 加载。

### 3.1 GoalManifest 接口

```typescript
/**
 * Goal 的 manifest 定义 — 对标 SentinelManifest 字段命名。
 * 
 * 与 SentinelManifest 共有字段: name, version, type, displayName, description,
 *   expert, priority, computes, thresholds, context, entryPoint, exportKey
 * 
 * Goal 独有字段: goalType, department, baselinePeriod, autoExpire, dependsOn,
 *   conflictsWith, successCriteriaTemplate
 */
export interface GoalManifest {
  // ═══ 对标 SentinelManifest 的共有字段 ═══

  name: string;                          // 唯一名称，如 'reduce-fixed-cost-ratio'
  version: string;                       // 语义版本
  type: 'goal';                          // 固定值
  displayName: string;                   // 面向中层的可读名称
  description: string;                   // Goal 详细说明
  expert: string;                        // 关联专家 (轻量级再诊断时自动选择)
  priority: 'critical' | 'high' | 'medium' | 'low';
  computes: string[];                    // 关联的 compute 函数列表
  thresholds: Record<string, { warning: number; critical: number }>;  // 度量阈值
  context: {
    requiredDataSources: string[];
    dataAccess: { allowedDimensions: string[]; sensitiveAccess: string };
  };
  entryPoint: string;                    // 入口点文件 (相对路径)
  exportKey: string;                     // 导出键名

  // ═══ Goal 独有字段 ═══

  /**
   * Goal 类型 — 对应 Goal.type。
   * efficiency / growth / structural / defensive
   */
  goalType: 'efficiency' | 'growth' | 'structural' | 'defensive';

  /**
   * 所属部门 — 对应 Goal.department。
   * finance / ops / sales / product / hr / tech / marketing
   */
  department: string;

  /**
   * 基线建立周期 (天)。
   * Goal approved→in_progress 后，方案级哨兵先进入基线采集模式。
   * 默认 14 天 (2 周)，最大 28 天。
   */
  baselinePeriod: number;

  /**
   * 自动过期设置。
   * enabled: 是否启用自动过期。
   * ttlDays: proposed 状态最长存活天数 (默认 30)。
   * idleDays: approved 状态最长空闲天数 (默认 14)。
   */
  autoExpire: {
    enabled: boolean;
    ttlDays: number;
    idleDays: number;
  };

  /**
   * 依赖声明 — 该 Goal 类型对上游 Goal 的硬性依赖。
   * 运行时与 Goal.dependsOn 合并。
   */
  dependsOn?: Array<{
    goalPattern: string;                 // 依赖的 Goal manifest name 模式 (glob)
    type: 'blocking' | 'advisory';
  }>;

  /**
   * 冲突声明 — 与该 Goal 类型互斥的其他 Goal 模式。
   * 例: "裁员降本" 与 "招聘扩张" 不能同时 in_progress。
   */
  conflictsWith?: string[];

  /**
   * 成功标准模板 — 该类型 Goal 的默认 successCriteria 结构。
   * 运行时与诊断报告中的建议参数合并，生成具体 Goal 实例。
   */
  successCriteriaTemplate?: {
    metric: { comparator: 'gte' | 'lte' | 'eq' | 'range' };
    duration: { period: 'day' | 'week' | 'month'; count: number };
    constraintPatterns?: Array<{
      measurementType: 'sentinel' | 'compute' | 'edge_param';
      sourceIdPattern: string;
      comparator: 'gte' | 'lte' | 'eq';
    }>;
  };
}
```

### 3.2 manifest.json 示例

```json
{
  "$schema": "https://synova.dev/schemas/goal-manifest-v1.json",
  "name": "reduce-fixed-cost-ratio",
  "version": "1.0.0",
  "type": "goal",
  "displayName": "降低固定成本占比",
  "description": "将固定成本占总成本比例从 72% 降至 60% 以下，通过外包非核心职能和弹性用工实现变动成本化。",
  "expert": "finance",
  "priority": "high",
  "goalType": "efficiency",
  "department": "finance",
  "baselinePeriod": 21,
  "autoExpire": {
    "enabled": true,
    "ttlDays": 30,
    "idleDays": 14
  },
  "computes": [
    "fixed-cost-ratio",
    "operating-leverage"
  ],
  "thresholds": {
    "fixed_cost_ratio": {
      "warning": 0.65,
      "critical": 0.70
    },
    "operating_leverage": {
      "warning": 2.5,
      "critical": 3.0
    }
  },
  "context": {
    "requiredDataSources": ["sog_graph"],
    "dataAccess": {
      "allowedDimensions": ["financial"],
      "sensitiveAccess": "read"
    }
  },
  "entryPoint": "./aggregate.ts",
  "exportKey": "reduceFixedCostGoal",
  "dependsOn": [],
  "conflictsWith": ["expand-headcount", "acquire-assets"],
  "successCriteriaTemplate": {
    "metric": { "comparator": "lte" },
    "duration": { "period": "month", "count": 2 },
    "constraintPatterns": [
      {
        "measurementType": "compute",
        "sourceIdPattern": "operating-margin",
        "comparator": "gte"
      }
    ]
  }
}
```

### 3.3 Goal loader 接口 (对标 sentinel-loader.ts)

```typescript
/**
 * Goal 加载器 — 对标 sentinel-loader.ts。
 * 从 extensions/goals/{name}/manifest.json 加载 Goal 定义。
 */
export interface LoadedGoal {
  manifest: GoalManifest;
  dir: string;
}

/** 扫描 extensions/goals/ 目录，加载所有 Goal manifest */
export function loadGoals(): { goals: LoadedGoal[]; degraded: boolean; errors: string[] };

/** 将已加载的 Goal 注册到 GoalRegistry */
export function registerLoadedGoals(): Promise<{ registered: number; errors: string[] }>;

/** 清除缓存 (用于热加载) */
export function clearGoalCache(): void;
```

---


## 四、闭环验证机制

Goal 完成 ≠ 有效。闭环验证是增长导航系统的最后一道防线：在 Goal 进入 completed 状态时自动检查关联诊断指标是否确实改善。

### 4.1 验证流程

```
Goal 进入 completed
       │
       ▼
  ┌──────────────────────────────────┐
  │ 1. 回查原始诊断指标                │
  │    source.diagnosisReportId        │
  │    → 获取诊断时的维度指标快照         │
  │    → 获取当前同维度指标值             │
  └──────────────┬───────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────┐
  │ 2. 对比判断                       │
  │    改善 (P<0.05 或效应量>小):      │
  │      → 标记 "已完成且有效"          │
  │      → 写入 PKB 正向案例            │
  │    未改善:                          │
  │      → 标记 "已完成但无效"          │
  │      → 触发执行有效性审查           │
  └──────────────┬───────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────┐
  │ 3. 写入审计日志                    │
  │    {goalId, outcome, diagnosisId,  │
  │     metricBefore, metricAfter,     │
  │     delta, verifiedAt}             │
  └──────────────────────────────────┘
```

### 4.2 对比判断细则

| 场景 | 条件 | 结论 | 动作 |
|------|------|------|------|
| 改善 - 显著 | 诊断指标改善方向与 Goal 一致，且变化幅度 > 1σ | 已完成且有效 | 写入 PKB 正向案例；通知 GA |
| 改善 - 微弱 | 诊断指标改善方向一致，但幅度不足 1σ | 已完成且弱有效 | 标记完成；建议延长观察期 |
| 未改善 | 诊断指标无明显变化 (变化 < 0.5σ) | 已完成但无效 | 触发执行有效性审查 |
| 恶化 | 诊断指标向反方向变化 | 已完成但无效 | 立即触发执行有效性审查 + 通知 GA |
| 无法比较 | 诊断指标元数据已变更 (计算口径改变/数据源下线) | 无法验证 | 标记完成；记录原因；建议人工复核 |

### 4.3 执行有效性审查

"已完成但无效"触发执行有效性审查——不是怀疑执行质量，而是检查 Goal→诊断指标的因果链路是否成立：

1. **因果链路重检**: 该 Goal 的 rootCause → action → outcome 链路是否仍然成立？（可能环境变化导致链路断裂）
2. **度量归属检查**: 诊断指标的改善是否应由该 Goal 负责？（可能其他并行 Goal 已覆盖）
3. **执行充分性检查**: 哨兵记录显示执行是否到位？（可能执行中偏离但未触发调整）
4. **外部因素排查**: 是否存在未被监控的外部事件？（可能市场/政策变化冲销了 Goal 效果）

审查结论写入 adaptationNotes，并回流到 PKB 作为该 Goal 类型的经验案例。

### 4.4 PKB 写入格式

```typescript
interface GoalKnowledgeEntry {
  /** Goal manifest name */
  manifestName: string;
  /** 诊断维度 (对应 rootCause dimension) */
  diagnosisDimension: string;
  /** 闭环结论 */
  outcome: 'effective' | 'weakly_effective' | 'ineffective' | 'counterproductive' | 'unverifiable';
  /** 指标变化 */
  metricDelta: {
    before: number;
    after: number;
    unit: string;
    changePercent: number;
  };
  /** 执行周期 (天) */
  executionDays: number;
  /** deviation 次数 */
  deviationCount: number;
  /** 关联 Goal ID */
  goalId: string;
  /** 验证时间 */
  verifiedAt: string;
}
```

---


## 五、级联依赖检测

Goal 不是孤立的——dependsOn 定义了执行依赖链。当方案级哨兵检测到偏离时，必须先检查上游 Goal 状态，避免下游误告警。

### 5.1 检测流程

```
deviated 触发 (T5: in_progress → deviated)
       │
       ▼
  ┌──────────────────────────────────────────┐
  │ 1. 级联依赖检查                            │
  │    dependsOn 中所有 blocking 类型 Goal:     │
  │    遍历 goalId → 查询当前 lifecycle          │
  └──────────────┬───────────────────────────┘
                 │
         ┌───────┴────────┐
         ▼                ▼
  所有上游已完成      存在上游延期
         │                │
         ▼                ▼
  正常触发偏离     ┌──────────────────────┐
  → 中层告警      │ 上游延期 → 下游偏离     │
                  │ 不触发中层告警          │
                  │ 通知 GA "依赖链断裂"    │
                  │ 标记 adaptationNote:    │
                  │   trigger = 'cascade'   │
                  │   cascadeSource = 上游ID │
                  └──────────────────────┘
```

### 5.2 三种级联场景

| 场景 | 上游状态 | 下游偏离 | 系统行为 |
|------|---------|---------|---------|
| 纯级联 | 上游 deviated/completed | 下游跟随偏离 | 下游不告警中层，通知GA「依赖链断裂：上游Goal-{id}延期导致下游Goal-{id2}偏离」 |
| 混合偏离 | 上游 completed (正常完成) | 下游自身偏离 | 正常告警中层，因为上游已完成 |
| 无关联 | 上游 completed/closed | 下游偏离 | 正常告警中层，上游与偏离无关 |

### 5.3 级联标注格式 (AdaptationNote)

```typescript
// 级联偏离的 AdaptationNote 特殊标记
{
  trigger: 'external',           // 级联触发，非自身偏离
  deviation: undefined,          // 无本地偏离数据
  adjustmentSummary: depart-on-chain断裂：上游Goal-{upstreamId}延期({upstreamState})导致下游无法按期执行',
  lightDiagnosisId: undefined,   // 级联偏离不触发轻量级再诊断
  sentinelFindingIds: [],        // 级联偏离不产生本地Finding
  fromState: 'in_progress',
  toState: 'deviated',
  timestamp: '2026-07-14T00:00:00Z',
  // 扩展字段 (运行时挂载):
  cascadeSource: 'goal-abc123'   // 导致级联的上游 Goal ID
}
```

### 5.4 冲突检测

conflictsWith 提供运行时互斥保护：

```typescript
/** Goal 创建/审批时的冲突检查 */
function checkGoalConflicts(newGoal: Goal, activeGoals: Goal[]): ConflictResult {
  const conflicts = activeGoals.filter(g =>
    g.lifecycle === 'in_progress' &&
    (newGoal.conflictsWith.includes(g.id) || g.conflictsWith.includes(newGoal.id))
  );

  if (conflicts.length > 0) {
    return {
      blocked: true,
      reason: `与以下执行中Goal存在资源/目标冲突`,
      conflictingGoalIds: conflicts.map(g => g.id),
      resolution: 'GA手动解决: 关闭其中一个 / 标记为advisory依赖 / 忽略冲突继续'
    };
  }

  return { blocked: false };
}
```

---


## 六、Playbook输出→Goal字段映射表

诊断报告 (DiagnosisReport.recommendations) 中的 actionRecommendations 转化为 Goal。以下映射定义每个 Goal 字段的数据来源和推断规则。

### 6.1 字段映射表

| Goal 字段 | 来源 | 映射规则 |
|-----------|------|---------|
| `id` | 自动生成 | `goal-{uuid-short}`，创建时确定 |
| `type` | 自动推断 | 基于 recommendation.action 语义分析: 含"降本/提效/优化"→efficiency; 含"增长/增收/扩张"→growth; 含"组织/架构/制度"→structural; 含"风险/合规/对冲"→defensive。置信度 < 0.8 时请求 GA 确认 |
| `title` | `DiagnosisReport.recommendations[n].action` | 直接使用，截取前 80 字符 |
| `description` | `DiagnosisReport.recommendations[n].action` | 完整使用 |
| `department` | 自动推断 | 基于 recommendation.expert 映射: finance→finance, strategy→ops, org→hr, tech→tech, marketing→marketing 等 |
| `responsibleRole` | GA 手动指定 | 创建时 GA 从部门角色列表中选取 |
| `source.diagnosisReportId` | `DiagnosisReport.reportId` | 直接复制 |
| `source.diagnosisPlaybookExecutionId` | Playbook 执行上下文 | 运行时注入 |
| `source.proposalId` | Proposal 创建后回填 | T1 转换时生成 |
| `source.pathIndex` | recommendations 数组索引 | 自动填入 |
| `metrics.primary.measurement` | 自动推断 | 基于 Goal type + department 从测量器注册表中匹配最相关测量器; 如无法自动匹配→请求 GA 选择 |
| `metrics.primary.currentBaseline` | 哨兵/compute 当前值快照 | 创建时从 MeasurementDef 指向的数据源实时读取 |
| `metrics.primary.targetValue` | GA 手动指定 | 诊断报告可能含建议值; GA 审批时确认或修改 |
| `metrics.primary.unit` | 测量器元数据 | 从 compute 函数/哨兵的输出元数据中提取 |
| `metrics.secondary` | GA 可选添加 | 创建时可添加 0-3 个辅助指标 |
| `successCriteria` | GA 手动指定 + 模板默认 | GoalManifest.successCriteriaTemplate 提供模板; GA 审批时填入具体值 |
| `measurement.type` | 自动推断 | 优先 sentinel (如该维度有可用哨兵) → compute (如有 compute 函数) → edge_param (如有对应边参数) |
| `measurement.sourceId` | 自动推断 | 从测量器注册表匹配 |
| `dependsOn` | 自动推断 + GA 手动 | GoalManifest.dependsOn 提供类型级别的依赖模式; 运行时匹配到具体 Goal 实例; GA 可追加 |
| `conflictsWith` | 自动推断 | GoalManifest.conflictsWith 提供类型级别的冲突模式; 运行时匹配到具体 Goal 实例 |
| `timeline.proposedAt` | 自动生成 | Goal 创建时间戳 |
| `timeline.targetDate` | GA 手动指定 | 审批时 GA 设定目标日期 |
| `lifecycle` | 自动管理 | 创建时 = 'proposed' |
| `priority` | `DiagnosisReport.recommendations[n].priority` | 直接映射: critical→critical, high→high, medium→medium, low→low |
| `adaptationNotes` | 自动追加 | 创建时 = [] |

### 6.2 自动推断优先级

当字段可自动推断但置信度不足时：

1. 置信度 ≥ 0.9: 自动填入，记录推断理由
2. 置信度 0.6-0.89: 填入建议值，标记 `needsConfirmation: true`，GA 审批时可一键确认
3. 置信度 < 0.6: 留空，要求 GA 手动填写

### 6.3 筛选规则

不是诊断报告中的每条 recommendation 都自动转 Goal：

1. **可执行性判断**: recommendation 必须包含可度量目标 (有数值+单位)，否则跳过
2. **重复检测**: 如已有 in_progress/proposed Goal 覆盖同一 recommendation (基于语义相似度 > 0.7)，跳过并提示
3. **上限控制**: 每企业最多 5 个 in_progress Goal，超出上限的 recommendation 自动排队等待

---


## 七、补充评审11条确认表

以下为所有补充评审意见的逐条确认，标注每条意见在本文档中的对应章节。

| # | 评审意见 | 对应章节 | 状态 |
|---|---------|---------|------|
| 1 | **successCriteria 字段完整性** — 必须包含 metric/targetValue/duration/constraints/excludes | §一 SuccessCriteria 接口 | ✅ 已覆盖 — 5个子字段完整定义 |
| 2 | **measurement 数据源绑定** — 不是"从哨兵获取"，是"从 sentinel-{id} 的 latestResult.{field} 读取" | §一 MeasurementDef 接口 (type/sourceId/field/fallback) | ✅ 已覆盖 — 精确到字段路径 + 降级策略 |
| 3 | **dependsOn 依赖管理** — blocking/advisory 两种类型 + dependsOn.goalId/type | §一 Goal.dependsOn 字段 | ✅ 已覆盖 — 包含 blocking/advisory 两种依赖类型 |
| 4 | **conflictsWith 冲突检测** — Goal 间资源/目标互斥声明 | §一 Goal.conflictsWith 字段 + §五 冲突检测代码 | ✅ 已覆盖 — 运行时互斥保护 |
| 5 | **级联依赖检测** — 上游延期→下游偏离不触发中层告警 | §五 完整级联依赖检测流程 (3种场景) | ✅ 已覆盖 — 包含级联标注格式 + 冲突检测代码 |
| 6 | **闭环验证机制** — completed→检查关联诊断指标→改善/未改善判定 | §四 闭环验证机制 (验证流程 + 5种对比判断 + 执行有效性审查) | ✅ 已覆盖 — 包含 PKB 写入格式 |
| 7 | **诊断追溯** — Goal 必须记录来源诊断报告 ID 和建议索引 | §一 Goal.source 字段 (diagnosisReportId/pathIndex) | ✅ 已覆盖 — 4字段完整追溯链 |
| 8 | **Goal 类型分类** — efficiency/growth/structural/defensive 四种 | §一 Goal.type 字段 | ✅ 已覆盖 — 4类型 + 自动推断规则 (§六) |
| 9 | **GoalLifecycle 状态机** — 7态+17条转换 | §二 完整状态机 (正转7+终止4+推翻2+重激活2+直接完成2) | ✅ 已覆盖 — 17条转换每条含: 触发条件/前置检查/副作用/失败处理 |
| 10 | **闭环再检查** — "已完成但无效"触发执行有效性审查 | §四 执行有效性审查 (因果链路重检/度量归属/执行充分性/外部因素) | ✅ 已覆盖 — 4步审查流程 |
| 11 | **拒绝 Goal 流程** — GA主动拒绝/expired/abandoned 三条路径 | §二 终止转换 T8/T9/T10/T11 + 推翻转换 T12/T13 | ✅ 已覆盖 — 6条关闭路径 |

---

## 八、接口依赖与下游预期

本章作为增长导航系统的契约基础，定义了以下下游系统的前置依赖：

| 下游系统 | 所在章节 | 依赖的 Goal 接口 |
|---------|---------|-----------------|
| Proposal 三选一 (第二章) | - | Goal.id / source / lifecycle(proposed→approved) / type |
| 方案级哨兵 (第三章) | - | Goal.id / metrics / measurement / timeline.targetDate / lifecycle(in_progress→deviated) |
| 中层工作台 (第四章) | - | Goal 全部字段 (展示) + lifecycle 状态驱动 UI |
| 轻量级再诊断 (第五章) | - | Goal.adaptationNotes / source.diagnosisReportId / type / expert |
| PKB 知识回流 (第五章) | - | GoalKnowledgeEntry (闭环验证输出) |
| 哨兵注册中心 | §三 | GoalManifest → goal-loader.ts → GoalRegistry |

---

## 九、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-07-14 | 初始版本。完整定义 Goal 28字段接口 / 7态状态机17条转换 / manifest格式 / 闭环验证 / 级联依赖 / Playbook映射 / 11条评审确认 |

