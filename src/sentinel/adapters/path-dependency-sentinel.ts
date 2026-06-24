/**
 * @deprecated 使用 extensions/sentinels/path-dependency/ 替代。新功能在此目录下开发。
 * sentinel/adapters/path-dependency-sentinel.ts — 路径依赖检测哨兵 (D2)
 * @state: real
 *
 * 包装 detectPathDependency()，检测组织是否因历史原因僵化在某个维度。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/path-dependency');

const config: SentinelConfig = {
  id: 'sentinel-path-dependency',
  name: '路径依赖检测',
  description: '检测组织能力缝隙中的历史锁定——对比同类团队基线，识别异常僵化的维度。',
  category: 'capability',
  priority: 'P2',
  mode: 'cron',
  cron: '0 9 * * 1',
  requiredDataSources: ['gap_snapshots'],
  confidenceModel: 'statistical',
  version: '1.0.0',
};

interface PathDep {
  dimension: string; stickinessScore: number; monthsUnchanged: number;
  peerAvgChangeRate: number | null; isAnomaly: boolean; lockedBy: string | null; interpretation: string;
}

function extractFindings(report: PathDep[], now: Date): SentinelFinding[] {
  const findings: SentinelFinding[] = [];
  const ts = now.toISOString();

  for (const dep of report) {
    if (dep.isAnomaly) {
      findings.push({
        id: `pathdep-anomaly-${dep.dimension}-${now.getTime()}`, severity: 'critical',
        title: `路径依赖异常: ${dep.dimension}`,
        description: `${dep.dimension}: ${dep.interpretation} 锁定原因: ${dep.lockedBy || '未知'}`,
        evidence: [`粘性得分: ${dep.stickinessScore.toFixed(2)}`, `未变化月数: ${dep.monthsUnchanged}`, `基线变化率: ${dep.peerAvgChangeRate?.toFixed(3) || 'N/A'}`],
        suggestion: dep.lockedBy ? `建议审查 "${dep.lockedBy}" 是否是唯一的路径——探索替代方案。` : '建议对该维度进行外部审视——引入外部视角打破路径锁定。',
        detectedAt: ts,
      });
    } else if (dep.stickinessScore > 0.7) {
      findings.push({
        id: `pathdep-high-stickiness-${dep.dimension}-${now.getTime()}`, severity: 'warning',
        title: `高粘性维度: ${dep.dimension}`,
        description: `${dep.interpretation}`,
        evidence: [`粘性得分: ${dep.stickinessScore.toFixed(2)}`, `未变化月数: ${dep.monthsUnchanged}`],
        suggestion: '虽然尚未达到异常阈值，但持续监测——如果粘性继续上升，将成为路径依赖。',
        detectedAt: ts,
      });
    }
  }

  return findings;
}

export const pathDependencySentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context);
    const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../sentinel/compute/path-dependency') as { detectPathDependency(t: string): PathDep[] };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.detectPathDependency(t), (rep) => extractFindings(rep as PathDep[], now), 'PathDep');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'PATHDEP_SENTINEL_CRASH', phase: 3, retryable: true }, '[PathDep] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: msg, degraded: true };
    } finally { restore(); }
  },
};
