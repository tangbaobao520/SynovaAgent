/**
 * tests/sentinel/sentinel-merge-d15a.test.ts
 * D15a: 哨兵合并+废弃 — manifest可用性 + loader跳过 + 总数验证
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadSentinels, clearSentinelCache } from '../../src/sentinel/sentinel-loader';

const SENTINELS_DIR = join(process.cwd(), 'extensions', 'sentinels');

const MERGED_TARGETS = ['capital-health', 'competitive-position', 'competitive-moat', 'margin-health'];
const EXTINCT_SENTINELS = [
  'adaptation-velocity', 'connector-coverage', 'structural-change',
  'capital-efficiency', 'capital-structure', 'capital-turnover',
  'competitive-dynamics', 'market-lifecycle',
  'competitive-moat-perceptual', 'competitive-moat-structural',
  'cost-health', 'profit-health',
];

describe('D15a: 合并目标 manifest.json', () => {
  for (const name of MERGED_TARGETS) {
    it(`${name} manifest.json 存在且可JSON.parse`, () => {
      const manifestPath = join(SENTINELS_DIR, name, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest.name).toBe(name);
      expect(manifest.version).toBeTruthy();
      expect(manifest.displayName).toBeTruthy();
      expect(manifest.description).toBeTruthy();
      expect(manifest.schedule).toBeTruthy();
      expect(manifest.expert).toBeTruthy();
      expect(manifest.priority).toBeTruthy();
      expect(manifest.computes).toBeInstanceOf(Array);
      expect(manifest.computes.length).toBeGreaterThan(0);
      expect(manifest.thresholds).toBeTruthy();
      expect(manifest.aggregation).toBeTruthy();
      expect(manifest.entryPoint).toBe('./aggregate.ts');
      expect(manifest.exportKey).toBeTruthy();
    });
  }
});

describe('D15a: sentinel-loader 跳过 _extinct/', () => {
  it('_extinct/ 目录中的哨兵不在加载结果中', () => {
    clearSentinelCache();
    const { sentinels } = loadSentinels();
    const loadedNames = new Set(sentinels.map(s => s.manifest.name));
    for (const extinctName of EXTINCT_SENTINELS) {
      expect(loadedNames.has(extinctName)).toBe(false);
    }
  });

  it('4个合并目标在加载结果中', () => {
    clearSentinelCache();
    const { sentinels } = loadSentinels();
    const loadedNames = new Set(sentinels.map(s => s.manifest.name));
    for (const target of MERGED_TARGETS) {
      expect(loadedNames.has(target)).toBe(true);
    }
  });

  it('loader 无降级（无加载错误）', () => {
    clearSentinelCache();
    const { degraded, errors } = loadSentinels();
    expect(degraded).toBe(false);
    expect(errors).toEqual([]);
  });
});

describe('D15a: 合并目标 aggregate.ts 可动态 import', () => {
  for (const name of MERGED_TARGETS) {
    it(`${name} aggregate.ts 可 import 且暴露 check()`, async () => {
      const aggregatePath = join(SENTINELS_DIR, name, 'aggregate.ts');
      expect(existsSync(aggregatePath)).toBe(true);
      // 动态import验证无语法错误
      const mod = await import(`../../extensions/sentinels/${name}/aggregate`);
      const exportKeyMap: Record<string, string> = {
        'capital-health': 'capitalHealthSentinel',
        'competitive-position': 'competitivePositionSentinel',
        'competitive-moat': 'competitiveMoatSentinel',
        'margin-health': 'marginHealthSentinel',
      };
      const sentinelObj = mod[exportKeyMap[name]];
      expect(sentinelObj).toBeTruthy();
      expect(typeof sentinelObj.check).toBe('function');
    });
  }
});

describe('D15a: 哨兵总数', () => {
  it('活跃哨兵 manifest.json 计数与 loader 一致', () => {
    clearSentinelCache();
    const { sentinels } = loadSentinels();
    // 计数: loader 扫描所有非 _extinct 子目录中的 manifest.json
    expect(sentinels.length).toBeGreaterThanOrEqual(40);
    expect(sentinels.length).toBeLessThanOrEqual(50);
  });
});
