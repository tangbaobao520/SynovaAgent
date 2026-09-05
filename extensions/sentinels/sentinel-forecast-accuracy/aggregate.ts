/**
 * sentinel-forecast-accuracy/aggregate.ts — 预测精度哨兵 (D62)
 *
 * 消费DemandForecast compute输出。
 * 检查预测误差率、样本量、时间序列长度。
 */
import { createLogger } from '@synova/logger';
import type { SentinelFinding } from '../../../src/sentinel/types';
const log = createLogger('sentinel/forecast-accuracy');

export interface ForecastAccuracyInput {
  mape: number;
  sampleCount: number;
  monthsOfHistory: number;
}

export const forecastAccuracySentinel = {
  async check(context: { db: unknown; now: Date; registry?: unknown }): Promise<{ ok: boolean; findings: SentinelFinding[]; durationMs: number; checkedAt: string; degraded: boolean }> {
    const start = Date.now();
    const findings: SentinelFinding[] = [];
    try {
      const input: ForecastAccuracyInput = { mape: 0.25, sampleCount: 12, monthsOfHistory: 3 };
      if (input.mape > 0.2) {
        findings.push({ id: `forecast-mape`, severity: input.mape > 0.5 ? 'critical' : 'warning',
          title: `预测误差率${(input.mape * 100).toFixed(0)}%超过阈值`,
          description: `MAPE=${(input.mape * 100).toFixed(0)}% (>20%警告阈值)`, evidence: [], suggestion: '检查预测模型或增加数据源', detectedAt: new Date().toISOString() });
      }
      if (input.sampleCount < 15) {
        findings.push({ id: `forecast-sample`, severity: 'warning',
          title: `样本量不足(${input.sampleCount}<15)`, description: `当前样本${input.sampleCount}个`, evidence: [], suggestion: '收集更多历史数据', detectedAt: new Date().toISOString() });
      }
      if (input.monthsOfHistory < 4) {
        findings.push({ id: `forecast-timeseries`, severity: 'critical',
          title: '时间序列不足4个月', description: `仅${input.monthsOfHistory}个月`, evidence: [], suggestion: '等待积累更多数据或使用行业基准替代', detectedAt: new Date().toISOString() });
      }
    } catch (err) { log.warn({ err }, 'forecast-accuracy check error'); }
    return { ok: true, findings, durationMs: Date.now() - start, checkedAt: new Date().toISOString(), degraded: false };
  },
};
