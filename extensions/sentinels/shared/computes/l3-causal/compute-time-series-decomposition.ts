/**
 * compute-time-series-decomposition.ts — 时间序列分解
 *
 * 契约ID: COMPUTE-TIME-SERIES-DECOMP-v1
 * 管理经济学(托马斯) Ch4 — 时间序列分析
 * @input series: number[], periodLength: number
 * @output { trend, seasonal, residual, forecast }
 * @degraded series.length<periodLength*2 -> degraded:true
 */
export interface TimeSeriesInterpretation { trendDirection: string; seasonalStrength: string; volatility: string; }
export interface TimeSeriesResult { trend: number[]; seasonal: number[]; residual: number[]; forecast: number; economicInterpretation: TimeSeriesInterpretation; degraded: boolean; warnings: string[]; }
export function computeTimeSeriesDecomposition(series: number[], periodLength: number = 4): TimeSeriesResult {
  const w: string[] = [];
  if (series.length < periodLength * 2) return { trend: [], seasonal: [], residual: [], forecast: 0,
    economicInterpretation: { trendDirection: 'unknown', seasonalStrength: '数据不足', volatility: 'N/A' },
    degraded: true, warnings: ['Series too short'] };
  // Simple moving average trend
  const trend: number[] = [];
  for (let i = periodLength - 1; i < series.length; i++) {
    trend.push(series.slice(i - periodLength + 1, i + 1).reduce((s, v) => s + v, 0) / periodLength);
  }
  // Seasonal: ratio to trend
  const seasonal: number[] = [];
  for (let i = 0; i < trend.length; i++) {
    const idx = i + periodLength - 1;
    seasonal.push(series[idx] / trend[i]);
  }
  // Residual
  const residual: number[] = [];
  for (let i = 0; i < seasonal.length; i++) {
    residual.push(series[i + periodLength - 1] - trend[i] * (seasonal[i] > 0 ? seasonal[i] : 1));
  }
  const lastTrend = trend[trend.length - 1];
  const trendChange = trend.length > 1 ? (trend[trend.length - 1] - trend[0]) / trend.length : 0;
  const forecast = Math.round((lastTrend + trendChange) * 100) / 100;
  const avgSeasonal = seasonal.reduce((s, v) => s + v, 0) / seasonal.length;
  return {
    trend: trend.map(v => Math.round(v * 100) / 100),
    seasonal: seasonal.map(v => Math.round(v * 100) / 100),
    residual: residual.map(v => Math.round(v * 100) / 100),
    forecast,
    economicInterpretation: {
      trendDirection: trendChange > 0 ? '上升趋势' : trendChange < 0 ? '下降趋势' : '平稳',
      seasonalStrength: Math.abs(avgSeasonal - 1) > 0.2 ? '强季节性' : '弱季节性',
      volatility: residual.reduce((s, v) => s + Math.abs(v), 0) / residual.length > series.reduce((s, v) => s + v, 0) / series.length * 0.1 ? '高波动' : '低波动',
    }, degraded: false, warnings: w };
}
