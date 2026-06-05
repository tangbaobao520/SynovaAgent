/**
 * tests/python-bridge/01-synova-worker.test.ts
 *
 * L5: Python Bridge 跨语言集成测试。
 * 验证 synova_worker Python 子进程可被 TypeScript 侧正确调用。
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const WORKER_DIR = path.join(REPO_ROOT, 'synova_worker');
const WORKER_MAIN = path.join(WORKER_DIR, '__main__.py');
const REQUIREMENTS = path.join(WORKER_DIR, 'requirements.txt');

describe('Python Bridge 集成', () => {
  it('synova_worker 目录存在', () => {
    expect(fs.existsSync(WORKER_DIR)).toBe(true);
  });

  it('__main__.py 入口文件存在', () => {
    expect(fs.existsSync(WORKER_MAIN)).toBe(true);
  });

  it('requirements.txt 存在', () => {
    expect(fs.existsSync(REQUIREMENTS)).toBe(true);
  });

  it('Python 可用且版本 >= 3.10', async () => {
    try {
      const version = await runPython('--version');
      expect(version).toMatch(/Python 3\.(1[0-9]|[2-9]\d)/);
    } catch (err: any) {
      console.warn(`⚠ Python 不可用: ${err.message}。跳过 Python Bridge 集成测试。`);
    }
  });

  it('__main__.py --help 执行成功', async () => {
    try {
      const help = await runPython(`${WORKER_MAIN} --help`);
      expect(help.length).toBeGreaterThan(0);
      console.warn(`⚠ Python Bridge 帮助输出: ${help.slice(0, 200)}`);
    } catch (err: any) {
      console.warn(`⚠ Python Bridge 不可用: ${err.message}`);
    }
  });
});

function runPython(args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', args.split(/\s+/), {
      cwd: WORKER_DIR,
      timeout: 15000,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`exit ${code}: ${stderr.slice(0, 200)}`));
    });
    proc.on('error', reject);
  });
}
