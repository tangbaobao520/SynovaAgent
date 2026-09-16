/**
 * tests/expert/manifest-consistency.test.ts — D53: 专家manifest.json 一致性验证
 *
 * D567 适配（K3 15-1）: 专家清单不再硬编码 9 位旧枚举，改为从 expert/expert-registry.yaml
 * 动态读取（getAllExpertIds）。v2 精简 manifest 不含 boundaries/edges/computes/crossDomainRule，
 * 旧"全员必有"断言改为"可选结构字段出现时格式合法"——schema 演进后仍锁定 manifest 可解析性
 * 与字段合法性。
 *
 * D650 适配: registry v3.0 六位问题域专家（cycle 命名改名问题域——权威第六章 §6.6
 * 「专家名禁含 cycle」），新增断言 ① 专家名零 cycle 残留 ② 与问题域英文名清单一致（§7.4）。
 *
 * D658 适配: 哨兵 manifest expert 字段末段收口——extensions/sentinels/{name}/manifest.json
 * 的 expert/auxiliaryExperts 字段值必须 ∈ 新 5 问题域 + host（同 registry 事实源），零旧 8 名
 * （strategy/org/finance/tech/marketing/business_model/action/knowledge）。
 *
 * 测试覆盖(>=7):
 * - registry 全部专家的 manifest.json 存在（动态 6 位）
 * - 每个 JSON.parse() 不抛异常
 * - 每个含必填字段 name/version/type/displayName/description
 * - 可选结构字段（boundaries/edges/computes/crossDomainRule）出现时格式合法
 * - D650: 专家名零 cycle 残留 + 问题域清单一致
 * - D658: 哨兵 manifest expert/auxiliaryExperts ∈ 新 5+host，零旧 8 名
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
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

  it('D650: registry 专家名零 cycle 残留（权威 §6.6 专家名禁含 cycle）', () => {
    for (const name of EXPERT_NAMES) {
      expect(name.includes('cycle'), `专家名 "${name}" 含 cycle，违反权威第六章 §6.6 命名规则`).toBe(false);
    }
  });

  it('D650: registry 与六位问题域专家清单一致（权威第七章 §7.4 英文名）', () => {
    expect(EXPERT_NAMES.sort()).toEqual([
      'competitive-strategy', 'customer-growth', 'fundamental-efficiency', 'host',
      'organizational-capability', 'technology-foundation',
    ].sort());
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

// ── D658: 哨兵 manifest expert 字段一致性（权威第六章 §6.6 + 第七章 §7.4）──

const SENTINELS_DIR = join(import.meta.dirname, '..', '..', 'extensions', 'sentinels');
// 合法值集合与 registry 同源（host + 5 问题域，D650 v3.0）
const LEGACY_EXPERT_NAMES = [
  'strategy', 'org', 'finance', 'tech', 'marketing', 'business_model', 'action', 'knowledge',
];

interface SentinelManifestJson {
  name?: string;
  expert?: string;
  auxiliaryExperts?: string[];
}

interface LoadedSentinelManifest {
  dirName: string;
  manifest: SentinelManifestJson;
}

function loadSentinelManifests(): LoadedSentinelManifest[] {
  const out: LoadedSentinelManifest[] = [];
  for (const entry of readdirSync(SENTINELS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(SENTINELS_DIR, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    out.push({
      dirName: entry.name,
      manifest: JSON.parse(readFileSync(manifestPath, 'utf-8')) as SentinelManifestJson,
    });
  }
  return out;
}

const SENTINEL_MANIFESTS = loadSentinelManifests();

describe('D658: 哨兵 manifest expert 字段一致性（旧 8 → 新 5+host）', () => {
  it('哨兵清单可枚举：per-sentinel manifest ≥40 且 expert 字段全量存在（防目录漂移静默缩水）', () => {
    expect(SENTINEL_MANIFESTS.length, 'per-sentinel manifest 应 ≥40 个').toBeGreaterThanOrEqual(40);
    for (const { dirName, manifest } of SENTINEL_MANIFESTS) {
      expect(manifest.name, `${dirName}: manifest.name 应存在`).toBeDefined();
      expect(
        manifest.expert,
        `${dirName}: expert 字段应存在（哨兵→专家路由的声明侧）`,
      ).toBeDefined();
    }
  });

  it('每个哨兵 manifest 的 expert 字段 ∈ registry v3.0 清单，零旧 8 名', () => {
    for (const { dirName, manifest } of SENTINEL_MANIFESTS) {
      const expert = manifest.expert ?? '';
      expect(
        EXPERT_NAMES,
        `${dirName}: expert "${expert}" 不在 registry v3.0（host + 5 问题域）`,
      ).toContain(expert);
      expect(
        LEGACY_EXPERT_NAMES,
        `${dirName}: expert "${expert}" 是旧 8 名残留（spec §2.1 映射表）`,
      ).not.toContain(expert);
      expect(
        expert.includes('cycle'),
        `${dirName}: expert "${expert}" 含 cycle，违反权威 §6.6 命名规则`,
      ).toBe(false);
    }
  });

  it('每个哨兵 manifest 的 auxiliaryExperts（出现时）∈ registry v3.0 清单，零旧 8 名', () => {
    for (const { dirName, manifest } of SENTINEL_MANIFESTS) {
      if (manifest.auxiliaryExperts === undefined) continue;
      expect(
        Array.isArray(manifest.auxiliaryExperts),
        `${dirName}: auxiliaryExperts 应为数组`,
      ).toBe(true);
      for (const aux of manifest.auxiliaryExperts) {
        expect(
          EXPERT_NAMES,
          `${dirName}: auxiliaryExpert "${aux}" 不在 registry v3.0（host + 5 问题域）`,
        ).toContain(aux);
        expect(
          LEGACY_EXPERT_NAMES,
          `${dirName}: auxiliaryExpert "${aux}" 是旧 8 名残留（spec §2.1 映射表）`,
        ).not.toContain(aux);
      }
    }
  });
});
