/**
 * src/l4/temporal-baseline.ts — 时序基线 (Holt-Winters 指数平滑)
 *
 * 计算时序参数的 current/window_3m/window_12m/slope/variance/trend。
 * alpha=0.3 (level), beta=0.1 (trend), gamma=0.1 (seasonal)
 *
 * V4.3.0 — 本体层重建
 */
export interface TemporalParams {
  current: number;
  window_3m: { mean: number; slope: number; variance: number };
  window_12m: { mean: number; slope: number; variance: number };
  trend: 'accelerating' | 'decelerating' | 'stable' | 'reversing';
}

export function computeTemporalBaseline(timeSeries: number[]): TemporalParams {
  const warnings: string[] = [];

  if (timeSeries.length === 0) {
    return { current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' };
  }

  const current = timeSeries[timeSeries.length - 1];

  // Holt-Winters 简单实现 (alpha=0.3 level, beta=0.1 trend)
  let level = timeSeries[0];
  let trend = timeSeries.length > 1 ? timeSeries[1] - timeSeries[0] : 0;

  for (let i = 1; i < timeSeries.length; i++) {
    const newLevel = 0.3 * timeSeries[i] + 0.7 * (level + trend);
    trend = 0.1 * (newLevel - level) + 0.9 * trend;
    level = newLevel;
  }

  // 窗口计算
  const w3m = timeSeries.slice(-3);
  const w12m = timeSeries.slice(-12);

  const w3mMean = w3m.length > 0 ? w3m.reduce((s, v) => s + v, 0) / w3m.length : 0;
  const w12mMean = w12m.length > 0 ? w12m.reduce((s, v) => s + v, 0) / w12m.length : 0;

  const w3mSlope = w3m.length >= 2 ? (w3m[w3m.length - 1] - w3m[0]) / w3m.length : 0;
  const w12mSlope = w12m.length >= 2 ? (w12m[w12m.length - 1] - w12m[0]) / w12m.length : 0;

  const w3mVariance = w3m.length > 0 ? w3m.reduce((s, v) => s + (v - w3mMean) ** 2, 0) / w3m.length : 0;
  const w12mVariance = w12m.length > 0 ? w12m.reduce((s, v) => s + (v - w12mMean) ** 2, 0) / w12m.length : 0;

  // 趋势判定
  let trendLabel: 'accelerating' | 'decelerating' | 'stable' | 'reversing';
  const slopeMagnitude = Math.abs(w12mSlope);
  const meanMagnitude = Math.abs(w12mMean) || 1;

  if (slopeMagnitude / meanMagnitude < 0.02) {
    trendLabel = 'stable';
  } else if (w12mSlope > 0) {
    trendLabel = w3mSlope > w12mSlope * 0.5 ? 'accelerating' : 'decelerating';
  } else {
    trendLabel = w12mSlope < 0 && w3mSlope > 0 ? 'reversing' : 'decelerating';
  }

  return {
    current: Math.round(current * 100) / 100,
    window_3m: { mean: Math.round(w3mMean * 100) / 100, slope: Math.round(w3mSlope * 100) / 100, variance: Math.round(w3mVariance * 100) / 100 },
    window_12m: { mean: Math.round(w12mMean * 100) / 100, slope: Math.round(w12mSlope * 100) / 100, variance: Math.round(w12mVariance * 100) / 100 },
    trend: trendLabel,
  };
}
