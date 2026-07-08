/**
 * compute-competitor-feature-threat.ts — 竞争对手功能威胁评估
 *
 * 契约ID: COMPUTE-COMPETITOR-FEATURE-THREAT-v1
 * 模块: l4-competition
 * 消费边: SUBSTITUTES
 * 输入: ourFeatures: number, competitorFeatures: number, marketOverlap: number(0-1), growth: number
 * 输出(正常): { value: number(0-1威胁分), confidence:'high', evidence:[], degraded:false }
 */
export function computeCompetitorFeatureThreat(
  ourFeatures: number,
  competitorFeatures: number,
  marketOverlap: number,
  growth: number,
): {
  value: number;
  threatLevel: 'low' | 'moderate' | 'high' | 'severe';
  confidence: 'high' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (ourFeatures < 0 || competitorFeatures < 0 || marketOverlap < 0 || growth < 0) {
    return { value: 0, threatLevel: 'low', confidence: 'low', evidence: [], degraded: true, warnings: ['输入包含负数'], computedAt };
  }

  // Feature parity ratio
  const featureRatio = ourFeatures > 0 ? competitorFeatures / ourFeatures : competitorFeatures;
  const featureScore = Math.min(featureRatio / 2, 1); // 2x our features = max threat

  // Combined threat score
  const threat = featureScore * 0.4 + Math.min(marketOverlap, 1) * 0.35 + Math.min(growth, 1) * 0.25;

  const threatLevel = threat >= 0.8 ? 'severe' : threat >= 0.6 ? 'high' : threat >= 0.3 ? 'moderate' : 'low';

  return {
    value: Math.round(threat * 10000) / 10000,
    threatLevel,
    confidence: 'high',
    evidence: [`我方功能数: ${ourFeatures}`, `竞品功能数: ${competitorFeatures}`, `市场重叠: ${(marketOverlap * 100).toFixed(0)}%`],
    degraded: false,
    warnings,
    computedAt,
  };
}
