/**
 * market-lifecycle/computes/lifecycle-stage.ts — 产业生命周期判定
 *
 * 基于 Klepper (1996) 规则判定产业阶段：
 * - growth > 15% & netEntry > 0 → growth
 * - 5-15% & exits > entries → shakeout
 * - <5% & netEntry ≈ 0 → maturity
 * - 负增长 & netEntry < 0 → decline
 *
 * 纯函数：输入营收数据和竞争者进出数据，输出生命周期阶段。
 */
export type LifecycleStage = 'introduction' | 'growth' | 'shakeout' | 'maturity' | 'decline';

export interface LifecycleResult {
  stage: LifecycleStage;
  confidence: number;
  industryGrowthRate: number;
  netEntryRate: number;
  totalRevenue: number;
  competitorCount: number;
  degraded: boolean;
  warnings: string[];
}

export function computeLifecycleStage(params: {
  currentRevenue: number;
  previousRevenue: number;
  competitorEntries: number;
  competitorExits: number;
  totalCompetitors: number;
}): LifecycleResult {
  const { currentRevenue, previousRevenue, competitorEntries, competitorExits, totalCompetitors } = params;

  const warnings: string[] = [];

  if (totalCompetitors === 0 || currentRevenue === 0) {
    return {
      stage: 'introduction', confidence: 0.3,
      industryGrowthRate: 0, netEntryRate: 0,
      totalRevenue: currentRevenue, competitorCount: totalCompetitors,
      degraded: true,
      warnings: ['无竞争数据，默认 introduction 阶段'],
    };
  }

  const industryGrowthRate = previousRevenue > 0 ? (currentRevenue - previousRevenue) / previousRevenue : 0;
  const netEntryRate = totalCompetitors > 0 ? (competitorEntries - competitorExits) / totalCompetitors : 0;

  let stage: LifecycleStage;
  let confidence: number;

  if (industryGrowthRate > 0.15 && netEntryRate > 0) {
    stage = 'growth';
    confidence = 0.7;
  } else if (industryGrowthRate > 0.05 && industryGrowthRate <= 0.15 && competitorExits > competitorEntries) {
    stage = 'shakeout';
    confidence = 0.6;
  } else if (industryGrowthRate >= 0 && industryGrowthRate <= 0.05 && Math.abs(netEntryRate) < 0.02) {
    stage = 'maturity';
    confidence = 0.7;
  } else if (industryGrowthRate < 0 && netEntryRate < 0) {
    stage = 'decline';
    confidence = 0.65;
  } else {
    stage = 'maturity';
    confidence = 0.4;
    warnings.push('数据不充分，默认 maturity');
  }

  return { stage, confidence, industryGrowthRate, netEntryRate, totalRevenue: currentRevenue, competitorCount: totalCompetitors, degraded: false, warnings };
}
