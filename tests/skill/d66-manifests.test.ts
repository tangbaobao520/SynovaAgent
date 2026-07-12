/**
 * tests/skill/d66-manifests.test.ts — D66 41个出厂内置Skill manifest 完整性测试
 *
 * 覆盖（≥8测试用例）:
 * 1. 41个manifest.json全部存在
 * 2. 每个 JSON.parse() 不抛异常
 * 3. 每个含必填字段 name/version/type
 * 4. tier 全部是 L1-L7 有效值
 * 5. expert 全部是有效专家名
 * 6. SkillLoader 加载41个Skill -> skills.length=41
 * 7. 同name的优先级覆盖不报错
 * 8. manifest.json缺失的Skill目录 -> SkillLoader errors[] 含该目录
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SkillManifest } from '../../src/skill/skill-loader';

const BUILTIN_ROOT = join(process.cwd(), 'extensions', 'skills', 'builtin');
const CUSTOM_ROOT = join(process.cwd(), 'extensions', 'skills', 'custom');

const VALID_TIERS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] as const;
const VALID_EXPERTS = ['finance', 'strategy', 'org', 'marketing', 'tech', 'action', 'business_model', 'knowledge', 'host', 'multi'] as const;
const VALID_COMPLEXITIES = ['atomic', 'composite', 'expert'] as const;

// ═══ Test helpers ═══

/** 返回 builtin 中所有非下划线开头的子目录名 */
function getSkillDirNames(): string[] {
  return readdirSync(BUILTIN_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .map(e => e.name);
}

/** 清理测试 fixture */
function cleanupFixtures(): void {
  for (const root of [BUILTIN_ROOT, CUSTOM_ROOT]) {
    if (!existsSync(root)) continue;
    const entries = readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && e.name.startsWith('d66-test-')) {
        try { rmSync(join(root, e.name), { recursive: true, force: true }); } catch { /* ok */ }
      }
    }
  }
}

/** 创建测试 fixture 目录 */
function createFixtureDir(name: string, root: string = BUILTIN_ROOT): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 写入 manifest */
function writeManifest(dir: string, overrides: Partial<SkillManifest> = {}): void {
  const manifest: SkillManifest = {
    name: overrides.name || 'd66-test-skill',
    version: overrides.version || '1.0.0',
    type: 'skill',
    displayName: overrides.displayName || 'D66 Test Skill',
    description: overrides.description || 'Test description',
    tier: overrides.tier || 'L1',
    complexity: overrides.complexity || 'atomic',
    expert: overrides.expert || 'finance',
    tools: overrides.tools || [],
    entryPoint: overrides.entryPoint || './SKILL.md',
    exportKey: overrides.exportKey || 'default',
    permissions: overrides.permissions || {
      dataAccess: { dimensions: ['test'], sensitiveAccess: 'none' },
      crossExpert: [],
    },
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

// ═══ Tests ═══

describe('D66 41出厂内置Skill manifest完整性', () => {
  // 测试1: 41个manifest.json全部存在
  describe('文件存在性', () => {
    it('builtin/ 下应有41个Skill子目录', () => {
      const dirs = getSkillDirNames();
      expect(dirs.length).toBe(41);
    });

    it('每个子目录存在 manifest.json', () => {
      const dirs = getSkillDirNames();
      for (const d of dirs) {
        const manifestPath = join(BUILTIN_ROOT, d, 'manifest.json');
        expect(existsSync(manifestPath), `${d} 缺少 manifest.json`).toBe(true);
      }
    });
  });

  // 测试2: 每个 JSON.parse() 不抛异常
  describe('JSON可解析', () => {
    it('每个 manifest.json 可被 JSON.parse 解析', () => {
      const dirs = getSkillDirNames();
      for (const d of dirs) {
        const raw = readFileSync(join(BUILTIN_ROOT, d, 'manifest.json'), 'utf-8');
        expect(() => JSON.parse(raw), `${d} manifest.json JSON.parse 失败`).not.toThrow();
      }
    });
  });

  // 测试3: 每个含必填字段 name/version/type/displayName
  describe('必填字段', () => {
    let manifests: { name: string; parsed: Record<string, unknown> }[];

    beforeAll(() => {
      manifests = getSkillDirNames().map(d => ({
        name: d,
        parsed: JSON.parse(readFileSync(join(BUILTIN_ROOT, d, 'manifest.json'), 'utf-8')),
      }));
    });

    it('每个 manifest 含 name 字段且非空', () => {
      for (const m of manifests) {
        expect(m.parsed.name, `${m.name} 缺少 name`).toBeTruthy();
        expect(typeof m.parsed.name).toBe('string');
      }
    });

    it('每个 manifest 含 version 字段且非空', () => {
      for (const m of manifests) {
        expect(m.parsed.version, `${m.name} 缺少 version`).toBeTruthy();
        expect(typeof m.parsed.version).toBe('string');
      }
    });

    it('每个 manifest 含 type 字段且为 "skill"', () => {
      for (const m of manifests) {
        expect(m.parsed.type, `${m.name} type 不是 skill`).toBe('skill');
      }
    });

    it('每个 manifest 含 displayName 字段且非空', () => {
      for (const m of manifests) {
        expect(m.parsed.displayName, `${m.name} 缺少 displayName`).toBeTruthy();
      }
    });

    it('每个 manifest 含 description 字段', () => {
      for (const m of manifests) {
        expect(m.parsed.description, `${m.name} 缺少 description`).toBeDefined();
      }
    });

    it('每个 manifest 含 entryPoint 字段', () => {
      for (const m of manifests) {
        expect(m.parsed.entryPoint, `${m.name} 缺少 entryPoint`).toBe('./SKILL.md');
      }
    });

    it('每个 manifest 含 permissions.dataAccess.dimensions', () => {
      for (const m of manifests) {
        const perms = m.parsed.permissions as Record<string, unknown>;
        const da = perms?.dataAccess as Record<string, unknown>;
        expect(Array.isArray(da?.dimensions), `${m.name} 缺少 permissions.dataAccess.dimensions`).toBe(true);
      }
    });
  });

  // 测试4: tier 全部是L1-L7的有效值
  describe('tier 有效值', () => {
    it('所有 tier 均为 L1-L7 之一', () => {
      const dirs = getSkillDirNames();
      for (const d of dirs) {
        const raw = readFileSync(join(BUILTIN_ROOT, d, 'manifest.json'), 'utf-8');
        const manifest = JSON.parse(raw);
        expect(VALID_TIERS.includes(manifest.tier), `${d} tier=${manifest.tier} 不是有效值`).toBe(true);
      }
    });
  });

  // 测试5: expert 全部是有效专家名
  describe('expert 有效值', () => {
    it('所有 expert 均为有效专家名之一', () => {
      const dirs = getSkillDirNames();
      for (const d of dirs) {
        const raw = readFileSync(join(BUILTIN_ROOT, d, 'manifest.json'), 'utf-8');
        const manifest = JSON.parse(raw);
        expect(VALID_EXPERTS.includes(manifest.expert), `${d} expert=${manifest.expert} 不是有效值`).toBe(true);
      }
    });
  });

  // 测试6: SkillLoader加载41个Skill -> skills.length=41
  describe('SkillLoader 加载41个技能', () => {
    // 所有41个真实 Skill 的 name
    const EXPECTED_NAMES = [
      'acquire-financial-data', 'acquire-customer-data', 'acquire-competitive-intel',
      'acquire-org-health-data', 'acquire-operational-data',
      'analyze-break-even', 'analyze-operating-leverage', 'analyze-price-elasticity',
      'analyze-customer-value', 'analyze-competitive-position', 'analyze-cost-structure',
      'analyze-learning-curve', 'analyze-capital-allocation',
      'diagnose-cashflow-health', 'diagnose-churn-root-cause', 'diagnose-org-health',
      'diagnose-competitive-decay', 'diagnose-margin-erosion', 'diagnose-agency-cost',
      'prescribe-pricing-strategy', 'prescribe-budget-allocation', 'prescribe-market-entry',
      'prescribe-synergy-value',
      'track-execution-progress', 'verify-hypothesis', 'detect-plan-deviation',
      'retrieve-industry-benchmark', 'match-best-practice', 'distill-expert-knowledge',
      'check-data-source-health', 'manage-sentinel-config', 'self-diagnose-agent',
      'backup-restore',
      'cross-expert-review', 'conflict-resolution', 'synthesizer-invoke',
      'agent-self-health', 'knowledge-base-maintenance', 'diagnosis-calibration',
      'enterprise-growth-diagnosis', 'survival-crisis-diagnosis',
    ];

    beforeEach(() => {
      cleanupFixtures();
    });

    afterEach(() => {
      cleanupFixtures();
    });

    it('loadSkills() 加载全部41个真实 Skill', async () => {
      const { loadSkills, clearSkillCache } = await import('../../src/skill/skill-loader');
      clearSkillCache();
      const result = loadSkills();
      // 至少包含全部41个真实 Skill（可能有多余的测试残留目录）
      expect(result.skills.length).toBeGreaterThanOrEqual(41);
      const names = result.skills.map(s => s.manifest.name);
      for (const expected of EXPECTED_NAMES) {
        expect(names, `缺少 Skill: ${expected}`).toContain(expected);
      }
    });

    it('加载后可通过 name 找到对应 Skill', async () => {
      const { loadSkills, clearSkillCache } = await import('../../src/skill/skill-loader');
      clearSkillCache();
      const result = loadSkills();
      const names = result.skills.map(s => s.manifest.name).sort();
      // 验证全部41个存在
      for (const expected of EXPECTED_NAMES) {
        expect(names).toContain(expected);
      }
      // 跨层验证
      expect(names.filter(n => n.startsWith('diagnose-')).length).toBeGreaterThanOrEqual(6);
      expect(names.filter(n => n.startsWith('acquire-')).length).toBeGreaterThanOrEqual(5);
      expect(names.filter(n => n.startsWith('analyze-')).length).toBeGreaterThanOrEqual(8);
      expect(names.filter(n => n.startsWith('prescribe-')).length).toBeGreaterThanOrEqual(4);
    });
  });

  // 测试7: 同name的优先级覆盖不报错
  describe('优先级覆盖', () => {
    const OVERRIDE_NAME = 'd66-test-override';
    const BUILTIN_NAME = 'acquire-financial-data';

    beforeEach(() => {
      cleanupFixtures();
      // 在 custom/ 目录创建同名 Skill（但用测试专用名避免冲突）
      if (!existsSync(CUSTOM_ROOT)) mkdirSync(CUSTOM_ROOT, { recursive: true });
      const dir = createFixtureDir(OVERRIDE_NAME, CUSTOM_ROOT);
      writeManifest(dir, {
        name: BUILTIN_NAME, // 与 real builtin skill 同名
        description: 'Custom override for test',
      });
    });

    afterEach(() => {
      cleanupFixtures();
    });

    it('custom/ 同名 Skill 不导致加载失败', async () => {
      const { loadSkills, clearSkillCache } = await import('../../src/skill/skill-loader');
      clearSkillCache();
      const result = loadSkills();
      // 同名覆盖不会改变 skills 数量（仍 ≥41 个真实 Skill）
      expect(result.skills.length).toBeGreaterThanOrEqual(41);
      // 验证 acquire-financial-data 仍然可加载（无论来自 custom 还是 builtin）
      const names = result.skills.map(s => s.manifest.name);
      expect(names).toContain('acquire-financial-data');
    });
  });

  // 测试8: manifest.json缺失的Skill目录 -> errors[]
  describe('缺失 manifest.json', () => {
    beforeEach(() => {
      cleanupFixtures();
    });

    afterEach(() => {
      cleanupFixtures();
    });

    it('缺少 manifest.json 的目录 → errors[] 含该目录', async () => {
      const { loadSkills, clearSkillCache } = await import('../../src/skill/skill-loader');
      clearSkillCache();

      // 创建一个没有 manifest.json 的目录
      createFixtureDir('d66-test-no-manifest');

      const result = loadSkills();
      // 41个有效 + 0个新增（缺失manifest的不计入skills）
      expect(result.skills.length).toBe(41);
      expect(result.errors.some((e: string) => e.includes('d66-test-no-manifest'))).toBe(true);
      expect(result.degraded).toBe(true);
    });
  });

  // 额外: 验证 SKILL.md 存在
  describe('SKILL.md 存在性', () => {
    it('每个 Skill 目录都包含 SKILL.md 文件', () => {
      const dirs = getSkillDirNames();
      for (const d of dirs) {
        const skillMdPath = join(BUILTIN_ROOT, d, 'SKILL.md');
        expect(existsSync(skillMdPath), `${d} 缺少 SKILL.md`).toBe(true);
      }
    });
  });

  // 额外: 验证 complexity 有效值
  describe('complexity 有效值', () => {
    it('所有 complexity 均为 atomic/composite/expert 之一', () => {
      const dirs = getSkillDirNames();
      for (const d of dirs) {
        const raw = readFileSync(join(BUILTIN_ROOT, d, 'manifest.json'), 'utf-8');
        const manifest = JSON.parse(raw);
        expect(VALID_COMPLEXITIES.includes(manifest.complexity), `${d} complexity=${manifest.complexity} 不是有效值`).toBe(true);
      }
    });
  });
});
