/**
 * tests/sentinel/builtins.test.ts — 内置哨兵注册测试
 *
 * Iron Law 33: *.test.ts = 单元测试
 *
 * 测试:
 *   Given: 注册全部 7 个哨兵 → Then: registry.count() === 7
 *   Given: 7 个哨兵全为 cron mode → Then: listCronSentinels() 返回 7 个
 *   Given: 注册后 → Then: 每个哨兵有唯一 ID、有效 cron、明确类别
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock all adapter modules with valid Sentinel objects
function makeMockSentinel(id: string, category: string, cron: string) {
  return {
    config: { id, name: `Test ${id}`, description: '', category, priority: 'P1', mode: 'cron' as const, cron, requiredDataSources: [], confidenceModel: 'deterministic' as const, version: '1.0.0' },
    check: vi.fn(),
  };
}

vi.mock('../../src/sentinel/adapters/htm-sentinel', () => ({ htmSentinel: makeMockSentinel('sentinel-htm', 'collaboration', '0 9 * * *') }));
vi.mock('../../src/sentinel/adapters/hacd-sentinel', () => ({ hacdSentinel: makeMockSentinel('sentinel-hacd', 'collaboration', '0 9 * * *') }));
vi.mock('../../src/sentinel/adapters/gap-dynamics-sentinel', () => ({ gapDynamicsSentinel: makeMockSentinel('sentinel-gap-dynamics', 'capability', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/cpc-sentinel', () => ({ cpcSentinel: makeMockSentinel('sentinel-cpc', 'capability', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/path-dependency-sentinel', () => ({ pathDependencySentinel: makeMockSentinel('sentinel-path-dependency', 'capability', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/self-awareness-sentinel', () => ({ selfAwarenessSentinel: makeMockSentinel('sentinel-self-awareness', 'collaboration', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/seven-powers-sentinel', () => ({ sevenPowersSentinel: makeMockSentinel('sentinel-seven-powers', 'strategy', '0 9 1 * *') }));
vi.mock('../../src/sentinel/adapters/eob-sentinel', () => ({ eobSentinel: makeMockSentinel('sentinel-eob', 'capability', '0 9 * * 2') }));
vi.mock('../../src/sentinel/adapters/hona-sentinel', () => ({ honaSentinel: makeMockSentinel('sentinel-hona', 'collaboration', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/key-person-risk-sentinel', () => ({ keyPersonRiskSentinel: makeMockSentinel('sentinel-key-person-risk', 'risk', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/token-economics-sentinel', () => ({ tokenEconomicsSentinel: makeMockSentinel('sentinel-token-economics', 'capability', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/financial-impact-sentinel', () => ({ financialImpactSentinel: makeMockSentinel('sentinel-financial-impact', 'risk', '0 9 1 * *') }));
vi.mock('../../src/sentinel/adapters/financial-snapshot-sentinel', () => ({ financialSnapshotSentinel: makeMockSentinel('sentinel-financial-snapshot', 'risk', '0 9 1 * *') }));
vi.mock('../../src/sentinel/adapters/goal-alignment-sentinel', () => ({ goalAlignmentSentinel: makeMockSentinel('sentinel-goal-alignment', 'capability', '0 9 * * 1') }));
vi.mock('../../src/sentinel/adapters/risk-aggregator-sentinel', () => ({ riskAggregatorSentinel: makeMockSentinel('sentinel-risk-aggregator', 'risk', '0 9 * * 1') }));

import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { registerBuiltinSentinels } from '../../src/sentinel/builtins';

describe('registerBuiltinSentinels', () => {
  beforeEach(() => {
    destroySentinelRegistry();
  });

  it('Given 9 个适配器全部加载成功 → 注册 15 个哨兵', async () => {
    await registerBuiltinSentinels();
    expect(getSentinelRegistry().count()).toBe(15);
  });

  it('Given 9 个 cron sentinel → listCronSentinels() 返回 15 个', async () => {
    await registerBuiltinSentinels();
    const cronList = getSentinelRegistry().listCronSentinels();
    expect(cronList.length).toBe(15);
    for (const { sentinel, cron } of cronList) {
      expect(sentinel.config.mode).toBe('cron');
      expect(cron).toBeTruthy();
    }
  });

  it('Given 注册后 → 每个哨兵有唯一 ID 和有效类别', async () => {
    await registerBuiltinSentinels();
    const ids = new Set<string>();
    const validCategories = new Set(['collaboration', 'capability', 'strategy', 'risk']);
    for (const s of getSentinelRegistry().list()) {
      expect(ids.has(s.config.id)).toBe(false);
      ids.add(s.config.id);
      expect(s.config.id).toMatch(/^sentinel-/);
      expect(validCategories.has(s.config.category)).toBe(true);
      expect(s.config.mode).toBe('cron');
      expect(s.config.cron).toBeTruthy();
    }
  });

  it('Given 第二次调用 registerBuiltinSentinels → 覆盖旧哨兵但仍为 9 个', async () => {
    await registerBuiltinSentinels();
    await registerBuiltinSentinels();
    expect(getSentinelRegistry().count()).toBe(15);
  });
});
