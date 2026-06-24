/**
 * @deprecated 使用 extensions/sentinels/gap-dynamics/ 替代。新功能在此目录下开发。
 * sentinel/adapters/gap-dynamics-sentinel.ts — 缝隙动力学哨兵 (D2)
 * @state: real
 *
 * 包装 computeDynamics()，监测组织能力缝隙的变化速度和粘性维度。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/gap-dynamics');

const config: SentinelConfig = {
  id: 'sentinel-gap-dynamics',
  name: '缝隙动力学 (GapDynamics)',
  description: '监测组织能力缝隙的变化速度、加速度和长期粘性维度。',
  category: 'capability',
  priority: 'P1',
  mode: 'cron',
  cron: '0 9 * * 1',
  requiredDataSources: ['gap_snapshots'],
  confidenceModel: 'deterministic',
  version: '1.0.0',
};

interface GapDynamics {
  velocity: Record<string, number>;
  acceleration: Record<string, number>;
  phaseCoupling: Array<{ dim1: string; dim2: string; correlation: number; lag: number }>;
  stickyDimensions: Array<{ dimension: string; variance: number; monthsUnchanged: number; interpretation: string }>;
  overallChangeRate: number;
}

function extractFindings(report: GapDynamics, now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = [];
  const ts = now.toISOString();

  // 负速度 (恶化) → critical
  for (const [dim, vel] of Object.entries(report.velocity)) {
    if (vel < -0.05) {
      findings.push({
        id: `gap-velocity-neg-${dim}-${now.getTime()}`, severity: 'critical',
        title: `缝隙恶化: ${dim}`,
        description: `${dim} 维度的变化速度为 ${vel.toFixed(3)} (负值=恶化)。整体变化率: ${report.overallChangeRate.toFixed(3)}`,
        evidence: [`速度: ${vel.toFixed(3)}`, `加速度: ${(report.acceleration[dim] || 0).toFixed(3)}`, `整体变化率: ${report.overallChangeRate.toFixed(3)}`],
        suggestion: '审查该维度的根本原因——是团队结构变化、人员流失还是外部压力。',
        detectedAt: ts,
      });
    }
  }

  // 粘性维度 (>3月不变) → warning
  for (const sticky of report.stickyDimensions) {
    if (sticky.monthsUnchanged > 3) {
      findings.push({
        id: `gap-sticky-${sticky.dimension}-${now.getTime()}`, severity: 'warning',
        title: `组织刚性: ${sticky.dimension} 维度 ${sticky.monthsUnchanged} 个月未变化`,
        description: `${sticky.dimension}: ${sticky.interpretation}`,
        evidence: [`未变化月数: ${sticky.monthsUnchanged}`, `方差: ${sticky.variance.toFixed(4)}`],
        suggestion: sticky.monthsUnchanged > 6
          ? `${sticky.dimension} 长期缺乏变化可能意味着组织适应性不足。建议主动引入变化刺激。`
          : `继续监测 ${sticky.dimension}，如超过 6 个月仍未变化，需要干预。`,
        detectedAt: ts,
      });
    }
  }

  // 强相位耦合 (|correlation| > 0.8) → info
  const strongCouplings = report.phaseCoupling.filter(c => Math.abs(c.correlation) > 0.8);
  if (strongCouplings.length > 0) {
    findings.push({
      id: `gap-coupling-${now.getTime()}`, severity: 'info',
      title: `${strongCouplings.length} 对维度存在强相位耦合`,
      description: strongCouplings.map(c => `${c.dim1}↔${c.dim2} (r=${c.correlation.toFixed(2)}, lag=${c.lag})`).join('; '),
      evidence: strongCouplings.map(c => `r(${c.dim1}, ${c.dim2}) = ${c.correlation.toFixed(3)}`),
      suggestion: '强耦合的维度应同时优化——单独优化一个维度可能被耦合维度拖回原点。',
      detectedAt: ts,
    });
  }

  return findings;
}

export const gapDynamicsSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context);
    const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../sentinel/compute/gap-dynamics') as { computeDynamics(t: string): GapDynamics | null };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.computeDynamics(t), (rep) => extractFindings(rep as GapDynamics, now), 'GapDynamics');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'GAPDYN_SENTINEL_CRASH', phase: 3, retryable: true }, '[GapDynamics] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: msg, degraded: true };
    } finally { restore(); }
  },
};
