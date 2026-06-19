import { describe, it, expect, afterAll } from 'vitest';
import { AtomicWriter } from '../../src/agent/atomic-write';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'synova-atomic-test-' + Date.now());
const TEST_FILE = 'test-output.md';

describe('AtomicWriter', () => {
  const writer = new AtomicWriter(TEST_DIR);

  afterAll(() => {
    // cleanup
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('Given 合法内容, When write, Then success=true + 文件存在', () => {
    const content = '# Test\n\nHello World';
    const result = writer.write(TEST_FILE, content);
    expect(result.success).toBe(true);
    expect(result.targetPath).toContain(TEST_FILE);
    expect(fs.existsSync(path.join(TEST_DIR, TEST_FILE))).toBe(true);
  });

  it('Given 内容校验失败, When write, Then success=false', () => {
    const result = writer.write('fail-test.md', 'content', () => false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('校验失败');
  });

  it('Given 内容校验通过, When write, Then success=true', () => {
    const result = writer.write('pass-test.md', 'content', () => true);
    expect(result.success).toBe(true);
  });

  it('Given 两次写入同一文件, When write, Then 备份存在', () => {
    writer.write('backup-test.md', 'version 1');
    writer.write('backup-test.md', 'version 2');
    const backups = fs.readdirSync(path.join(TEST_DIR, 'versions'))
      .filter(f => f.startsWith('backup-test.md'));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it('Given 写入后, Then 清理无残留.tmp文件', () => {
    writer.cleanup();
    const tmpFiles = findTmpFiles(TEST_DIR);
    expect(tmpFiles.length).toBe(0);
  });
});

function findTmpFiles(dir: string): string[] {
  const result: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { result.push(...findTmpFiles(p)); }
      else if (entry.name.endsWith('.tmp')) { result.push(p); }
    }
  } catch { /* ignore */ }
  return result;
}
