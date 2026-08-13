import { describe, it, expect } from 'vitest';
import { generateNarrative, type SignalInput } from '../../src/pipeline/narrative-generator';

describe('generateNarrative', () => {
  it('空信号 → 无关键信号', () => {
    expect(generateNarrative([])).toContain('无关键信号');
  });

  it('critical信号 → 含需立即关注', () => {
    const signals: SignalInput[] = [{ id: 's1', severity: 'critical', title: '现金流断裂', dimension: 'finance', trend: 'worsening' }];
    const text = generateNarrative(signals);
    expect(text).toContain('需立即关注');
    expect(text).toContain('现金流断裂');
    expect(text).toContain('恶化趋势');
  });

  it('warning信号 → 含需关注不含critical', () => {
    const signals: SignalInput[] = [{ id: 's1', severity: 'warning', title: '人员流失', dimension: 'org' }];
    const text = generateNarrative(signals);
    expect(text).toContain('需关注');
    expect(text).not.toContain('需立即关注');
  });

  it('无critical/warning → 正常范围', () => {
    const signals: SignalInput[] = [{ id: 's1', severity: 'info', title: '指标正常', dimension: 'finance' }];
    expect(generateNarrative(signals)).toContain('正常范围内');
  });
});
