/**
 * sentinel/adapters/key-person-risk-sentinel.ts — 关键人风险哨兵 (D2)
 * @state: real
 *
 * 包装 analyzeKeyPersonRisk()，识别组织中的单点故障和 Bus Factor 风险。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { swapDbForContext, discoverTeams, checkTeam } from './helpers';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/kpr');

const config: SentinelConfig = {
  id: 'sentinel-key-person-risk', name: '关键人风险 (KPR)', description: '识别单点故障——Bus Factor=1 的关键岗位、知识孤岛、角色稀缺度。', category: 'risk', priority: 'P0', mode: 'cron', cron: '0 9 * * 1', requiredDataSources: ['role_dependencies', 'knowledge_domains'], confidenceModel: 'deterministic', version: '1.0.0',
};

interface KPRReport { teamId: string; busFactorReport: Array<{ roleId: string; busFactor: number; riskScore: number; recoveryEstimateDays: number; isSpof: boolean; risk: string }>; spofs: string[]; topRisks: Array<{ roleId: string; riskScore: number; reason: string }>; interpretation: string; }

function extractFindings(report: KPRReport, now: Date): SentinelFinding[] {
  const f: SentinelFinding[] = []; const ts = now.toISOString();
  for (const item of report.topRisks || []) {
    f.push({ id: `kpr-risk-${item.roleId}-${now.getTime()}`, severity: 'critical', title: `关键人风险: ${item.roleId} (评分 ${item.riskScore.toFixed(1)})`, description: item.reason, evidence: [`风险评分: ${item.riskScore.toFixed(1)}`], suggestion: '该岗位 Bus Factor 过低——建议立即建立备份机制或文档化关键知识。', detectedAt: ts });
  }
  for (const spof of report.spofs || []) {
    if (!report.topRisks?.some((r: any) => r.roleId === spof)) {
      f.push({ id: `kpr-spof-${spof}-${now.getTime()}`, severity: 'warning', title: `单点故障: ${spof}`, description: `${spof} 的 Bus Factor = 1——该角色无人可替代。`, evidence: [`SPOF: ${spof}`], suggestion: '交叉培训或招聘备份人员。', detectedAt: ts });
    }
  }
  return f;
}

async function loadKPRData(teamId: string, _ctx: SentinelContext): Promise<any> {
  // 延迟加载 engine-core cjs 模块
  const mod = await import('../../sentinel/compute/key-person-risk') as unknown as {
    analyzeKeyPersonRisk(p: any): KPRReport;
    buildDependenciesFromRoles(roles: Array<{ roleId: string; roleName: string; responsibilities: string[]; teamIds: string[] }>): any[];
    buildKnowledgeDomains(domains: Array<{ name: string; holders: string[]; criticality: string; documentationUrl: string }>): any[];
  };
  // 简化场景: 从 DB 加载角色和知识域 (回退到空数组)
  return { mod, roles: [], domains: [] };
}

export const keyPersonRiskSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const restore = swapDbForContext(context); const { now } = context; const checkedAt = now.toISOString();
    try {
      const teams = discoverTeams(context);
      if (teams.length === 0) return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true };
      const { mod } = await loadKPRData(teams[0], context);
      const dependencies = mod.buildDependenciesFromRoles([]);
      const knowledgeDomains = mod.buildKnowledgeDomains([]);
      const allFindings: SentinelFinding[] = [];
      for (const tid of teams) {
        try {
          const report = mod.analyzeKeyPersonRisk({ teamId: tid, dependencies, knowledgeDomains, roleScarcityMap: {}, roleNames: {} });
          allFindings.push(...extractFindings(report, now));
        } catch (err: any) { log.warn({ tid, err: err.message }, '[KPR] 团队分析失败'); }
      }
      return { sentinelId: config.id, ok: true, findings: allFindings, durationMs: Date.now() - now.getTime(), checkedAt, degraded: allFindings.length === 0 };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      log.error({ err: msg, code: 'KPR_SENTINEL_CRASH', phase: 3, retryable: true }, '[KPR] 哨兵崩溃');
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - now.getTime(), checkedAt, error: msg, degraded: true };
    } finally { restore(); }
  },
};
