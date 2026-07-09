/**
 * interview/gpi-estimator.ts — 无数据时GPI估算代理 (T11 无数据诊断)
 *
 * 契约ID: T11-GPI-ESTIMATOR-v1
 * 模块: interview (L2)
 * 消费方: POST /api/diagnosis/upload/interview → expert-dispatcher
 *
 * 约束3: 所有输出含 confidence:'preliminary' + dataSource:'interview'。
 * GPI = f(外部机会系数, 价值捕获效率, 内生创造速率, 增长成本系数)
 * 无数据时增长成本始终为 null（需财务数据）。
 *
 * 代理指标设计参考: 深度研究-无数据诊断能力-20260707.md §3.3
 */

import type { CausalSignal } from './signals';
import { createLogger } from '@synova/logger';

const log = createLogger('interview/gpi-estimator');

// ═══ Types ═══

export interface GPIFactorEstimate {
  score: number | null;
  confidence: 'preliminary' | 'unavailable';
  source: string;
  reason?: string;
}

export interface GPIEstimate {
  external_opportunity: GPIFactorEstimate;
  value_capture: GPIFactorEstimate;
  endogenous_creation: GPIFactorEstimate;
  growth_cost: GPIFactorEstimate;
  /** GPI 综合值（只聚合前三个因子），0-1 */
  gpi: number;
  /** GPI 分级: 'red' < 0.4, 'yellow' 0.4-0.7, 'green' > 0.7 */
  gpiTier: 'red' | 'yellow' | 'green';
  degraded: boolean;
  dataSource: 'interview';
}

export interface GPIInput {
  /** 行业信息（来自 Phase0State.industry） */
  industry?: string;
  /** 信号集（来自 signal-extractor） */
  signals: CausalSignal[];
  /** 矛盾数 */
  contradictionCount: number;
  /** 盲区维度数 */
  blindSpotCount: number;
}

// ═══ Industry-stage baseline matrix ═══
// 行业×阶段预设外部机会系数 (基于学术研究和行业基线)
// 参考: market-lifecycle 哨兵的阶段判定逻辑

const INDUSTRY_OPPORTUNITY_BASELINE: Record<string, number> = {
  // 高增长行业
  saas: 0.75,
  ai: 0.80,
  fintech: 0.70,
  biotech: 0.65,
  // 稳定行业
  enterprise: 0.55,
  consumer: 0.50,
  healthcare: 0.55,
  education: 0.50,
  // 传统行业
  manufacturing: 0.40,
  retail: 0.35,
  logistics: 0.40,
  energy: 0.35,
};

const DEFAULT_OPPORTUNITY = 0.50;

// ═══ Estimation Logic ═══

/**
 * 估算外部机会系数 (α)
 *
 * 基于：
 * 1. 行业基线矩阵（industry baseline）
 * 2. 信号调整：市场悲观信号 → 下调；市场乐观信号 → 上调
 */
function estimateExternalOpportunity(
  signals: CausalSignal[],
  industry?: string,
): GPIFactorEstimate {
  let base = industry
    ? (INDUSTRY_OPPORTUNITY_BASELINE[industry] ?? DEFAULT_OPPORTUNITY)
    : DEFAULT_OPPORTUNITY;

  // 检查市场悲观信号
  const marketShiftSignals = signals.filter(
    s => s.dimension === 'market_shift' || s.dimension === 'substitutes',
  );
  // 检查市场乐观信号
  const positiveSignals = signals.filter(
    s => s.signalStrength === 'strong' && (
      s.dimension === 'goal_alignment' || s.dimension === 'strategy_clarity'
    ),
  );

  // 每个悲观信号 -0.05, 最多 -0.2
  const penalty = Math.min(marketShiftSignals.length * 0.05, 0.2);
  // 每个强信号 +0.03, 最多 +0.15
  const bonus = Math.min(positiveSignals.length * 0.03, 0.15);

  const score = Math.max(0.1, Math.min(1.0, base - penalty + bonus));

  return {
    score: Math.round(score * 100) / 100,
    confidence: 'preliminary',
    source: industry
      ? `industry_baseline(${industry})_adjusted_by_${marketShiftSignals.length}_market_signals`
      : 'default_baseline_adjusted_by_interview_signals',
  };
}

/**
 * 估算价值捕获效率 (β)
 *
 * 基于：
 * 1. 矛盾数量（矛盾越多 → 价值捕获效率越低）
 * 2. CEO vs 一线的认知偏差
 * 3. 盲区维度数
 */
function estimateValueCapture(
  contradictionCount: number,
  signals: CausalSignal[],
  blindSpotCount: number,
): GPIFactorEstimate {
  // 起评分 0.7
  let score = 0.7;

  // 矛盾扣分：每 2 个矛盾 -0.05
  const contradictionPenalty = Math.min(Math.floor(contradictionCount / 2) * 0.05, 0.2);
  score -= contradictionPenalty;

  // CEO 感知偏差扣分
  const ceoBiasSignals = signals.filter(
    s => s.dimension === 'signal_transmits' && s.signalStrength === 'strong',
  );
  score -= Math.min(ceoBiasSignals.length * 0.08, 0.2);

  // 盲区扣分
  score -= blindSpotCount * 0.05;

  // 信号丰富度加成（信号越多 = 了解更多情况 = 可能捕获价值）
  if (signals.length >= 8) score += 0.05;
  if (signals.length >= 15) score += 0.05;

  const finalScore = Math.max(0.1, Math.min(1.0, score));

  return {
    score: Math.round(finalScore * 100) / 100,
    confidence: 'preliminary',
    source: `contradiction_based(${contradictionCount}_contradictions, ${blindSpotCount}_blind_spots)`,
  };
}

/**
 * 估算内生创造速率 (γ)
 *
 * 基于：
 * 1. 痛觉点信号数量（越多 → 内生创造越低）
 * 2. 信号强度分布
 */
function estimateEndogenousCreation(
  signals: CausalSignal[],
): GPIFactorEstimate {
  // 痛觉点信号（R2 提取的 pain_ 信号）
  const painSignals = signals.filter(s => s.id.startsWith('pain_'));
  const contradictionSignals = signals.filter(s => s.evidenceType === 'contradiction');

  // 起评分 0.65
  let score = 0.65;

  // 痛觉点扣分：每 2 个痛觉点 -0.05
  const painPenalty = Math.min(Math.floor(painSignals.length / 2) * 0.05, 0.25);
  score -= painPenalty;

  // 矛盾信号扣分
  score -= Math.min(contradictionSignals.length * 0.03, 0.15);

  // 强信号太多 → 组织问题严重 → 内生创造低
  const strongSignals = signals.filter(s => s.signalStrength === 'strong');
  if (strongSignals.length >= 5) score -= 0.1;

  const finalScore = Math.max(0.1, Math.min(1.0, score));

  return {
    score: Math.round(finalScore * 100) / 100,
    confidence: 'preliminary',
    source: `pain_signal_based(${painSignals.length}_pain_signals, ${strongSignals.length}_strong_signals)`,
  };
}

/**
 * 估算 GPI（无数据模式）
 *
 * 约束3: 所有因子 confidence='preliminary', dataSource='interview'。
 * 增长成本系数始终为 null（需部署后财务数据）。
 *
 * @param input - 输入信号和元信息
 * @returns GPI 估算
 */
export function estimateGPI(input: GPIInput): GPIEstimate {
  const { industry, signals, contradictionCount, blindSpotCount } = input;

  log.debug({
    industry, signalCount: signals.length,
    contradictionCount, blindSpotCount,
  }, 'GPI 估算启动');

  // 估算各因子
  const external_opportunity = estimateExternalOpportunity(signals, industry);
  const value_capture = estimateValueCapture(contradictionCount, signals, blindSpotCount);
  const endogenous_creation = estimateEndogenousCreation(signals);

  // 增长成本始终 unavailable（需财务数据）
  const growth_cost: GPIFactorEstimate = {
    score: null,
    confidence: 'unavailable',
    source: 'requires_financial_data',
    reason: '需财务数据',
  };

  // 聚合 GPI = 前三个因子的均值（如某个因子为 null 则跳过）
  const factorScores = [
    external_opportunity.score,
    value_capture.score,
    endogenous_creation.score,
  ].filter((s): s is number => s !== null);

  const gpi = factorScores.length > 0
    ? Math.round((factorScores.reduce((a, b) => a + b, 0) / factorScores.length) * 100) / 100
    : 0;

  // GPI 分级
  const gpiTier: 'red' | 'yellow' | 'green' = gpi < 0.4 ? 'red' : gpi > 0.7 ? 'green' : 'yellow';

  log.info({
    external_opportunity: external_opportunity.score,
    value_capture: value_capture.score,
    endogenous_creation: endogenous_creation.score,
    gpi,
    tier: gpiTier,
  }, 'GPI 估算完成');

  return {
    external_opportunity,
    value_capture,
    endogenous_creation,
    growth_cost,
    gpi,
    gpiTier,
    degraded: false,
    dataSource: 'interview',
  };
}
