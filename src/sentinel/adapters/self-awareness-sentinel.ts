import { loadComputeDegraded } from '../compute-degraded';
/**
 * sentinel/adapters/self-awareness-sentinel.ts — 自知偏差哨兵 (D3)
 * @state: real
 *
 * 包装 computeSelfAwareness()，对比引擎观测 vs 人类自评的认知偏差。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/self-awareness');

const config: SentinelConfig = {
  id: 'sentinel-self-awareness',
  name: '自知偏差 (SelfAwareness)',
  description: '对比引擎观测评分 vs 人类自评——识别团队对自身能力的高估或低估。',
  category: 'collaboration',
  priority: 'P2',
  mode: 'cron',
  cron: '0 9 * * 1',
  requiredDataSources: ['gap_snapshots', 'self_assessments'],
  confidenceModel: 'statistical',
  version: '1.0.0',
};

interface SelfAwarenessDelta {
  dimension: string; engineScore: number; selfScore: number; delta: number;
  interpretation: string;
}
interface SelfAwarenessReport {
  deltas: SelfAwarenessDelta[];
  overallGap: number;
  significantDimensions: SelfAwarenessDelta[];
  interpretation: string;
}

function extractFindings(report: SelfAwarenessReport, now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = [];
  const ts = now.toISOString();

  for (const dim of report.significantDimensions) {
    const overOrUnder = dim.delta > 0 ? '高估' : '低估';
    findings.push({
      id: `sa-delta-${dim.dimension}-${now.getTime()}`, severity: 'warning',
      title: `认知偏差: ${dim.dimension} (${overOrUnder})`,
      description: `${dim.dimension}: 引擎评分 ${dim.engineScore.toFixed(2)}，自评 ${dim.selfScore.toFixed(2)}，偏差 ${dim.delta.toFixed(2)}。${dim.interpretation}`,
      evidence: [`引擎评分: ${dim.engineScore.toFixed(2)}`, `自评: ${dim.selfScore.toFixed(2)}`, `偏差 (delta): ${dim.delta.toFixed(2)}`],
      suggestion: dim.delta > 0
        ? `团队可能高估了 ${dim.dimension} 维度的能力——建议用客观指标校准自评。`
        : `团队可能低估了 ${dim.dimension} 维度的能力——这本身也是问题（不敢放手、资源错配）。`,
      detectedAt: ts,
    });
  }

  if (report.overallGap > 0.25 && report.significantDimensions.length === 0) {
    findings.push({
      id: `sa-high-gap-${now.getTime()}`, severity: 'info',
      title: `整体自知偏差偏高 (${report.overallGap.toFixed(2)})`,
      description: report.interpretation,
      evidence: [`整体偏差: ${report.overallGap.toFixed(2)}`],
      suggestion: '虽然无单个维度显著偏离，但累积偏差偏高——建议定期做第三方能力评估。',
      detectedAt: ts,
    });
  }

  return findings;
}

export const selfAwarenessSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context);
    const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = loadComputeDegraded('degraded')  as unknown as { computeSelfAwareness(t: string): SelfAwarenessReport };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.computeSelfAwareness(t), (rep) => extractFindings(rep as SelfAwarenessReport, now), 'SelfAwareness');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'SA_SENTINEL_CRASH', phase: 3, retryable: true }, '[SelfAwareness] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: msg, degraded: true };
    } finally { restore(); }
  },
};
