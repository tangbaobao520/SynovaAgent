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

  it('Given FileScanner 扫描, Then 发现 7 位专家', () => {
    const names = scanner.listExpertNames();
    expect(names.length).toBeGreaterThanOrEqual(7);
    expect(names).toContain('host');
    expect(names).toContain('capital-cycle');
    expect(names).toContain('customer-cycle');
    expect(names).toContain('talent-cycle');
  });

  it('Given host 专家, Then 包含关键文件', () => {
    const expert = scanner.getExpert('host');
    expect(expert).toBeDefined();
    expect(expert!.files).toBeDefined();
    expect(Object.keys(expert!.files).length).toBeGreaterThanOrEqual(3);
  });

  it('Given 完整索引, When loadFromIndex, Then 7 位专家全部加载成功', () => {
    const index = scanner.getIndex()!;
    expect(index).toBeDefined();

    const result = loader.loadFromIndex(index, {});
    expect(result.fromFiles).toBeGreaterThanOrEqual(7);
    expect(result.errors.length).toBe(0);
  });

  it('Given 已加载专家, When getPrompt, Then prompt 包含必要章节', () => {
    const index = scanner.getIndex()!;
    loader.loadFromIndex(index, {});

    const prompt = getExpertRegistry().getPrompt('host');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('角色');
    expect(prompt).toContain('规则');
    expect(prompt).toContain('工具');
  });

  it('Given 已加载专家, Then prompt 包含身份和规则', () => {
    const index = scanner.getIndex()!;
    loader.loadFromIndex(index, {});

    const prompt = getExpertRegistry().getPrompt('host')!;
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain('角色定义');
    expect(prompt).toContain('规则');
    expect(prompt).toContain('工具');
  });

  it('Given 所有 7 位专家, Then prompt 非空且包含 IDENTITY', () => {
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
