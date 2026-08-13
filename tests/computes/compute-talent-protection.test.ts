/**
 * tests/computes/compute-talent-protection.test.ts
 *
 * E-41 TALENT_PROTECTION — 知识保留与备份比率
 * 覆盖: 正常/降级/边界
 */
import { describe, it, expect } from 'vitest';
import { computeTalentProtection } from '../../extensions/sentinels/shared/computes/l4-capture/compute-talent-protection';

describe('computeTalentProtection', () => {
  it('正常参数 → 返回人才保护评分', () => {
    const result = computeTalentProtection({ knowledgeRetention: 0.8, backupRatio: 0.9 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeGreaterThan(0.5);
    expect(result.confidence).toBe('high');
  });

  it('两类均缺失 → 降级', () => {
    const result = computeTalentProtection({ knowledgeRetention: -1, backupRatio: -1 });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
  });

  it('边界值 → 不崩溃', () => {
    const result = computeTalentProtection({ knowledgeRetention: -0.5, backupRatio: 2 });
    expect(result.degraded).toBe(false);
    expect(result.value).toBeLessThanOrEqual(1);
  });
});
