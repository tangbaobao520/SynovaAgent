/**
 * tests/agent/skill-lazy-loader.test.ts — C3 渐进式技能加载器测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillLazyLoader, type SkillStub } from '../../src/agent/skill-lazy-loader';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SkillLazyLoader', () => {
  let loader: SkillLazyLoader;

  beforeEach(() => {
    loader = new SkillLazyLoader();
  });

  describe('register()', () => {
    it('Given valid stub, When registered, Then can list names', () => {
      loader.register({
        name: 'browser-automation',
        description: 'Control a web browser for testing and automation',
        fullPrompt: '# Browser Automation\nNavigate, click, fill forms...',
        source: 'builtin',
      });

      const names = loader.listNames();
      expect(names).toContain('browser-automation');
    });

    it('Given long description, When registered, Then truncated to 200 chars', () => {
      const longDesc = 'x'.repeat(500);
      loader.register({
        name: 'test-skill',
        description: longDesc,
        source: 'builtin',
      });

      const skills = loader.listNames();
      expect(skills).toContain('test-skill');
    });
  });

  describe('listForExpert()', () => {
    it('Given skills linked to expert, When listed, Then returns stubs without fullPrompt', () => {
      loader.register({
        name: 'ui-test',
        description: 'UI testing tools',
        fullPrompt: '# UI Test\nFull content here',
        source: 'builtin',
      });
      loader.linkToExpert('tech_expert', 'ui-test');

      const skills = loader.listForExpert('tech_expert');
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('ui-test');
      expect(skills[0].description).toBe('UI testing tools');
      // fullPrompt 不应出现在 listForExpert 的结果中
      expect((skills[0] as SkillStub).fullPrompt).toBeUndefined();
    });

    it('Given no linked skills, When listed, Then returns empty array', () => {
      const skills = loader.listForExpert('finance_expert');
      expect(skills).toHaveLength(0);
    });
  });

  describe('loadFull()', () => {
    it('Given registered skill with fullPrompt, When loadFull, Then returns prompt', () => {
      loader.register({
        name: 'db-query',
        description: 'Database query tools',
        fullPrompt: '# DB Query\nSELECT, INSERT, UPDATE...',
        source: 'builtin',
      });

      const full = loader.loadFull('db-query');
      expect(full).toBe('# DB Query\nSELECT, INSERT, UPDATE...');
    });

    it('Given unregistered skill, When loadFull, Then returns null', () => {
      const full = loader.loadFull('nonexistent');
      expect(full).toBeNull();
    });
  });

  describe('buildCatalogText()', () => {
    it('Given skills for expert, When called, Then returns markdown catalog', () => {
      loader.register({ name: 'git-tools', description: 'Git operations', source: 'builtin' });
      loader.register({ name: 'docker-tools', description: 'Docker management', source: 'builtin' });
      loader.linkToExpert('tech_expert', 'git-tools');
      loader.linkToExpert('tech_expert', 'docker-tools');

      const text = loader.buildCatalogText('tech_expert');
      expect(text).toContain('Available Skills');
      expect(text).toContain('git-tools');
      expect(text).toContain('docker-tools');
    });

    it('Given no skills, When called, Then returns empty string', () => {
      const text = loader.buildCatalogText('finance_expert');
      expect(text).toBe('');
    });
  });

  describe('resolveWithPriority()', () => {
    it('Given same name with different sources, When resolved, Then workspace wins', () => {
      loader.register({ name: 'weather', description: 'Builtin weather', source: 'builtin' });
      loader.register({ name: 'weather', description: 'Custom weather v2', source: 'workspace' });

      const resolved = loader.resolveWithPriority('weather');
      expect(resolved).not.toBeNull();
      expect(resolved!.source).toBe('workspace');
    });

    it('Given unknown name, When resolved, Then returns null', () => {
      const resolved = loader.resolveWithPriority('unknown');
      expect(resolved).toBeNull();
    });
  });

  describe('scanFromFiles()', () => {
    const testDir = '/tmp/synova-skill-test';

    beforeEach(() => {
      if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
      // Create test skill directory
      const skillSubDir = join(testDir, 'test-expert');
      if (!existsSync(skillSubDir)) mkdirSync(skillSubDir, { recursive: true });
      writeFileSync(join(skillSubDir, 'SKILLS.md'), '# Test Expert Skill\nDo something useful.\n## Steps\n1. Step one\n2. Step two');
      // Create knowledge file
      writeFileSync(join(testDir, 'industry-knowledge.md'), '# Industry Knowledge\nMarket insights for analysis.');
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('Given directory with skills and knowledge, When scanned, Then registers stubs', () => {
      const count = loader.scanFromFiles(testDir);
      expect(count).toBeGreaterThan(0);
      // Should have at least the SKILLS.md entry
      expect(loader.listNames().length).toBe(count);
    });

    it('Given nonexistent directory, When scanned, Then returns 0 gracefully', () => {
      const count = loader.scanFromFiles('/tmp/nonexistent-path-xyz');
      expect(count).toBe(0);
    });
  });

  describe('linkToExpert()', () => {
    it('Given skill linked to two experts, Then each expert sees it', () => {
      loader.register({ name: 'data-query', description: 'Query data', source: 'builtin' });
      loader.linkToExpert('finance_expert', 'data-query');
      loader.linkToExpert('org_expert', 'data-query');

      expect(loader.listForExpert('finance_expert')).toHaveLength(1);
      expect(loader.listForExpert('org_expert')).toHaveLength(1);
    });
  });
});
