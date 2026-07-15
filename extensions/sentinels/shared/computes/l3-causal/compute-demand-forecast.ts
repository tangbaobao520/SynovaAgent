/**
 * compute-demand-forecast.ts — 需求预测 (Demand Forecasting)
 *
 * 契约ID: COMPUTE-DEMAND-FORECAST-v1
 * 管理经济学(托马斯) Ch4 — 需求预测
 * @input historicalData: number[], periods:number
 * @output { forecast, trend, seasonality, confidence }
 * @degraded historicalData.length<3 -> degraded:true
 */
export interface DemandForecastInterpretation { trendDirection: string; forecastConfidence: string; planningImplication: string; }
export interface DemandForecastResult { forecast: number; trend: number; seasonality: number; confidence: string; economicInterpretation: DemandForecastInterpretation; degraded: boolean; warnings: string[]; }
export function computeDemandForecast(historicalData: number[], forecastPeriods: number = 1): DemandForecastResult {
  const w: string[] = [];
  if (historicalData.length < 3) return { forecast: 0, trend: 0, seasonality: 0, confidence: 'low',
    economicInterpretation: { trendDirection: 'unknown', forecastConfidence: '数据不足', planningImplication: 'N/A' },
    degraded: true, warnings: ['Need >=3 data points'] };
  const n = historicalData.length;
  const trend = (historicalData[n - 1] - historicalData[0]) / n;
  let forecast = historicalData[n - 1];
  for (let i = 0; i < forecastPeriods; i++) forecast += trend;
  const variance = historicalData.reduce((s, v) => s + (v - historicalData[n - 1]) ** 2, 0) / n;
  const confidence = variance < 0.1 * Math.abs(historicalData[n - 1]) ? 'high' : variance < 0.3 * Math.abs(historicalData[n - 1]) ? 'medium' : 'low';
  return {
    forecast: Math.round(forecast * 100) / 100,
    trend: Math.round(trend * 100) / 100,
    seasonality: 0,
    confidence,
    economicInterpretation: {
      trendDirection: trend > 0 ? '上升趋势' : trend < 0 ? '下降趋势' : '平稳',
      forecastConfidence: confidence === 'high' ? '高置信度' : confidence === 'medium' ? '中等置信度' : '低置信度',
      planningImplication: trend > 0 ? '需求增长，需扩充产能' : '需求萎缩，需控制产能',
    }, degraded: false, warnings: w };
}
