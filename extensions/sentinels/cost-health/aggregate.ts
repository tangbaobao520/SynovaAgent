/**
 * cost-health/aggregate.ts — 成本健康哨兵
 *
 * 综合 N 个计算指标 → 1 条 Finding。
 * 数据通过 L4 GraphStore 接口获取，不直接查 SQLite。
 *
 * V4.4.2 — compute 函数抽取
 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';
import { computeGrossMargin } from './computes/compute-gross-margin';
import { computeFixedVariableRatio } from './computes/compute-fixed-variable-ratio';
import { computeCostPerHead } from './computes/compute-cost-per-head';

const log = createLogger('sentinel/cost-health');

export const costHealthSentinel = {
  manifest: null as SentinelManifest | null, // 由 loader 注入

  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];

    try {
      const [grossMarginResult, fixedRatioResult] = await Promise.all([
        computeGrossMargin(store, { teamId, traversal }),
        computeFixedVariableRatio(store, { teamId, traversal }),
      ]);

      // 1. 毛利率变化率
      if (this.manifest && !grossMarginResult.degraded) {
        const t = this.manifest.thresholds.gross_margin;
        if (grossMarginResult.value <= t.critical) {
          findings.push({
            id: 'cost_gross_margin_critical',
            severity: 'critical',
            title: '毛利率严重下降',
            description: `毛利率 ${(grossMarginResult.value * 100).toFixed(1)}%，低于 critical 阈值 ${(t.critical * 100).toFixed(0)}%。`,
            detectedAt: new Date().toISOString(),
          });
        } else if (grossMarginResult.value <= t.warning) {
          findings.push({
            id: 'cost_gross_margin_warning',
            severity: 'warning',
            title: '毛利率下降',
            description: `毛利率 ${(grossMarginResult.value * 100).toFixed(1)}%，低于 warning 阈值 ${(t.warning * 100).toFixed(0)}%。`,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // 3. 人均成本
      if (!grossMarginResult.degraded) {
        const costPerHeadResult = await computeCostPerHead(store, { teamId, traversal });
        if (this.manifest && !costPerHeadResult.degraded) {
          const t = this.manifest.thresholds.cost_per_head;
          if (costPerHeadResult.value >= t.critical) {
            findings.push({
              id: 'cost_per_head_critical',
              severity: 'critical',
              title: '人均成本过高',
              description: `人均成本 ${costPerHeadResult.value.toFixed(0)}，超出 critical 阈值 ${t.critical}。`,
              evidence: costPerHeadResult.evidence,
              suggestion: '审查人员结构和成本效率。',
              detectedAt: new Date().toISOString(),
            });
          } else if (costPerHeadResult.value >= t.warning) {
            findings.push({
              id: 'cost_per_head_warning',
              severity: 'warning',
              title: '人均成本偏高',
              description: `人均成本 ${costPerHeadResult.value.toFixed(0)}，超出 warning 阈值 ${t.warning}。`,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }

      // 2. 固定/变动成本比
      if (this.manifest && !fixedRatioResult.degraded) {
        const t = this.manifest.thresholds.fixed_ratio;
        if (fixedRatioResult.value >= t.critical) {
          findings.push({
            id: 'cost_fixed_ratio_critical',
            severity: 'critical',
            title: '固定成本占比过高',
            description: `固定成本占比 ${(fixedRatioResult.value * 100).toFixed(1)}%，超出 critical 阈值 ${(t.critical * 100).toFixed(0)}%。成本结构僵化。`,
            evidence: fixedRatioResult.evidence,
            suggestion: '审查固定成本构成，寻找可变成本化机会（外包、按需资源）。',
            detectedAt: new Date().toISOString(),
          });
        } else if (fixedRatioResult.value >= t.warning) {
          findings.push({
            id: 'cost_fixed_ratio_warning',
            severity: 'warning',
            title: '固定成本占比偏高',
            description: `固定成本占比 ${(fixedRatioResult.value * 100).toFixed(1)}%，超出 warning 阈值 ${(t.warning * 100).toFixed(0)}%。`,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      if (findings.length > 0) {
        log.info({ teamId, count: findings.length }, '成本健康检查完成');
      }
    } catch (err: any) {
      log.warn({ err, teamId }, '成本健康检查失败 — degraded');
    }

    return findings;
  },
};
