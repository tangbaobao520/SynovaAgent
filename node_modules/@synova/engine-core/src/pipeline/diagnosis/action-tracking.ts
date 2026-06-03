/**
 * action-tracking.ts — 诊断行动项采纳与执行追踪
 *
 * P2-20a: 反馈闭环的数据基础层。
 *
 * 设计来源：
 *   - ARCH-23 服务模式文档：顾问引导 vs 自助，共享同一数据模型
 *   - Hermes 模式：后台审查代理审查对话质量，学习用户偏好
 *   - Claw-Code 模式：SessionTracer 记录结构化事件流
 *
 * 两种服务模式共享同一数据模型——引擎不关心进度是谁更新的。
 * 顾问引导模式：顾问在每次客户沟通后批量更新
 * 自助模式：系统推送提醒 → 一键确认 → 超时自动推断
 *
 * 三张表：
 *   action_items     — 采纳决策 + 执行进度 + 外部任务
 *   diagnosis_feedback — 诊断质量反馈（满意度/准确度/改进建议）
 *   evolution_signals — 本地进化信号（术语修正/基线漂移/权重调整）
 */

// ====================================================================
// Types
// ====================================================================

export type AdoptionStatus = 'adopted' | 'deferred' | 'rejected' | 'modified';
export type DecidedBy = 'advisor' | 'sponsor' | 'delegate' | 'auto_inferred';
export type ProgressDiscount = 'full' | 'partial' | 'minimal' | 'unknown';
export type FeedbackRating = 'very_helpful' | 'helpful' | 'neutral' | 'unhelpful' | 'harmful';

export interface ActionAdoption {
  status: AdoptionStatus;
  decidedBy: DecidedBy;
  decidedAt: string;
  reason?: string;
  modifiedDescription?: string;
}

export interface ActionProgress {
  reportedBy: DecidedBy;
  reportedAt: string;
  percentage: number;
  discountLevel: ProgressDiscount;
  obstacles?: string[];
  notes?: string;
}

export interface ExternalTask {
  system: 'jira' | 'linear' | 'feishu' | 'manual';
  taskId: string;
  url: string;
  status: string;
  syncedAt?: string;
}

export interface ActionItem {
  actionId: string;
  diagnosisId: string;
  orgId: string;
  teamId: string;
  /** 行动描述（来自诊断 Phase 5） */
  description: string;
  /** 优先级 */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** 目标维度 */
  targetDimension: string;
  /** 采纳决策 */
  adoption: ActionAdoption;
  /** 执行进度历史（最新在前） */
  progress: ActionProgress[];
  /** 外部任务链接 */
  externalTasks: ExternalTask[];
  /** 预估工时（小时） */
  estimatedHours: number;
  /** 实际工时（小时，可选） */
  actualHours?: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 下次跟进日期 */
  nextFollowUpAt?: string;
}

export interface DiagnosisFeedback {
  feedbackId: string;
  diagnosisId: string;
  orgId: string;
  teamId: string;
  /** 整体满意度 */
  overallRating: FeedbackRating;
  /** 各维度评分 */
  dimensionRatings: Record<string, FeedbackRating>;
  /** 报告准确度自评（0-1） */
  accuracySelfReport: number;
  /** 采纳率（已采纳 + 已修改 / 总行动项） */
  adoptionRate: number;
  /** 最有价值的发现 */
  mostValuableInsight?: string;
  /** 最不符合实际的发现 */
  mostInaccurateInsight?: string;
  /** 改进建议 */
  improvementSuggestions: string[];
  /** 提交者 */
  submittedBy: DecidedBy;
  submittedAt: string;
}

// ====================================================================
// Evolution Signals (Layer 2 — 组织内自校准)
// ====================================================================

export interface TerminologyCorrection {
  /** 原术语 */
  original: string;
  /** 修正后术语 */
  corrected: string;
  /** 来源诊断 ID */
  sourceDiagnosisId: string;
  /** 置信度 */
  confidence: number;
}

export interface BaselineDrift {
  /** 指标名 */
  metricName: string;
  /** 原始基线值 */
  originalBaseline: number;
  /** 当前观测均值 */
  currentMean: number;
  /** 样本量 */
  sampleSize: number;
  /** 趋势方向 */
  trendDirection: 'improving' | 'stable' | 'declining';
  /** 置信度 */
  confidence: number;
}

export interface RoleWeightAdjustment {
  /** 角色 */
  role: string;
  /** 原权重 */
  originalWeight: number;
  /** 新权重 */
  adjustedWeight: number;
  /** 调整原因 */
  reason: string;
  /** 置信度 */
  confidence: number;
}

export interface EvolutionSignal {
  signalId: string;
  orgId: string;
  teamId: string;
  /** 信号来源诊断数 */
  diagnosisCount: number;
  /** 术语修正 */
  terminologyCorrections: TerminologyCorrection[];
  /** 基线漂移 */
  baselineDrifts: BaselineDrift[];
  /** 角色权重调整 */
  roleWeightAdjustments: RoleWeightAdjustment[];
  /** 生成时间 */
  generatedAt: string;
  /** 是否已提交到联邦进化 */
  submittedToFederation: boolean;
}

// ====================================================================
// In-Memory Store (SQLite 持久化后续迭代)
// ====================================================================

const actionStore = new Map<string, ActionItem>();
const feedbackStore = new Map<string, DiagnosisFeedback>();
const evolutionStore = new Map<string, EvolutionSignal>();

let _idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${++_idCounter}_${Math.random() /* nosec: nonce for ID uniqueness */.toString(36).slice(2, 5)}`;
}

// ====================================================================
// Action Tracking
// ====================================================================

/** 从诊断 Phase 5 输出创建行动项 */
export function createActionsFromDiagnosis(
  diagnosisId: string,
  orgId: string,
  teamId: string,
  actions: Array<{ description: string; priority: ActionItem['priority']; dimension: string; estimatedHours: number }>,
): ActionItem[] {
  const items: ActionItem[] = [];
  for (const a of actions) {
    const item: ActionItem = {
      actionId: genId('act'),
      diagnosisId,
      orgId,
      teamId,
      description: a.description,
      priority: a.priority,
      targetDimension: a.dimension,
      adoption: {
        status: 'deferred', // 默认延后，等待顾问/发起人决策
        decidedBy: 'auto_inferred',
        decidedAt: new Date().toISOString(),
      },
      progress: [],
      externalTasks: [],
      estimatedHours: a.estimatedHours,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    actionStore.set(item.actionId, item);
    items.push(item);
  }
  return items;
}

/** 更新采纳决策 */
export function updateAdoption(
  actionId: string,
  adoption: ActionAdoption,
): ActionItem | null {
  const item = actionStore.get(actionId);
  if (!item) return null;
  item.adoption = adoption;
  item.updatedAt = new Date().toISOString();
  return item;
}

/** 追加执行进度 */
export function addProgress(
  actionId: string,
  progress: ActionProgress,
): ActionItem | null {
  const item = actionStore.get(actionId);
  if (!item) return null;
  item.progress.unshift(progress);
  item.updatedAt = new Date().toISOString();
  return item;
}

/** 链接外部任务 */
export function linkExternalTask(
  actionId: string,
  task: ExternalTask,
): ActionItem | null {
  const item = actionStore.get(actionId);
  if (!item) return null;
  // 去重：同 system + taskId 不重复添加
  if (!item.externalTasks.some(t => t.system === task.system && t.taskId === task.taskId)) {
    item.externalTasks.push({ ...task, syncedAt: new Date().toISOString() });
  }
  item.updatedAt = new Date().toISOString();
  return item;
}

/** 自动推断执行进度（从被动信号） */
export function autoInferProgress(
  actionId: string,
  signals: { gitActivity?: boolean; softwareChange?: boolean; taskCompleted?: boolean },
): ActionProgress | null {
  const item = actionStore.get(actionId);
  if (!item) return null;

  let percentage = 0;
  let discount: ProgressDiscount = 'unknown';

  const positiveSignals = [signals.gitActivity, signals.softwareChange, signals.taskCompleted]
    .filter(Boolean).length;

  if (signals.taskCompleted) {
    percentage = 100; discount = 'full';
  } else if (positiveSignals >= 2) {
    percentage = 70; discount = 'partial';
  } else if (positiveSignals >= 1) {
    percentage = 30; discount = 'minimal';
  }

  const progress: ActionProgress = {
    reportedBy: 'auto_inferred',
    reportedAt: new Date().toISOString(),
    percentage,
    discountLevel: discount,
  };

  item.progress.unshift(progress);
  item.updatedAt = new Date().toISOString();
  return progress;
}

/** 获取组织的所有行动项 */
export function getOrgActions(orgId: string): ActionItem[] {
  return [...actionStore.values()].filter(a => a.orgId === orgId);
}

/** 获取需要跟进的行���项（逾期未更新） */
export function getDueFollowUps(orgId: string, overdueDays: number = 14): ActionItem[] {
  const now = Date.now();
  return getOrgActions(orgId).filter(a => {
    if (!a.nextFollowUpAt) return false;
    const followUp = new Date(a.nextFollowUpAt).getTime();
    return (now - followUp) > overdueDays * 86400000;
  });
}

// ====================================================================
// Diagnosis Feedback
// ====================================================================

/** 提交诊断反馈 */
export function submitFeedback(feedback: Omit<DiagnosisFeedback, 'feedbackId' | 'submittedAt'>): DiagnosisFeedback {
  const record: DiagnosisFeedback = {
    ...feedback,
    feedbackId: genId('fb'),
    submittedAt: new Date().toISOString(),
  };
  feedbackStore.set(record.feedbackId, record);
  return record;
}

/** 获取某次诊断的反馈 */
export function getDiagnosisFeedback(diagnosisId: string): DiagnosisFeedback | undefined {
  return [...feedbackStore.values()].find(f => f.diagnosisId === diagnosisId);
}

/** 计算组织级采纳率 */
export function getOrgAdoptionRate(orgId: string): {
  total: number;
  adopted: number;
  deferred: number;
  rejected: number;
  modified: number;
  rate: number;
} {
  const actions = getOrgActions(orgId);
  const total = actions.length;
  if (total === 0) return { total: 0, adopted: 0, deferred: 0, rejected: 0, modified: 0, rate: 0 };

  const adopted = actions.filter(a => a.adoption.status === 'adopted').length;
  const deferred = actions.filter(a => a.adoption.status === 'deferred').length;
  const rejected = actions.filter(a => a.adoption.status === 'rejected').length;
  const modified = actions.filter(a => a.adoption.status === 'modified').length;

  return {
    total, adopted, deferred, rejected, modified,
    rate: Math.round(((adopted + modified) / total) * 100) / 100,
  };
}

// ====================================================================
// Evolution Signals (Layer 2)
// ====================================================================

/** 从 ≥3 次诊断生成进化信号 */
export function generateEvolutionSignal(
  orgId: string,
  teamId: string,
  diagnosisIds: string[],
  options?: {
    terminologyCorrections?: TerminologyCorrection[];
    baselineDrifts?: BaselineDrift[];
    roleWeightAdjustments?: RoleWeightAdjustment[];
  },
): EvolutionSignal | null {
  if (diagnosisIds.length < 3) return null; // 最小样本量门禁

  const signal: EvolutionSignal = {
    signalId: genId('evo'),
    orgId,
    teamId,
    diagnosisCount: diagnosisIds.length,
    terminologyCorrections: options?.terminologyCorrections ?? [],
    baselineDrifts: options?.baselineDrifts ?? [],
    roleWeightAdjustments: options?.roleWeightAdjustments ?? [],
    generatedAt: new Date().toISOString(),
    submittedToFederation: false,
  };

  evolutionStore.set(signal.signalId, signal);
  return signal;
}

/** 标记进化信号已提交到联邦 */
export function markSubmittedToFederation(signalId: string): boolean {
  const signal = evolutionStore.get(signalId);
  if (!signal) return false;
  signal.submittedToFederation = true;
  return true;
}

/** 获取未提交的进化信号 */
export function getUnsubmittedSignals(orgId: string): EvolutionSignal[] {
  return [...evolutionStore.values()].filter(s => s.orgId === orgId && !s.submittedToFederation);
}

// ====================================================================
// Auto-Inference Engine (从被动信号推断执行情况)
// ====================================================================

export interface PassiveSignals {
  /** 软件清单变化（上次建议的取消订阅是否真的取消了） */
  softwareChanged: boolean;
  /** Git 活动模式变化（PR 审查流程改善是否被采纳） */
  gitPatternChanged: boolean;
  /** 协作元数据变化（异步站会是否建立） */
  collaborationPatternChanged: boolean;
  /** 外部任务状态（Jira/Linear 任务是否完成） */
  externalTaskCompleted: boolean;
}

/**
 * 自动推断：扫描所有行动项，用被动信号补充进度。
 * 仅对进度超过 14 天未更新的行动项进行自动推断。
 * 返回被更新行动项的数量。
 */
export function autoInferAllProgress(orgId: string, signals: Partial<PassiveSignals>): number {
  const actions = getOrgActions(orgId);
  let updated = 0;

  for (const action of actions) {
    // 仅对进度未知且超过 14 天未更新的行动项进行推断
    const lastProgress = action.progress[0];
    if (lastProgress && lastProgress.reportedBy !== 'auto_inferred') {
      const lastUpdate = new Date(lastProgress.reportedAt).getTime();
      if (Date.now() - lastUpdate < 14 * 86400000) continue;
    }

    const result = autoInferProgress(action.actionId, {
      gitActivity: signals.gitPatternChanged,
      softwareChange: signals.softwareChanged,
      taskCompleted: signals.externalTaskCompleted,
    });
    if (result && result.percentage > 0) updated++;
  }

  return updated;
}

// ====================================================================
// Advisor Workload Dashboard (顾问工作负载)
// ====================================================================

export interface AdvisorWorkload {
  /** 待审阅报告数 */
  pendingReviews: number;
  /** 逾期未更新的行动项 */
  overdueActions: ActionItem[];
  /** 需要准备的下次诊断 */
  upcomingDiagnoses: Array<{ orgId: string; dueDate: string; daysUntil: number }>;
  /** 总体采纳率 */
  overallAdoptionRate: number;
  /** 组织级采纳率 */
  orgAdoptionRates: Record<string, number>;
}

/** 计算顾问工作负载 */
export function getAdvisorWorkload(orgIds: string[]): AdvisorWorkload {
  const allActions: ActionItem[] = [];
  const orgRates: Record<string, number> = {};

  for (const orgId of orgIds) {
    const orgActions = getOrgActions(orgId);
    allActions.push(...orgActions);
    const stats = getOrgAdoptionRate(orgId);
    orgRates[orgId] = stats.rate;
  }

  const overdue = allActions.filter(a => {
    if (!a.nextFollowUpAt) return false;
    return new Date(a.nextFollowUpAt).getTime() < Date.now();
  });

  // 采纳率最高的前 3 条建议（推荐给新客户）
  const adopted = allActions
    .filter(a => a.adoption.status === 'adopted' || a.adoption.status === 'modified')
    .slice(0, 3);

  return {
    pendingReviews: allActions.filter(a => a.adoption.status === 'deferred').length,
    overdueActions: overdue.slice(0, 10),
    upcomingDiagnoses: [],
    overallAdoptionRate: allActions.length > 0
      ? allActions.filter(a => a.adoption.status === 'adopted' || a.adoption.status === 'modified').length / allActions.length
      : 0,
    orgAdoptionRates: orgRates,
  };
}

/** 清空所有存储（测试用） */
export function clearActionTrackingStore(): void {
  actionStore.clear();
  feedbackStore.clear();
  evolutionStore.clear();
}
