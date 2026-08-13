/**
 * tests/skill/skill-loader.test.ts — D65 SkillLoader 单元测试
 *
 * 覆盖:
 * - 空目录 → {skills:[], degraded:false}
 * - 含1个有效skill → {skills.length:1}
 * - 缺少manifest.json → errors[]
 * - manifest.json解析失败 → errors[]
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

import type { SkillManifest } from '../../src/skill/skill-loader';

const BUILTIN_ROOT = join(process.cwd(), 'extensions', 'skills', 'builtin');

const VALID_MANIFEST: SkillManifest = {
  name: 'test-math-skill',
  version: '1.0.0',
  type: 'skill',
  displayName: 'Test Math Skill',
  description: 'A test skill for math operations',
  tier: 'L3',
  complexity: 'atomic',
  expert: 'knowledge',
  tools: ['calculator'],
  entryPoint: './skill.ts',
  exportKey: 'default',
  permissions: {
    dataAccess: { dimensions: ['test'], sensitiveAccess: 'none' },
    crossExpert: [],
  },
};

function createSkillFixture(name: string, manifest: unknown): void {
  const dir = join(BUILTIN_ROOT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

function createEmptySkillDir(name: string): void {
  mkdirSync(join(BUILTIN_ROOT, name), { recursive: true });
}

function cleanupAllFixtures(): void {
  // CI 上目录可能不存在（空目录不被 git 提交），此处优雅跳过
  if (!existsSync(BUILTIN_ROOT)) return;
  const entries = readdirSync(BUILTIN_ROOT, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith('d65-test-')) {
      try { rmSync(join(BUILTIN_ROOT, e.name), { recursive: true, force: true }); } catch { /* ok */ }
    }
  }
}

describe('SkillLoader', () => {
  let loadSkills: typeof import('../../src/skill/skill-loader').loadSkills;
  let clearSkillCache: typeof import('../../src/skill/skill-loader').clearSkillCache;
  let skillCount: number;

  beforeEach(async () => {
    const mod = await import('../../src/skill/skill-loader');
    loadSkills = mod.loadSkills;
    clearSkillCache = mod.clearSkillCache;
    cleanupAllFixtures();
    clearSkillCache();
    // 记录 D66 内置 Skill 的真实数量（不一定是41，由文件系统状态决定）
    skillCount = loadSkills().skills.length;
    clearSkillCache();
  });

  afterEach(() => {
    cleanupAllFixtures();
  });

  it('加载内置Skill → 不崩溃, degraded:false', () => {
    const result = loadSkills();
    expect(result.degraded).toBe(false);
    expect(Array.isArray(result.skills)).toBe(true);
  });

  it('含1个有效skill → 加载成功', () => {
    createSkillFixture('d65-test-math', VALID_MANIFEST);

    const result = loadSkills();
    // 在真实内置 Skill 的基础上增加1个
    expect(result.skills.length).toBe(skillCount + 1);
    // 验证新增的 skill 存在
    const added = result.skills.find(s => s.manifest.name === 'test-math-skill');
    expect(added).toBeDefined();
    expect(added?.manifest.version).toBe('1.0.0');
    expect(result.degraded).toBe(false);
  });

  it('缺少manifest.json → errors[]', () => {
    createEmptySkillDir('d65-test-no-manifest');

    const result = loadSkills();
    // 真实内置 Skill 不受影响
    expect(result.skills.length).toBe(skillCount);
    expect(result.errors.some((e: string) => e.includes('缺少 manifest.json'))).toBe(true);
  });

  it('manifest.json解析失败 → errors[]', () => {
    const dir = join(BUILTIN_ROOT, 'd65-test-bad-parse');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), '{ invalid json }', 'utf-8');

    const result = loadSkills();
    // 真实内置 Skill 不受影响
    expect(result.skills.length).toBe(skillCount);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});
