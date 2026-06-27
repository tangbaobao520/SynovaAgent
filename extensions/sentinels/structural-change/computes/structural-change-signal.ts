/**
 * structural-change/computes/structural-change-signal.ts — 底层结构变化检测
 *
 * 检测三类底层结构变化：技术范式转移、法规范式变化、经济结构变化。
 */
export interface StructuralChangeResult {
  score: number;
  signals: string[];
  totalEvents: number;
  degraded: boolean;
}

export interface ChangeEvent {
  eventType?: string;
  description?: string;
}

export function computeStructuralChangeSignal(events: ChangeEvent[]): StructuralChangeResult {
  if (events.length === 0) {
    return { score: 0, signals: ['无事件数据'], totalEvents: 0, degraded: true };
  }

  const signals: string[] = [];
  let techParadigm = 0, regulatoryParadigm = 0, economicShift = 0;

  for (const e of events) {
    const type = (e.eventType || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();

    if (type.includes('technology_change') || type.includes('paradigm') || desc.includes('ai') || desc.includes('automation') || desc.includes('digital')) {
      techParadigm++;
    }
    if (type.includes('regulatory_change') || type.includes('compliance') || desc.includes('regulation') || desc.includes('policy') || desc.includes('standard')) {
      regulatoryParadigm++;
    }
    if (type.includes('economic') || type.includes('market_shift') || desc.includes('recession') || desc.includes('inflation') || desc.includes('supply_chain')) {
      economicShift++;
    }
  }

  if (techParadigm > 0) signals.push(`技术范式变化信号: ${techParadigm}个`);
  if (regulatoryParadigm > 0) signals.push(`法规范式变化信号: ${regulatoryParadigm}个`);
  if (economicShift > 0) signals.push(`经济结构变化信号: ${economicShift}个`);

  const total = techParadigm + regulatoryParadigm + economicShift;
  const score = events.length > 0 ? Math.min(total / Math.max(events.length * 0.15, 1), 1) : 0;

  return { score: Math.round(score * 100) / 100, signals, totalEvents: events.length, degraded: false };
}
