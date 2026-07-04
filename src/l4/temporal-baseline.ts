/**
 * src/l4/temporal-baseline.ts — 时序基线 (V4.3.0)
 *
 * Holt-Winters 指数平滑算法，计算时序参数的 window 统计和 trend 方向。
 * 用于 compute 函数的时序数据分析和图遍历中的 getTemporalParams。
 *
 * 参数: alpha=0.3 (level), beta=0.1 (trend), gamma=0.1 (seasonal)
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l4/temporal-baseline');

export interface TemporalParams {
  current: number;
  window_3m: {
    mean: number;
    slope: number;
    variance: number;
  };
  window_12m: {
    mean: number;
    slope: number;
    variance: number;
  };
  trend: 'accelerating' | 'decelerating' | 'stable' | 'reversing';
}

/**
 * 计算时序基线。
 * @param timeSeries — 按时间排序的数值数组（最近的在最后）
 * @returns TemporalParams
 */
export function computeTemporalBaseline(timeSeries: number[]): TemporalParams {
  if (timeSeries.length === 0) {
    log.warn('空时序 — 返回默认基线');
    return {
      current: 0,
      window_3m: { mean: 0, slope: 0, variance: 0 },
      window_12m: { mean: 0, slope: 0, variance: 0 },
      trend: 'stable',
    };
  }

  const n = timeSeries.length;
  const current = timeSeries[n - 1];

  // === Holt-Winters 平滑 ===
  const alpha = 0.3;
  const beta = 0.1;
  const gamma = 0.1;

  const level: number[] = [timeSeries[0]];
  const trend: number[] = [timeSeries[1] - timeSeries[0] || 0];
  const seasonal: number[] = [0];

  for (let i = 1; i < n; i++) {
    const prevLevel = level[i - 1];
    const prevTrend = trend[i - 1];
    const prevSeasonal = seasonal[i - 1] || 0;

    const newLevel = alpha * (timeSeries[i] - prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
    const newTrend = beta * (newLevel - prevLevel) + (1 - beta) * prevTrend;
    const newSeasonal = gamma * (timeSeries[i] - newLevel) + (1 - gamma) * prevSeasonal;

    level.push(newLevel);
    trend.push(newTrend);
    seasonal.push(newSeasonal);
  }

  // === Window 统计 ===
  const window3m = n >= 3 ? timeSeries.slice(-3) : timeSeries;
  const window12m = n >= 12 ? timeSeries.slice(-12) : timeSeries;

  const mean3m = window3m.reduce((s, v) => s + v, 0) / window3m.length;
  const mean12m = window12m.reduce((s, v) => s + v, 0) / window12m.length;

  const variance3m = window3m.reduce((s, v) => s + (v - mean3m) ** 2, 0) / window3m.length;
  const variance12m = window12m.reduce((s, v) => s + (v - mean12m) ** 2, 0) / window12m.length;

  // === Trend 方向判定 (V4.3.0) ===
  // 直接用窗口斜率判定趋势方向，使用相对阈值（基于均值比例）
  const recentSlope = n >= 3 ? (timeSeries[n - 1] - timeSeries[n - 3]) / 2 : (n >= 2 ? timeSeries[n - 1] - timeSeries[0] : 0);
  const overallSlope = n >= 2 ? (timeSeries[n - 1] - timeSeries[0]) / (n - 1) : 0;
  const absSlope = Math.abs(recentSlope);
  const recentMean = (window3m.reduce((s, v) => s + v, 0) / window3m.length) || 1;
  // 相对斜率: 斜率绝对值 / 均值。小于 2% 视为稳定
  const relativeSlope = absSlope / Math.abs(recentMean);

  let direction: 'accelerating' | 'decelerating' | 'stable' | 'reversing';

  if (relativeSlope < 0.02) {
    direction = 'stable';
  } else if (recentSlope > 0) {
    direction = 'accelerating';
  } else {
    direction = 'decelerating';
  }

  // 如果最近趋势与整体趋势方向相反，标记为 reversing
  if (overallSlope * recentSlope < 0 && relativeSlope > 0.05) {
    direction = 'reversing';
  }

  return {
    current,
    window_3m: {
      mean: Math.round(mean3m * 100) / 100,
      slope: Math.round(recentSlope * 100) / 100,
      variance: Math.round(variance3m * 100) / 100,
    },
    window_12m: {
      mean: Math.round(mean12m * 100) / 100,
      slope: Math.round((overallSlope) * 100) / 100,
      variance: Math.round(variance12m * 100) / 100,
    },
    trend: direction,
  };
}
