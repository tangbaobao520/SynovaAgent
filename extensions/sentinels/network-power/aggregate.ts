/**
 * network-power/aggregate.ts — I5 网络权力哨兵
 *
 * D577: 判定源 = loader 注入 thresholds（manifest 基线 + memStore 覆写，第 4 参）；
 * 未注入（直调/单测）fallback 内置默认 DEFAULT_THRESHOLDS（与 manifest 现值一致，蓝绿基准）。
 */
import type { SentinelFinding, SentinelThresholdPair } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeNetworkPower } from './computes/betweenness-centrality';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/network-power');

/** 内置默认阈值 = 改造前硬编码现值（D577 蓝绿基准：注入与默认行为完全一致） */
const DEFAULT_THRESHOLDS = {
  power_index: { warning: 0.6, critical: 0.8 },
} as const;

interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const networkPowerSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal,
    thresholds?: Record<string, SentinelThresholdPair>): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();

    // D577: 阈值消费契约 — 注入优先；参数在但缺 key → log.warn（真配置缺口）；未注入 → log.debug（直调/单测）
    const th = (key: keyof typeof DEFAULT_THRESHOLDS): SentinelThresholdPair => {
      const injected = thresholds?.[key];
      if (injected) return injected;
      if (thresholds) log.warn({ sentinel: 'network-power', key }, 'thresholds 注入缺 key — fallback 内置默认（manifest 配置缺口）');
      else log.debug({ sentinel: 'network-power', key }, 'thresholds 未注入（直调/单测）— fallback 内置默认');
      return DEFAULT_THRESHOLDS[key];
    };
    try {
    let allNodeData: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      // @deprecated — 语义迁移由D15处理
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (r.nodes[0]) { allNodeData = r.nodes; usedTraversal = true; } }
    } catch (err: unknown) { log.warn({ err, teamId }, 'graph traversal failed - fallback'); }
      const nodes = [...store.queryNodes('Person', { teamId }), ...store.queryNodes('Agent', { teamId }), ...store.queryNodes('Client', { teamId }), ...store.queryNodes('Agent', { teamId })];
      const r = computeNetworkPower(nodes);
      if (r.degraded) { log.warn({ teamId }, 'compute degraded — skipping threshold'); return []; }
      log.debug({ powerIndex: r.powerIndex }, '网络权力计算完成');
      if (r.powerIndex > th('power_index').critical) return [{ id: `i5-crit-${now.getTime()}`, severity: 'critical', title: `网络权力集中 (指数${r.powerIndex.toFixed(2)})`, description: '权力或信息流高度集中在少数节点。', evidence: [`权力指数: ${r.powerIndex.toFixed(2)}`, `关键节点: ${r.keyNodes.join(', ')}`], suggestion: '分散关键决策权，降低单点故障风险。', detectedAt: checkedAt }];
      if (r.powerIndex > th('power_index').warning) return [{ id: `i5-warn-${now.getTime()}`, severity: 'warning', title: `网络权力偏高 (${r.powerIndex.toFixed(2)})`, description: '部分节点权力过大。', evidence: [`指数: ${r.powerIndex.toFixed(2)}`, `总节点: ${r.totalNodes}`], suggestion: '评估关键人员的备份计划。', detectedAt: checkedAt }];
      return [];
    } catch (err: unknown) { log.error({ err }, '[network-power] 失败'); return [{ id: `i5-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
