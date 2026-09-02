/**
 * tests/expert/manifest-consistency.test.ts — D53: 专家manifest.json 一致性验证
 *
 * D567 适配（K3 15-1）: 专家清单不再硬编码 9 位旧枚举，改为从 expert/expert-registry.yaml
 * 动态读取（getAllExpertIds，当前 7 位）。v2 精简 manifest（finance-structure/competitive-strategy
 * 等）不含 boundaries/edges/computes/crossDomainRule，旧"全员必有"断言改为
 * "可选结构字段出现时格式合法"——schema 演进后仍锁定 manifest 可解析性与字段合法性。
 *
 * 测试覆盖(>=7):
 * - registry 全部专家的 manifest.json 存在（动态 7 位）
 * - 每个 JSON.parse() 不抛异常
 * - 每个含必填字段 name/version/type/displayName/description
 * - 可选结构字段（boundaries/edges/computes/crossDomainRule）出现时格式合法
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getAllExpertIds } from '../../src/agent/expert-config-loader';

const EXPERT_DIR = join(import.meta.dirname, '..', '..', 'expert');
// D567: 唯一事实源 = expert-registry.yaml（不再硬编码专家名枚举）
const EXPERT_NAMES = getAllExpertIds();

interface ExpertManifest {
  name: string;
  version: string;
  type: string;
  displayName: string;
  description: string;
  tone?: string;
  priority?: string;
  loading?: string;
  enabled?: boolean;
  background?: boolean;
  model?: string;
  tier?: string;
  complexity?: string;
  activationType?: string;
  activationCondition?: string;
  boundaries?: string[];
  frameworks?: string[];
  edges?: string[];
  computes?: string[];
  crossDomainRule?: string;
  moduleLoading?: Record<string, unknown>;
  entryPoints?: Record<string, string>;
  dependencies?: Record<string, string[]>;
}

function loadManifest(name: string): ExpertManifest {
  const path = join(EXPERT_DIR, name, 'manifest.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as ExpertManifest;
}

describe('D53: 专家manifest.json 一致性', () => {
  it('registry 专家清单非空（yaml 事实源可读，防降级静默）', () => {
    expect(EXPERT_NAMES.length, 'expert-registry.yaml 应声明至少 1 位专家').toBeGreaterThan(0);
  });

  it('registry 全部专家的 manifest.json 存在', () => {
    for (const name of EXPERT_NAMES) {
      const path = join(EXPERT_DIR, name, 'manifest.json');
      expect(existsSync(path), `${name}/manifest.json 应存在`).toBe(true);
    }
  });

  for (const name of EXPERT_NAMES) {
    it(`${name}: JSON.parse() 不抛异常 + 必填字段完整`, () => {
      const manifest = loadManifest(name);
      expect(manifest.name).toBe(name);
      expect(manifest.version).toBeDefined();
      expect(manifest.type).toBe('expert');
      expect(manifest.displayName).toBeDefined();
      expect(manifest.description).toBeDefined();
    });
  }

  it('所有 expert: 可选结构字段出现时格式合法（v2 精简 manifest 兼容）', () => {
    for (const name of EXPERT_NAMES) {
      const manifest = loadManifest(name);
      if (manifest.boundaries !== undefined) {
        expect(Array.isArray(manifest.boundaries), `${name}: boundaries 应为数组`).toBe(true);
        expect(
          (manifest.boundaries as string[]).length,
          `${name}: boundaries 出现时应为非空数组`,
        ).toBeGreaterThan(0);
      }
      for (const edge of manifest.edges ?? []) {
        expect(edge, `${name}: edge ${edge} 应为 E-XX 格式`).toMatch(/^E-\d{2}$/);
      }
      for (const compute of manifest.computes ?? []) {
        expect(compute, `${name}: compute ${compute} 应为 COMPUTE- 格式`).toMatch(/^COMPUTE-/);
      }
      if (manifest.crossDomainRule !== undefined) {
        expect(
          manifest.crossDomainRule.trim().length,
          `${name}: crossDomainRule 出现时应非空`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
