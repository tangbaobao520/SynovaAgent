/**
 * src/cycles/overflow-dashboard.ts — 动态溢出仪表盘生成器
 *
 * D90: 每个注册的子循环 = 一行仪表盘。
 * 5 列: 循环名称 / 当前溢出值 / 趋势箭头 / 数据成熟度 / 更新周期
 * 排序: 负溢出优先（吸引注意力）
 * 热力图: 子循环 × 时间轴矩阵
 *
 * 契约:
 *   @input  — enterpriseId + CycleRegistry + GraphBridge
 *   @output — OverflowDashboard
 *   @degraded — 部分循环数据不可用时降级，不阻断整体
 */
import { createLogger } from '@synova/logger';
import type { CycleRegistry } from './cycle-registry';
import type { GraphStore } from '../l4/graph-bridge';
import type { OverflowSnapshot } from './overflow-compute';
import { validateOverflowSignals } from "./cross-scale-validator";
import { getCycleSnapshots, getLatestSnapshot } from './overflow-graph-bridge';

const log = createLogger('cycles/overflow-dashboard');

// ═══ Types ═══

export interface DashboardRow {
  cycleId: string;
  cycleName: string;
  currentOverflow: number;
  unit: string;
  trendArrow: '▲' | '▼' | '◆';
  trendDirection: 'rising' | 'stable' | 'declining';
  maturity: 'learning' | 'active' | 'mature';
  maturityLabel: string;
  updateCycle: string;
  hasOverflow: boolean;
}

export interface HeatmapCell {
  cycleId: string;
  month: string;
  value: number;
  maturity: string;
}

export interface ConductionStep {
  step: number;
  fromNode: string;
  toNode: string;
  estimatedLag: string;
  polarity: '+' | '-';
}

export interface OverflowDashboard {
  enterpriseId: string;
  generatedAt: string;
  rows: DashboardRow[];
  heatmap: HeatmapCell[];
  conductionTimeline: ConductionStep[];
  totalCycles: number;
  overflowCount: number;
  degraded: boolean;
  crossScaleWarnings: Array<{
    type: string;
    fastCycleId: string;
    fastCycleName: string;
    slowCycleId: string;
    slowCycleName: string;
    verdict: string;
    suggestion: string;
  }>;
}

// ═══ 仪表盘生成 ═══

const MATURITY_LABELS: Record<string, string> = {
  learning: '学习中 (低置信度)',
  active: '活跃 (中置信度)',
  mature: '成熟 (高置信度)',
};

const TREND_ARROWS: Record<string, '▲' | '▼' | '◆'> = {
  rising: '▲',
  declining: '▼',
  stable: '◆',
};

/**
 * 生成组织溢出仪表盘。
 *
 * @param enterpriseId - 企业 ID
 * @param registry - CycleRegistry 实例
 * @param store - GraphStore 实例
 * @returns OverflowDashboard
 */
export function generateOverflowDashboard(
  enterpriseId: string,
  registry: CycleRegistry,
  store: GraphStore,
): OverflowDashboard {
  const cycles = registry.list();
  const rows: DashboardRow[] = [];
  const heatmap: HeatmapCell[] = [];
  const allConductionSteps: ConductionStep[] = [];

  for (const cycle of cycles) {
    const latest = getLatestSnapshot(enterpriseId, cycle.cycleId, store);
    const snapshots = getCycleSnapshots(enterpriseId, cycle.cycleId, store);

    // 行数据
    const hasOverflow = latest ? latest.overflowValue > (cycle.nodes.reduce((max, n) => Math.max(max, n.initialValue || 0), 0) * 0.5) : false;

    rows.push({
      cycleId: cycle.cycleId,
      cycleName: cycle.name,
      currentOverflow: latest?.overflowValue ?? 0,
      unit: latest?.unit ?? '',
      trendArrow: latest ? TREND_ARROWS[latest.trendDirection] || '◆' : '◆',
      trendDirection: latest?.trendDirection ?? 'stable',
      maturity: latest?.maturity ?? 'learning',
      maturityLabel: MATURITY_LABELS[latest?.maturity ?? 'learning'] || '未知',
      updateCycle: '每月',
      hasOverflow,
    });

    // 热力图单元格
    for (const snap of snapshots) {
      heatmap.push({
        cycleId: cycle.cycleId,
        month: snap.month,
        value: snap.overflowValue,
        maturity: snap.maturity,
      });
    }

    // 传导时间线
    cycle.edges.forEach((edge, idx) => {
      allConductionSteps.push({
        step: idx + 1,
        fromNode: edge.from,
        toNode: edge.to,
        estimatedLag: `${edge.delay ?? 1} 个周期`,
        polarity: edge.polarity,
      });
    });
  }

  // 排序: 负溢出优先（有问题的排前面）
  rows.sort((a, b) => {
    if (a.hasOverflow !== b.hasOverflow) return a.hasOverflow ? -1 : 1;
    return Math.abs(b.currentOverflow) - Math.abs(a.currentOverflow);
  });

  // 热力图按时间倒序
  heatmap.sort((a, b) => b.month.localeCompare(a.month));

  // 只保留最近 12 个月
  const recentHeatmap = heatmap.slice(0, 12 * (cycles.length || 1));

  const crossScaleWarnings = validateOverflowSignals(enterpriseId, store);
  const finalized: OverflowDashboard = {
    enterpriseId, generatedAt: new Date().toISOString(), rows, heatmap: recentHeatmap,
    conductionTimeline: allConductionSteps, totalCycles: cycles.length,
    overflowCount: rows.filter(r => r.hasOverflow).length, degraded: false,
    crossScaleWarnings,
  };

  log.info({ enterpriseId, totalCycles: finalized.totalCycles, overflowCount: finalized.overflowCount, warnings: crossScaleWarnings.length }, '溢出仪表盘已生成');
  return finalized;
}
