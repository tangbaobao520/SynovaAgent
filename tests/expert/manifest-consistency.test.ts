/**
 * tests/expert/manifest-consistency.test.ts — D53: 专家manifest.json 一致性验证
 *
 * 测试覆盖(>=7):
 * - 9个manifest.json全部存在
 * - 每个 JSON.parse() 不抛异常
 * - 每个含必填字段 name/version/type/displayName/description
 * - finance: edges 含 E-13/E-23/E-34
 * - strategy: edges 含 E-33/E-36
 * - finance: boundaries 含"不替代专业财务审计"
 * - 所有 expert: crossDomainRule 非空
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EXPERT_DIR = join(import.meta.dirname, '..', '..', 'expert');
const EXPERT_NAMES = ['host', 'strategy', 'org', 'finance', 'marketing', 'tech', 'action', 'business_model', 'knowledge'];

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
  boundaries: string[];
  frameworks?: string[];
  edges: string[];
  computes: string[];
  crossDomainRule: string;
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
  it('9个manifest.json全部存在', () => {
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
      expect(Array.isArray(manifest.boundaries)).toBe(true);
      expect(manifest.boundaries.length).toBeGreaterThan(0);
      expect(Array.isArray(manifest.edges)).toBe(true);
      expect(Array.isArray(manifest.computes)).toBe(true);
      expect(manifest.crossDomainRule).toBeDefined();
      expect(manifest.crossDomainRule.trim().length).toBeGreaterThan(0);
    });
  }

  it('finance: edges 含 E-13/E-23/E-34', () => {
    const manifest = loadManifest('finance');
    expect(manifest.edges).toContain('E-13');
    expect(manifest.edges).toContain('E-23');
    expect(manifest.edges).toContain('E-34');
  });

  it('strategy: edges 含 E-33/E-36', () => {
    const manifest = loadManifest('strategy');
    expect(manifest.edges).toContain('E-33');
    expect(manifest.edges).toContain('E-36');
  });

  it('finance: boundaries 含"不替代专业财务审计"', () => {
    const manifest = loadManifest('finance');
    expect(manifest.boundaries.some(b => b.includes('不替代专业财务审计'))).toBe(true);
  });

  it('所有 expert: crossDomainRule 非空', () => {
    for (const name of EXPERT_NAMES) {
      const manifest = loadManifest(name);
      expect(manifest.crossDomainRule, `${name}: crossDomainRule 应非空`).toBeTruthy();
      expect(manifest.crossDomainRule.trim().length, `${name}: crossDomainRule 不应为空字符串`).toBeGreaterThan(0);
    }
  });

  it('所有 edges 引用符合 E-XX 格式', () => {
    for (const name of EXPERT_NAMES) {
      const manifest = loadManifest(name);
      for (const edge of manifest.edges) {
        expect(edge, `${name}: edge ${edge} 应为 E-XX 格式`).toMatch(/^E-\d{2}$/);
      }
    }
  });

  it('所有 computes 引用符合 COMPUTE- 格式', () => {
    for (const name of EXPERT_NAMES) {
      const manifest = loadManifest(name);
      for (const compute of manifest.computes) {
        expect(compute, `${name}: compute ${compute} 应为 COMPUTE- 格式`).toMatch(/^COMPUTE-/);
      }
    }
  });
});
