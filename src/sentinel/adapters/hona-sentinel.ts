/**
 * @deprecated 使用 extensions/sentinels/hona/ 替代。新功能在此目录下开发。
 * sentinel/adapters/hona-sentinel.ts — 异质节点网络哨兵 (D3)
 * @state: real — 2026-06-18 Week 4: 增强 finding 提取
 *
 * 包装 computeHONA()，监测 Agent 交互网络密度、中心性、孤立节点。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/hona');

const config: SentinelConfig = {
  id: 'sentinel-hona', name: '异质节点网络 (HONA)',
  description: '监测 Agent 交互网络密度、中心性、孤立节点和拓扑结构。每周一巡检。',
  category: 'collaboration', priority: 'P2', mode: 'cron', cron: '0 9 * * 1',
  requiredDataSources: ['interaction_logs'], confidenceModel: 'statistical', version: '2.0.0',
};

interface HONAReport {
  nodes: Array<{ id: string; type: string; centrality: number }>;
  edges: Array<{ from: string; to: string; type: string }>;
  density: number; avgCentrality: number; maxCentrality: number; isolatedCount: number;
  structure: 'dense' | 'moderate' | 'sparse' | 'fragmented'; interpretation: string;
}

function extractFindings(report: HONAReport, now: Date): SentinelFinding[] {
  const f: SentinelFinding[] = []; const ts = now.toISOString();
  const agentNodes = report.nodes.filter(n => n.type === 'AGENT' || n.type === 'Agent');
  const personNodes = report.nodes.filter(n => n.type === 'PERSON' || n.type === 'Person');

  // 1. 碎片化
  if (report.structure === 'fragmented') {
    f.push({ id: `hona-fragmented-${now.getTime()}`, severity: 'critical',
      title: `交互网络碎片化 (密度 ${report.density.toFixed(3)})`, description: report.interpretation,
      evidence: [`密度: ${report.density.toFixed(3)}`, `节点: ${report.nodes.length}`, `结构: fragmented`],
      suggestion: '碎片化网络 = 信息孤岛。立即增加跨团队 Agent 连接点，建立核心路由节点。', detectedAt: ts });
  } else if (report.structure === 'sparse') {
    f.push({ id: `hona-sparse-${now.getTime()}`, severity: 'warning',
      title: `交互网络稀疏 (密度 ${report.density.toFixed(3)})`, description: report.interpretation,
      evidence: [`密度: ${report.density.toFixed(3)}`, `平均中心性: ${report.avgCentrality.toFixed(3)}`, `结构: sparse`],
      suggestion: '增加跨团队 Agent 连接点——低密度意味着信息和信号传递效率低。', detectedAt: ts });
  }

  // 2. 孤立节点 → critical
  if (report.isolatedCount > 0) {
    const isolatedAgents = report.nodes.filter(n => n.centrality === 0 && (n.type === 'AGENT' || n.type === 'Agent'));
    f.push({ id: `hona-isolated-${now.getTime()}`, severity: 'critical',
      title: `${report.isolatedCount} 个孤立节点${isolatedAgents.length > 0 ? ` (含 ${isolatedAgents.length} Agent)` : ''}`,
      description: `这些节点在交互网络中无任何连接。${report.interpretation}`,
      evidence: [`孤立: ${report.isolatedCount}`, `总节点: ${report.nodes.length}`, `Agent数: ${agentNodes.length}`, `人数: ${personNodes.length}`],
      suggestion: '孤立 Agent 无法接收信号或协同——检查配置错误或权限隔离过度。', detectedAt: ts });
  }

  // 3. 中心性集中
  if (report.maxCentrality > report.avgCentrality * 5) {
    f.push({ id: `hona-centrality-${now.getTime()}`, severity: 'warning',
      title: `交互中心性极度集中 (${(report.maxCentrality / Math.max(report.avgCentrality, 0.001)).toFixed(1)}x)`,
      description: `少数节点成为所有交互的中转站——单点瓶颈风险。`,
      evidence: [`最大中心性: ${report.maxCentrality.toFixed(3)}`, `平均: ${report.avgCentrality.toFixed(3)}`, `比率: ${(report.maxCentrality / Math.max(report.avgCentrality, 0.001)).toFixed(1)}x`],
      suggestion: '分散路由——不让单一 Agent 成为所有交互的中转站。增加冗余路由。', detectedAt: ts });
  }

  // 4. Agent/人 比例失衡
  if (agentNodes.length > 0 && personNodes.length > 0) {
    const ratio = agentNodes.length / personNodes.length;
    if (ratio > 3) {
      f.push({ id: `hona-ratio-${now.getTime()}`, severity: 'info',
        title: `Agent/人 比例偏高 (${ratio.toFixed(1)}:1)`,
        description: `${agentNodes.length} Agent vs ${personNodes.length} 人——Agent 密度远超人员密度。`,
        evidence: [`Agent: ${agentNodes.length}`, `人: ${personNodes.length}`, `比例: ${ratio.toFixed(1)}:1`],
        suggestion: '关注 Agent 间通信开销——过多 Agent 可能导致信号噪音。', detectedAt: ts });
    }
  }

  // 5. 健康
  if (f.length === 0) {
    f.push({ id: `hona-healthy-${now.getTime()}`, severity: 'info',
      title: `交互网络健康 (${report.nodes.length} 节点, 密度 ${report.density.toFixed(3)})`,
      description: `结构 ${report.structure}，无孤立节点。${agentNodes.length} Agent + ${personNodes.length} 人。`,
      evidence: [`节点: ${report.nodes.length}`, `密度: ${report.density.toFixed(3)}`, `结构: ${report.structure}`],
      suggestion: '维持当前网络拓扑。', detectedAt: ts });
  }

  return f;
}

export const honaSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context;
    try {
      const teams = discoverTeams(context);
      const mod = await import('../../sentinel/compute/hona') as unknown as { computeHONA(t: string): HONAReport | null };
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
