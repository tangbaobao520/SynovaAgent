/**
 * global-analyzer.ts — 全局进化引擎 (L0 进化层｜第三层)
 *
 * 每月触发。跨组织聚合学习 → 更新行业扩展 JSON 文件。
 * 人工审核门禁。灰度发布。可回滚 (由 rule-version-manager 管理)。
 *
 * 核心功能:
 *   1. aggregateIndustryBaseline() — 聚合行业哨兵阈值 → thresholds.json
 *   2. discoverIndustryPatterns() — 跨组织模式识别 → common-pitfalls.md
 *
 * 数据隐私: 只提取统计特征 (median/p25/p75), 不提取个体数据。
 * 文件驱动: 产出写入 extensions/industries/{name}/ 目录, 不改 TypeScript。
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import type {
  L3WriteAPI, PerSentinelStats, IndustryBaseline,
  AgentMemoryStoreLike, EvolutionProposal, ThresholdChange, ProposalStatus,
  IndustryPattern,
} from './evolution-types';
import { DEFAULT_EVOLUTION_CONFIG } from './evolution-types';
import { RuleVersionManager } from './rule-version-manager';

const log = createLogger('evolution/global-analyzer');

// ═══ 行业扩展目录 ═══

const INDUSTRIES_DIR = join(process.cwd(), 'extensions', 'industries');

/** 通用默认哨兵阈值 (作为行业阈值偏离的参考基线) */
const GENERAL_THRESHOLDS: Record<string, { warning: number; critical: number }> = {
  F1_KZ: { warning: 1.5, critical: 2.0 },
  F2_runway: { warning: 12, critical: 6 },
  F3_revenue_quality: { warning: 0.3, critical: 0.15 },
  F4_profit_quality: { warning: 0.3, critical: 0.15 },
  F5_cash_conversion: { warning: 0.5, critical: 0.3 },
  // 组织维度
  O1_info_distortion: { warning: 0.4, critical: 0.6 },
  O2_explore_exploit: { warning: 0.3, critical: 0.5 },
  O3_talent_density: { warning: 0.3, critical: 0.5 },
  // 技术维度
  T1_software_health: { warning: 0.4, critical: 0.6 },
  T2_connector_coverage: { warning: 0.3, critical: 0.5 },
};

// ═══ 核心函数 ═══

/**
 * 聚合指定行业的哨兵得分 → 计算行业中位数 → 与通用阈值对比 →
 * 写入行业专属 thresholds.json。
 *
 * @param industry 行业名称 (对应 extensions/industries/{name}/)
 * @param l3 L3WriteAPI 实例 (用于 getSentinelStats)
 * @returns 行业基线数据
 */
export async function aggregateIndustryBaseline(
  industry: string,
  l3: L3WriteAPI,
): Promise<IndustryBaseline> {
  const stats = await l3.getSentinelStats(industry);

  if (stats.length === 0) {
    log.warn({ industry }, '行业哨兵数据不足 — 跳过聚合');
    return {
      industry,
      aggregatedAt: new Date().toISOString(),
      sentinelStats: [],
      thresholdSuggestions: [],
    };
  }

  // 对比通用阈值, 生成调整建议
  const suggestions: IndustryBaseline['thresholdSuggestions'] = [];
  for (const stat of stats) {
    const general = GENERAL_THRESHOLDS[stat.sentinelId];
    if (!general) continue;

    // 如果行业中位数与通用临界值偏差 > 20% → 建议调整
    const deviation = Math.abs(stat.median - general.critical) / general.critical;
    if (deviation > 0.2 && stat.orgCount >= DEFAULT_EVOLUTION_CONFIG.minOrgsForIndustryAggregation) {
      suggestions.push({
        sentinelId: stat.sentinelId,
        generalThreshold: general,
        industryMedian: stat.median,
        suggestion: `行业中位数 ${stat.median} 与通用阈值 ${general.critical} 偏差 ${(deviation * 100).toFixed(0)}% — 建议调整为 ${stat.median}`,
      });
    }
  }

  const baseline: IndustryBaseline = {
    industry,
    aggregatedAt: new Date().toISOString(),
    sentinelStats: stats,
    thresholdSuggestions: suggestions,
  };

  // 写入 JSON 文件
  writeIndustryThresholds(industry, baseline);

  log.info({
    industry,
    sentinelCount: stats.length,
    suggestions: suggestions.length,
  }, '行业基线聚合完成');

  return baseline;
}

/**
 * 将行业基线与阈值建议写入 extensions/industries/{name}/thresholds.json。
 */
export function writeIndustryThresholds(industry: string, baseline: IndustryBaseline): void {
  const dir = join(INDUSTRIES_DIR, industry);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filePath = join(dir, 'thresholds.json');
  const thresholds: Record<string, { warning: number; critical: number }> = {};

  // 从哨兵统计提取行业中位数作为阈值
  for (const stat of baseline.sentinelStats) {
    const defaultThreshold = GENERAL_THRESHOLDS[stat.sentinelId];
    thresholds[stat.sentinelId] = {
      warning: defaultThreshold?.warning ?? 0.5,
      critical: defaultThreshold?.critical ?? 1.0,
    };
  }

  // 应用调整建议 (用行业中位数覆盖)
  for (const suggestion of baseline.thresholdSuggestions) {
    if (thresholds[suggestion.sentinelId]) {
      thresholds[suggestion.sentinelId] = {
        ...thresholds[suggestion.sentinelId],
        critical: suggestion.industryMedian,
      };
    }
  }

  const output = {
    industry,
    aggregatedAt: baseline.aggregatedAt,
    thresholdOverrides: thresholds,
  };

  writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
  log.info({ industry, path: filePath, thresholdCount: Object.keys(thresholds).length }, '行业阈值已写入');
}

/**
 * 批量聚合所有已注册行业的基线。
 * 由 Cron 定时触发 (每月)。
 */
export async function aggregateAllIndustries(
  l3: L3WriteAPI,
  industries: string[],
): Promise<IndustryBaseline[]> {
  const results: IndustryBaseline[] = [];

  for (const industry of industries) {
    try {
      const baseline = await aggregateIndustryBaseline(industry, l3);
      results.push(baseline);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, industry }, '行业聚合失败 — 降级继续');
    }
  }

  return results;
}

// ═══ Phase P2: 模式发现 ═══

/**
 * 跨组织模式发现。
 * 读取所有 user_correction 记忆，按 sentinelId 分组，
 * 统计每个 sentinel 被多少个不同组织纠错过。
 * 如果同一 sentinel 被 ≥3 个同行业组织纠错过 → 系统级模式。
 *
 * @param memoryStore AgentMemoryStore 实例
 * @param orgIds 已知组织 ID 列表（用于过滤）
 * @returns 发现的模式列表
 */
export async function discoverIndustryPatterns(
  memoryStore: AgentMemoryStoreLike,
  orgIds?: string[],
): Promise<IndustryPattern[]> {
  const patterns: IndustryPattern[] = [];
  const sentinelOrgs = new Map<string, Set<string>>();

  // 如果传入了 orgIds，逐个查询
  const queryOrgs = orgIds && orgIds.length > 0 ? orgIds : ['default'];
  for (const orgId of queryOrgs) {
    try {
      const corrections = memoryStore.list({
        orgId,
        type: 'user_correction',
        limit: 100,
      });
      for (const entry of corrections) {
        try {
          const parsed = JSON.parse(entry.value) as { sentinelId?: string };
          if (parsed.sentinelId) {
            if (!sentinelOrgs.has(parsed.sentinelId)) {
              sentinelOrgs.set(parsed.sentinelId, new Set());
            }
            sentinelOrgs.get(parsed.sentinelId)!.add(orgId);
          }
        } catch { /* skip corrupt */ }
      }
    } catch (err: unknown) {
      log.warn({ err, orgId }, '模式发现 — 组织查询失败（降级继续）');
    }
  }

  // 提取 ≥3 个组织都有纠错的哨兵
  for (const [sentinelId, orgs] of sentinelOrgs) {
    if (orgs.size >= DEFAULT_EVOLUTION_CONFIG.minCorrectionsForThresholdAdjustment) {
      patterns.push({
        type: 'threshold_calibration',
        sentinelId,
        evidence: `${orgs.size} 个组织纠错过此哨兵`,
        suggestion: `此哨兵被 ${orgs.size} 个组织纠错 — 建议检查通用阈值是否适用于所有组织`,
        orgCount: orgs.size,
      });
    }
  }

  if (patterns.length > 0) {
    log.info({ patternCount: patterns.length }, '模式发现完成');
  }
  return patterns;
}

// ═══ Phase P2: 提案管理 ═══

function generateProposalId(): string {
  return `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 将阈值调整建议包装为 EvolutionProposal。
 * 每个提案包含具体的变更列表、影响评估、和证据。
 *
 * @param industry 关联行业
 * @param suggestions 阈值调整建议列表
 * @param memoryStore 可选 — 用于评估影响范围
 * @returns 提案
 */
export async function generateThresholdProposal(
  industry: string,
  suggestions: IndustryBaseline['thresholdSuggestions'],
  memoryStore?: AgentMemoryStoreLike,
): Promise<EvolutionProposal> {
  const now = new Date().toISOString();
  const changes: ThresholdChange[] = suggestions.map(s => ({
    sentinelId: s.sentinelId,
    from: s.generalThreshold,
    to: { warning: s.generalThreshold.warning, critical: s.industryMedian },
  }));

  const orgCount = 0; // 影响评估需要跨组织查询，当前简化处理
  const sentinelIds = changes.map(c => c.sentinelId);
  const highRisk = changes.some(c => Math.abs(c.to.critical - c.from.critical) / c.from.critical > 0.5);
  const severity = changes.length >= 3 ? 'high' : changes.length >= 1 ? 'medium' : 'low';

  const proposal: EvolutionProposal = {
    id: generateProposalId(),
    type: 'threshold_adjustment',
    title: `${industry} 行业阈值校准 — ${changes.length} 个哨兵`,
    description: `基于 ${suggestions.length} 个行业中位数与通用阈值的偏差分析`,
    industry,
    changes,
    risk: highRisk ? 'high' : severity as 'low' | 'medium' | 'high',
    impactEstimate: { orgCount, sentinelIds },
    evidence: suggestions.map(s => s.suggestion).join('; '),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  // 持久化到 AgentMemoryStore
  if (memoryStore) {
    try {
      memoryStore.remember({
        orgId: 'global',
        key: `proposal_${proposal.id}`,
        value: JSON.stringify(proposal),
        type: 'enterprise_fact',
        confidence: 0.8,
        source: 'global_analyzer',
        tags: ['proposal', industry, proposal.status],
        expiresAt: null,
      });
      log.info({ proposalId: proposal.id, industry, changes: changes.length }, '提案已创建');
    } catch (err: unknown) {
      log.warn({ err }, '提案持久化失败 — 降级返回内存提案');
    }
  }

  return proposal;
}

/**
 * 列出提案，可选按状态过滤。
 *
 * @param memoryStore AgentMemoryStore 实例
 * @param status 可选 — 按状态过滤
 * @returns 提案列表
 */
export function listProposals(
  memoryStore: AgentMemoryStoreLike,
  status?: ProposalStatus,
): EvolutionProposal[] {
  try {
    const entries = memoryStore.list({
      orgId: 'global',
      type: 'enterprise_fact',
      tags: ['proposal'],
      limit: 100,
    });

    const proposals: EvolutionProposal[] = [];
    for (const entry of entries) {
      try {
        const p = JSON.parse(entry.value) as EvolutionProposal;
        if (p.id && p.status) {
          if (!status || p.status === status) {
            proposals.push(p);
          }
        }
      } catch { /* skip corrupt */ }
    }

    // 按创建时间降序
    proposals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return proposals;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'listProposals 失败 — degraded');
    return [];
  }
}

/**
 * 审批通过一个提案。
 * 流程：快照 → 渐灰发布 → 标记 applied
 *
 * @param memoryStore AgentMemoryStore 实例
 * @param proposalId 提案 ID
 * @param l3 L3WriteAPI 实例
 * @param rvm RuleVersionManager 实例
 * @param orgPool 可选 — 灰度发布的目标组织池
 * @returns 更新后的提案
 */
export async function approveProposal(
  memoryStore: AgentMemoryStoreLike,
  proposalId: string,
  l3: L3WriteAPI,
  rvm: RuleVersionManager,
  orgPool?: string[],
): Promise<EvolutionProposal | null> {
  try {
    const stored = memoryStore.recall('global', `proposal_${proposalId}`);
    if (!stored) {
      log.warn({ proposalId }, '提案不存在');
      return null;
    }

    const proposal = JSON.parse(stored.value) as EvolutionProposal;
    if (proposal.status !== 'pending') {
      log.warn({ proposalId, status: proposal.status }, '提案状态不允许审批');
      return null;
    }

    // 1. 创建快照
    const snapshotId = await rvm.createSnapshot(`approve:${proposalId} — ${proposal.title}`);
    if (!snapshotId) {
      log.warn({ proposalId }, '快照创建失败 — 审批中止');
      return null;
    }

    // 2. 渐灰发布阈值变更
    const pool = orgPool && orgPool.length > 0 ? orgPool : ['default'];
    const thresholdInput = proposal.changes.map(c => ({
      sentinelId: c.sentinelId,
      warning: c.to.warning,
      critical: c.to.critical,
    }));

    // 第一阶段: 10% 灰度
    await rvm.gradualRollout({ orgPool: pool, percentage: 10, thresholds: thresholdInput });

    // 3. 更新提案状态
    proposal.status = 'approved';
    proposal.updatedAt = new Date().toISOString();
    proposal.appliedSnapshotId = snapshotId;
    proposal.rolloutPercentage = 10;

    memoryStore.remember({
      orgId: 'global',
      key: `proposal_${proposalId}`,
      value: JSON.stringify(proposal),
      type: 'enterprise_fact',
      confidence: 0.9,
      source: 'global_analyzer',
      tags: ['proposal', proposal.industry, 'approved'],
      expiresAt: null,
    });

    log.info({
      proposalId, snapshotId, changes: proposal.changes.length,
      rolloutPercentage: 10,
    }, '提案已审批 — 10% 灰度发布中');

    return proposal;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, proposalId }, '提案审批失败');
    return null;
  }
}

/**
 * 拒绝一个提案。仅 pending 状态的提案可拒绝。
 *
 * @returns 更新后的提案，或 null（不存在/状态不匹配）
 */
export async function rejectProposal(
  memoryStore: AgentMemoryStoreLike,
  proposalId: string,
): Promise<EvolutionProposal | null> {
  try {
    const stored = memoryStore.recall('global', `proposal_${proposalId}`);
    if (!stored) {
      log.warn({ proposalId }, '提案不存在');
      return null;
    }

    const proposal = JSON.parse(stored.value) as EvolutionProposal;
    if (proposal.status !== 'pending') {
      log.warn({ proposalId, status: proposal.status }, '提案状态不允许拒绝');
      return null;
    }

    proposal.status = 'rejected';
    proposal.updatedAt = new Date().toISOString();

    memoryStore.remember({
      orgId: 'global',
      key: `proposal_${proposalId}`,
      value: JSON.stringify(proposal),
      type: 'enterprise_fact',
      confidence: 1.0,
      source: 'global_analyzer',
      tags: ['proposal', proposal.industry, 'rejected'],
      expiresAt: null,
    });

    log.info({ proposalId }, '提案已拒绝');
    return proposal;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, proposalId }, '提案拒绝失败');
    return null;
  }
}
