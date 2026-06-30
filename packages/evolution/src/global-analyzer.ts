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
import type { L3WriteAPI, PerSentinelStats, IndustryBaseline } from './evolution-types';
import { DEFAULT_EVOLUTION_CONFIG } from './evolution-types';

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
export async function aggregateAllIndustries(l3: L3WriteAPI): Promise<IndustryBaseline[]> {
  try {
    const { listIndustries } = await import('../l4/industry-loader');
    const industries = listIndustries();
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '批量行业聚合失败');
    return [];
  }
}
