/**
 * info-distortion/computes/compute-info-distortion.ts — 信息失真率
 *
 * 评估信息在组织层级传递中的失真程度。
 * 失真来源: 管理层级深度、目标一致性偏差、沟通故障频率。
 * 层级越深 + 目标分散度越高 + 沟通故障越多 = 失真率越高。
 */
export interface DistortionResult {
  distortionRate: number;         // 0-1, 信息失真率
  orgDepth: number;               // 管理层级数
  goalDispersion: number;         // 目标分散度 0-1
  communicationFailures: number;  // 沟通故障事件数
  assessment: 'low' | 'moderate' | 'high' | 'insufficient';
  degraded: boolean;
}

export function computeInfoDistortion(
  personCount: number,
  managerCount: number,
  eventCount: number,
  failureEvents: number
): DistortionResult {
  if (personCount === 0 && eventCount === 0) {
    return { distortionRate: 0, orgDepth: 0, goalDispersion: 0, communicationFailures: 0, assessment: 'insufficient', degraded: true };
  }

  // 管理层级深度: 管理者占比越高 = 层级越深
  const orgDepth = personCount > 0 ? Math.round(1 + managerCount / Math.max(personCount, 1) * 5) : 1;

  // 沟通故障频率
  const communicationFailures = failureEvents;
  const failureRate = eventCount > 0 ? failureEvents / eventCount : 0;

  // 管理层级对失真率的影响: 每层增加约 10% 失真 (经典组织理论)
  const depthDistortion = Math.min((orgDepth - 1) * 0.1, 0.5);

  // 沟通故障影响
  const eventDistortion = failureRate;

  // 目标分散度: 用管理者比例代替 (高管理比 = 可能目标分散)
  const goalDispersion = managerCount > 0 ? Math.min(managerCount / Math.max(personCount || 1, 1), 1) : 0.2;

  // 综合失真率
  const rawRate = depthDistortion * 0.4 + eventDistortion * 0.35 + goalDispersion * 0.25;
  const distortionRate = Math.min(Math.max(rawRate, 0), 1);

  let assessment: 'low' | 'moderate' | 'high' | 'insufficient';
  if (distortionRate > 0.35) {
    assessment = 'high';
  } else if (distortionRate > 0.15) {
    assessment = 'moderate';
  } else {
    assessment = 'low';
  }

  return {
    distortionRate: Math.round(distortionRate * 100) / 100,
    orgDepth,
    goalDispersion: Math.round(goalDispersion * 100) / 100,
    communicationFailures,
    assessment,
    degraded: false,
  };
}
