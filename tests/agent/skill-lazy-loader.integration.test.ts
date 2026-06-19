/**
 * tests/agent/skill-lazy-loader.integration.test.ts — SkillLazyLoader 集成测试
 *
 * 验证: scanFromFiles 递归扫描 → linkToExpert 自动映射 → buildCatalogText 非空
 * 铁律 33: *.integration.test.ts (涉及真实文件系统 I/O)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getSkillLoader } from '../../src/agent/skill-lazy-loader';
import * as path from 'path';
import * as fs from 'fs';

const SKILLS_DIR = path.resolve('skills');

describe('SkillLazyLoader — 集成测试', () => {
  const loader = getSkillLoader();

  beforeAll(() => {
    // 清空已有索引，重新扫描
    loader.scanFromFiles(SKILLS_DIR);
  });

  it('Given skills/ 目录, When scanFromFiles, Then 至少发现 30 个 skill', () => {
    const strategySkills = loader.listForExpert('strategy');
    const orgSkills = loader.listForExpert('org');
    const financeSkills = loader.listForExpert('finance');
    const marketingSkills = loader.listForExpert('marketing');
    const actionSkills = loader.listForExpert('action');
    const bizSkills = loader.listForExpert('business-model');
    const techSkills = loader.listForExpert('tech');
    const knowledgeSkills = loader.listForExpert('knowledge');

    const total = strategySkills.length + orgSkills.length + financeSkills.length
      + marketingSkills.length + actionSkills.length + bizSkills.length
      + techSkills.length + knowledgeSkills.length;

    expect(total).toBeGreaterThanOrEqual(30);
  });

  it('Given strategy 专家, When buildCatalogText, Then 返回非空技能目录', () => {
    const catalog = loader.buildCatalogText('strategy');
    expect(catalog).toBeTruthy();
    expect(catalog.length).toBeGreaterThan(50);
    expect(catalog).toContain('Available Skills');
  });

  it('Given business-model 专家, Then 包含 duan-six-questions 和 value-cycle', () => {
    const skills = loader.listForExpert('business-model');
    const names = skills.map(s => s.name);
    expect(names).toContain('duan-six-questions');
    expect(names).toContain('value-cycle');
  });

  it('Given org 专家, Then 包含 yang-triangle 和 htm-assessment', () => {
    const skills = loader.listForExpert('org');
    const names = skills.map(s => s.name);
    expect(names).toContain('yang-triangle');
    expect(names).toContain('htm-assessment');
  });

  it('Given action 专家, Then 包含 constraint-id', () => {
    const skills = loader.listForExpert('action');
    const names = skills.map(s => s.name);
    expect(names).toContain('constraint-id');
  });

  it('Given 所有专家, When buildCatalogText, Then 均非空', () => {
    const experts = ['strategy', 'org', 'finance', 'marketing', 'action', 'business-model', 'tech', 'knowledge'];
    for (const exp of experts) {
      const catalog = loader.buildCatalogText(exp);
      expect(catalog).toBeTruthy();
      expect(catalog.length).toBeGreaterThan(20);
    }
  });

  it('Given non-existent expert, When listForExpert, Then 返回空数组', () => {
    const skills = loader.listForExpert('nonexistent');
    expect(skills).toEqual([]);
  });

  it('Given strategy expert, Then skill stubs 含 name + description + source', () => {
    const skills = loader.listForExpert('strategy');
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.source).toBeTruthy();
    }
  });
});
