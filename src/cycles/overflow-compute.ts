/**
 * src/cycles/overflow-compute.ts — 溢出计算引擎
 *
 * 解析 overflowFormula → 逐参数查 sourceId → 按 YoY/MoM/trendDirection 计算趋势。
 * 纯函数：输入确定则输出确定，不依赖外部状态。
 *
 * 契约:
 *   @input  — CycleConfig + 企业数据时间序列
 *   @output — OverflowSnapshot（含同比/环比/趋势方向）
 *   @degraded — 数据不足时降级标记，不崩溃
 */
import { createLogger } from '@synova/logger';
import type { CycleConfig } from './cycle-types';

const log = createLogger('cycles/overflow-compute');

// ═══ Types ═══

export interface OverflowSnapshot {
  /** 所属循环 ID */
  cycleId: string;
  /** 快照月份（YYYY-MM） */
  month: string;
  /** 溢出值 */
  overflowValue: number;
  /** 单位 */
  unit: string;
  /** 趋势描述 */
  trend: string;
  /** 趋势偏移量 */
  trendDelta: number;
  /** 数据成熟度 */
  maturity: 'learning' | 'active' | 'mature';
  /** 是否为行业基准线 */
  isIndustryBaseline: boolean;
  /** 环比变化绝对值 */
  momChange: number;
  /** 环比变化百分比 */
  momChangePercent: number;
  /** 同比变化绝对值（数据不足12月时为 null） */
  yoyChange: number | null;
  /** 同比变化百分比（数据不足12月时为 null） */
  yoyChangePercent: number | null;
  /** 趋势方向 */
  trendDirection: 'rising' | 'stable' | 'declining';
  /** 连续同向月数 */
  consecutiveDirection: number;
  /** 降级标记 */
  degraded: boolean;
}

export interface EnterpriseTimeSeries {
  /** 月度数据点列表（最近 13 个月，倒序或正序均可） */
  dataPoints: Array<{ month: string; value: number }>;
  /** 节点当前值 */
  currentNodeValues: Record<string, number>;
  /** 企业 ID */
  enterpriseId: string;
}

// ═══ 核心计算函数 ═══

/**
 * 计算循环溢出快照。
 *
 * 步骤:
 * 1. 从 cycle 的 overflowFormula 提取目标节点
 * 2. 从企业数据中获取当前值 + 时间序列
 * 3. 计算环比（MoM — 本期 vs 上期）
 * 4. 如果数据 ≥12 个月，计算同比（YoY — 本期 vs 去年同期）
 * 5. 判断趋势方向 + 连续同向月数
 * 6. 返回完整 OverflowSnapshot
 *
 * @param cycle - 循环配置
 * @param data - 企业时间序列数据
 * @returns OverflowSnapshot
 */
export function computeOverflow(cycle: CycleConfig, data: EnterpriseTimeSeries): OverflowSnapshot {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const formula = cycle.overflowFormula;
  const targetNodeId = formula.targetNode;
  const targetNode = cycle.nodes.find(n => n.id === targetNodeId);

  // 当前值
  const currentValue = data.currentNodeValues[targetNodeId] ??
    targetNode?.currentValue ??
    targetNode?.initialValue ?? 0;

  const unit = targetNode?.unit ?? '';
  const formulaResult = safeEvalFormula(formula.formula, data.currentNodeValues, currentValue);

  // 时间序列 — 按月份排序（从旧到新）
  const sorted = [...data.dataPoints].sort((a, b) => a.month.localeCompare(b.month));
  const latestIdx = sorted.length - 1;
  const prevIdx = sorted.length - 2;

  // 环比
  const momChange = latestIdx >= 0 && prevIdx >= 0
    ? formulaResult - (sorted[prevIdx]?.value ?? 0)
    : 0;
  const momPrev = sorted[prevIdx]?.value ?? 1;
  const momChangePercent = momPrev !== 0
    ? Math.round((momChange / Math.abs(momPrev)) * 10000) / 100
    : 0;

  // 同比（需要至少 12 个月数据）
  const yoyIdx = latestIdx - 11; // 去年同期
  let yoyChange: number | null = null;
  let yoyChangePercent: number | null = null;
  if (yoyIdx >= 0 && sorted[yoyIdx]) {
    const yoyPrev = sorted[yoyIdx].value;
    yoyChange = formulaResult - yoyPrev;
    yoyChangePercent = yoyPrev !== 0
      ? Math.round((yoyChange / Math.abs(yoyPrev)) * 10000) / 100
      : 0;
  }

  // 趋势方向
  let consecutiveDirection = 0;
  let trendDirection: 'rising' | 'stable' | 'declining' = 'stable';

  if (sorted.length >= 2) {
    const recentValues = sorted.slice(-6); // 最近 6 个月
    const diff = recentValues[recentValues.length - 1].value - recentValues[0].value;
    trendDirection = diff > 0.05 * Math.abs(recentValues[0].value || 1) ? 'rising'
      : diff < -0.05 * Math.abs(recentValues[0].value || 1) ? 'declining'
      : 'stable';

    // 连续同向月数
    let count = 0;
    for (let i = sorted.length - 1; i > 0; i--) {
      const d = sorted[i].value - sorted[i - 1].value;
      const sign = trendDirection === 'rising' ? d > 0 : trendDirection === 'declining' ? d < 0 : false;
      if (sign) { count++; } else { break; }
    }
    consecutiveDirection = count;
  }

  // 数据成熟度 → 溢出快照成熟度
  const maturityMap: Record<string, 'learning' | 'active' | 'mature'> = {
    low: 'learning',
    medium: 'active',
    high: 'mature',
  };

  const degraded = data.dataPoints.length < 2;

  const snapshot: OverflowSnapshot = {
    cycleId: cycle.cycleId,
    month: currentMonth,
    overflowValue: Math.round(formulaResult * 100) / 100,
    unit,
    trend: formula.condition,
    trendDelta: momChange,
    maturity: maturityMap[cycle.dataMaturity] || 'learning',
    isIndustryBaseline: false,
    momChange: Math.round(momChange * 100) / 100,
    momChangePercent,
    yoyChange: yoyChange !== null ? Math.round(yoyChange * 100) / 100 : null,
    yoyChangePercent,
    trendDirection,
    consecutiveDirection,
    degraded,
  };

  log.info({ cycleId: cycle.cycleId, overflowValue: snapshot.overflowValue, trendDirection }, '溢出计算完成');
  return snapshot;
}

/**
 * 安全地执行溢出公式。
 * 公式中引用 {{nodeId}} 的占位符会被替换为当前值。
 */
function safeEvalFormula(
  formula: string,
  nodeValues: Record<string, number>,
  fallbackValue: number,
): number {
  try {
    let expr = formula;

    // 替换所有 {{nodeId}} 占位符
    expr = expr.replace(/\{\{(\w+)\}\}/g, (_, nodeId) => {
      const val = nodeValues[nodeId] ?? fallbackValue;
      return String(val);
    });

    // 替换简单变量引用（x.initialValue, x.currentValue）
    expr = expr.replace(/(\w+)\.initialValue/g, (_, id) => String(nodeValues[id] ?? fallbackValue));
    expr = expr.replace(/(\w+)\.currentValue/g, (_, id) => String(nodeValues[id] ?? fallbackValue));

    // 安全求值 — 仅允许数学表达式
    const sanitized = expr.replace(/\s+/g, '');
    if (!/^[\d+\-*/().%maxmin,]+$/.test(sanitized)) {
      // 包含函数调用（max, min 等）
      const result = new Function(
        ...Object.keys(nodeValues),
        `"use strict"; return (${expr});`,
      )(...Object.values(nodeValues));
      return typeof result === 'number' && isFinite(result) ? result : fallbackValue;
    }

    // 纯数学表达式
    const result = Function(`"use strict"; return (${expr});`)();
    return typeof result === 'number' && isFinite(result) ? result : fallbackValue;
  } catch {
    log.warn({ formula }, '溢出公式求值失败 — 使用默认值');
    return fallbackValue;
  }
}
