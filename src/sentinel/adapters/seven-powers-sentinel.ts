/**
 * sentinel/adapters/seven-powers-sentinel.ts — 7 Powers 竞争壁垒哨兵 (D6)
 * @state: real
 *
 * 包装 computeSevenPowers()，评估企业护城河的 7 种力量。
 * 每月 1 日 9:00 巡检 (低频——战略壁垒变化慢)。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/seven-powers');

const config: SentinelConfig = {
  id: 'sentinel-seven-powers',
  name: '7 Powers 竞争壁垒',
  description: '评估赫尔默七种战略力量——规模经济、网络效应、反定位、转换成本、品牌、垄断资源、流程优势。',
  category: 'strategy',
  priority: 'P1',
  mode: 'cron',
  cron: '0 9 1 * *',
  requiredDataSources: ['gap_snapshots', 'identity_markers'],
  confidenceModel: 'statistical',
  version: '1.0.0',
};

interface PowerAssessment {
  power: string; score: number; confidence: 'high' | 'medium' | 'low';
  evidence: string[]; method: string;
}
interface SevenPowersReport {
  powers: PowerAssessment[];
  overallMoatStrength: number;
  strongestPower: string;
  weakestPower: string;
  interpretation: string;
}

function extractFindings(report: SevenPowersReport, now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = [];
  const ts = now.toISOString();

  // 整体壁垒薄弱 → warning
  if (report.overallMoatStrength < 0.3) {
    findings.push({
      id: `7p-weak-moat-${now.getTime()}`, severity: 'warning',
      title: `竞争壁垒薄弱 (${(report.overallMoatStrength * 100).toFixed(0)}%)`,
      description: `7 Powers 综合壁垒强度 ${(report.overallMoatStrength * 100).toFixed(0)}%。最强: ${report.strongestPower}，最弱: ${report.weakestPower}。${report.interpretation}`,
      evidence: report.powers.filter(p => p.score > 0.3).map(p => `${p.power}: ${(p.score * 100).toFixed(0)}%`),
      suggestion: `优先强化 "${report.strongestPower}"——在已有优势上加码比从零建立新壁垒更高效。同时评估 "${report.weakestPower}" 是否是致命弱点。`,
      detectedAt: ts,
    });
  }

  // 最强力量仍不够强 → warning
  const strongest = report.powers.find(p => p.power === report.strongestPower);
  if (strongest && strongest.score < 0.5 && report.overallMoatStrength >= 0.3) {
    findings.push({
      id: `7p-no-standout-${now.getTime()}`, severity: 'warning',
      title: `缺乏突出竞争壁垒 (最强=${report.strongestPower} ${(strongest.score * 100).toFixed(0)}%)`,
      description: `最强力量 "${report.strongestPower}" 仅 ${(strongest.score * 100).toFixed(0)}%，未达到 50% 的防御阈值。`,
      evidence: report.powers.map(p => `${p.power}: ${(p.score * 100).toFixed(0)}%`),
      suggestion: '赫尔默: "一个 8 分的力量胜过 5 个 3 分的力量。" 集中资源打造一个真正的壁垒。',
      detectedAt: ts,
    });
  }

  // 每个力量低于阈值 → info (供专家分析)
  for (const p of report.powers) {
    if (p.score < 0.3 && p.power !== report.weakestPower) {
      findings.push({
        id: `7p-weak-${p.power}-${now.getTime()}`, severity: 'info',
        title: `${p.power}: 评分偏低 (${(p.score * 100).toFixed(0)}%)`,
        description: `${p.power} 当前评分为 ${(p.score * 100).toFixed(0)}%。${p.evidence.join('; ') || '无直接证据'}`,
        evidence: p.evidence,
        suggestion: p.method === 'keyword'
          ? '基于关键词推断，置信度有限——建议补充行业数据进行验证。'
          : '建议审查该力量是否适用于当前行业/阶段——不适用的力量应标注而非打低分。',
        detectedAt: ts,
      });
    }
  }

  return findings;
}

export const sevenPowersSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context);
    const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../../packages/engine-core/src/pipeline/diagnosis/seven-powers') as { computeSevenPowers(t: string): SevenPowersReport | null };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.computeSevenPowers(t), (rep) => extractFindings(rep as SevenPowersReport, now), '7Powers');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: '7P_SENTINEL_CRASH', phase: 3, retryable: true }, '[7Powers] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: msg, degraded: true };
    } finally { restore(); }
  },
};
