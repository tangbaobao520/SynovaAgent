/**
 * sentinel/adapters/hona-sentinel.ts — 异质节点网络哨兵 (D3)
 * @state: real
 *
 * 包装 computeHONA()，监测 Agent 交互网络的密度、中心性和拓扑结构。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/hona');

const config: SentinelConfig = {
  id: 'sentinel-hona', name: '异质节点网络 (HONA)', description: '监测 Agent 交互网络的密度、中心性、孤立节点和拓扑结构。', category: 'collaboration', priority: 'P2', mode: 'cron', cron: '0 9 * * 1', requiredDataSources: ['interaction_logs'], confidenceModel: 'statistical', version: '1.0.0',
};

interface HONAReport { nodes: Array<{ id: string; type: string; centrality: number }>; edges: Array<{ from: string; to: string; type: string }>; density: number; avgCentrality: number; maxCentrality: number; isolatedCount: number; structure: 'dense' | 'moderate' | 'sparse' | 'fragmented'; interpretation: string; }

function extractFindings(report: HONAReport, now: Date): SentinelFinding[] {
  const f: SentinelFinding[] = []; const ts = now.toISOString();
  if (report.structure === 'fragmented' || report.structure === 'sparse') f.push({ id: `hona-structure-${now.getTime()}`, severity: 'warning', title: `网络结构: ${report.structure} (密度=${report.density.toFixed(3)})`, description: report.interpretation, evidence: [`密度: ${report.density.toFixed(3)}`, `平均中心性: ${report.avgCentrality.toFixed(3)}`, `结构: ${report.structure}`], suggestion: '分散的网络意味着信息孤岛——建议增加跨团队 Agent 的连接点。', detectedAt: ts });
  if (report.isolatedCount > 0) f.push({ id: `hona-isolated-${now.getTime()}`, severity: 'critical', title: `${report.isolatedCount} 个孤立节点`, description: `${report.isolatedCount} 个 Agent/人在交互网络中无任何连接。${report.interpretation}`, evidence: [`孤立节点数: ${report.isolatedCount}`, `总节点数: ${report.nodes.length}`], suggestion: '孤立节点无法接收信号或协同工作——检查这些节点是否存在配置错误。', detectedAt: ts });
  if (report.maxCentrality > report.avgCentrality * 5) f.push({ id: `hona-centrality-${now.getTime()}`, severity: 'warning', title: `中心性极度集中 (max=${report.maxCentrality.toFixed(3)}, avg=${report.avgCentrality.toFixed(3)})`, description: `网络中心性集中在极少数节点上——存在单点瓶颈风险。`, evidence: [`最大中心性: ${report.maxCentrality.toFixed(3)}`, `平均中心性: ${report.avgCentrality.toFixed(3)}`, `比率: ${(report.maxCentrality / report.avgCentrality).toFixed(1)}x`], suggestion: '分散路由——不让单一 Agent 成为所有交互的中转站。', detectedAt: ts });
  return f;
}

export const honaSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../../packages/engine-core/src/pipeline/diagnosis/hona') as unknown as { computeHONA(t: string): HONAReport | null };
      const allFindings: SentinelFinding[] = []; let anyFailed = false, anyData = false; const errors: string[] = [];
      for (const tid of teams) {
        const r = await checkTeam(config.id, tid, now, (t) => mod.computeHONA(t), (rep) => extractFindings(rep as HONAReport, now), 'HONA');
        if (!r.ok) { anyFailed = true; if (r.error) errors.push(r.error); }
        if (r.findings.length > 0) anyData = true;
        allFindings.push(...r.findings);
      }
      return { sentinelId: config.id, ok: !anyFailed, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: anyFailed ? errors.join('; ') : undefined, degraded: (!anyData && teams.length > 0) || (anyFailed && allFindings.length === 0) };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'HONA_SENTINEL_CRASH', phase: 3, retryable: true }, '[HONA] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt: now.toISOString(), error: msg, degraded: true };
    } finally { restore(); }
  },
};
