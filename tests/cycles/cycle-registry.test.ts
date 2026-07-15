/**
 * tests/cycles/cycle-registry.test.ts — CycleRegistry 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CycleRegistry } from '../../src/cycles/cycle-registry';
import type { CycleConfig } from '../../src/cycles/cycle-types';

const BASE_CYCLE: CycleConfig = {
  cycleId: 'test-cycle', name: 'Test', description: '', version: '1.0.0',
  applicableIndustries: [], nodes: [], edges: [],
  overflowFormula: { condition: 'x>0', targetNode: 'x', formula: 'x*2', minDataMaturity: 'low' },
  dataMaturity: 'low', mapping: [], crossCyclePropagation: [],
};

describe('CycleRegistry', () => {
  let registry: CycleRegistry;

  beforeEach(() => { registry = new CycleRegistry(); });

  it('register + get → 返回注册的 cycle', () => {
    registry.register(BASE_CYCLE);
    expect(registry.get('test-cycle')?.cycleId).toBe('test-cycle');
  });

  it('unregister → 移除成功', () => {
    registry.register(BASE_CYCLE);
    expect(registry.unregister('test-cycle')).toBe(true);
    expect(registry.get('test-cycle')).toBeUndefined();
  });

  it('list → 返回全部', () => {
    registry.register(BASE_CYCLE);
    registry.register({ ...BASE_CYCLE, cycleId: 'cycle-2' });
    expect(registry.list().length).toBe(2);
  });

  it('listByIndustry → 按行业筛选', () => {
    const retail: CycleConfig = { ...BASE_CYCLE, cycleId: 'retail-cycle', applicableIndustries: ['retail-ecommerce'] };
    registry.register(BASE_CYCLE);           // 通用（空 industries）
    registry.register(retail);               // 零售
    const retailCycles = registry.listByIndustry('retail-ecommerce');
    expect(retailCycles.length).toBe(2);      // 通用 + 零售
    expect(retailCycles.some(c => c.cycleId === 'retail-cycle')).toBe(true);
  });
});
