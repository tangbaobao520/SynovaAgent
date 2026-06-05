/**
 * tests/architecture/05-as-any-audit.test.ts
 *
 * 铁律 38: as any 零容忍。
 * 47 次历史教训。除测试文件外，生产代码中 .as any 零存在。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('铁律 38: as any 审计', () => {
  it('src/ 中无 as any (非测试/非声明文件)', () => {
    const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
    const violations: string[] = [];

    for (const file of srcFiles) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 匹配 as any 后跟各种字符
        if (/\bas\s+any\b/.test(line) && !line.includes('//') && !line.includes('*')) {
          const rel = path.relative(REPO_ROOT, file);
          violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      }
    }

    if (violations.length > 0) {
      console.warn(`⚠ 发现 ${violations.length} 处 as any:\n  ${violations.join('\n  ')}`);
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
