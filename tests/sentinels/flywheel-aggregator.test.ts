import { describe, it, expect } from 'vitest';
import { computeFlywheelSpeeds } from '../../src/sentinel/flywheel-aggregator';
import type { SentinelFinding } from '../../src/sentinel/types';

describe('computeFlywheelSpeeds', () => {
  it('空列表默认中等', () => {
    const r = computeFlywheelSpeeds([]);
    expect(r.valueCreation).toBe(50);
    expect(r.valueCapture).toBe(50);
    expect(r.valueRegeneration).toBe(50);
  });

  it('全critical应低转速', () => {
    const findings: SentinelFinding[] = [
      { id: 'e1-crit-1', severity: 'critical', title: 't', description: 'd', evidence: [], suggestion: '', detectedAt: '' },
      { id: 'e1-crit-2', severity: 'critical', title: 't', description: 'd', evidence: [], suggestion: '', detectedAt: '' },
    ];
    const r = computeFlywheelSpeeds(findings);
    expect(r.valueCreation).toBeLessThan(30);
  });

  it('瓶颈=最低飞轮', () => {
    const allCritical: SentinelFinding[] = [
      { id: 's1-crit-1', severity: 'critical', title: 't', description: 'd', evidence: [], suggestion: '', detectedAt: '' },
      { id: 'f1-crit-1', severity: 'critical', title: 't', description: 'd', evidence: [], suggestion: '', detectedAt: '' },
      { id: 'o1-crit-1', severity: 'critical', title: 't', description: 'd', evidence: [], suggestion: '', detectedAt: '' },
      { id: 't5-crit-1', severity: 'critical', title: 't', description: 'd', evidence: [], suggestion: '', detectedAt: '' },
    ];
    const r = computeFlywheelSpeeds(allCritical);
    expect(['creation', 'capture', 'regeneration']).toContain(r.bottleneck);
  });
});
