/**
 * compute-coupling-strength.ts — 跨活动耦合强度计算
 *
 * 契约ID: COMPUTE-COUPLING-STRENGTH-v1
 * 模块: l2-value
 * 消费边: COUPLES
 * 输入: activityATimeSeries({marginalContribution, period}[]), activityBTimeSeries({marginalContribution, period}[])
 * 输出(正常): { couplingStrength, couplingDirection, couplingLagDays, inertia, confidence, evidence, degraded:false }
 * 输出(降级): { couplingStrength:0, ... degraded:true, warnings:['...'] }
 *
 * 计算步骤（约束3要求JSDoc中明确写出）:
 *   1. 从PRODUCES边提取 Activity A 和 Activity B 的 marginal_contribution 时间序列（过去N周期）
 *   2. 计算 Pearson 相关系数 r = corr(A_ts, B_ts)
 *   3. coupling_strength = |r| （绝对值，0-1）
 *   4. coupling_direction = 交叉相关峰位置比较 → 判定单向A→B / 单向B→A / 双向 / 无
 *   5. coupling_lag_days = 交叉相关函数的最大滞后阶数
 *   6. inertia = 1 - coupling_strength在最近3个周期的变化率（耦合越稳定惯性越高）
 *
 * 降级条件:
 *   - 时间序列长度 < 3 → degraded:true + "数据不足(<3周期)"
 *   - 任一时间序列全零 → degraded:true + "时间序列无变化"
 */

export interface CouplingTimePoint {
  marginalContribution: number;
  period: string;
}

export interface CouplingStrengthInput {
  activityATimeSeries: CouplingTimePoint[];
  activityBTimeSeries: CouplingTimePoint[];
}

export interface CouplingStrengthResult {
  couplingStrength: number;                      // |r|, 0-1
  couplingDirection: 'unidirectional_a_to_b' | 'unidirectional_b_to_a' | 'bidirectional' | 'none';
  couplingLagDays: number;
  inertia: number;                                // 0-1
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
}

/**
 * 计算 Pearson 相关系数
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  const r = numerator / denominator;
  return Math.max(-1, Math.min(1, r));
}

/**
 * 简化版方向判定：通过比较A滞后vsB滞后的交叉相关峰
 * 在多个lag上计算交叉相关，比较A→B vs B→A的最大绝对值
 */
function determineDirection(x: number[], y: number[], maxLag: number): {
  direction: 'unidirectional_a_to_b' | 'unidirectional_b_to_a' | 'bidirectional' | 'none';
  lagDays: number;
} {
  let bestLag = 0;
  let maxCorrAB = 0;  // A→B: A(t) 与 B(t+lag) 的相关
  let maxCorrBA = 0;  // B→A: B(t) 与 A(t+lag) 的相关

  for (let lag = 1; lag <= Math.min(maxLag, Math.floor(x.length / 2)); lag++) {
    const aLead = pearsonCorrelation(x.slice(0, -lag), y.slice(lag));
    const bLead = pearsonCorrelation(y.slice(0, -lag), x.slice(lag));

    if (Math.abs(aLead) > maxCorrAB) {
      maxCorrAB = Math.abs(aLead);
    }
    if (Math.abs(bLead) > maxCorrBA) {
      maxCorrBA = Math.abs(bLead);
      if (maxCorrBA > Math.abs(pearsonCorrelation(x, y))) bestLag = lag;
    }
  }

  const threshold = 0.2;
  if (maxCorrAB < threshold && maxCorrBA < threshold) {
    return { direction: 'none', lagDays: 0 };
  }
  if (maxCorrAB > maxCorrBA * 1.2) {
    return { direction: 'unidirectional_a_to_b', lagDays: bestLag };
  }
  if (maxCorrBA > maxCorrAB * 1.2) {
    return { direction: 'unidirectional_b_to_a', lagDays: bestLag };
  }
  return { direction: 'bidirectional', lagDays: bestLag };
}

export function computeCouplingStrength(input: CouplingStrengthInput): CouplingStrengthResult {
  const { activityATimeSeries, activityBTimeSeries } = input;
  const warnings: string[] = [];

  // 对齐时间序列
  const n = Math.min(activityATimeSeries.length, activityBTimeSeries.length);
  if (n < 3) {
    return {
      couplingStrength: 0, couplingDirection: 'none', couplingLagDays: 0, inertia: 0,
      confidence: 'low', evidence: [], degraded: true,
      warnings: [`数据不足(<3周期): A有${activityATimeSeries.length}, B有${activityBTimeSeries.length}`],
    };
  }

  const aVals = activityATimeSeries.slice(-n).map(p => p.marginalContribution);
  const bVals = activityBTimeSeries.slice(-n).map(p => p.marginalContribution);

  const aAllZero = aVals.every(v => v === 0);
  const bAllZero = bVals.every(v => v === 0);
  if (aAllZero || bAllZero) {
    return {
      couplingStrength: 0, couplingDirection: 'none', couplingLagDays: 0, inertia: 0,
      confidence: 'low', evidence: [], degraded: true,
      warnings: [`${aAllZero ? 'A' : 'B'}时间序列全零`],
    };
  }

  // Step 2: Pearson correlation
  const r = pearsonCorrelation(aVals, bVals);

  // Step 3: coupling strength = |r|
  const couplingStrength = Math.abs(r);

  // Step 4: direction
  const maxLag = Math.min(6, Math.floor(n / 3));
  const { direction, lagDays } = determineDirection(aVals, bVals, maxLag);

  // Step 5: lag
  const couplingLagDays = lagDays;

  // Step 6: inertia — 将序列分段计算变化率
  const segmentSize = Math.max(1, Math.floor(n / 3));
  const segments: number[] = [];
  for (let s = 0; s < n; s += segmentSize) {
    const end = Math.min(s + segmentSize, n);
    const segA = aVals.slice(s, end);
    const segB = bVals.slice(s, end);
    if (segA.length >= 2 && segB.length >= 2) {
      segments.push(Math.abs(pearsonCorrelation(segA, segB)));
    }
  }

  let inertia = 0.5;
  if (segments.length >= 2) {
    const changes = segments.slice(1).map((v, i) => Math.abs(v - segments[i]));
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    inertia = Math.max(0, Math.min(1, 1 - avgChange));
  }

  const confidence = n >= 12 ? 'high' : n >= 6 ? 'medium' : 'low';
  if (n < 12) warnings.push(`仅${n}周期数据，置信度受限`);

  return {
    couplingStrength: Math.round(couplingStrength * 1000) / 1000,
    couplingDirection: direction,
    couplingLagDays,
    inertia: Math.round(inertia * 1000) / 1000,
    confidence,
    evidence: [`Pearson r=${r.toFixed(4)}`, `lag=${lagDays}`, `segments=${segments.length}`],
    degraded: false,
    warnings,
  };
}
