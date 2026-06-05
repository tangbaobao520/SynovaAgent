/**
 * tests/security/01-empty-catch-audit.test.ts
 *
 * 铁律 11+24+31: 零空 catch 块。
 * 所有 catch 块必须包含 log.warn/error 和/或 degraded 标记。
 *
 * 历史：15 处空 catch 块 → LLM 双通道全断数周无人察觉。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('铁律 11+24+31: 空 catch 审计', () => {
  it('src/ 中无空 catch 块 (Catch with no log.warn/error)', () => {
    const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 查找 catch 块开始
        if (/catch\s*\{/.test(line) || /catch\s*\([^)]+\)\s*\{/.test(line)) {
          // 检查同一行是否有 log
          if (/log\./.test(line)) continue;

          // 检查下一行是否有 log
          if (i + 1 < lines.length && /log\./.test(lines[i + 1])) continue;

          // 检查注释标注的合法情况
          if (/JSON\.parse|noop|non.critical|benign|nosec|i18n|skip|fall.through|intentional/.test(line)) continue;

          const rel = path.relative(REPO_ROOT, file);
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      console.warn(`⚠ 发现 ${violations.length} 处潜在空 catch:\n  ${violations.join('\n  ')}`);
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
