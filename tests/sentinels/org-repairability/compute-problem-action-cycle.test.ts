import { describe, it, expect } from 'vitest';
import { computeProblemActionCycle } from '../../../extensions/sentinels/org-repairability/computes/compute-problem-action-cycle';

describe('computeProblemActionCycle', () => {
  it('should score lower for slow repair with high recurrence', () => {
    const events = [
      { eventType: 'problem_detected', timestamp: '2025-01-01', problemCategory: 'network', resolved: true, resolvedAt: '2025-04-01' },
      { eventType: 'problem_detected', timestamp: '2025-05-01', problemCategory: 'network', resolved: true, resolvedAt: '2025-06-01' },
      { eventType: 'corrective_action', timestamp: '2025-04-02', problemCategory: 'network' },
    ];
    const r = computeProblemActionCycle(events);
    expect(r.totalProblems).toBeGreaterThan(0);
    expect(r.repairCycleDays).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });

  it('should degrade on empty data', () => {
    const r = computeProblemActionCycle([]);
    expect(r.degraded).toBe(true);
  });

  it('should handle no problem events gracefully', () => {
    const r = computeProblemActionCycle([{ eventType: 'info', timestamp: '2025-01-01' }]);
    expect(r.totalProblems).toBe(0);
  });
});
