/**
 * tests/deploy/data-directory.test.ts — D47 数据目录三平台路径测试
 *
 * 覆盖:
 *   - Windows: %LOCALAPPDATA%/Synova/data
 *   - macOS: ~/Library/Application Support/Synova/data
 *   - Linux: $XDG_DATA_HOME/Synova/data (fallback ~/.local/share)
 *   - registerDataDirectory 创建目录 + 标记文件
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('D47: data-directory — 平台路径', () => {
  const ORIG_PLATFORM = process.platform;
  const ORIG_ENV = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIG_PLATFORM, configurable: true });
    process.env = { ...ORIG_ENV };
  });

  it('Windows → %LOCALAPPDATA%/Synova/data', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    const { getDataDirectory } = await import('../../src/deploy/data-directory');
    const dir = getDataDirectory();
    expect(dir).toBe('C:\\Users\\test\\AppData\\Local\\Synova\\data');
  });

  it('macOS → ~/Library/Application Support/Synova/data', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    process.env.HOME = '/Users/test';
    const mod = await import('../../src/deploy/data-directory');
    const dir = mod.getDataDirectory();
    const expected = path.join('/Users/test', 'Library', 'Application Support', 'Synova', 'data');
    expect(dir).toBe(expected);
  });

  it('Linux → $XDG_DATA_HOME/Synova/data (fallback ~/.local/share)', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    process.env.HOME = '/home/test';
    delete process.env.XDG_DATA_HOME;
    const mod = await import('../../src/deploy/data-directory');
    const dir = mod.getDataDirectory();
    const expected = path.join('/home/test', '.local', 'share', 'Synova', 'data');
    expect(dir).toBe(expected);
  });

  it('registerDataDirectory 创建目录 + .synova-registry 标记文件', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    process.env.HOME = '/tmp';
    delete process.env.XDG_DATA_HOME;

    const mod = await import('../../src/deploy/data-directory');
    const result = mod.registerDataDirectory();
    expect(result.path).toBeTruthy();
    expect(typeof result.created).toBe('boolean');

    const markerPath = path.join(result.path, '.synova-registry');
    expect(fs.existsSync(markerPath)).toBe(true);

    // 清理
    fs.rmSync(result.path, { recursive: true, force: true });
  });
});
