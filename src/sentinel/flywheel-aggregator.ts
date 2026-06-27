/**
 * sentinel/flywheel-aggregator.ts — 飞轮聚合引擎
 *
 * 将 46 哨兵的 SentinelFinding[] 聚合为三飞轮转速。
 * 技术方案 §12: 价值创造/价值兑现/价值再生 + 瓶颈检测。
 *
 * 每飞轮转速 = 该飞轮下所有哨兵得分的加权平均。
 * 瓶颈 = argmin(三个飞轮转速)。
 */
import type { SentinelFinding } from './types';

export interface FlywheelSpeeds {
  valueCreation: number;      // 0-100, 价值创造飞轮转速
  valueCapture: number;       // 0-100, 价值兑现飞轮转速
  valueRegeneration: number;  // 0-100, 价值再生飞轮转速
  bottleneck: 'creation' | 'capture' | 'regeneration';
}

// 三飞轮 → 哨兵 ID 映射（技术方案 §12.1）
const VALUE_CREATION = new Set([
  // 环境层 E1-E6: 市场空间、机会窗口、竞争格局、客户迁移、环境红利、结构变化
  'sentinel-cash-flow', 'sentinel-api-accessibility', 'sentinel-protocol-coverage',
  'sentinel-data-readiness', 'sentinel-data-silos', 'sentinel-saas-utilization',
  'sentinel-shadow-it', 'sentinel-customer-dynamics', 'sentinel-revenue-decomposition',
  // Extensions 哨兵（按哨兵 ID）
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6',
  // 界面层 I1-I13 (除 I7-I10)
  'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I11', 'I12', 'I13',
  // 技术层 T1-T4, T6, T9
  'T1', 'T2', 'T3', 'T4', 'T6', 'T9',
]);

const VALUE_CAPTURE = new Set([
  // 资本层 F1-F5
  'F1', 'F2', 'F3', 'F4', 'F5',
  // 界面层 I7-I10: 商业模式一致性、护城河依赖度、时间穿透力、单位经济
  'I7', 'I8', 'I9', 'I10',
]);

const VALUE_REGENERATION = new Set([
  // 匹配层 S1-S3
  'S1', 'S2', 'S3',
  // 内部层 O1-O10
  'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10',
  // 技术层 T5, T7-T8: 流程AI化、Agent部署、AI ROI
  'T5', 'T7', 'T8',
]);

function extractSentinelId(finding: SentinelFinding): string {
  // 从 finding.id 提取哨兵 ID（格式如 "e1-stage-123456"）
  const prefix = finding.id.split('-')[0].toUpperCase();
  return prefix;
}

function computeFlywheelScore(
  findings: SentinelFinding[],
  sentinelIds: Set<string>
): number {
  const relevant = findings.filter(f => sentinelIds.has(extractSentinelId(f)));
  if (relevant.length === 0) return 50; // 无数据时默认中等

  // 分值映射: critical=20, warning=50, info=80
  let totalScore = 0;
  for (const f of relevant) {
    switch (f.severity) {
      case 'critical': totalScore += 20; break;
      case 'warning': totalScore += 50; break;
      case 'info': totalScore += 80; break;
    }
  }
  return Math.round(totalScore / relevant.length);
}

/**
 * 输入所有哨兵的 SentinelFinding 列表，输出三个飞轮的转速和瓶颈。
 * @param findings - 所有哨兵的发现列表
 * @returns FlywheelSpeeds - 三个飞轮转速(0-100) + 瓶颈标识
 */
export function computeFlywheelSpeeds(
  findings: SentinelFinding[]
): FlywheelSpeeds {
  const valueCreation = computeFlywheelScore(findings, VALUE_CREATION);
  const valueCapture = computeFlywheelScore(findings, VALUE_CAPTURE);
  const valueRegeneration = computeFlywheelScore(findings, VALUE_REGENERATION);

  // 瓶颈 = 转速最低的飞轮
  let bottleneck: 'creation' | 'capture' | 'regeneration' = 'creation';
  if (valueCapture <= valueCreation && valueCapture <= valueRegeneration) {
    bottleneck = 'capture';
  }
  if (valueRegeneration <= valueCreation && valueRegeneration <= valueCapture) {
    bottleneck = 'regeneration';
  }

  return { valueCreation, valueCapture, valueRegeneration, bottleneck };
}
