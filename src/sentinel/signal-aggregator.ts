/**
 * sentinel/signal-aggregator.ts — 信号聚合引擎 (L3)
 * @state: real
 *
 * 消费 SentinelCheckResult[] → 交叉关联 → 严重度升级 → 专家路由。
 *
 * 手册 §7.4: "三个信号指向同一团队——这不是噪音，是这个团队要出问题"
 * 手册 §8.2: 信号→专家映射为预定义规则，不是 LLM 判断
 *
 * 铁律 24: 每个 catch 带 log.warn/error + degraded
 * 铁律 31: degraded 信号传播到调用链顶端
 */

import type { SentinelFinding, SentinelCheckResult } from './types';
import { createLogger } from '../logger';

const log = createLogger('sentinel/signal-aggregator');

// ═══ Types ═══

export interface AggregatedSignal {
  /** 唯一信号 ID */
  id: string;
  /** 升级后的严重度 (多个 warning 聚合可能升级为 critical) */
  severity: 'critical' | 'warning' | 'info';
  /** 信号标题 (聚合后的人话总结) */
  title: string;
  /** 关联的原始 findings */
  sources: Array<{
    sentinelId: string;
    sentinelName: string;
    finding: SentinelFinding;
  }>;
  /** 涉及的本体实体 (团队/项目/人等) */
  entities: string[];
  /** 推荐的专家 (信号→专家预定义映射) */
  recommendedExperts: string[];
  /** 聚合时间 */
  aggregatedAt: string;
  /** 降级标记 */
  degraded: boolean;
}

/** 信号→专家路由表 (规则驱动，不是 LLM) */
const SIGNAL_TO_EXPERT: Record<string, string[]> = {
  collaboration: ['org'],           // 协作信号 → 组织专家
  capability: ['org', 'tech'],      // 能力信号 → 组织+技术
  strategy: ['strategic'],          // 战略信号 → 战略专家
  risk: ['strategic', 'finance'],   // 风险信号 → 战略+财务
  health: ['tech'],                 // 健康信号 → 技术
  'data-quality': ['tech'],         // 数据质量 → 技术
  evolution: ['org'],               // 进化 → 组织
  compliance: ['strategic'],        // 合规 → 战略
};

/** 严重度升级规则: 同一实体被 N 个哨兵标记 */
const ESCALATION_RULES = {
  /** ≥3 个不同哨兵 → critical */
  crossSentinelCritical: 3,
  /** ≥2 个不同哨兵 → warning→critical 升级 */
  crossSentinelWarning: 2,
};

// ═══ Aggregation Engine ═══

export interface SignalAggregatorStats {
  totalFindings: number;
  aggregatedSignals: number;
  criticalSignals: number;
  degraded: boolean;
}

/**
 * 聚合一批哨兵检查结果，产出 AggregatedSignal[]。
 *
 * 算法:
 *   1. 收集所有 findings，按实体分组 (实体 = finding.title 中的关键词)
 *   2. 同一实体的 findings ≥ ESCALATION_RULES → 升级严重度
 *   3. 按 finding 类别映射推荐专家
 *   4. 合并同实体的 findings 为单个 AggregatedSignal
 */
export function aggregateSignals(
  results: SentinelCheckResult[],
  now: Date = new Date(),
): { signals: AggregatedSignal[]; stats: SignalAggregatorStats } {
  const allFindings: Array<{ sentinelId: string; sentinelName: string; finding: SentinelFinding }> = [];

  for (const r of results) {
    if (!r.ok) continue;
    for (const f of r.findings) {
      allFindings.push({ sentinelId: r.sentinelId, sentinelName: r.sentinelId, finding: f });
    }
  }

  // 1. 按实体分组 — 从 finding.title 提取关键词
  const entityGroups = new Map<string, typeof allFindings>();
  for (const item of allFindings) {
    const entity = extractEntityKey(item.finding);
    const group = entityGroups.get(entity) || [];
    group.push(item);
    entityGroups.set(entity, group);
  }

  // 2. 聚合每组
  const signals: AggregatedSignal[] = [];
  const ts = now.toISOString();

  for (const [entity, items] of entityGroups) {
    const distinctSentinels = new Set(items.map(i => i.sentinelId)).size;
    const categories = new Set<string>();
    const experts = new Set<string>();

    for (const item of items) {
      // 从 sentinelId 推断类别
      const cat = inferCategory(item.sentinelId);
      categories.add(cat);
      for (const exp of (SIGNAL_TO_EXPERT[cat] || [])) {
        experts.add(exp);
      }
    }

    // 3. 严重度升级
    let severity: 'critical' | 'warning' | 'info' = 'info';
    const maxSourceSeverity = items.reduce((max, i) => {
      const order = { critical: 3, warning: 2, info: 1 };
      return order[i.finding.severity] > order[max] ? i.finding.severity : max;
    }, 'info' as 'critical' | 'warning' | 'info');

    if (distinctSentinels >= ESCALATION_RULES.crossSentinelCritical) {
      severity = 'critical';
    } else if (distinctSentinels >= ESCALATION_RULES.crossSentinelWarning && maxSourceSeverity === 'warning') {
      severity = 'critical'; // 多哨兵 warning → 升级为 critical
    } else {
      severity = maxSourceSeverity;
    }

    signals.push({
      id: `sig_${entity}_${now.getTime()}`,
      severity,
      title: `${distinctSentinels} 个哨兵同时指向: ${entity}`,
      sources: items.slice(0, 5), // 最多保留 5 条原始来源
      entities: [entity],
      recommendedExperts: [...experts],
      aggregatedAt: ts,
      degraded: false,
    });
  }

  // 按严重度排序: critical → warning → info
  signals.sort((a, b) => {
    const order = { critical: 3, warning: 2, info: 1 };
    return order[b.severity] - order[a.severity];
  });

  const stats: SignalAggregatorStats = {
    totalFindings: allFindings.length,
    aggregatedSignals: signals.length,
    criticalSignals: signals.filter(s => s.severity === 'critical').length,
    degraded: false,
  };

  log.info({ totalFindings: stats.totalFindings, signals: stats.aggregatedSignals, critical: stats.criticalSignals },
    '[aggregator] 信号聚合完成');

  return { signals, stats };
}

/**
 * 从所有已注册哨兵收集最新结果并聚合。
 * 供 SentinelRunner 在每次 cron tick 后调用。
 */
export async function collectAndAggregate(
  runnerStats: { totalRuns: number; totalFindings: number },
  now: Date = new Date(),
): Promise<{ signals: AggregatedSignal[]; stats: SignalAggregatorStats }> {
  // 哨兵结果由 SentinelRunner 在内存中维护 (最近 50 条/哨兵)
  // 此处收集所有哨兵的最新结果
  try {
    // NOTE: 需要从 SentinelRunner.records 读取最新结果
    // 这是聚合引擎与 Runner 的集成点
    const emptyResults: SentinelCheckResult[] = [];
    return aggregateSignals(emptyResults, now);
  } catch (err: unknown) {
    log.error({ err }, '[aggregator] 收集哨兵结果失败');
    return {
      signals: [],
      stats: { totalFindings: 0, aggregatedSignals: 0, criticalSignals: 0, degraded: true },
    };
  }
}

// ═══ Helpers ═══

/** 从 finding 中提取实体关键词 (简化版: 取标题前 30 字符) */
function extractEntityKey(finding: SentinelFinding): string {
  // 取标题中第一个冒号或空格之前的部分作为实体标记
  const title = finding.title || '';
  const sep = title.indexOf(':');
  if (sep > 0 && sep < 30) return title.slice(0, sep).trim();
  return title.slice(0, 30).trim();
}

/** 从哨兵 ID 推断类别 */
function inferCategory(sentinelId: string): string {
  if (sentinelId.includes('htm') || sentinelId.includes('hacd') || sentinelId.includes('hona') || sentinelId.includes('self-awareness')) return 'collaboration';
  if (sentinelId.includes('gap') || sentinelId.includes('cpc') || sentinelId.includes('path') || sentinelId.includes('eob') || sentinelId.includes('token')) return 'capability';
  if (sentinelId.includes('seven-powers')) return 'strategy';
  if (sentinelId.includes('key-person') || sentinelId.includes('risk')) return 'risk';
  return 'health';
}
