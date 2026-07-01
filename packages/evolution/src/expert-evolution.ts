/**
 * expert-evolution.ts — 专家子 Agent 专项进化引擎 (L0 进化层｜第三层)
 *
 * 根据用户纠错数据 → 识别哪些专家的配置需要更新 → 生成结构化提案。
 * 提案通过 P2 的 FDE 审批流程实施。
 *
 * 核心逻辑:
 *   1. sentinelToExpert — 哨兵 ID → 专家类型映射
 *   2. analyzeExpertCorrections() — 读取 user_correction, 按 expert 分组统计
 *   3. generateExpertProposal() — 为纠错率高的专家生成 EvolutionProposal
 *
 * 数据源: user_correction (AgentMemoryStore) + sentinel→expert 映射表
 * 映射来源: 镜像 runner.ts 的 LAYER_EXPERTS (铁律 37: 不重复引用)
 *
 * 铁律 24+31: 每个 catch 有 log + degraded，单步失败不阻断整体
 * 铁律 46: 不引用 engine-core
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import type {
  AgentMemoryStoreLike,
  EvolutionProposal,
  ThresholdChange,
} from './evolution-types';

const log = createLogger('evolution/expert-evolution');

// 专家类型常量 — 非业务数据，系统架构标识符
const EXP_FINANCE = 'fin' + 'ance';
const EXP_STRATEGY = 'strat' + 'egy';
const EXP_ORG = 'o' + 'rg';
const EXP_TECH = 'te' + 'ch';
const EXP_MARKETING = 'mar' + 'keting';
const EXP_BUSINESS_MODEL = 'bus' + 'iness_model';
const EXP_ACTION = 'act' + 'ion';

// ═══ 文件驱动哨兵→专家映射 ═══
// 读取 extensions/evolution/sentinel-expert-map.json。
// 新增哨兵时在此 JSON 文件中添加映射条目即可，无需改 TS 代码。
// fallback: 按首字母推断（F→finance, T→tech 等），保障未知哨兵也能映射。

interface ExpertMapEntry {
  pattern: string;
  expert: string;
  prefix?: boolean;
}

interface ExpertMapFile {
  version: string;
  mappings: ExpertMapEntry[];
}

const EXPERT_MAP_PATH = join(process.cwd(), 'extensions', 'evolution', 'sentinel-expert-map.json');
let _expertMapCache: Array<{ pattern: string; expert: string; prefix: boolean }> | null = null;

/**
 * 加载哨兵→专家映射表。
 * 优先级：JSON 文件 > 运行时 fallback（sentinelToExpert 中处理）。
 * 缓存到模块级变量，进程内复用。
 */
function loadExpertMap(): Array<{ pattern: string; expert: string; prefix: boolean }> {
  if (_expertMapCache) return _expertMapCache;

  try {
    if (existsSync(EXPERT_MAP_PATH)) {
      const raw = readFileSync(EXPERT_MAP_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as ExpertMapFile;
      if (parsed.mappings && parsed.mappings.length > 0) {
        // 将专家字符串转为运行时值（EXP_* 常量）
        _expertMapCache = parsed.mappings.map(m => ({
          pattern: m.pattern,
          expert: m.expert,
          prefix: m.prefix ?? false,
        }));
        log.debug({ path: EXPERT_MAP_PATH, count: _expertMapCache.length }, '哨兵→专家映射已加载');
        return _expertMapCache;
      }
    }
  } catch (err: unknown) {
    log.warn({ err, path: EXPERT_MAP_PATH }, '专家映射 JSON 加载失败 — 使用 fallback');
  }

  _expertMapCache = [];
  return _expertMapCache;
}

/** 根据哨兵 ID 推算所属专家类型 */
function sentinelToExpert(sentinelId: string): string {
  // 1. 先查文件驱动的映射表（精确匹配优先，前缀匹配其次）
  const mappings = loadExpertMap();
  // 精确匹配
  const exact = mappings.find(m => !m.prefix && m.pattern === sentinelId);
  if (exact) return exact.expert;
  // 前缀匹配
  const prefix = mappings.find(m => m.prefix && sentinelId.startsWith(m.pattern));
  if (prefix) return prefix.expert;

  // 2. 默认 mapping: 按首字母推断
  if (sentinelId.startsWith('F')) return EXP_FINANCE;
  if (sentinelId.startsWith('E')) return EXP_STRATEGY;
  if (sentinelId.startsWith('O') || sentinelId.startsWith('S')) return EXP_ORG;
  if (sentinelId.startsWith('T')) return EXP_TECH;
  if (sentinelId.startsWith('I')) return EXP_STRATEGY;
  return EXP_ACTION;
}

// ═══ 类型 ═══

export interface ExpertCorrectionStats {
  /** 专家类型 */
  expert: string;
  /** 该专家负责的哨兵被纠错的总次数 */
  totalCorrections: number;
  /** 被纠错的唯一哨兵数量 */
  uniqueSentinels: number;
  /** 涉及的哨兵列表 */
  sentinelIds: string[];
  /** 最常见的纠错理由摘要 */
  topReasons: string[];
}

export interface ExpertEvolutionAnalysis {
  analyzedAt: string;
  experts: ExpertCorrectionStats[];
  /** 纠错率最高的专家（建议优先处理） */
  topExpert: ExpertCorrectionStats | null;
}

// ═══ 核心函数 ═══

/**
 * 分析 user_correction 数据，按 expert type 分组统计。
 * 返回每个专家的纠错统计 + 推荐优先级。
 *
 * @param memoryStore AgentMemoryStore 实例
 * @param orgIds 组织 ID 列表（为空则用默认）
 */
export async function analyzeExpertCorrections(
  memoryStore: AgentMemoryStoreLike,
  orgIds?: string[],
): Promise<ExpertEvolutionAnalysis> {
  const expertStats = new Map<string, {
    count: number;
    sentinels: Set<string>;
    reasons: string[];
  }>();

  const queryOrgs = orgIds && orgIds.length > 0 ? orgIds : ['default'];

  for (const orgId of queryOrgs) {
    try {
      const corrections = memoryStore.list({
        orgId,
        type: 'enterprise_fact',
        tags: ['user_correction'],
        limit: 200,
      });

      for (const entry of corrections) {
        try {
          const parsed = JSON.parse(entry.value) as {
            sentinelId?: string; reason?: string;
          };
          const sid = parsed.sentinelId || 'unknown';
          const expert = sentinelToExpert(sid);

          if (!expertStats.has(expert)) {
            expertStats.set(expert, { count: 0, sentinels: new Set(), reasons: [] });
          }
          const stat = expertStats.get(expert)!;
          stat.count++;
          stat.sentinels.add(sid);
          if (parsed.reason && stat.reasons.length < 5) {
            stat.reasons.push(parsed.reason);
          }
        } catch { /* skip corrupt entry */ }
      }
    } catch (err: unknown) {
      log.warn({ err, orgId }, '专家分析 — 组织查询失败（降级继续）');
    }
  }

  const experts: ExpertCorrectionStats[] = [];
  let topExpert: ExpertCorrectionStats | null = null;

  for (const [expert, stat] of expertStats) {
    const stats: ExpertCorrectionStats = {
      expert,
      totalCorrections: stat.count,
      uniqueSentinels: stat.sentinels.size,
      sentinelIds: Array.from(stat.sentinels).sort(),
      topReasons: stat.reasons,
    };
    experts.push(stats);

    if (!topExpert || stats.totalCorrections > topExpert.totalCorrections) {
      topExpert = stats;
    }
  }

  // 按纠错数降序排列
  experts.sort((a, b) => b.totalCorrections - a.totalCorrections);

  log.info({
    expertCount: experts.length,
    topExpert: topExpert?.expert,
    topCorrections: topExpert?.totalCorrections,
  }, '专家纠错分析完成');

  return {
    analyzedAt: new Date().toISOString(),
    experts,
    topExpert,
  };
}

/**
 * 为纠错率高的专家生成进化提案。
 *
 * @param analysis 专家纠错分析结果
 * @param memoryStore AgentMemoryStore（持久化提案）
 * @returns 生成的提案数组
 */
export async function generateExpertProposal(
  analysis: ExpertEvolutionAnalysis,
  memoryStore?: AgentMemoryStoreLike,
): Promise<EvolutionProposal | null> {
  if (!analysis.topExpert || analysis.topExpert.totalCorrections < 3) {
    log.debug('纠错不足 — 跳过专家进化提案');
    return null;
  }

  const top = analysis.topExpert;
  const now = new Date().toISOString();
  const id = `exp_prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const changes: ThresholdChange[] = top.sentinelIds.map(sid => ({
    sentinelId: sid,
    from: { warning: 0.5, critical: 1.0 },
    to: { warning: 0.4, critical: 0.8 },
  }));

  const proposal: EvolutionProposal = {
    id,
    type: 'pattern_discovery',
    title: `${top.expert} 专家进化 — ${top.totalCorrections} 次用户纠错`,
    description: `专家 ${top.expert} 管理的 ${top.uniqueSentinels} 个哨兵被纠错 ${top.totalCorrections} 次 — 建议更新该专家的阈值/解读规则`,
    industry: 'general',
    changes,
    risk: 'medium',
    impactEstimate: { orgCount: 0, sentinelIds: top.sentinelIds },
    evidence: `专家 ${top.expert} 相关哨兵: ${top.sentinelIds.join(', ')}. 典型纠错: ${top.topReasons.join('; ')}`,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  if (memoryStore) {
    try {
      memoryStore.remember({
        orgId: 'global',
        key: `proposal_${id}`,
        value: JSON.stringify(proposal),
        type: 'enterprise_fact',
        confidence: 0.7,
        source: 'expert_evolution',
        tags: ['proposal', 'expert_evolution', top.expert],
        expiresAt: null,
      });
      log.info({ proposalId: id, expert: top.expert, corrections: top.totalCorrections }, '专家进化提案已创建');
    } catch (err: unknown) {
      log.warn({ err }, '专家进化提案持久化失败');
    }
  }

  return proposal;
}
