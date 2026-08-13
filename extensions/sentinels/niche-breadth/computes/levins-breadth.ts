/**
 * niche-breadth/computes/levins-breadth.ts — Levins 生态位宽度/深度/体积
 *
 * B = 1 / sum(p_j^2)  — 生态位宽度 (越大多样性越高)
 * D = max(p_j)         — 生态位深度 (对单一资源的依赖度)
 * V = B × (1 - D)     — 生态位体积 (综合指标)
 *
 * p_j = 客户/营收在细分市场j中的占比
 */
export interface LevinsResult {
  breadth: number;       // B: 生态位宽度 (1-∞)
  depth: number;         // D: 生态位深度 (0-1, 越高越依赖单一市场)
  volume: number;        // V: 生态位体积
  segmentCount: number;
  segments: Array<{ name: string; share: number }>;
  degraded: boolean;
}

export function computeLevinsBreadth(segments: Array<{ name: string; value: number }>): LevinsResult {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0 || segments.length === 0) {
    return { breadth: segments.length || 1, depth: 0, volume: 0, segmentCount: segments.length, segments: [], degraded: true };
  }

  const shares = segments.map(s => ({ name: s.name, share: s.value / total }));
  const sumSq = shares.reduce((s, sh) => s + sh.share * sh.share, 0);
  const breadth = sumSq > 0 ? 1 / sumSq : segments.length;
  const depth = Math.max(...shares.map(sh => sh.share));
  const volume = breadth * (1 - depth);

  return { breadth: Math.round(breadth * 100) / 100, depth: Math.round(depth * 100) / 100, volume: Math.round(volume * 100) / 100, segmentCount: segments.length, segments: shares, degraded: false };
}
