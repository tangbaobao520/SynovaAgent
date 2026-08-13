/**
 * src/l4/temporal-baseline.ts — 时序基线 (Holt-Winters 指数平滑)
 *
 * 实现带季节性分量的三重指数平滑。
 * alpha=0.3 (level), beta=0.1 (trend), gamma=0.1 (seasonal)
 * 返回 current, window_3m/window_12m 的 mean/slope/variance, trend 方向
 *
 * V4.3.0 — 本体层重建
 */
export interface TemporalParams {
  current: number;
  window_3m: { mean: number; slope: number; variance: number };
  window_12m: { mean: number; slope: number; variance: number };
  trend: 'accelerating' | 'decelerating' | 'stable' | 'reversing';
}

/**
 * Holt-Winters 三重指数平滑。
 *
 * 公式:
 *   level(t) = alpha * (value(t) - season(t-period)) + (1-alpha) * (level(t-1) + trend(t-1))
 *   trend(t) = beta * (level(t) - level(t-1)) + (1-beta) * trend(t-1)
 *   season(t) = gamma * (value(t) - level(t)) + (1-gamma) * season(t-period)
 *
 * @param timeSeries - 按时间排序的数值数组（至少 2*period 个点才能启用季节性）
 * @param period - 季节周期长度（默认 4，适用于季度数据）
 * @param alpha - 水平平滑系数 (0-1)
 * @param beta - 趋势平滑系数 (0-1)
 * @param gamma - 季节平滑系数 (0-1, 0=禁用季节性)
 */
export function computeTemporalBaseline(
  timeSeries: number[],
  period: number = 4,
  alpha: number = 0.3,
  beta: number = 0.1,
  gamma: number = 0.1,
): TemporalParams {
  if (timeSeries.length === 0) {
    return { current: 0, window_3m: { mean: 0, slope: 0, variance: 0 }, window_12m: { mean: 0, slope: 0, variance: 0 }, trend: 'stable' };
  }

  const current = timeSeries[timeSeries.length - 1];

  // 初始化水平、趋势和季节分量
  let level = timeSeries[0];
  let trend = timeSeries.length > 1 ? timeSeries[1] - timeSeries[0] : 0;

  // 初始化季节分量（从第一个周期估算）
  const initialSeason: number[] = [];
  if (gamma > 0 && timeSeries.length >= period * 2) {
    // 用第一个完整周期的去趋势值初始化季节分量
    const firstCycle = timeSeries.slice(0, period);
    const cycleAvg = firstCycle.reduce((s, v) => s + v, 0) / period;
    for (let i = 0; i < period; i++) {
      initialSeason[i] = firstCycle[i] - cycleAvg;
    }
  } else {
    gamma = 0; // 数据不足时禁用季节性
  }

  // 为每个时间点复制季节分量（循环使用）
  const season: number[] = [];
  for (let i = 0; i < timeSeries.length; i++) {
    if (i < initialSeason.length) {
      season[i] = initialSeason[i];
    } else {
      season[i] = 0;
    }
  }

  // Holt-Winters 迭代
  for (let i = 1; i < timeSeries.length; i++) {
    const seasonalIdx = gamma > 0 ? i % period : -1;
    const seasonalVal = seasonalIdx >= 0 && seasonalIdx < initialSeason.length ? initialSeason[seasonalIdx] : 0;

    // 去季节性后的值
    const deseasonalized = gamma > 0 ? timeSeries[i] - seasonalVal : timeSeries[i];

    const oldLevel = level;
    level = alpha * deseasonalized + (1 - alpha) * (level + trend);
    trend = beta * (level - oldLevel) + (1 - beta) * trend;

    // 更新季节分量
    if (gamma > 0 && seasonalIdx >= 0) {
      initialSeason[seasonalIdx] = gamma * (timeSeries[i] - level) + (1 - gamma) * seasonalVal;
    }
  }

  // 窗口计算 (近期数据的滑动统计)
  const w3m = timeSeries.slice(-Math.min(3, timeSeries.length));
  const w12m = timeSeries.slice(-Math.min(12, timeSeries.length));

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
