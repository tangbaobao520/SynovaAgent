/**
 * tests/l3/rule-loader.test.ts
 * V3.7 Batch 3 — rule loader 单元测试
 */
import { describe, it, expect } from 'vitest';
import { loadRules, getUpgradeStrategy, getSignalRouting, clearRuleCache } from '../../src/l3/rule-loader';

describe('loadRules', () => {
  it('加载诊断规则 ≥ 6 条', () => {
    const { rules, degraded } = loadRules();
    expect(rules.diagnostic.length).toBeGreaterThanOrEqual(6);
    expect(degraded).toBe(false);
  });

  it('加载升级策略 = 4', () => {
    const { rules } = loadRules();
    expect(rules.upgradeStrategies.length).toBe(4);
  });

  it('信号路由表暂未实现', () => {
    const { rules } = loadRules();
    expect(rules.signalRouting).toBeNull();
  });

  it('第二次调用返回缓存', () => {
    const r1 = loadRules();
    const r2 = loadRules();
    expect(r1.rules).toBe(r2.rules);
  });
});

describe('getUpgradeStrategy', () => {
  it('返回 general-enterprise 策略', () => {
    const s = getUpgradeStrategy('general-enterprise');
    expect(s).not.toBeNull();
    expect(s!.industry).toBe('general-enterprise');
  });

  it('不存在的行业返回 null', () => {
    expect(getUpgradeStrategy('nonexistent')).toBeNull();
  });
});

describe('getSignalRouting', () => {
  it('信号路由表暂未实现', () => {
    const r = getSignalRouting();
    expect(r).toBeNull();
  });
});

describe('clearRuleCache', () => {
  it('清除后重新加载', () => {
    clearRuleCache();
    const { rules } = loadRules();
    expect(rules.diagnostic.length).toBeGreaterThanOrEqual(6);
  });
});
