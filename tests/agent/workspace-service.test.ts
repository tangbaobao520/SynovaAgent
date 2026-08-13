import { describe, it, expect } from 'vitest';
import { buildInheritedContext, detectConflicts } from '../../src/agent/workspace-service';

describe('buildInheritedContext', () => {
  it('generates context for marketing department', () => {
    const ctx = buildInheritedContext({
      parentId: 'ws_abc', department: 'marketing', title: '定价优化',
      source: 'agent_suggested', parentSummary: '提升客单价至35元',
    });
    expect(ctx).toContain('提升客单价至35元');
    expect(ctx).toContain('竞品价格区间对比');
    expect(ctx).toContain('客户价格敏感度分析');
    expect(ctx).toContain('渠道利润率评估');
    expect(ctx).toContain('汇入全局视图');
  });

  it('generates context for finance', () => {
    const ctx = buildInheritedContext({
      parentId: 'ws_abc', department: 'finance', title: '成本优化',
      source: 'boss_assigned', parentSummary: '降低运营成本15%',
    });
    expect(ctx).toContain('现金流压力测试');
    expect(ctx).toContain('成本结构优化方案');
  });

  it('generates generic context for unknown department', () => {
    const ctx = buildInheritedContext({
      parentId: 'ws_abc', department: 'unknown', title: 'test',
      source: 'boss_assigned', parentSummary: 'summary',
    });
    expect(ctx).toContain('当前部门数据分析');
  });
});

describe('detectConflicts', () => {
  it('empty list → no conflicts', () => {
    expect(detectConflicts([])).toEqual([]);
  });

  it('single confirmed workspace → no conflicts', () => {
    expect(detectConflicts([
      { id: 'w1', department: 'marketing', title: '定价优化', status: 'confirmed' },
    ])).toEqual([]);
  });

  it('two departments with matching topic → conflict detected', () => {
    const c = detectConflicts([
      { id: 'w1', department: 'marketing', title: '定价 优化', status: 'confirmed' },
      { id: 'w2', department: 'sales', title: '定价 方案', status: 'confirmed' },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('numeric');
    expect(c[0].sources).toContain('w1');
    expect(c[0].sources).toContain('w2');
  });

  it('non-confirmed workspaces ignored', () => {
    expect(detectConflicts([
      { id: 'w1', department: 'marketing', title: '定价优化', status: 'pending' },
      { id: 'w2', department: 'sales', title: '定价优化', status: 'analyzing' },
    ])).toEqual([]);
  });

  it('same-department workspaces not flagged as conflict', () => {
    expect(detectConflicts([
      { id: 'w1', department: 'marketing', title: '定价方案A', status: 'confirmed' },
      { id: 'w2', department: 'marketing', title: '定价方案B', status: 'confirmed' },
    ])).toEqual([]);
  });
});
