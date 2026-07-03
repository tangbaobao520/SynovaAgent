/**
 * tests/services/config-recovery.test.ts — Phase 4.2 配置恢复测试
 *
 * 铁律 33: *.test.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('@synova/logger', () => {
  const m = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  return { logger: m, createLogger: vi.fn(() => m) };
});

import { ConfigRecovery } from '../../src/services/config-recovery';
import { logger } from '@synova/logger';

describe('ConfigRecovery — verify', () => {
  const tmpDir = '/tmp/config-recovery-test';

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  function writeConfig(name: string, content: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content, 'utf-8');
    return p;
  }

  it('有效 JSON 应通过验证', () => {
    const p = writeConfig('synova.json', JSON.stringify({ port: 3099, devMode: true }));
    const result = ConfigRecovery.verify(p);
    expect(result.ok).toBe(true);
  });

  it('无效 JSON 应标记损坏', () => {
    const p = writeConfig('synova.json', '{invalid json');
    const result = ConfigRecovery.verify(p);
    expect(result.ok).toBe(false);
    expect(result.corrupted).toBe(true);
  });

  it('有 .bak 备份时应自动恢复', () => {
    writeConfig('synova.json', '{invalid json}');
    writeConfig('synova.json.bak', JSON.stringify({ port: 3099, devMode: true }));
    const p = path.join(tmpDir, 'synova.json');

    const result = ConfigRecovery.verify(p);

    expect(result.restored).toBe(true);
    // 恢复后的文件应有效
    const content = fs.readFileSync(p, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('无 .bak 备份时不应恢复', () => {
    const p = writeConfig('synova.json', '{invalid');
    const result = ConfigRecovery.verify(p);
    expect(result.restored).toBe(false);
    expect(result.corrupted).toBe(true);
  });

  it('内容缩小超过 50% 应标记可疑', () => {
    writeConfig('synova.json', '{"port":3099}');
    writeConfig('synova.json.bak', JSON.stringify({ port: 3099, devMode: true, dbPath: '/data/db.sqlite', llmApiKey: 'sk-xxx', llmModel: 'deepseek-v4' }));
    const p = path.join(tmpDir, 'synova.json');

    const result = ConfigRecovery.verify(p);
    expect(result.ok).toBe(true);
    expect(result.warning).toContain('缩小');
  });

  it('含占位符密钥应拒绝恢复', () => {
    writeConfig('synova.json', '{invalid}');
    writeConfig('synova.json.bak', JSON.stringify({ port: 3099, llmApiKey: '***' }));
    const p = path.join(tmpDir, 'synova.json');

    const result = ConfigRecovery.verify(p);
    expect(result.restored).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('文件不存在应返回 ok=false', () => {
    const result = ConfigRecovery.verify('/nonexistent/path.json');
    expect(result.ok).toBe(false);
  });
});
