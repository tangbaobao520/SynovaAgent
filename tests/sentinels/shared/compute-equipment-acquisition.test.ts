import { describe, it, expect } from 'vitest';
import { computeEquipmentAcquisition } from '../../../extensions/sentinels/shared/computes/l1-input/compute-equipment-acquisition';

describe('COMPUTE-EQUIPMENT-ACQUISITION-v1', () => {
  it('正常: 高效设备采购', () => {
    const r = computeEquipmentAcquisition({ unitsAcquired: 10, totalCapacityAdded: 800, avgUtilizationRate: 0.8 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.confidence).toBe('high');
  });

  it('降级: avgUtilizationRate未配置', () => {
    const r = computeEquipmentAcquisition({ unitsAcquired: 0, totalCapacityAdded: 0, avgUtilizationRate: -1 });
    expect(r.degraded).toBe(true);
    expect(r.value).toBe(0);
  });

  it('边界: 零设备采购', () => {
    const r = computeEquipmentAcquisition({ unitsAcquired: 0, totalCapacityAdded: 0, avgUtilizationRate: 0 });
    expect(r.degraded).toBe(false);
    expect(r.value).toBe(0);
  });
});
