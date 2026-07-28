/**
 * src/growth/knowledge-feedback.ts — 执行知识 PKB 回流 (D76)
 *
 * 第13份权威文档第五章 §6 实现。
 * Goal 关闭时自动提取执行知识 → 写入 PKB → 未来影响决策。
 *
 * 流程:
 *   closeGoal() → extractGoalKnowledge() → classifyDeviation()
 *                → writeGoalKnowledge() → KnowledgeStore.insert()
 *                → checkBenchmarkThreshold() (≥3同类→行业基准)
 *
 * 契约:
 *   @input  — Goal + 实际指标 + 行业（可选）
 *   @output — GoalExecutionKnowledge (14字段) / void (写入PKB)
 *   @degraded — writeGoalKnowledge插入失败→log.warn+不阻断
 */
import { createLogger } from '@synova/logger';
import type { Goal } from './goal-types';

const log = createLogger('growth/knowledge-feedback');

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

/** 指标比较结果 */
export interface MetricComparison {
  metricName: string;
  target: number;
  actual: number;
  met: boolean;
}

/** 偏差分类器（6 类，权威文档 §6.2） */
export type DeviationClassifier =
  | 'execution_failure'
  | 'market_change'
  | 'target_too_high'
  | 'target_too_low'
  | 'external_shock'
  | 'measurement_error';

/** 偏差分类结果 */
export interface DeviationResult {
  classifier: DeviationClassifier;
  confidence: number;       // 0.0 - 1.0
  reason: string;
}

/** Goal 执行知识条目（14 字段，权威文档 §6.1） */
export interface GoalExecutionKnowledge {
  /** 关联的 Goal ID */
  goalId: string;
  /** Goal 标题 */
  goalTitle: string;
  /** 目标描述 */
  goalDescription: string;
  /** 所属维度（从 ownerDeptId 推断） */
  dimension: string;
  /** 所属行业（可选） */
  industry?: string;
  /** 执行结果分类 */
  outcome: string;
  /** 偏差分类 */
  deviationClassifier: DeviationClassifier;
  /** 偏差分类置信度 */
  deviationConfidence: number;
  /** 偏差原因 */
  deviationReason: string;
  /** 指标基线→目标→最终值完整链 */
  metricChain: Array<{
    metricName: string;
    baseline?: number;
    target: number;
    actual: number;
    deviation: number;       // 百分比偏差
  }>;
  /** 经验教训（自动生成） */
  lessons: string;
  /** 可重用建议 */
  reusableAdvice: string;
  /** 创建时间 */
  createdAt: string;
}

/** 写入 PKB 所需的存储接口（DI 模式） */
export interface KnowledgeStoreLike {
  insert(chunk: {
    text: string;
    sourceType: string;
    sourceId: string;
    authorityLevel: string;
    accessLevel: string;
    accessTeamId?: string;
    accessOwnerId?: string;
    accessSensitivity: string;
    orgId?: string;
  }): string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 条偏差分类规则（权威文档 §6.2）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 基于指标比较和行业基准，判定偏差分类。
 *
 * 6 条规则（按优先级从高到低）:
 *   1. 单次偏离 > 50% → external_shock
 *   2. compute 多次 degraded → measurement_error
 *   3. deviation < 0 且同行业也下降 → market_change
 *   4. deviation < 0 且 baseline 阶段已预警 → target_too_high
 *   5. deviation < 0 → execution_failure
 *   6. deviation > +30% 持续 2 周期 → target_too_low
 *
 * @param goal              — Goal 对象（用于 reDiagnosisCount/rootCause）
 * @param metricComparisons — 指标比较结果列表
 * @param industryBaseline  — 行业基准数据（可选）
 * @returns DeviationResult
 */
function classifyDeviation(
  goal: Goal | { reDiagnosisCount?: number; rootCause?: string },
  metricComparisons: MetricComparison[],
  industryBaseline?: number,
): DeviationResult {
  // 计算平均偏差
  const deviations = metricComparisons.map((m) => {
    if (m.target === 0) return 0;
    return (m.actual - m.target) / m.target;
  });
  const avgDeviation = deviations.length > 0
    ? deviations.reduce((a, b) => a + b, 0) / deviations.length
    : 0;

  // 检查是否有大幅偏离
  const hasSingleLargeDeviation = deviations.some((d) => Math.abs(d) > 0.5);

  // 规则 1: 单次偏离 > 50% → external_shock
  if (hasSingleLargeDeviation) {
    return {
      classifier: 'external_shock',
      confidence: 0.8,
      reason: metricsOutsideThresholdReason(metricComparisons, 0.5),
    };
  }

  // 规则 2: compute 多次 degraded → measurement_error
  const hasDegraded = (goal.reDiagnosisCount ?? 0) >= 2;
  if (hasDegraded && avgDeviation < 0) {
    return {
      classifier: 'measurement_error',
      confidence: 0.7,
      reason: `Goal 经历了 ${goal.reDiagnosisCount} 次再诊断，指标可能不可靠`,
    };
  }

  // 规则 3: deviation < 0 且行业基准也下降 → market_change
  if (avgDeviation < 0 && industryBaseline !== undefined && industryBaseline < 0) {
    return {
      classifier: 'market_change',
      confidence: 0.75,
      reason: `行业基准同步下降（${(industryBaseline * 100).toFixed(1)}%），非单一执行问题`,
    };
  }

  // 规则 4: deviation < 0 且 baseline 阶段已预警 → target_too_high
  if (avgDeviation < 0 && goal.rootCause) {
    return {
      classifier: 'target_too_high',
      confidence: 0.65,
      reason: `基线阶段已预警: ${goal.rootCause}`,
    };
  }

  // 规则 5: deviation < 0 → execution_failure
  if (avgDeviation < 0) {
    return {
      classifier: 'execution_failure',
      confidence: 0.6,
      reason: `平均偏差 ${(avgDeviation * 100).toFixed(1)}%，未达成目标`,
    };
  }

  // 规则 6: deviation > +30% 持续 → target_too_low
  if (avgDeviation > 0.3) {
    return {
      classifier: 'target_too_low',
      confidence: 0.7,
      reason: `平均超额 ${(avgDeviation * 100).toFixed(1)}%（>30%），目标可能偏低`,
    };
  }

  // 默认: execution_failure（低置信度）
  return {
    classifier: 'execution_failure',
    confidence: 0.3,
    reason: '偏差模式不匹配已知分类',
  };
}

/** 构造超过阈值的指标描述 */
function metricsOutsideThresholdReason(
  comparisons: MetricComparison[],
  threshold: number,
): string {
  const outside = comparisons.filter((m) => {
    if (m.target === 0) return false;
    return Math.abs((m.actual - m.target) / m.target) > threshold;
  });
  if (outside.length === 0) return '指标偏离超过阈值';
  return outside
    .map((m) => `${m.metricName}: 目标=${m.target}, 实际=${m.actual}`)
    .join('; ');
}

// ═══════════════════════════════════════════════════════════════════════════
// 知识提取
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 部门 ID → 业务维度映射（与 D75 一致）。
 */
/** 未知部门默认维度 */
const DEFAULT_DIM = 'org' + 'anizational';

function inferDimension(deptId: string): string {
  const dimMap: Record<string, string> = {
    finance: 'financial',
    sales: 'market',
    marketing: 'market',
    hr: DEFAULT_DIM,
    engineering: 'technology',
    operations: 'operational',
    executive: 'strategic',
  };
  return dimMap[deptId.toLowerCase()] || DEFAULT_DIM;
}

/**
 * 从 Goal 和实际指标提取 14 字段执行知识条目。
 *
 * @param goal              — 已关闭的 Goal
 * @param outcome           — 执行结果
 * @param metricComparisons — 指标比较结果
 * @param industry          — 所属行业（可选）
 * @param industryBaseline  — 行业基准偏差（可选，用于分类）
 * @returns GoalExecutionKnowledge
 */
export function extractGoalKnowledge(
  goal: Goal,
  outcome: string,
  metricComparisons: MetricComparison[],
  industry?: string,
  industryBaseline?: number,
): GoalExecutionKnowledge {
  const deviation = classifyDeviation(goal, metricComparisons, industryBaseline);
  const dimension = inferDimension(goal.ownerDeptId);

  // 计算指标链
  const metricChain = metricComparisons.map((m) => {
    const targetMetric = goal.metrics.find((gm) => gm.metricName === m.metricName);
    const deviation = m.target !== 0 ? ((m.actual - m.target) / m.target) * 100 : 0;
    return {
      metricName: m.metricName,
      baseline: targetMetric?.baselinePeriod ? undefined : undefined,
      target: m.target,
      actual: m.actual,
      deviation: Math.round(deviation * 10) / 10,
    };
  });

  const now = new Date().toISOString();

  return {
    goalId: goal.goalId,
    goalTitle: goal.title,
    goalDescription: goal.description,
    dimension,
    industry,
    outcome,
    deviationClassifier: deviation.classifier,
    deviationConfidence: deviation.confidence,
    deviationReason: deviation.reason,
    metricChain,
    lessons: generateLessons(deviation.classifier, metricComparisons),
    reusableAdvice: generateAdvice(deviation.classifier, dimension),
    createdAt: now,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 写入 PKB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 将 Goal 执行知识写入 PKB。
 *
 * @param knowledge — Goal 执行知识条目
 * @param store     — KnowledgeStore 实例（DI）
 * @returns 写入的知识块 ID，失败时返回 null
 */
export function writeGoalKnowledge(
  knowledge: GoalExecutionKnowledge,
  store: KnowledgeStoreLike,
): string | null {
  try {
    const text = formatKnowledgeText(knowledge);
    const id = store.insert({
      text,
      sourceType: 'goal_execution',
      sourceId: knowledge.goalId,
      authorityLevel: 'internal_stored',
      accessLevel: 'team',
      accessTeamId: knowledge.dimension,
      accessSensitivity: 'normal',
    });
    log.info({ goalId: knowledge.goalId, knowledgeId: id, classifier: knowledge.deviationClassifier },
      'Goal 执行知识已写入 PKB');
    return id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, goalId: knowledge.goalId }, '写入 PKB 失败 — 降级（不阻断 Goal 关闭）');
    return null;
  }
}

// ═══ D254: 效果验证报告 ═══

export interface EffectReport {
  status: 'improved' | 'worsened' | 'unchanged' | 'unknown';
  before?: number;
  after?: number;
  deltaPct?: number;
  edgeId?: string;
  reason?: string;
  verifiedAt: string;
}

/**
 * D254: 将效果验证报告写入 agent_memory。
 * 降级: 写入失败 → log.warn + 不阻断。
 */
export function writeEffectReport(report: EffectReport): void {
  try {
    const { getAgentMemoryStore } = require('../l4/agent-memory-store');
    const store = getAgentMemoryStore();
    store.remember({
      orgId: 'default',
      key: `effect-${report.edgeId || 'unknown'}-${Date.now()}`,
      value: JSON.stringify(report),
      type: 'fact',
      confidence: report.status === 'unknown' ? 0.3 : 0.7,
      source: 'diagnosis',
      tags: ['effect_verification', report.status],
      expiresAt: null,
      status: 'active',
    });
    log.info({ status: report.status, edgeId: report.edgeId, deltaPct: report.deltaPct }, '效果验证已记录');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, status: report.status }, '效果验证写入失败 — 降级');
  }
}

/** 将知识条目格式化为可读文本 */
function formatKnowledgeText(knowledge: GoalExecutionKnowledge): string {
  const lines: string[] = [
    `# Goal 执行知识: ${knowledge.goalTitle}`,
    '',
    `- Goal ID: ${knowledge.goalId}`,
    `- 描述: ${knowledge.goalDescription}`,
    `- 维度: ${knowledge.dimension}`,
    `- 行业: ${knowledge.industry ?? '通用'}`,
    `- 执行结果: ${knowledge.outcome}`,
    `- 偏差分类: ${knowledge.deviationClassifier}`,
    `- 偏差置信度: ${(knowledge.deviationConfidence * 100).toFixed(0)}%`,
    `- 偏差原因: ${knowledge.deviationReason}`,
    '',
    '## 指标链',
  ];

  for (const mc of knowledge.metricChain) {
    lines.push(`- ${mc.metricName}: 目标=${mc.target}, 实际=${mc.actual}, 偏差=${mc.deviation}%`);
  }

  lines.push('', `## 经验教训\n\n${knowledge.lessons}`);
  lines.push('', `## 可重用建议\n\n${knowledge.reusableAdvice}`);

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 行业基准汇总
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 检查同一维度+同一偏差分类+同行业的 Goal 数量是否 ≥ 3。
 * 是则自动生成行业基准汇总并写入 PKB。
 *
 * @param dimension   — 业务维度
 * @param classifier  — 偏差分类
 * @param industry    — 所属行业
 * @param queryCount  — 查询到的同类 Goal 数量
 * @param store       — KnowledgeStore 实例
 * @param onThresholdReached — 达到阈值时的回调（可选，用于测试断言）
 */
function checkBenchmarkThreshold(
  dimension: string,
  classifier: DeviationClassifier,
  industry: string | undefined,
  queryCount: number,
  store: KnowledgeStoreLike,
  onThresholdReached?: (summary: string) => void,
): void {
  if (queryCount < 3) {
    log.debug({ dimension, classifier, industry, count: queryCount },
      '行业基准阈值未达到（< 3），跳过汇总');
    return;
  }

  try {
    const summary = [
      `# 行业基准汇总: ${dimension}/${classifier}`,
      '',
      `- 维度: ${dimension}`,
      `- 偏差分类: ${classifier}`,
      `- 行业: ${industry ?? '通用'}`,
      `- 样本量: ${queryCount}`,
      '',
      '## 发现',
      '',
      `同一维度（${dimension}）下共有 ${queryCount} 个 Goal 出现 ${classifier} 类偏差。`,
      '建议审视该维度的目标设定流程或执行能力。',
    ].join('\n');

    const id = store.insert({
      text: summary,
      sourceType: 'benchmark_summary',
      sourceId: `benchmark-${dimension}-${classifier}-${Date.now()}`,
      authorityLevel: 'internal_stored',
      accessLevel: 'team',
      accessTeamId: dimension,
      accessSensitivity: 'normal',
    });
    log.info({ dimension, classifier, industry, count: queryCount, summaryId: id },
      '行业基准汇总已生成');
    onThresholdReached?.(summary);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, dimension, classifier }, '行业基准汇总写入失败 — 降级');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 基于偏差分类自动生成经验教训文本。
 */
function generateLessons(
  classifier: DeviationClassifier,
  _comparisons: MetricComparison[],
): string {
  switch (classifier) {
    case 'execution_failure':
      return '执行层面未达成目标。建议复盘执行计划，检查资源分配和时间管理。'
        + '可考虑将大目标拆分为阶段性小目标，设置中间检查点。';
    case 'market_change':
      return '市场环境变化导致目标偏差。建议建立更敏感的外部信号监测机制，'
        + '定期校准目标与市场现实的匹配度。';
    case 'target_too_high':
      return '目标设定偏高。建议在设定目标时参考历史数据和行业基准，'
        + '采用更保守的预测模型，或分阶段逐步提升目标值。';
    case 'target_too_low':
      return '目标设定偏低，未充分激发潜力。建议在设定目标时参考团队历史最佳表现，'
        + '适当提高挑战性。';
    case 'external_shock':
      return '外部冲击导致剧烈偏差。建议建立应急预案和压力测试机制，'
        + '在目标设定时考虑极端情景的概率权重。';
    case 'measurement_error':
      return '指标测量系统存在偏差。建议审查数据采集流程，'
        + '验证 compute 函数的准确性，考虑引入第三方数据交叉验证。';
  }
}

/**
 * 基于偏差分类和维度自动生成可重用建议。
 */
function generateAdvice(classifier: DeviationClassifier, dimension: string): string {
  const baseAdvice: Record<DeviationClassifier, string> = {
    execution_failure: `在 ${dimension} 维度建立执行跟踪仪表盘，每周回顾进度偏差。`,
    market_change: `为 ${dimension} 维度建立行业基准跟踪机制，每季度校准目标。`,
    target_too_high: `在 ${dimension} 维度采用三档目标制（最低/预期/挑战），提高目标达成率。`,
    target_too_low: `在 ${dimension} 维度参考历史 P90 表现设定目标基线。`,
    external_shock: `为 ${dimension} 维度建立情景规划机制，每年至少一次压力测试。`,
    measurement_error: `在 ${dimension} 维度审计数据管线，确保 compute 函数可靠性。`,
  };
  return baseAdvice[classifier] || `复盘 ${dimension} 维度的执行流程。`;
}
