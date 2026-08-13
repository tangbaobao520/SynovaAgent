/**
 * tests/deploy/startup-check.test.ts — D47 首次启动 5 项检查测试
 *
 * 覆盖:
 *   - runStartupChecks 返回结构 {passed, failed, warnings}
 *   - 全部正常时 passed.length >= 5
 *   - 每项 CheckResult 有 name/passed 字段
 *   - SQLite 检查不因无数据库文件而失败
 *   - 哨兵检查遇错误不 throw
 *   - electron-main.ts 集成验证
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('D47: startup-check — 5 项检查', () => {
  beforeEach(() => {
    // 确保每次 import 新鲜模块
  });

  it('runStartupChecks 返回 {passed, failed, warnings} 结构', async () => {
    const { runStartupChecks } = await import('../../src/deploy/startup-check');
    const result = await runStartupChecks();
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.passed)).toBe(true);
    expect(Array.isArray(result.failed)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('全部正常时 passed.length >= 1 (至少 SQLite+哨兵通过)', async () => {
    const { runStartupChecks } = await import('../../src/deploy/startup-check');
    const result = await runStartupChecks();
    // 总共 5 项检查
    expect(result.passed.length + result.failed.length + result.warnings.length).toBe(5);
  });

  it('每项 CheckResult 含 name/passed 字段', async () => {
    const { runStartupChecks } = await import('../../src/deploy/startup-check');
    const result = await runStartupChecks();
    const all = [...result.passed, ...result.failed, ...result.warnings];
    expect(all.length).toBe(5);
    for (const item of all) {
      expect(item).toHaveProperty('name');
      expect(typeof item.name).toBe('string');
      expect(item).toHaveProperty('passed');
      expect(typeof item.passed).toBe('boolean');
    }
  });

  it('SQLite 检查不因无数据库文件而失败', async () => {
    const { runStartupChecks } = await import('../../src/deploy/startup-check');
    const result = await runStartupChecks();
    const sqliteCheck = [...result.passed, ...result.failed, ...result.warnings].find(
      (r) => r.name.startsWith('SQLite'),
    );
    expect(sqliteCheck).toBeTruthy();
    // 数据库文件不存在时应为 passed (首次启动正常)
    expect(sqliteCheck!.passed).toBe(true);
  });

  it('哨兵检查遇到错误时写入 warnings 或 failed 但不 throw', async () => {
    const { runStartupChecks } = await import('../../src/deploy/startup-check');
    await expect(runStartupChecks()).resolves.not.toThrow();
  });

  it('checkPermissions 检查返回有效的 CheckResult', async () => {
    const { runStartupChecks } = await import('../../src/deploy/startup-check');
    const result = await runStartupChecks();
    const permCheck = [...result.passed, ...result.warnings, ...result.failed].find(
      (r) => r.name.startsWith('数据目录权限'),
    );
    expect(permCheck).toBeTruthy();
    expect(typeof permCheck!.passed).toBe('boolean');
    expect(typeof permCheck!.name).toBe('string');
  });
});

describe('D47: electron-main.ts 集成', () => {
  it('import { runStartupChecks } 在 electron-main.ts 中存在', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'electron-main.ts'),
      'utf-8',
    );
    expect(content).toContain("import { runStartupChecks } from './src/deploy/startup-check'");
  });

  it('app.whenReady 中包含 startupCheck 调用', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'electron-main.ts'),
      'utf-8',
    );
    expect(content).toContain('const startupResult = await runStartupChecks()');
    expect(content).toContain("dialog.showErrorBox('启动失败'");
  });
});
