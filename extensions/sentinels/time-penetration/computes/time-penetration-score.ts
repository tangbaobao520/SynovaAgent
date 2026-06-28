/**
 * I9: 时间穿透力 — 企业能否跨越时间周期做决策
 *
 * 理论依据: Christensen 时间穿透力理论，企业战略决策的时间视野
 * 影响资源配置质量和竞争反应能力。
 *
 * 评分方法:
 * - events: 企业中观察到的长期战略事件数量（如研发项目、产能投资）
 * - changes: 同期环境变化事件数量
 * - 用 log2 压缩后归一化到 [0,1]，反映战略投资密度
 */
export interface TimePenetrationResult {
  penetration: number;
  degraded: boolean;
}

export function computeTimePenetration(events: number, changes: number): TimePenetrationResult {
  if (events === 0) return { penetration: 0.5, degraded: true };
  if (changes === 0) return { penetration: 0.8, degraded: false };
  const raw = Math.log2(events + 1) / Math.log2(changes + 2);
  return { penetration: Math.round(Math.min(raw, 1) * 100) / 100, degraded: false };
}
