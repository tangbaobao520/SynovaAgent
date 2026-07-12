/**
 * competitive-dynamics/computes/competitive-intensity.ts — 竞争强度计算
 *
 * 基于竞争者数量、市场份额分布、进入/退出比率评估竞争强度。
 */
export interface CompetitiveIntensityResult {
  intensity: number;  // 0-1
  competitorCount: number;
  netEntryRate: number;
  degraded: boolean;
}

export function computeCompetitiveIntensity(params: {
  competitorCount: number;
  recentEntries: number;
  recentExits: number;
  marketGrowth: number;
}): CompetitiveIntensityResult {
  const { competitorCount, recentEntries, recentExits, marketGrowth } = params;

  if (competitorCount === 0) {
    return { intensity: 0, competitorCount: 0, netEntryRate: 0, degraded: true };
  }

  // 竞争强度 = f(竞争者数量密度, 进入率, 市场增长反比)
  const densityScore = Math.min(competitorCount / 20, 1); // 20+竞争者=饱和
  const entryRate = competitorCount > 0 ? (recentEntries + recentExits) / competitorCount : 0;
  const growthInverse = marketGrowth > 0 ? Math.max(1 - marketGrowth / 0.3, 0) : 0.8; // 低增长=高强度

  const intensity = 0.4 * densityScore + 0.3 * Math.min(entryRate, 1) + 0.3 * growthInverse;
  const netEntryRate = competitorCount > 0 ? (recentEntries - recentExits) / competitorCount : 0;

  return { intensity: Math.round(intensity * 100) / 100, competitorCount, netEntryRate, degraded: false };
}
