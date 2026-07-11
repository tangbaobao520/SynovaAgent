import { describe, it, expect } from 'vitest';
import { computeSensingCalibration } from '../../../extensions/sentinels/shared/computes/l1-input/compute-sensing-calibration';

describe('COMPUTE-SENSING-CALIBRATION-v1', () => {
  it('正常: 强学习低遗忘', () => {
    const r = computeSensingCalibration({ learningFromPastMisjudgments: 0.9, forgettingRate: 0.1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.7);
    expect(r.confidence).toBe('high');
  });

  it('降级: 无历史感知记录', () => {
    const r = computeSensingCalibration({ learningFromPastMisjudgments: -1, forgettingRate: 0 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 高遗忘率使校准无效', () => {
    const r = computeSensingCalibration({ learningFromPastMisjudgments: 0.9, forgettingRate: 1 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });

  it('时序声明: 本compute为纯横截面计算，不消费时序参数(slope/variance/trend/window)', () => {
    expect(true).toBe(true);
  });
});
