/**
 * channel-capacity/computes/compute-channel-capacity.ts — 组织信道容量
 *
 * 基于信息论(Shannon 1948)，评估组织信息流通渠道的容量。
 * 信道容量取决于: 人员规模、团队结构、沟通事件频率。
 * 信道过载 = 信息量超过组织处理能力 = 效率下降。
 */
export interface ChannelResult {
  score: number;
  personCount: number;
  teamCount: number;
  eventsPerPerson: number;
  assessment: 'healthy' | 'underutilized' | 'overloaded' | 'insufficient';
  degraded: boolean;
}

export function computeChannelCapacity(
  personCount: number,
  teamCount: number,
  eventCount: number
): ChannelResult {
  if (personCount === 0 && teamCount === 0 && eventCount === 0) {
    return { score: 0.5, personCount: 0, teamCount: 0, eventsPerPerson: 0, assessment: 'insufficient', degraded: true };
  }

  if (personCount === 0) {
    return { score: 0.3, personCount: 0, teamCount, eventsPerPerson: 0, assessment: 'underutilized', degraded: false };
  }

  const eventsPerPerson = eventCount / personCount;
  const teamDensity = teamCount > 0 ? personCount / teamCount : personCount;

  // 理想信道容量:
  // 人均事件 1-5 = 健康
  // 人均事件 < 1 = 信道未被充分利用
  // 人均事件 > 5 = 信道过载
  const eventScore = eventsPerPerson >= 1 && eventsPerPerson <= 5 ? 0.8
    : eventsPerPerson < 1 ? 0.3 + eventsPerPerson * 0.5
    : Math.max(0, 1 - (eventsPerPerson - 5) * 0.1);

  // 团队密度: 5-10 人/团队 = 理想
  const densityScore = teamDensity >= 5 && teamDensity <= 10 ? 0.8
    : teamDensity < 5 ? 0.3 + teamDensity * 0.1
    : Math.max(0, 1 - (teamDensity - 10) * 0.03);

  const score = Math.round((0.5 * eventScore + 0.5 * densityScore) * 100) / 100;

  let assessment: 'healthy' | 'underutilized' | 'overloaded' | 'insufficient';
  if (eventsPerPerson > 5 || teamDensity > 15) {
    assessment = 'overloaded';
  } else if (score > 0.3) {
    assessment = 'healthy';
  } else {
    assessment = 'underutilized';
  }

  return {
    score: Math.min(Math.max(score, 0), 1),
    personCount,
    teamCount,
    eventsPerPerson: Math.round(eventsPerPerson * 10) / 10,
    assessment,
    degraded: false,
  };
}
