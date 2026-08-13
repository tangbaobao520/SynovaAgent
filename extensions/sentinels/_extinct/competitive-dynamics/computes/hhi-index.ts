/**
 * competitive-dynamics/computes/hhi-index.ts — HHI指数计算
 *
 * Herfindahl-Hirschman Index: 市场份额平方和。
 * HHI < 1000 = 非集中, 1000-2500 = 中度集中, > 2500 = 高度集中
 */
export interface HhiResult {
  hhi: number;
  marketShareChanges: Array<{ name: string; share: number }>;
  concentration: 'low' | 'moderate' | 'high';
  degraded: boolean;
}

export function computeHhiIndex(competitors: Array<{ name: string; revenue: number }>): HhiResult {
  if (competitors.length === 0) {
    return { hhi: 0, marketShareChanges: [], concentration: 'low', degraded: true };
  }

  const totalRev = competitors.reduce((s, c) => s + c.revenue, 0);
  if (totalRev === 0) {
    return { hhi: 0, marketShareChanges: competitors.map(c => ({ name: c.name, share: 0 })), concentration: 'low', degraded: true };
  }

  const shares = competitors.map(c => ({ name: c.name, share: c.revenue / totalRev }));
  const hhi = Math.round(shares.reduce((s, c) => s + Math.pow(c.share * 100, 2), 0));

  let concentration: 'low' | 'moderate' | 'high';
  if (hhi < 1000) concentration = 'low';
  else if (hhi < 2500) concentration = 'moderate';
  else concentration = 'high';

  return { hhi, marketShareChanges: shares, concentration, degraded: false };
}
