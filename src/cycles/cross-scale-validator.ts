/**
 * src/cycles/cross-scale-validator.ts — 跨尺度溢出验证器
 *
 * D95: 防止短期信号导致的虚假乐观。
 * 快速信号（周/月）应与慢速信号（季度）交叉校验。
 *
 * 验证规则:
 * 1. 快升 + 慢降: 短期改善可能不可持续
 * 2. 慢升 + 快降: 长期改善可能来自短期投入
 *
 * 4 格验证矩阵:
 *   Fast: cash-cycle / customer-cycle
 *   Slow: talent-cycle / product-cycle (品牌代理)
 *
 * 契约:
 *   @input  — 已计算的溢出快照数据
 *   @output — CrossScaleWarning[]
 *   @degraded — 数据不足时返回空数组
 */
import { createLogger } from '@synova/logger';
import type { GraphStore } from '../l4/graph-bridge';
import { getCycleSnapshots, getLatestSnapshot } from './overflow-graph-bridge';
import type { OverflowSnapshot } from './overflow-compute';

const log = createLogger('cycles/cross-scale-validator');

// ═══ Types ═══

export interface CrossScaleWarning {
  /** 警告类型 */
  type: 'fast_up_slow_down' | 'slow_up_fast_down';
  /** 快速信号循环 ID */
  fastCycleId: string;
  /** 快速信号名称 */
  fastCycleName: string;
  /** 快速信号方向 */
  fastDirection: 'rising' | 'stable' | 'declining';
  /** 慢速信号循环 ID */
  slowCycleId: string;
  /** 慢速信号名称 */
  slowCycleName: string;
  /** 慢速信号方向 */
  slowDirection: 'rising' | 'stable' | 'declining';
  /** 验证结论 */
  verdict: string;
  /** 建议行动 */
  suggestion: string;
}

// ═══ 快/慢循环分类 ═══

/** 快速信号循环（周/月级别） */
const FAST_CYCLES = new Set(['cash-cycle', 'customer-cycle']);

/** 慢速信号循环（季度级别） */
const SLOW_CYCLES = new Set(['talent-cycle', 'product-cycle']);

// ═══ 验证矩阵 ═══

interface MatrixEntry {
  fastCycleId: string;
  slowCycleId: string;
  verdictTemplate: string;
  suggestionTemplate: string;
}

const VALIDATION_MATRIX: MatrixEntry[] = [
  {
    fastCycleId: 'cash-cycle',
    slowCycleId: 'talent-cycle',
    verdictTemplate: '现金流改善但人才加速流失 — 如果人才流失不减缓，现金改善可能不可持续',
    suggestionTemplate: '检查人才留存率趋势，评估人才流失对现金流的滞后影响',
  },
  {
    fastCycleId: 'customer-cycle',
    slowCycleId: 'cash-cycle',
    verdictTemplate: '客户增长但现金流恶化 — 客户增长可能是折扣驱动',
    suggestionTemplate: '检查客户获取成本(CAC)是否上升，评估客户质量而非数量',
  },
  {
    fastCycleId: 'customer-cycle',
    slowCycleId: 'talent-cycle',
    verdictTemplate: '客户增长但人才流失 — 服务能力可能跟不上增长',
    suggestionTemplate: '评估团队产能，确定是否需要控制增长速度',
  },
  {
    fastCycleId: 'cash-cycle',
    slowCycleId: 'product-cycle',
    verdictTemplate: '现金流改善但产品交付质量下降 — 可能牺牲长期质量换取短期现金',
    suggestionTemplate: '检查研发投入和交付质量指标，防止技术债累积',
  },
];

// ═══ 验证逻辑 ═══

/**
 * 判断趋势方向是否属于"改善"。
 * 下降趋势在某些上下文中可能是改善（如成本下降），
 * 但在溢出模型中 rising 通常表示问题加剧。
 * 这里的规则简化为: 上升=正面, 下降=负面, stable=中性。
 */
function isPositive(trend: 'rising' | 'stable' | 'declining'): boolean {
  return trend === 'rising';
}

function isNegative(trend: 'rising' | 'stable' | 'declining'): boolean {
  return trend === 'declining';
}

/**
 * 对指定企业执行跨尺度溢出验证。
 *
 * @param enterpriseId - 企业 ID
 * @param store - GraphStore 实例
 * @returns 跨尺度警告列表
 */
export function validateOverflowSignals(
  enterpriseId: string,
  store: GraphStore,
): CrossScaleWarning[] {
  const warnings: CrossScaleWarning[] = [];

  // 收集所有循环的最新快照
  const latestSnapshots = new Map<string, OverflowSnapshot | null>();
  const allCycleIds = new Set([...FAST_CYCLES, ...SLOW_CYCLES]);

  for (const cycleId of allCycleIds) {
    try {
      latestSnapshots.set(cycleId, getLatestSnapshot(enterpriseId, cycleId, store));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, cycleId }, '获取快照失败 — 降级');
      latestSnapshots.set(cycleId, null);
    }
  }

  // 遍历验证矩阵
  for (const entry of VALIDATION_MATRIX) {
    const fast = latestSnapshots.get(entry.fastCycleId);
    const slow = latestSnapshots.get(entry.slowCycleId);

    if (!fast || !slow) continue; // 数据不足，跳过

    const isFastUp = isPositive(fast.trendDirection);
    const isFastDown = isNegative(fast.trendDirection);
    const isSlowUp = isPositive(slow.trendDirection);
    const isSlowDown = isNegative(slow.trendDirection);

    const fastLabel = fastCycleLabel(entry.fastCycleId);
    const slowLabel = slowCycleLabel(entry.slowCycleId);

    // 规则 1: 快升 + 慢降 → 短期改善可能不可持续
    if (isFastUp && isSlowDown) {
      warnings.push({
        type: 'fast_up_slow_down',
        fastCycleId: entry.fastCycleId,
        fastCycleName: fastLabel,
        fastDirection: fast.trendDirection,
        slowCycleId: entry.slowCycleId,
        slowCycleName: slowLabel,
        slowDirection: slow.trendDirection,
        verdict: entry.verdictTemplate,
        suggestion: entry.suggestionTemplate,
      });
    }

    // 规则 2: 慢升 + 快降 → 长期改善可能来自短期投入
    if (isSlowUp && isFastDown) {
      warnings.push({
        type: 'slow_up_fast_down',
        fastCycleId: entry.fastCycleId,
        fastCycleName: fastLabel,
        fastDirection: fast.trendDirection,
        slowCycleId: entry.slowCycleId,
        slowCycleName: slowLabel,
        slowDirection: slow.trendDirection,
        verdict: entry.verdictTemplate,
        suggestion: entry.suggestionTemplate,
      });
    }
  }

  log.info({ enterpriseId, warnings: warnings.length }, '跨尺度验证完成');
  return warnings;
}

/** 获取快信号循环名称 */
function fastCycleLabel(id: string): string {
  const labels: Record<string, string> = {
    'cash-cycle': '现金流循环',
    'customer-cycle': '客户循环',
  };
  return labels[id] || id;
}

/** 获取慢信号循环名称 */
function slowCycleLabel(id: string): string {
  const labels: Record<string, string> = {
    'talent-cycle': '人才循环',
    'product-cycle': '产品循环',
  };
  return labels[id] || id;
}
