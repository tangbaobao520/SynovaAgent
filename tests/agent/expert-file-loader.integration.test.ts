/**
 * tests/agent/expert-file-loader.integration.test.ts — ExpertFileLoader 集成测试
 *
 * 验证: 8段组装顺序 + 新文件类型(THEORY/STAGE_LOGIC/CROSS_EXPERT)被加载
 * 铁律 33: *.integration.test.ts (涉及真实文件系统 I/O)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FileScanner } from '../../src/agent/file-scanner';
import { ExpertFileLoader } from '../../src/agent/expert-file-loader';
import { getExpertRegistry } from '../../src/l3/expert-registry';
import * as path from 'path';

const ROOT = path.resolve('.');

describe('ExpertFileLoader — 8段组装集成测试', () => {
  let scanner: FileScanner;
  let loader: ExpertFileLoader;

  beforeAll(() => {
    scanner = new FileScanner(ROOT);
    scanner.scan();
    loader = new ExpertFileLoader();
  });

  it('Given FileScanner 扫描, Then 发现 8 位专家', () => {
    const names = scanner.listExpertNames();
    expect(names.length).toBeGreaterThanOrEqual(8);
    expect(names).toContain('strategy');
    expect(names).toContain('business_model');
    expect(names).toContain('org');
    expect(names).toContain('finance');
  });

  it('Given strategy 专家, Then 包含 THEORY/STAGE_LOGIC/CROSS_EXPERT 文件', () => {
    const expert = scanner.getExpert('strategy');
    expect(expert).toBeDefined();
    expect(expert!.files.THEORY).toBeDefined();
    expect(expert!.files.STAGE_LOGIC).toBeDefined();
    expect(expert!.files.CROSS_EXPERT).toBeDefined();
  });

  it('Given 完整索引, When loadFromIndex, Then 8 位专家全部加载成功', () => {
    const index = scanner.getIndex()!;
    expect(index).toBeDefined();

    const result = loader.loadFromIndex(index, {});
    expect(result.fromFiles).toBeGreaterThanOrEqual(8);
    expect(result.errors.length).toBe(0);
  });

  it('Given 已加载专家, When getPrompt, Then prompt 包含 THEORY + STAGE_LOGIC + CROSS_EXPERT 章节', () => {
    const index = scanner.getIndex()!;
    loader.loadFromIndex(index, {});

    const prompt = getExpertRegistry().getPrompt('strategy');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('理论基础');
    expect(prompt).toContain('规模自适应逻辑');
    expect(prompt).toContain('跨专家协同协议');
  });

  it('Given 已加载专家, Then prompt 组装顺序正确 (IDENTITY→THEORY→SOUL→RULES→TOOLS→STAGE_LOGIC→KNOWLEDGE→CROSS_EXPERT)', () => {
    const index = scanner.getIndex()!;
    loader.loadFromIndex(index, {});

    const prompt = getExpertRegistry().getPrompt('strategy')!;
    const idxIdentity = prompt.indexOf('角色定义');
    const idxTheory = prompt.indexOf('理论基础');
    const idxSoul = prompt.indexOf('诊断风格与方法论');
    const idxRules = prompt.indexOf('诊断规则与评分指南');
    const idxTools = prompt.indexOf('可用工具');
    const idxStage = prompt.indexOf('规模自适应逻辑');
    const idxKnowledge = prompt.indexOf('领域知识');
    const idxCross = prompt.indexOf('跨专家协同协议');

    // 顺序必须: IDENTITY < THEORY < SOUL < RULES < TOOLS < STAGE_LOGIC < KNOWLEDGE < CROSS_EXPERT
    expect(idxIdentity).toBeGreaterThan(0);
    expect(idxTheory).toBeGreaterThan(idxIdentity);
    expect(idxSoul).toBeGreaterThan(idxTheory);
    expect(idxRules).toBeGreaterThan(idxSoul);
    expect(idxTools).toBeGreaterThan(idxRules);
    expect(idxStage).toBeGreaterThan(idxTools);
    expect(idxKnowledge).toBeGreaterThan(idxStage);
    expect(idxCross).toBeGreaterThan(idxKnowledge);
  });

  it('Given 所有 8 位专家, Then prompt 非空且包含 IDENTITY', () => {
    const index = scanner.getIndex()!;
    loader.loadFromIndex(index, {});

    for (const name of scanner.listExpertNames()) {
      const prompt = getExpertRegistry().getPrompt(name);
      expect(prompt).toBeTruthy();
      expect(prompt!.length).toBeGreaterThan(200);
      expect(prompt).toContain('角色定义');
    }
  });
});
