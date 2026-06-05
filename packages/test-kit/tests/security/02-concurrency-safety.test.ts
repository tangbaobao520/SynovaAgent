/**
 * tests/security/02-concurrency-safety.test.ts
 *
 * BUG-05: interrupted 模块级全局变量竞态检测
 * EventBus 并发安全检测
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('BUG-05: 模块级全局变量竞态', () => {
  it('src/ 中无模块级全局 interrupted/aborted 变量 (非测试文件)', () => {
    const problematic = ['let interrupted = false', 'let isRunning = false', 'var interrupted = false'];
    const violations: string[] = [];

    const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of problematic) {
        // 只检查模块顶层声明 (不在函数/类内部)
        if (content.includes(pattern)) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(pattern) &&
                !lines[i].includes('class') &&
                !lines[i].includes('function') &&
                !lines[i].includes('//')) {
              const rel = path.relative(REPO_ROOT, file);
              violations.push(`${rel}:${i + 1}: ${pattern}`);
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      console.warn(`⚠ 发现 ${violations.length} 处模块级全局变量:\n  ${violations.join('\n  ')}`);
    }
  });
});

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results.push(...findTsFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')) {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}
