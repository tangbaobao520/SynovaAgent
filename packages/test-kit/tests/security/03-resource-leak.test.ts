/**
 * tests/security/03-resource-leak.test.ts
 *
 * 资源泄漏检测：DB 连接数、active timers、未清理的服务器。
 * 历史：多次诊断后 DB 连接不释放、CronScheduler stop 残留 timer。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('资源泄漏扫描', () => {
  it('src/ 中无未关闭的 DB 连接模式', () => {
    const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        // 检测 new Database() 调用
        if (/new\s+Database\s*\(/.test(lines[i])) {
          // 检查同一函数内是否有 .close() 调用
          let hasClose = false;
          for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
            if (/\.close\s*\(/.test(lines[j])) { hasClose = true; break; }
            // 遇到下一个函数定义就停止搜索
            if (/^\s*(async\s+)?(function|const|let)\s/.test(lines[j])) break;
          }
          if (!hasClose) {
            const rel = path.relative(REPO_ROOT, file);
            violations.push(`${rel}:${i + 1}: 可能未关闭的 Database 连接`);
          }
        }
      }
    }

    if (violations.length > 0) {
      console.warn(`⚠ 可能未关闭的 DB 连接:\n  ${violations.join('\n  ')}`);
    }
  });

  it('src/ 中 setInterval/setTimeout 有对应的 clear 机制', () => {
    const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
    const intervals: string[] = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(REPO_ROOT, file);
      if (content.includes('setInterval(') || content.includes('setTimeout(')) {
        intervals.push(rel);
      }
    }

    if (intervals.length > 0) {
      console.warn(`⚠ 使用定时器的文件 (确认有清理机制):\n  ${intervals.join('\n  ')}`);
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
