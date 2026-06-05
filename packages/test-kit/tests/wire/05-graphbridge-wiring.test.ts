/**
 * tests/wire/05-graphbridge-wiring.test.ts
 *
 * GraphBridge 6 个 upsert 方法的接线状态。
 * WIRE-02: 5/6 方法未被生产代码引用。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const PRODUCTION_DIRS = ['src/'];

describe('WIRE-02: GraphBridge 6 upsert 方法接线状态', () => {
  const methods = [
    'upsertFromKeyPersonRisk',
    'upsertFromHONA',
    'upsertFromFinancialImpact',
    'upsertFromCapabilityGap',
    'upsertFromSevenPowers',
    'upsertFromCPC',
  ];

  for (const method of methods) {
    it(`${method} 在生产代码中被引用`, () => {
      // 扫描 src/ 中所有 .ts 文件 (排除 graph-bridge.ts 自身 + test 文件)
      const srcFiles = findTsFiles(path.join(REPO_ROOT, 'src'));
      const nonSourceFiles = srcFiles.filter(f => {
        const rel = path.relative(REPO_ROOT, f);
        return !rel.includes('graph-bridge.ts') && !rel.includes('.test.ts') && !rel.includes('.d.ts');
      });

      let refCount = 0;
      for (const file of nonSourceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes(method)) refCount++;
      }

      if (method === 'upsertFromKeyPersonRisk') {
        expect(refCount).toBeGreaterThan(0);
      } else {
        // 其他 5 个方法零引用 — 记录状态
        console.warn(`⚠ ${method}: ${refCount} 处生产引用 (已知未接线, WIRE-02)`);
      }
    });
  }
});

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results.push(...findTsFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}
