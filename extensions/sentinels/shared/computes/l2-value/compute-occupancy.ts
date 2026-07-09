/**
 * compute-occupancy.ts — 先发占位优势计算（组织生态学）
 *
 * 契约ID: COMPUTE-OCCUPANCY-v1
 * 模块: l2-value
 * 消费边: OCCUPIES
 * 输入: populationDensity(number 0-1), windowDurationMonths(number),
 *       timeToOccupyMonths(number), legitimacyThreshold?(number 0-1),
 *       occupancyDurationMonths(number)
 * 输出(正常): { occupancyAdvantage, windowClosing, confidence, evidence, degraded:false }
 * 输出(降级): { occupancyAdvantage:0, ... degraded:true, warnings:['需GA配置市场数据'] }
 *
 * 计算公式:
 *   occupancy_advantage = population_density * (1 - exp(-window_duration / time_to_occupy)) * legitimacy_threshold
 *
 * 降级条件:
 *   - populationDensity < 0（未配置）→ degraded:true + "需GA配置市场进入时间和竞品数据"
 *   - windowDurationMonths <= 0 或 timeToOccupyMonths <= 0 → degraded:true + "时间参数无效"
 */

export interface OccupancyInput {
  populationDensity: number;           // 种群密度(0-1)，-1表示未配置
  windowDurationMonths: number;        // 先发优势窗口期（月）
  timeToOccupyMonths: number;          // 进入市场到占据位置的时间（月）
  legitimacyThreshold?: number;        // 合法性阈值(0-1)，默认0.5
  occupancyDurationMonths: number;     // 已占据位置的时间（月）
}

export interface OccupancyResult {
  occupancyAdvantage: number;          // 占位优势得分(0-1)
  windowClosing: boolean;              // 窗口是否即将关闭
  populationDensity: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
}

export function computeOccupancy(input: OccupancyInput): OccupancyResult {
  const warnings: string[] = [];
  const {
    populationDensity,
    windowDurationMonths,
    timeToOccupyMonths,
    occupancyDurationMonths,
  } = input;
  const legitimacyThreshold = input.legitimacyThreshold ?? 0.5;

  // 降级：GA未配置population_density
  if (populationDensity < 0) {
    return {
      occupancyAdvantage: 0, windowClosing: false, populationDensity,
      confidence: 'low', evidence: [], degraded: true,
      warnings: ['需GA配置市场进入时间和竞品数据（populationDensity）'],
    };
  }

  // 降级：时间参数无效
  if (windowDurationMonths <= 0 || timeToOccupyMonths <= 0) {
    return {
      occupancyAdvantage: 0, windowClosing: false, populationDensity,
      confidence: 'low', evidence: [], degraded: true,
      warnings: [`时间参数无效: window=${windowDurationMonths}, occupy=${timeToOccupyMonths}`],
    };
  }

  // 降级：populationDensity超出范围
  const clampedDensity = Math.max(0, Math.min(1, populationDensity));

  // 占位优势计算
  const ratio = windowDurationMonths / timeToOccupyMonths;
  const advantage = clampedDensity * (1 - Math.exp(-ratio)) * legitimacyThreshold;
  const occupancyAdvantage = Math.max(0, Math.min(1, Math.round(advantage * 1000) / 1000));

  // 窗口关闭检测
  const windowClosing = windowDurationMonths < 6 && occupancyDurationMonths > windowDurationMonths;

  const evidence: string[] = [
    `populationDensity=${clampedDensity}`,
    `windowDuration=${windowDurationMonths}m`,
    `timeToOccupy=${timeToOccupyMonths}m`,
    `legitimacyThreshold=${legitimacyThreshold}`,
    `occupancyAdvantage=${occupancyAdvantage}`,
  ];

  if (windowClosing) {
    warnings.push(`先发窗口即将关闭: 窗口期${windowDurationMonths}月，已占据${occupancyDurationMonths}月`);
  }

  const confidence = populationDensity >= 0 && timeToOccupyMonths > 0 ? 'medium' : 'low';

  return {
    occupancyAdvantage,
    windowClosing,
    populationDensity: clampedDensity,
    confidence,
    evidence,
    degraded: false,
    warnings,
  };
}
