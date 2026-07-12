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

  beforeEach(async () => {
    const mod = await import('../../src/skill/skill-loader');
    loadSkills = mod.loadSkills;
    clearSkillCache = mod.clearSkillCache;
    cleanupAllFixtures();
    clearSkillCache();
  });

  afterEach(() => {
    cleanupAllFixtures();
  });

  it('空目录 → {skills:[], degraded:false}', () => {
    const result = loadSkills();
    expect(result.skills).toEqual([]);
    expect(result.degraded).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('含1个有效skill → {skills.length:1}', () => {
    createSkillFixture('d65-test-math', VALID_MANIFEST);

    const result = loadSkills();
    expect(result.skills.length).toBe(1);
    expect(result.skills[0].manifest.name).toBe('test-math-skill');
    expect(result.skills[0].manifest.version).toBe('1.0.0');
    expect(result.degraded).toBe(false);
  });

  it('缺少manifest.json → errors[]', () => {
    createEmptySkillDir('d65-test-no-manifest');

    const result = loadSkills();
    expect(result.skills.length).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e: string) => e.includes('缺少 manifest.json'))).toBe(true);
  });

  it('manifest.json解析失败 → errors[]', () => {
    const dir = join(BUILTIN_ROOT, 'd65-test-bad-parse');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), '{ invalid json }', 'utf-8');

    const result = loadSkills();
    expect(result.skills.length).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});
