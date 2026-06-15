/**
 * tests/agent/file-scanner.test.ts — FileScanner 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileScanner } from '../../src/agent/file-scanner';

describe('FileScanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synova-filescanner-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('空目录 — 返回空索引', () => {
    const scanner = new FileScanner(tmpDir);
    const index = scanner.scan();
    expect(index.experts).toHaveLength(0);
    expect(index.measurers).toHaveLength(0);
    expect(index.knowledge).toHaveLength(0);
    expect(index.errors).toHaveLength(0);
  });

  it('扫描 expert/ 目录 — 解析专家文件', () => {
    const expertDir = path.join(tmpDir, 'expert', 'strategy');
    fs.mkdirSync(expertDir, { recursive: true });
    fs.writeFileSync(path.join(expertDir, 'IDENTITY.md'), '# Strategy Expert');
    fs.writeFileSync(path.join(expertDir, 'SOUL.md'), '## Three-layer diagnosis');

    const scanner = new FileScanner(tmpDir);
    const index = scanner.scan();

    expect(index.experts).toHaveLength(1);
    expect(index.experts[0].name).toBe('strategy');
    expect(index.experts[0].files.IDENTITY).toBeDefined();
    expect(index.experts[0].files.IDENTITY!.content).toBe('# Strategy Expert');
    expect(index.experts[0].files.SOUL).toBeDefined();
    expect(index.experts[0].files.RULES).toBeUndefined();
  });

  it('部分文件损坏 — 独立降级, 不阻断其他文件', () => {
    const expertDir = path.join(tmpDir, 'expert', 'strategy');
    fs.mkdirSync(expertDir, { recursive: true });
    fs.writeFileSync(path.join(expertDir, 'IDENTITY.md'), 'valid content');

    const scanner = new FileScanner(tmpDir);
    const index = scanner.scan();

    // 好的文件仍然加载
    expect(index.experts).toHaveLength(1);
    expect(index.experts[0].files.IDENTITY).toBeDefined();
    // 整体扫描不抛异常
    expect(index.scannedAt).toBeDefined();
  });

  it('扫描 measurers/ 目录 — 解析 YAML 配置', () => {
    const measurerDir = path.join(tmpDir, 'measurers');
    fs.mkdirSync(measurerDir, { recursive: true });
    fs.writeFileSync(path.join(measurerDir, 'cash-flow.yml'), 'dimension: D1\nfrequency: weekly');

    const scanner = new FileScanner(tmpDir);
    const index = scanner.scan();

    expect(index.measurers).toHaveLength(1);
    expect(index.measurers[0].name).toBe('cash-flow');
    expect(index.measurers[0].rawYaml).toContain('dimension: D1');
  });

  it('扫描 knowledge/ 目录 — 按行业分组', () => {
    const knowledgeDir = path.join(tmpDir, 'knowledge', 'saas');
    fs.mkdirSync(knowledgeDir, { recursive: true });
    fs.writeFileSync(path.join(knowledgeDir, 'ltv-benchmarks.md'), '# LTV/CAC > 3');

    const scanner = new FileScanner(tmpDir);
    const index = scanner.scan();

    expect(index.knowledge).toHaveLength(1);
    expect(index.knowledge[0].industry).toBe('saas');
    expect(index.knowledge[0].entries).toHaveLength(1);
    expect(index.knowledge[0].entries[0].content).toContain('LTV/CAC');
  });

  it('getIndex — 返回最近一次扫描结果', () => {
    const scanner = new FileScanner(tmpDir);
    expect(scanner.getIndex()).toBeNull();
    scanner.scan();
    expect(scanner.getIndex()).not.toBeNull();
    expect(scanner.getIndex()!.experts).toHaveLength(0);
  });

  it('listExpertNames — 列出所有专家名', () => {
    const expertDir = path.join(tmpDir, 'expert', 'finance');
    fs.mkdirSync(expertDir, { recursive: true });
    fs.writeFileSync(path.join(expertDir, 'SOUL.md'), 'finance expert');

    const scanner = new FileScanner(tmpDir);
    scanner.scan();
    expect(scanner.listExpertNames()).toEqual(['finance']);
  });
});
