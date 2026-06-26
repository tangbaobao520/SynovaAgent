import { describe, it, expect } from 'vitest';
import { computeOpportunityWindowScore } from '../../extensions/sentinels/opportunity-window/computes/opportunity-window-score';

describe('computeOpportunityWindowScore', () => {
  it('空事件degraded', () => {
    const r = computeOpportunityWindowScore([]);
    expect(r.degraded).toBe(true);
  });

  it('技术变革增加评分', () => {
    const r = computeOpportunityWindowScore([
      { type: 'Tool', eventType: 'technology_change' },
      { type: 'Tool', eventType: 'technology_change' },
    ]);
    expect(r.techChangeSignals).toBe(2);
    expect(r.degraded).toBe(false);
  });

  it('多种信号叠加', () => {
    const r = computeOpportunityWindowScore([
      { type: 'Event', eventType: 'technology_change' },
      { type: 'Event', eventType: 'regulatory_change' },
      { type: 'Event', eventType: 'competitive_action' },
    ]);
    expect(r.techChangeSignals + r.regulatorySignals + r.competitiveSignals).toBe(3);
  });
});
