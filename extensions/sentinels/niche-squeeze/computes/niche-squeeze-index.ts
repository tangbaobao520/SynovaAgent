export interface SqueezeResult { squeeze: number; hhi: number; competitorCount: number; degraded: boolean; segments: Array<{ name: string; share: number }>; }
export function computeNicheSqueezeIndex(competitors: Array<{ name: string; revenue: number }>): SqueezeResult {
  if (competitors.length === 0) return { squeeze: 0, hhi: 0, competitorCount: 0, degraded: true, segments: [] };
  const total = competitors.reduce((s, c) => s + c.revenue, 0);
  if (total === 0) return { squeeze: 0.5, hhi: 0, competitorCount: competitors.length, degraded: true, segments: competitors.map(c => ({ name: c.name, share: 0 })) };
  const shares = competitors.map(c => ({ name: c.name, share: c.revenue / total }));
  const hhi = Math.round(shares.reduce((s, sh) => s + Math.pow(sh.share * 100, 2), 0));
  const density = Math.min(competitors.length / 10, 1);
  const topShare = Math.max(...shares.map(sh => sh.share));
  const squeeze = Math.min(0.5 * (hhi / 3000) + 0.3 * density + 0.2 * topShare, 1);
  return { squeeze: Math.round(squeeze * 100) / 100, hhi, competitorCount: competitors.length, degraded: false, segments: shares };
}
