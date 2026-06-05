/**
 * tests/architecture/04-file-size-audit.test.ts
 *
 * 铁律 37: 单文件 >1000 行硬阻断, >500 行警告。
 * ConversationEngine 从 915 行拆分为 4 个文件后, 防止再次膨胀。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('铁律 37: 单文件行数审计', () => {
  const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
  const oversized: string[] = [];
  const large: string[] = [];

  for (const file of srcFiles) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n').length;
    const rel = path.relative(REPO_ROOT, file);
    if (lines > 1000) oversized.push(`${rel}: ${lines} 行`);
    else if (lines > 500) large.push(`${rel}: ${lines} 行`);
  }

  it('无 >1000 行源文件 (硬阻断)', () => {
    if (oversized.length > 0) {
      console.warn(`❌ 超大型文件:\n  ${oversized.join('\n  ')}`);
    }
    expect(oversized).toEqual([]);
  });

  it('无 >500 行源文件 (建议拆分)', () => {
    if (large.length > 0) {
      console.warn(`⚠ 建议拆分的文件:\n  ${large.join('\n  ')}`);
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
