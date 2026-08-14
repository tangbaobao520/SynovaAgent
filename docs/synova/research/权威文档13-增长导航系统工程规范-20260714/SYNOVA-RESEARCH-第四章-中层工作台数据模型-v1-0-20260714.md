<!--
  Synova 增长导航系统工程规范 第四章 — 中层工作台数据模型
  版本: v1.0 | 日期: 2026-07-14
-->

# 第四章：中层工作台数据模型

> "中层负责人每天打开部门工作台，3秒内知道自己最该做什么。" — 研究方案 v2.0

---

## 一、总设计原则

1. **不增加负担**。显式反馈（点击按钮）一键操作。隐式反馈（偏离告警）自动运行。沉默反馈（提醒频率）保守递进。
2. **数据源绑定必须有身份**。不是"从哨兵获取"，是"从 `sentinel-{id}` 的 `latestResult.findings[n].severity` 读取"。每个字段标注精确的数据来源路径。
3. **阈值不在空气中**。使用方案哨兵的基线建立期回答"偏离20%是否合理"。
4. **免打扰不是不管**。所有被过滤的告警保留完整历史，系统保护的是中层的时间而非放弃注意力。
5. **证据链可追溯**。任何偏离值都可展开查看到原始哨兵Finding→排除的混淆因素→关联的诊断报告段落。

---

## 二、DepartmentWorkspace 完整 TypeScript 接口

```typescript
/**
 * DepartmentWorkspace — 中层工作台完整数据模型
 * 
 * 对应架构：L1 交互层渲染的核心数据载体。
 * 数据来源：L2 orchestration/sentinel-service.ts + L3 SentinelRegistry + L4 GraphBridge
 * 
 * Iron Law #31: 每个子模块携带 degraded 标记
 * Iron Law #38: as any = 0
 */

// ============================================================
// 2.1 核心工作台接口
// ============================================================

export interface DepartmentWorkspace {
  /** 部门唯一标识（映射到 GraphStore TEAM 节点） */
  departmentId: string;
  /** 部门显示名称 */
  departmentName: string;
  /** 工作台数据生成时间 ISO-8601 */
  generatedAt: string;

  /** 活跃目标列表（当前未关闭的 Goal） */
  activeGoals: ActiveGoal[];
  /** 最近告警列表（按严重度+时间排序，受免打扰规则过滤后） */
  recentAlerts: WorkspaceAlert[];
  /** 待处理方案列表（中层待确认或GA待确认） */
  pendingProposals: PendingProposal[];
  /** 关联的诊断报告引用（最近3份） */
  diagnosticsReferenced: DiagnosticReference[];
  /** 下一步行动推荐（系统自动计算） */
  nextAction: NextAction | null;

  /** 降级标记：任何子模块数据不可用时标记 */
  degraded: boolean;
  /** 降级模块名称列表 */
  degradedModules: string[];
  /** 数据新鲜度：最近一次全量刷新时间 */
  lastRefreshedAt: string;
}

// ============================================================
// 2.2 ActiveGoal — 活跃目标
// ============================================================

/** 目标偏离状态 */
export type GoalDeviationStatus = 
  | 'on_track'       // 在轨：当前值在预期范围内
  | 'at_risk'        // 风险：单因子偏离触发
  | 'deviated'       // 偏离：双因子触发，需关注
  | 'critical'       // 严重偏离：三因子触发或P0告警
  | 'unknown';       // 基线建立中，尚无足够数据判定

export interface ActiveGoal {
  /** Goal 唯一标识 */
  goalId: string;
  /** Goal 标题（来自诊断建议的工程化表达） */
  title: string;
  /** 目标当前状态（7态状态机） */
  status: GoalLifecycleStatus;
  /** 偏离状态 */
  deviationStatus: GoalDeviationStatus;

  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2';
  /** 截止日期 ISO-8601，null = 无截止日期 */
  deadline: string | null;
  /** 负责中层角色标识 */
  ownerId: string;

  /** 度量指标 */
  metrics: GoalMetric[];
  /** 成功标准 */
  successCriteria: SuccessCriterion[];

  /** 关联方案ID */
  proposalId: string;
  /** 关联诊断报告ID */
  diagnosisId: string;

  /** 依赖的其他 Goal ID 列表 */
  dependsOn: string[];
  /** 冲突的 Goal ID 列表 */
  conflictsWith: string[];

  /** 距截止日期剩余天数，null = 无截止日期 */
  daysUntilDeadline: number | null;
  /** 最近一次哨兵检查时间 */
  lastSentinelCheckAt: string | null;
  /** 轻量级再诊断累计次数 */
  reDiagnosisCount: number;
}

/** Goal 生命周期状态（7态状态机，定义见第一章） */
export type GoalLifecycleStatus =
  | 'draft'          // 草稿：从Proposal确认后生成，尚未激活
  | 'baseline'       // 基线建立期：方案哨兵2-4周只采集不告警
  | 'active'         // 活跃：正常执行追踪中
  | 'deviated'       // 偏离：触发了偏离告警，等待中层响应
  | 're_diagnosing'  // 再诊断中：轻量级或全量再诊断进行中
  | 'completed'      // 已完成：Goal关闭，闭环验证通过
  | 'abandoned';     // 已废弃：全量再诊断推翻原Goal

export interface GoalMetric {
  /** 指标名称，如 "变动成本率" */
  name: string;
  /** 当前值 */
  currentValue: number;
  /** 目标值 */
  targetValue: number;
  /** 基线值（Goal启动时的初始值） */
  baselineValue: number;
  /** 单位，如 "%"、"万元"、"人" */
  unit: string;
  /** 数据来源：compute contractId */
  computeContractId: string;
  /** 最近一次采样时间 */
  lastSampledAt: string;
  /** 偏离百分比（(current - target) / target * 100） */
  deviationPercent: number | null;
  /** 偏离方向：positive=超出目标（好），negative=低于目标（差） */
  deviationDirection: 'positive' | 'negative' | null;
}

export interface SuccessCriterion {
  /** 标准描述 */
  description: string;
  /** 验证方式 */
  verificationMethod: 'metric_threshold' | 'event_occurrence' | 'manual_confirmation';
  /** 验证指标（verificationMethod=metric_threshold时） */
  metric?: { name: string; operator: 'gte' | 'lte' | 'eq'; threshold: number; unit: string };
  /** 是否已满足 */
  satisfied: boolean;
  /** 验证时间 */
  verifiedAt: string | null;
}

// ============================================================
// 2.3 WorkspaceAlert — 工作台告警
// ============================================================

export interface WorkspaceAlert {
  /** 告警唯一ID */
  alertId: string;
  /** 告警标题 */
  title: string;
  /** 告警严重度 */
  severity: 'emergency' | 'critical' | 'warning' | 'info';
  /** 告警优先级（用于免打扰规则） */
  priority: 'P0' | 'P1' | 'P2';

  /** 告警来源：关联的哨兵ID */
  sourceSentinelId: string;
  /** 关联的 Goal ID（方案哨兵告警）或 null（通用哨兵告警） */
  relatedGoalId: string | null;

  /** 告警描述 */
  description: string;
  /** 偏离值详情（可展开证据链弹窗） */
  deviationDetail: DeviationDetail | null;

  /** 告警产生时间 */
  detectedAt: string;
  /** 是否已被中层确认（已读） */
  acknowledged: boolean;
  /** 确认时间 */
  acknowledgedAt: string | null;

  /** 建议操作 */
  suggestedAction: string;
  /** 行动链接（如 "/goals/{goalId}/adjust"） */
  actionLink: string;
}

/** 偏离详情（点击展开证据链） */
export interface DeviationDetail {
  /** 偏离的指标名称 */
  metricName: string;
  /** 当前值 */
  currentValue: number;
  /** 目标值 */
  targetValue: number;
  /** 偏离百分比 */
  deviationPercent: number;
  /** 偏离方向 */
  direction: 'positive' | 'negative';

  /** 最近3条哨兵Finding */
  recentFindings: DeviationFinding[];
  /** 已排除的混淆因素列表 */
  excludedConfounders: string[];
  /** 关联诊断报告引用 */
  diagnosticRef: {
    diagnosisId: string;
    reportTitle: string;
    relevantSection: string;
    generatedAt: string;
  } | null;
}

/** 偏离相关的哨兵Finding */
export interface DeviationFinding {
  /** Finding摘要（一句话） */
  summary: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 检测时间 */
  detectedAt: string;
}

// ============================================================
// 2.4 PendingProposal — 待处理方案
// ============================================================

export interface PendingProposal {
  /** 方案ID */
  proposalId: string;
  /** 方案标题 */
  title: string;
  /** 方案当前状态（11态状态机，定义见第二章） */
  status: ProposalStatus;

  /** 来源诊断报告ID */
  sourceDiagnosisId: string;
  /** 针对的根因问题 */
  rootCause: string;

  /** 可选路径（三选一） */
  options: ProposalOption[];
  /** 当前选中路径索引（-1 = 未选择） */
  selectedOptionIndex: number;

  /** 创建时间 */
  createdAt: string;
  /** 超时时间（5工作日），超时自动选默认 */
  expiresAt: string;
  /** 距超时剩余小时数 */
  hoursUntilExpiry: number;

  /** 是否已被中层查看 */
  viewed: boolean;
}

/** 方案状态（11态，详见第二章完整状态机） */
export type ProposalStatus =
  | 'draft'
  | 'pending_selection'
  | 'selected'
  | 'pending_ga_confirmation'
  | 'confirmed'
  | 'executing'
  | 'completed'
  | 'expired'
  | 'disputed'
  | 'regenerating'
  | 'ga_rejected';

export interface ProposalOption {
  /** 选项序号（1/2/3） */
  index: number;
  /** 选项标题 */
  title: string;
  /** 选项描述 */
  description: string;
  /** 预估代价（人/财/时间） */
  estimatedCost: { people: string; budget: string; timeline: string };
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high';
  /** 假设压力测试结果 */
  stressTest?: StressTestResult;
  /** 是否为默认选项（超时自动选此项） */
  isDefault: boolean;
}

/** 假设压力测试结果 */
export interface StressTestResult {
  /** 数据审计得分 0-1 */
  dataAuditScore: number;
  /** 风险扫描得分 0-1 */
  riskScanScore: number;
  /** 机会扫描得分 0-1 */
  opportunityScanScore: number;
  /** 假设压力得分 0-1 */
  assumptionStressScore: number;
  /** 综合可行性得分 0-1 */
  overallFeasibility: number;
  /** 关键风险提示 */
  keyRisks: string[];
}

// ============================================================
// 2.5 DiagnosticReference — 诊断报告引用
// ============================================================

export interface DiagnosticReference {
  /** 诊断ID */
  diagnosisId: string;
  /** 报告标题 */
  title: string;
  /** 诊断时间 */
  generatedAt: string;
  /** 诊断总体评分 0-1 */
  overallScore: number;
  /** 与本部门相关的发现摘要 */
  relevantFindings: string[];
  /** 与本部门相关的建议 */
  relevantRecommendations: string[];
  /** 该诊断产生的 Goal 数量 */
  spawnedGoals: number;
}

// ============================================================
// 2.6 NextAction — 下一步行动推荐
// ============================================================

export interface NextAction {
  /** 行动类型 */
  type: NextActionType;
  /** 简短标题（中层3秒内可理解） */
  title: string;
  /** 一句话原因说明 */
  reason: string;
  /** 行动链接（前端路由） */
  actionLink: string;
  /** 关联实体ID */
  relatedEntityId: string;
  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2';
  /** 推荐时间 */
  recommendedAt: string;
}

export type NextActionType =
  | 'confirm_proposal'        // 确认方案选择
  | 'review_deviation'        // 查看偏离详情
  | 'adjust_goal'             // 调整目标
  | 'check_dependency'        // 检查依赖Goal状态
  | 'resolve_conflict'        // 解决Goal冲突
  | 'review_diagnosis'        // 查看新诊断报告
  | 'acknowledge_alert'       // 确认紧急告警
  | 'no_action';              // 无待办事项
```


---

## 三、nextAction 生成规则决策树

系统基于 **Goal偏离状态 x 优先级 x 截止日期 x pendingProposals数量** 四维条件自动推荐下一步行动。

### 3.1 决策树规则表

| 优先级 | 条件 | 条件 | 条件 | 条件 | nextAction.type |
|--------|------|------|------|------|----------------|
| 1 | deviationStatus=critical | — | — | — | `review_deviation` |
| 2 | deviationStatus=deviated | priority=P0 | deadline < 7天 | — | `adjust_goal` |
| 3 | deviationStatus=deviated | priority=P1 | — | — | `review_deviation` |
| 4 | deviationStatus=at_risk | deadline < 3天 | — | — | `check_dependency` |
| 5 | status=baseline | baselineAge > 14天 | — | — | `no_action`（等待基线建立完成）|
| 6 | pendingProposals.length > 0 | proposal.expiresAt < 24h | — | — | `confirm_proposal` |
| 7 | pendingProposals.length > 0 | proposal.status=pending_selection | — | — | `confirm_proposal` |
| 8 | conflictsWith.length > 0 | — | — | — | `resolve_conflict` |
| 9 | dependsOn[].deviationStatus=critical | — | — | — | `check_dependency` |
| 10 | activeGoals 全部 on_track | pendingProposals=0 | — | — | `no_action` |

### 3.2 决策树伪代码

```typescript
/**
 * computeNextAction — 基于工作台状态自动推荐下一步行动
 * 
 * 契约 (Iron Law #47):
 *   输入: DepartmentWorkspace.activeGoals + pendingProposals
 *   输出: NextAction | null
 *   降级: 任何输入为空/undefined -> 返回 null + log.warn
 * 
 * 规则优先级: critical告警 > 偏离 > 方案超时 > 依赖问题 > 无动作
 */
function computeNextAction(workspace: DepartmentWorkspace): NextAction | null {
  const { activeGoals, pendingProposals } = workspace;
  if (!activeGoals || !pendingProposals) {
    log.warn('[nextAction] degraded input', { departmentId: workspace.departmentId });
    return null;
  }

  // 规则1: 任何critical告警优先
  const criticalGoals = activeGoals.filter(g => g.deviationStatus === 'critical');
  if (criticalGoals.length > 0) {
    const g = criticalGoals[0];
    return buildNextAction('review_deviation', g, workspace.departmentId);
  }

  // 规则2: 偏离+高优先级+临近截止
  const urgentDeviated = activeGoals
    .filter(g => g.deviationStatus === 'deviated' && g.priority === 'P0')
    .find(g => g.daysUntilDeadline !== null && g.daysUntilDeadline < 7);
  if (urgentDeviated) {
    return buildNextAction('adjust_goal', urgentDeviated, workspace.departmentId);
  }

  // 规则3: 偏离+中优先级
  const deviatedP1 = activeGoals.find(
    g => g.deviationStatus === 'deviated' && g.priority === 'P1'
  );
  if (deviatedP1) return buildNextAction('review_deviation', deviatedP1, workspace.departmentId);

  // 规则4: at_risk+临近截止
  const atRiskUrgent = activeGoals.find(
    g => g.deviationStatus === 'at_risk' && g.daysUntilDeadline !== null && g.daysUntilDeadline < 3
  );
  if (atRiskUrgent) return buildNextAction('check_dependency', atRiskUrgent, workspace.departmentId);

  // 规则6-7: 待确认方案（优先处理24h内超时的）
  const expiringProposal = pendingProposals.find(
    p => p.status === 'pending_selection' && p.hoursUntilExpiry < 24
  );
  if (expiringProposal) return buildProposalAction('confirm_proposal', expiringProposal, workspace.departmentId);

  const pendingProposal = pendingProposals.find(p => p.status === 'pending_selection');
  if (pendingProposal) return buildProposalAction('confirm_proposal', pendingProposal, workspace.departmentId);

  // 规则8: 冲突检测
  const conflictGoal = activeGoals.find(g => g.conflictsWith.length > 0);
  if (conflictGoal) return buildNextAction('resolve_conflict', conflictGoal, workspace.departmentId);

  // 规则9: 依赖的Goal处于危险状态
  const depAtRisk = activeGoals.find(g =>
    g.dependsOn.some(depId => {
      const dep = activeGoals.find(a => a.goalId === depId);
      return dep && dep.deviationStatus === 'critical';
    })
  );
  if (depAtRisk) return buildNextAction('check_dependency', depAtRisk, workspace.departmentId);

  // 规则5/10: 无动作
  return null;
}

function buildNextAction(type: NextActionType, goal: ActiveGoal, deptId: string): NextAction {
  const templates: Record<NextActionType, { title: string; reason: string }> = {
    review_deviation: { title: `检查"${goal.title}"偏离`, reason: `目标偏离${goal.metrics[0]?.deviationPercent?.toFixed(1)}%，需确认原因` },
    adjust_goal: { title: `调整"${goal.title}"目标`, reason: `高优先级目标严重偏离且临近截止` },
    check_dependency: { title: `检查依赖目标状态`, reason: `依赖的Goal出现异常，可能影响本目标` },
    resolve_conflict: { title: `解决目标冲突`, reason: `存在${goal.conflictsWith.length}个冲突目标` },
    confirm_proposal: { title: '确认方案选择', reason: '' },
    acknowledge_alert: { title: '确认紧急告警', reason: '' },
    review_diagnosis: { title: '查看新诊断报告', reason: '' },
    no_action: { title: '暂无待办', reason: '' },
  };
  const t = templates[type];
  return {
    type,
    title: t.title,
    reason: t.reason,
    actionLink: `/departments/${deptId}/goals/${goal.goalId}`,
    relatedEntityId: goal.goalId,
    priority: goal.priority,
    recommendedAt: new Date().toISOString(),
  };
}
```

### 3.3 输出格式

nextAction 始终输出为三元素：
- **简短标题**：中层在卡片标题栏直接看到，不超过15个中文字符
- **一句话原因**：副标题展示，不超过30个中文字符
- **行动链接**：前端路由，如 `/departments/{deptId}/goals/{goalId}/deviation`

---

## 四、免打扰规则引擎

### 4.1 频率矩阵

| 告警优先级 | 推送策略 | 单Goal聚合 | 跨Goal聚合 | 用户可覆盖 |
|-----------|---------|-----------|-----------|-----------|
| **P0** | 立即推送（WebSocket + 邮件） | 同一Goal 24h内不重复推送相同内容 | 不同Goal独立推送 | 否 |
| **P1** | 每周最多推送1次（每周一9:00汇总） | 同一Goal每周1条汇总 | 不同Goal合并为1封汇总邮件 | 是（可改为立即推送）|
| **P2** | 每周汇总1次（每周五17:00） | 所有P2告警合并为摘要列表 | 同部门所有Goal的P2汇总 | 是（可改为P1频率）|

### 4.2 免打扰时段

中层可在部门设置中配置免打扰时段：

```typescript
export interface DoNotDisturbConfig {
  /** 是否启用免打扰 */
  enabled: boolean;
  /** 每日免打扰开始时间（HH:mm），如 "22:00" */
  quietStart: string;
  /** 每日免打扰结束时间（HH:mm），如 "07:00" */
  quietEnd: string;
  /** 免打扰期内是否仍推送 P0 */
  p0Bypasses: boolean;  // 默认 true
  /** 免打扰期结束后是否批量补发 */
  sendDigestOnWake: boolean;  // 默认 true
  /** 工作日白名单（空 = 全部），["MON","TUE",...] */
  activeDays: string[];
}
```

### 4.3 融合规则

多个P1/P2告警聚合到单一摘要通知时：
- 按 Goal 分组，每个 Goal 一个折叠卡片
- 卡片标题：Goal名称 + 告警数量徽标
- 展开后按时间倒序排列，同类型告警去重（相同 sentinelId + 相同 severity -> 保留最新一条）

### 4.4 屏蔽历史

所有被免打扰规则抑制的告警：
- 保留在 `sentinel_alert_history` 表（不被物理删除）
- 中层可在工作台"告警历史"面板中查看全部
- 每条记录标注 `suppressed: true` + `suppressedReason: 'dnd'` | `'frequency_limit'` | `'quiet_hours'`

### 4.5 规则引擎伪代码

```typescript
interface DeliveryDecision {
  deliver: boolean;
  channel: 'websocket' | 'websocket+email' | 'websocket_weekly' | null;
  suppressedReason?: 'dnd' | 'frequency_limit' | 'quiet_hours';
  deliverAfter?: string;
  deliverOn?: string;
}

function shouldDeliver(alert: WorkspaceAlert, dnd: DoNotDisturbConfig): DeliveryDecision {
  // P0: 永远立即推送（受免打扰时段保护）
  if (alert.priority === 'P0') {
    if (dnd.enabled && dnd.p0Bypasses) return { deliver: true, channel: 'websocket+email' };
    if (dnd.enabled && isInQuietHours(dnd)) return { deliver: false, channel: null, suppressedReason: 'quiet_hours', deliverAfter: dnd.quietEnd };
    return { deliver: true, channel: 'websocket+email' };
  }

  // P0去重：同一Goal+同一sentinelId 24h内不重复
  if (alert.priority === 'P0' && isDuplicateIn24h(alert)) {
    return { deliver: false, channel: null, suppressedReason: 'frequency_limit' };
  }

  // P1: 每周1次
  if (alert.priority === 'P1') {
    if (alreadySentThisWeek(alert.relatedGoalId, 'P1')) {
      return { deliver: false, channel: null, suppressedReason: 'frequency_limit' };
    }
    return { deliver: true, channel: 'websocket_weekly' };
  }

  // P2: 每周五汇总
  if (alert.priority === 'P2') {
    addToWeeklyDigest(alert);
    return { deliver: false, channel: null, suppressedReason: 'frequency_limit', deliverOn: nextFriday17() };
  }

  // 免打扰时段保护
  if (dnd.enabled && isInQuietHours(dnd)) {
    return { deliver: false, channel: null, suppressedReason: 'quiet_hours', deliverAfter: dnd.quietEnd };
  }

  return { deliver: true, channel: 'websocket' };
}
```

---

## 五、数据源映射表

> 每个工作台字段精确标注数据来源。`->` 表示映射方向。更新频率按实际数据刷新能力标注。

### 5.1 DepartmentWorkspace 顶层字段

| 字段 | 数据来源 | 更新频率 | 降级策略 |
|------|---------|---------|---------|
| `departmentId` | GraphStore TEAM 节点 `id` | on-change | null -> 工作台不可用 |
| `departmentName` | GraphStore TEAM 节点 `props.name` | on-change | 显示 departmentId |
| `generatedAt` | 系统时钟 | realtime | N/A |
| `degraded` | 各子模块 degraded 标记 OR | realtime | N/A |
| `degradedModules` | 各子模块收集 | realtime | N/A |
| `lastRefreshedAt` | 最近一次全量查询时间 | realtime | N/A |

### 5.2 activeGoals 字段

| 字段 | 数据来源 | 更新频率 | 降级策略 |
|------|---------|---------|---------|
| `goalId` | GraphStore GOAL 节点 `id` | on-change | 跳过该Goal |
| `title` | GOAL 节点 `props.name` | on-change | "未命名目标" |
| `status` | GOAL 节点 `props.status` | on-change | `'active'` 默认 |
| `deviationStatus` | 方案哨兵 `sentinel-goal-{goalId}` 最新Finding | hourly | `'unknown'` |
| `priority` | GOAL 节点 `props.priority` | on-change | `'P2'` 默认 |
| `deadline` | GOAL 节点 `props.deadline` | on-change | null（无截止日期不告警）|
| `ownerId` | GOAL -> HAS_OWNER -> PERSON 边 | on-change | null（标记 degraded）|
| `metrics[].currentValue` | `compute-{contractId}` 最新执行结果 | hourly/daily | null + degraded标记 |
| `metrics[].targetValue` | GOAL 节点 `props.metrics[n].target` | on-change | null |
| `metrics[].baselineValue` | 方案哨兵基线期首快照值 | 基线期间 daily | null |
| `metrics[].computeContractId` | GOAL 节点 `props.metrics[n].computeRef` | on-change | null |
| `successCriteria[].satisfied` | 方案哨兵检查结果对比 | hourly | false |
| `proposalId` | GOAL 节点 `props.proposalRef` | on-change | null |
| `diagnosisId` | GOAL -> DERIVED_FROM -> DIAGNOSIS 边 | on-change | null |
| `dependsOn` | GraphStore GOAL -> DEPENDS_ON -> GOAL 边 | on-change | [] |
| `conflictsWith` | GraphStore GOAL -> CONFLICTS_WITH -> GOAL 边 | on-change | [] |
| `daysUntilDeadline` | 计算：`deadline - now` | realtime | null |
| `lastSentinelCheckAt` | `sentinel_tickets` 表 `checked_at` | hourly | null |
| `reDiagnosisCount` | `goal_re_diagnosis_log` 表 COUNT | on-change | 0 |

### 5.3 recentAlerts 字段

| 字段 | 数据来源 | 更新频率 | 降级策略 |
|------|---------|---------|---------|
| `alertId` | `sentinel_tickets` 表 `id` | on-change | 跳过该告警 |
| `title` | `sentinel_tickets` 表 `title` | on-change | "未命名告警" |
| `severity` | `sentinel_tickets` 表 `severity` | on-change | `'info'` 默认 |
| `priority` | 哨兵配置 `SentinelConfig.priority` | on-change | `'P2'` 默认 |
| `sourceSentinelId` | `sentinel_tickets` 表 `sentinel_id` | on-change | `'unknown'` |
| `relatedGoalId` | `sentinel_tickets` 表 `goal_id` | on-change | null（通用哨兵告警）|
| `description` | `sentinel_tickets` 表 `description` | on-change | "（描述不可用）" |
| `deviationDetail` | 聚合自 `sentinel_tickets` + 方案哨兵最新Finding + 混淆因素日志 | hourly | null |
| `detectedAt` | `sentinel_tickets` 表 `detected_at` | on-change | now() |
| `acknowledged` | `sentinel_tickets` 表 `acknowledged` | on-change | false |

### 5.4 pendingProposals 字段

| 字段 | 数据来源 | 更新频率 | 降级策略 |
|------|---------|---------|---------|
| `proposalId` | GraphStore PROPOSAL 节点 `id` | on-change | 跳过该Proposal |
| `title` | PROPOSAL 节点 `props.title` | on-change | "未命名方案" |
| `status` | PROPOSAL 节点 `props.status` | on-change | `'draft'` 默认 |
| `sourceDiagnosisId` | PROPOSAL -> DERIVED_FROM -> DIAGNOSIS 边 | on-change | null |
| `rootCause` | PROPOSAL 节点 `props.rootCause` | on-change | "未知" |
| `options` | PROPOSAL 节点 `props.options` JSON | on-change | [] |
| `selectedOptionIndex` | PROPOSAL 节点 `props.selectedOptionIndex` | on-change | -1 |
| `createdAt` | PROPOSAL 节点 `createdAt` | on-change | now() |
| `expiresAt` | PROPOSAL 节点 `props.expiresAt` | on-change | now() + 5工作日 |
| `hoursUntilExpiry` | 计算：`(expiresAt - now) / 3600000` | realtime | null |

### 5.5 diagnosticsReferenced 字段

| 字段 | 数据来源 | 更新频率 | 降级策略 |
|------|---------|---------|---------|
| `diagnosisId` | DIAGNOSIS 节点 `id`（最近3份关联到本部门GOAL/TEAM的）| on-change | 空数组 |
| `title` | DIAGNOSIS 节点 `props.title` | on-change | "诊断报告" |
| `overallScore` | DIAGNOSIS 节点 `props.overallScore` | on-change | null |
| `relevantFindings` | DIAGNOSIS -> HAS_FINDING -> FINDING（过滤本部门维度）| on-change | [] |
| `relevantRecommendations` | DIAGNOSIS -> HAS_RECOMMENDATION -> RECOMMENDATION（过滤本部门）| on-change | [] |
| `spawnedGoals` | 计数：DIAGNOSIS <- DERIVED_FROM <- GOAL 边 | on-change | 0 |

### 5.6 compute contractId 速查表

| compute contractId | 功能描述 | 输入 | 输出 | 42边参数索引 |
|-------------------|---------|------|------|------------|
| `compute-variable-cost-ratio` | 变动成本率 | 部门财务数据 | ratio 0-1 | 边#7 |
| `compute-fixed-cost-rigidity` | 固定成本刚性 | 成本结构数据 | score 0-1 | 边#8 |
| `compute-operating-leverage` | 经营杠杆系数 | DOL输入 | 系数 | 边#9 |
| `compute-goal-deviation` | 目标偏离度 | Goal当前值+目标值 | deviation% | N/A (方案哨兵) |
| `compute-trend-slope` | 趋势斜率 | 时间序列 | slope+方向 | N/A (方案哨兵) |
| `compute-baseline-drift` | 基线漂移 | 历史基线+当前值 | drift_score | N/A (方案哨兵) |
| `compute-revenue-growth` | 营收增长率 | 营收时序 | growth% | 边#1 |
| `compute-customer-churn` | 客户流失率 | 客户数据 | churn% | 边#15 |
| `compute-employee-turnover` | 员工流失率 | HR数据 | turnover% | 边#23 |
| `compute-process-efficiency` | 流程效率 | 流程数据 | efficiency 0-1 | 边#31 |

### 5.7 GraphStore 节点类型速查

| 节点类型 | 关键属性 | 诊断引用 | Goal引用 |
|---------|---------|---------|---------|
| `TEAM` | name, headcount, department_id | DIAGNOSIS -> AFFECTS -> TEAM | GOAL -> ASSIGNED_TO -> TEAM |
| `GOAL` | name, status, priority, deadline, metrics, proposalRef | GOAL -> DERIVED_FROM -> DIAGNOSIS | GOAL -> DEPENDS_ON -> GOAL |
| `PROPOSAL` | title, status, options, rootCause, expiresAt | PROPOSAL -> DERIVED_FROM -> DIAGNOSIS | GOAL -> DERIVED_FROM -> PROPOSAL |
| `DIAGNOSIS` | title, overallScore, generatedAt | — | PROPOSAL/GOAL -> DERIVED_FROM -> DIAGNOSIS |
| `PERSON` | name, role, department_id | — | GOAL -> HAS_OWNER -> PERSON |
| `FINDING` | statement, confidence, severity, dimension | DIAGNOSIS -> HAS_FINDING -> FINDING | — |
| `RECOMMENDATION` | description, priority, feasibility | DIAGNOSIS -> HAS_RECOMMENDATION -> RECOMMENDATION | — |

### 5.8 sentinel_tickets 表结构

| 列名 | 类型 | 说明 | 被映射到的接口字段 |
|------|------|------|------------------|
| `id` | TEXT PK | 工单唯一ID | `WorkspaceAlert.alertId` |
| `sentinel_id` | TEXT | 哨兵ID | `sourceSentinelId` |
| `goal_id` | TEXT NULL | 关联Goal ID | `relatedGoalId` |
| `title` | TEXT | 告警标题 | `title` |
| `description` | TEXT | 详细描述 | `description` |
| `severity` | TEXT | emergency/critical/warning/info | `severity` |
| `evidence` | TEXT | JSON数组：证据列表 | `DeviationDetail.recentFindings` |
| `suggestion` | TEXT | 建议操作 | `suggestedAction` |
| `detected_at` | TEXT ISO-8601 | 检测时间 | `detectedAt` |
| `checked_at` | TEXT ISO-8601 | 哨兵执行时间 | `ActiveGoal.lastSentinelCheckAt` |
| `acknowledged` | INTEGER 0/1 | 是否已确认 | `acknowledged` |
| `suppressed` | INTEGER 0/1 | 是否被免打扰抑制 | — |
| `suppressed_reason` | TEXT NULL | dnd/frequency_limit/quiet_hours | — |
| `excluded_confounders` | TEXT NULL | JSON数组：排除的混淆因素 | `DeviationDetail.excludedConfounders` |



---

## 六、证据链弹窗

### 6.1 触发方式

中层在工作台点击任何告警卡片中的偏离值（如"偏离 +23.5%"），弹出证据链侧窗。

### 6.2 弹窗内容结构

```
+------------------------------------------------------------------+
|  证据链：变动成本率偏离 +23.5%                            [x]    |
+------------------------------------------------------------------+
|                                                                  |
|  当前值: 76.2%    目标值: 52.7%    偏离: +23.5%                 |
|                                                                  |
|  --- 最近3条哨兵Finding ---                                     |
|                                                                  |
|  [2026-07-10] 固定成本占比连续3个月上升                          |
|  置信度: 0.87    哨兵: sentinel-fixed-cost-ratio                 |
|  摘要: 固定成本/总成本从48%升至62%，变动成本空间被压缩。         |
|                                                                  |
|  [2026-07-03] 新签供应商合同中固定费用条款占比过高                |
|  置信度: 0.72    哨兵: sentinel-procurement-structure            |
|  摘要: 近3个月新签合同中，70%含最低采购量条款，锁定固定支出。    |
|                                                                  |
|  [2026-06-26] 人员结构中固定薪酬占比突破历史阈值                  |
|  置信度: 0.81    哨兵: sentinel-people-cost-structure            |
|  摘要: 固定薪酬/总薪酬达78%，行业健康区间为55-65%。              |
|                                                                  |
|  --- 已排除混淆因素 ---                                          |
|  [x] 季节性波动（同比数据已校准）                                |
|  [x] 一次性大额采购（已剔除6月ERP系统升级费用）                  |
|  [x] 会计准则变更（适用准则未变化）                              |
|                                                                  |
|  --- 关联诊断 ---                                                |
|  诊断报告: 2026-Q2组织健康诊断 (2026-06-15)                      |
|  相关段落: §4.2 成本结构刚性分析                                |
|  "固定成本占比62%，高于行业P75分位(55%)。建议推进变动成本化：    |
|   将固定薪酬转为'底薪+绩效'，将固定采购转为按量付费。"           |
|                                                                  |
|  [提出异议]                              [关闭]                  |
+------------------------------------------------------------------+
```

### 6.3 数据获取逻辑

```typescript
/**
 * getDeviationEvidenceChain — 获取偏离值的完整证据链
 * 
 * 契约:
 *   输入: goalId + metricName
 *   输出: DeviationDetail | null
 *   降级: GraphStore不可用 -> null + log.warn
 */
async function getDeviationEvidenceChain(
  goalId: string,
  metricName: string
): Promise<DeviationDetail | null> {
  // 1. 从方案哨兵获取最近3条Finding
  const sentinelId = `sentinel-goal-${goalId}`;
  const recentFindings = await querySentinelFindings(sentinelId, { limit: 3 });

  // 2. 从 sentinel_tickets 获取已排除混淆因素
  const ticket = await queryLatestTicket(goalId, metricName);
  const excludedConfounders = ticket?.excluded_confounders 
    ? JSON.parse(ticket.excluded_confounders) 
    : [];

  // 3. 获取关联诊断报告引用
  const diagnosisRef = await queryLinkedDiagnosis(goalId);

  // 4. 获取当前值和目标值
  const goal = await queryGoal(goalId);
  const metric = goal.metrics.find(m => m.name === metricName);

  if (!metric) {
    log.warn('[evidence-chain] metric not found', { goalId, metricName });
    return null;
  }

  return {
    metricName,
    currentValue: metric.currentValue,
    targetValue: metric.targetValue,
    deviationPercent: metric.deviationPercent ?? 0,
    direction: metric.deviationDirection ?? 'negative',
    recentFindings: recentFindings.map(f => ({
      summary: f.description,
      confidence: f.confidence ?? 0.5,
      detectedAt: f.detectedAt,
    })),
    excludedConfounders,
    diagnosticRef: diagnosisRef,
  };
}
```

### 6.4 前端渲染规范

- **弹窗宽度**: 480px（桌面）/ 全屏（移动）
- **层级**: z-index 高于工作台主体，低于全局导航
- **动画**: 从右侧滑入，250ms ease-out
- **关闭方式**: 点击[x]、点击遮罩层、按 Esc
- **"提出异议"按钮**: 见第七节

---

## 七、中层提出异议入口

### 7.1 入口位置

- 证据链弹窗底部："提出异议"按钮
- 告警卡片操作区："有疑问？"链接
- 方案详情页选项列表底部："这些选项都不对"按钮

### 7.2 异议提交流程

```
中层点击"提出异议"
  -> 弹出理由输入框（文本区，最多500字）
  -> 可选：勾选异议类型
     [ ] 数据有误（具体指标值不准确）
     [ ] 因果关系不对（A不导致B）
     [ ] 建议不可行（操作成本/组织阻力过高）
     [ ] 遗漏关键因素（有重要变量未纳入分析）
  -> 点击"提交异议"
  -> 触发轻量级再诊断（见第五章）
  -> 中层收到确认："已收到异议，正在重新分析（预计5分钟内完成）"
```

### 7.3 异议数据模型

```typescript
export interface DisputeSubmission {
  /** 异议ID */
  disputeId: string;
  /** 触发部门ID */
  departmentId: string;
  /** 关联Goal ID */
  goalId: string;
  /** 关联Proposal ID（如果是方案异议） */
  proposalId?: string;
  /** 异议类型 */
  types: DisputeType[];
  /** 中层输入的理由（原始文本） */
  reason: string;
  /** 提交时间 */
  submittedAt: string;
  /** 提交人中层标识 */
  submittedBy: string;
  /** 处理状态 */
  status: 'pending' | 'in_review' | 'resolved' | 'escalated';
  /** 再诊断结果引用 */
  reDiagnosisResult?: {
    diagnosisId: string;
    outcome: 'confirmed' | 'adjusted' | 'overturned';
    summary: string;
    completedAt: string;
  };
}

export type DisputeType = 
  | 'data_error'
  | 'causality_error'
  | 'infeasible'
  | 'missing_factor';
```

### 7.4 后续处理

异议提交后系统自动执行以下步骤：
1. 记录异议到 `goal_dispute_log` 表
2. 触发轻量级再诊断（1位专家 + 3-5条边 + 5分钟超时）
3. 再诊断结果出来后：
   - **确认原判断**: 通知中层"经复核，原判断成立。原因：[具体解释]"
   - **调整判断**: 生成 `GoalAdjustmentProposal`，推送中层确认
   - **推翻原判断**: Goal 标记 `abandoned`，触发全量再诊断

---

## 八、降级与错误处理

### 8.1 降级矩阵

| 降级场景 | 影响范围 | 用户可见表现 | 恢复策略 |
|---------|---------|-------------|---------|
| GraphStore 不可用 | activeGoals + pendingProposals + diagnosticsReferenced 全部降级 | 工作台显示"数据暂时不可用"骨架屏 | 每30秒重试，恢复后自动刷新 |
| 方案哨兵未返回 | 单个Goal的 deviationStatus = unknown | 该Goal卡片显示"基线建立中" | 等待下次Cron执行 |
| sentinel_tickets 表查询失败 | recentAlerts 为空 | 告警区显示"告警数据加载失败" | 返回 degraded: true，保留上次缓存 |
| compute contract 执行失败 | 单个 metric.currentValue = null | 指标显示"--" | 标记 degraded，下次Cron重试 |
| 免打扰规则引擎异常 | 所有告警不过滤直接推送 | 中层可能收到重复告警 | 安全策略：宁可多推不少推 |

### 8.2 工作台整体降级标记

```typescript
function computeWorkspaceDegraded(workspace: DepartmentWorkspace): DepartmentWorkspace {
  const degradedModules: string[] = [];

  if (workspace.activeGoals.some(g => g.deviationStatus === 'unknown')) {
    degradedModules.push('activeGoals.deviationStatus');
  }
  if (workspace.activeGoals.some(g => g.metrics.some(m => m.currentValue === null))) {
    degradedModules.push('activeGoals.metrics');
  }
  if (workspace.recentAlerts.length === 0 && !workspace.degraded) {
    // 空告警可能是正常的（无偏离），不标记降级
  }
  if (workspace.pendingProposals.length === 0 && workspace.activeGoals.length > 0) {
    // Goal应该有关联Proposal，全部为空可能数据异常
    degradedModules.push('pendingProposals');
  }

  return {
    ...workspace,
    degraded: degradedModules.length > 0,
    degradedModules,
  };
}
```

---

## 九、数据刷新策略

| 数据块 | 刷新方式 | 触发条件 | 缓存TTL |
|--------|---------|---------|---------|
| activeGoals | 轮询 + 事件 | 每5分钟轮询 / GraphStore GOAL节点变更事件 | 5分钟 |
| recentAlerts | WebSocket推送 | 新sentinel_tickets写入时 | 实时 |
| pendingProposals | 轮询 | 每10分钟轮询 | 10分钟 |
| diagnosticsReferenced | 惰性加载 | 工作台首次打开时加载 / 新诊断报告产出时事件推送 | 1小时 |
| nextAction | 每次计算 | 轮询触发时重新计算 | 跟随activeGoals |

---

## 十、接口定义总结

| 接口名 | 用途 | 所在文件（规划） |
|--------|------|----------------|
| `DepartmentWorkspace` | 工作台顶层容器 | `src/growth/workspace-types.ts` |
| `ActiveGoal` | 活跃目标展示 | `src/growth/workspace-types.ts` |
| `WorkspaceAlert` | 工作台告警条目 | `src/growth/workspace-types.ts` |
| `PendingProposal` | 待处理方案 | `src/growth/workspace-types.ts` |
| `DiagnosticReference` | 诊断报告引用 | `src/growth/workspace-types.ts` |
| `NextAction` | 下一步行动推荐 | `src/growth/workspace-types.ts` |
| `DeviationDetail` | 偏离证据链 | `src/growth/workspace-types.ts` |
| `DoNotDisturbConfig` | 免打扰配置 | `src/growth/workspace-types.ts` |
| `DisputeSubmission` | 异议提交 | `src/growth/workspace-types.ts` |

所有接口应定义在 `src/growth/workspace-types.ts`，遵循 Iron Law #47（契约优先：每个导出接口必须有 JSDoc 契约注释）。
