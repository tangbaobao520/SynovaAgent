/**
 * tests/architecture/03-vendor-reference.test.ts
 *
 * 铁律 39: 仅 adapter 文件可引用 server/vendor/ 路径。
 * 所有直接 import engine-core 内部路径的行为必须经由适配器。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const ALLOWED_VENDOR_REF_FILES = [
  'src/adapters/engine-core-adapter.ts',
  'src/adapters/federal-adapter.ts',
];

describe('铁律 39: server/vendor 引用白名单', () => {
  it('仅 adapter 目录可以引用 server/vendor', () => {
    const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
    const violations: string[] = [];

    for (const file of srcFiles) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf-8');

      // 检查是否包含 server/vendor 引用
      if (content.includes('server/vendor') || content.includes('vendor/@synova')) {
        // 检查是否在白名单中
        const isAllowed = ALLOWED_VENDOR_REF_FILES.some(a => {
          const normalized = a.replace(/\\/g, '/');
          return rel.startsWith(normalized) || rel === normalized;
        });
        if (!isAllowed) {
          violations.push(rel);
        }
      }
    }

    expect(violations).toEqual([]);
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
  } catch { /* skip unreadable dirs */ }
  return results;
}
