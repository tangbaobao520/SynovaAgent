/**
 * tests/skill/skill-registry.test.ts — D65 SkillRegistry 单元测试
 *
 * 覆盖:
 * - register + get → 返回注册的skill
 * - register同name两次 → 第二次覆盖第一次
 * - unregister → 移除成功返回true
 * - list → 返回全部注册项
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { SkillManifest, LoadedSkill } from '../../src/skill/skill-loader';
import { SkillRegistry } from '../../src/skill/skill-registry';

const BASE_MANIFEST: SkillManifest = {
  name: 'test-skill',
  version: '1.0.0',
  type: 'skill',
  displayName: 'Test Skill',
  description: 'A test skill',
  tier: 'L3',
  complexity: 'atomic',
  expert: 'knowledge',
  tools: ['tool1'],
  entryPoint: './skill.ts',
  exportKey: 'default',
  permissions: {
    dataAccess: { dimensions: ['test'], sensitiveAccess: 'none' },
    crossExpert: [],
  },
};

const MANIFEST_2: SkillManifest = {
  ...BASE_MANIFEST,
  name: 'test-skill-2',
  displayName: 'Test Skill 2',
  description: 'Another test skill',
};

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('register + get → 返回注册的skill', () => {
    const skill: LoadedSkill = { manifest: BASE_MANIFEST, dir: '/tmp/test' };
    registry.register(skill);

    const result = registry.get('test-skill');
    expect(result).toBeDefined();
    expect(result?.manifest.name).toBe('test-skill');
    expect(result?.manifest.version).toBe('1.0.0');
  });

  it('register同name两次 → 第二次覆盖第一次', () => {
    const skill1: LoadedSkill = {
      manifest: { ...BASE_MANIFEST, name: 'overwrite-skill' as const, description: 'first version' },
      dir: '/tmp/first',
    };
    const skill2: LoadedSkill = {
      manifest: { ...BASE_MANIFEST, name: 'overwrite-skill' as const, description: 'second version' },
      dir: '/tmp/second',
    };

    registry.register(skill1);
    registry.register(skill2);

    const result = registry.get('overwrite-skill');
    expect(result).toBeDefined();
    expect((result?.manifest as { description: string }).description).toBe('second version');
    expect(result?.dir).toBe('/tmp/second');
  });

  it('unregister → 移除成功返回true', () => {
    const skill: LoadedSkill = { manifest: BASE_MANIFEST, dir: '/tmp/test' };
    registry.register(skill);

    expect(registry.unregister('test-skill')).toBe(true);
    expect(registry.get('test-skill')).toBeUndefined();
  });

  it('list → 返回全部注册项', () => {
    const s1: LoadedSkill = { manifest: BASE_MANIFEST, dir: '/tmp/1' };
    const s2: LoadedSkill = { manifest: MANIFEST_2, dir: '/tmp/2' };
    registry.register(s1);
    registry.register(s2);

    const list = registry.list();
    expect(list.length).toBe(2);
  });
});
