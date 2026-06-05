/**
 * tests/architecture/01-layer-boundaries.test.ts
 *
 * 铁律 39: 五层架构边界检查。
 * 每层只与相邻层通信。使用静态文件扫描检测跨层 import 违规。
 */
import { describe, it, expect } from 'vitest';
import { LAYERS } from '../../src/arch-check';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('铁律 39: 五层架构边界', () => {
  for (const layer of LAYERS) {
    describe(`${layer.name} (${layer.dirs.join(', ')})`, () => {
      for (const dir of layer.dirs) {
        const fullPath = path.join(REPO_ROOT, dir);
        if (!fs.existsSync(fullPath)) continue;

        const files = findTsFiles(fullPath);

        for (const prohibited of layer.prohibitedImports) {
          it(`不应 import ${prohibited}`, () => {
            const violations = files.filter(f => {
              const content = fs.readFileSync(f, 'utf-8');
              // import 语句中包含被禁止的路径
              return content.includes(`from '${prohibited}`) ||
                     content.includes(`from "${prohibited}`) ||
                     content.includes(`require('${prohibited}`) ||
                     content.includes(`from '..${prohibited}`);
            });
            expect(violations).toEqual([]);
          });
        }
      }
    });
  }
});

/** 递归查找目录中所有 .ts 文件（排除 test 和 d.ts） */
function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}
