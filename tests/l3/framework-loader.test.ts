/**
 * tests/l3/framework-loader.test.ts
 * v3.6 Batch 1 — framework loader 单元测试
 */
import { describe, it, expect } from 'vitest';
import { loadFrameworks, getFrameworksByCategory, matchFrameworksByConstraint } from '../../src/l3/framework-loader';

describe('loadFrameworks', () => {
  it('加载全部 85 个框架', () => {
    const { frameworks, degraded } = loadFrameworks();
    expect(frameworks.length).toBe(85);
    expect(degraded).toBe(false);
  });

  it('所有框架有必需的 id/name/category', () => {
    const { frameworks } = loadFrameworks();
    for (const f of frameworks) {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(f.category).toBeTruthy();
    }
  });

  it('第二次调用返回缓存', () => {
    const r1 = loadFrameworks();
    const r2 = loadFrameworks();
    expect(r1.frameworks).toBe(r2.frameworks);
  });
});

describe('getFrameworksByCategory', () => {
  it('返回 psychology 类别框架', () => {
    const fws = getFrameworksByCategory('psychology');
    expect(fws.length).toBeGreaterThan(0);
    expect(fws.every(f => f.category === 'psychology')).toBe(true);
  });

  it('不存在的类别返回空数组', () => {
    expect(getFrameworksByCategory('nonexistent').length).toBe(0);
  });
});

describe('matchFrameworksByConstraint', () => {
  it('按约束匹配返回结果', () => {
    const result = matchFrameworksByConstraint(['激励', '绩效', 'KPI']);
    expect(result.length).toBeGreaterThan(0);
    // 激励偏差应该匹配最多
    expect(result[0].id).toBe('incentive_bias');
  });

  it('无匹配约束返回空数组', () => {
    expect(matchFrameworksByConstraint(['不存在的约束xyz']).length).toBe(0);
  });
});
