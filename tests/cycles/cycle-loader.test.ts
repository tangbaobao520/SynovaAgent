/**
 * tests/cycles/cycle-loader.test.ts — CycleLoader 集成测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const CUSTOM_ROOT = join(process.cwd(), 'cycles', 'custom');

function cleanupCustomDir(): void {
  if (!existsSync(CUSTOM_ROOT)) return;
  const entries = readdirSync(CUSTOM_ROOT, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('d88-test-')) {
      try { rmSync(join(CUSTOM_ROOT, e.name), { recursive: true, force: true }); } catch { /* ok */ }
    }
  }
}

function writeTestCycle(cycleId: string, overrides: Record<string, unknown> = {}): string {
  if (!existsSync(CUSTOM_ROOT)) mkdirSync(CUSTOM_ROOT, { recursive: true });
  const filePath = join(CUSTOM_ROOT, `d88-test-${cycleId}.cycle.json`);
  const cycle = {
    cycleId,
    name: 'Test Cycle', description: '', version: '1.0.0',
    applicableIndustries: [], nodes: [{ id: 'n1', label: 'Node 1', type: 'stock' as const }],
    edges: [{ from: 'n1', to: 'n1', polarity: '+' as const }],
    overflowFormula: { condition: 'n1>0', targetNode: 'n1', formula: 'n1*2', minDataMaturity: 'low' as const },
    dataMaturity: 'low' as const, mapping: [], crossCyclePropagation: [],
    ...overrides,
  };
  writeFileSync(filePath, JSON.stringify(cycle, null, 2), 'utf-8');
  return filePath;
}

describe('CycleLoader', () => {
  beforeEach(() => cleanupCustomDir());
  afterEach(() => cleanupCustomDir());

  describe('loadCycles', () => {
    it('加载全部4个出厂循环', async () => {
      const { loadCycles, clearCycleCache } = await import('../../src/cycles/cycle-loader');
      clearCycleCache();
      const result = loadCycles();
      expect(result.cycles.length).toBeGreaterThanOrEqual(4);
      const ids = result.cycles.map(c => c.cycleId);
      expect(ids).toContain('customer-cycle');
      expect(ids).toContain('cash-cycle');
      expect(ids).toContain('talent-cycle');
      expect(ids).toContain('product-cycle');
    });

    it('每个循环完整的 7 字段', async () => {
      const { loadCycles, clearCycleCache } = await import('../../src/cycles/cycle-loader');
      clearCycleCache();
      const result = loadCycles();
      for (const c of result.cycles) {
        expect(c.cycleId).toBeTruthy();
        expect(c.nodes).toBeInstanceOf(Array);
        expect(c.edges).toBeInstanceOf(Array);
        expect(c.overflowFormula).toBeTruthy();
        expect(c.overflowFormula?.condition).toBeTruthy();
        expect(Array.isArray(c.mapping)).toBe(true);
        expect(Array.isArray(c.crossCyclePropagation)).toBe(true);
      }
    });

    it('单个文件失败 → 不阻断其余', async () => {
      const { loadCycles, clearCycleCache } = await import('../../src/cycles/cycle-loader');
      clearCycleCache();

      // 创建合法文件
      writeTestCycle('d88-legit');
      // 创建非法 JSON 文件
      const badPath = join(CUSTOM_ROOT, 'd88-test-bad.cycle.json');
      writeFileSync(badPath, '{ invalid json }', 'utf-8');

      const result = loadCycles();
      expect(result.cycles.length).toBeGreaterThanOrEqual(5); // 4 出厂 + 1 合法
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.degraded).toBe(true);
    });

    it('empty directory → 不崩溃', async () => {
      const { loadCycles, clearCycleCache } = await import('../../src/cycles/cycle-loader');
      clearCycleCache();

      // 创建一个空 custom 目录（无 .cycle.json 文件）
      if (!existsSync(CUSTOM_ROOT)) mkdirSync(CUSTOM_ROOT, { recursive: true });

      const result = loadCycles();
      expect(Array.isArray(result.cycles)).toBe(true);
    });
  });

  describe('registerLoadedCycles', () => {
    it('注册到 CycleRegistry → 可通过 get 获取', async () => {
      const { loadCycles, clearCycleCache, registerLoadedCycles } = await import('../../src/cycles/cycle-loader');
      const { cycleRegistry } = await import('../../src/cycles/cycle-registry');
      clearCycleCache();
      cycleRegistry.clear();

      await registerLoadedCycles();
      expect(cycleRegistry.list().length).toBeGreaterThanOrEqual(4);
      expect(cycleRegistry.get('customer-cycle')).toBeDefined();
    });
  });

  describe('行业循环', () => {
    it('industry/ 下的循环可加载', async () => {
      const { loadCycles, clearCycleCache } = await import('../../src/cycles/cycle-loader');
      clearCycleCache();
      const result = loadCycles();
      const ids = result.cycles.map(c => c.cycleId);
      expect(ids).toContain('store-replication');
      expect(ids).toContain('arr-growth');
    });

    it('listByIndustry 行业过滤正确', async () => {
      const { loadCycles, clearCycleCache, registerLoadedCycles } = await import('../../src/cycles/cycle-loader');
      const { cycleRegistry } = await import('../../src/cycles/cycle-registry');
      clearCycleCache();
      cycleRegistry.clear();

      await registerLoadedCycles();
      const retail = cycleRegistry.listByIndustry('retail-ecommerce');
      expect(retail.some(c => c.cycleId === 'store-replication')).toBe(true);
      expect(retail.some(c => c.cycleId === 'customer-cycle')).toBe(true); // 通用循环
    });
  });
});
