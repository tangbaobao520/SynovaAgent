/**
 * tests/architecture/02-wiring-audit.test.ts
 *
 * 铁律 0-2 Step 5: 接线验证是硬门禁。
 * 每次新增模块，只需要在 WIRING_REGISTRY 加一行。
 * 此测试自动验证每个模块是否被预期入口文件引用。
 *
 * 历史：4 次接线失败（ViewAdapter, Phase0Engine, ModuleRunner, GraphBridge）
 * 每次都是创始人发现，不是测试发现。这条测试让接线失败在 CI 中被阻断。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WIRING_REGISTRY } from '../../src/wiring-registry';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('铁律 0-2 Step 5: 模块接线验证', () => {
  // 按优先级分组
  const critical = WIRING_REGISTRY.filter(w => w.status === 'critical');
  const required = WIRING_REGISTRY.filter(w => w.required && w.status !== 'critical');
  const optional = WIRING_REGISTRY.filter(w => !w.required);

  describe('Critical 接线 (必须立即修复)', () => {
    for (const entry of critical) {
      it(`${entry.moduleName} → 被 [${entry.expectedEntries.join(', ')}] 引用`, () => {
        const refs = countReferences(entry.moduleName, entry.expectedEntries);
        expect(refs).toBeGreaterThan(0);
      });
    }
  });

  describe('Required 接线', () => {
    for (const entry of required) {
      it(entry.moduleName, () => {
        const refs = countReferences(entry.moduleName, entry.expectedEntries);
        expect(refs).toBeGreaterThan(0);
      });
    }
  });

  describe('Optional 接线 (信息性)', () => {
    for (const entry of optional) {
      it(`${entry.moduleName}: ${entry.purpose}`, () => {
        const refs = countReferences(entry.moduleName, entry.expectedEntries);
        // 不 block，仅记录
        if (refs === 0) {
          console.warn(`⚠ ${entry.moduleName} 未被任何入口引用 — ${entry.ref || ''}`);
        }
      });
    }
  });
});

/** 计算指定模块在所有给定入口文件中的引用次数 */
function countReferences(moduleName: string, entries: string[]): number {
  let total = 0;
  for (const entry of entries) {
    const fullPath = path.join(REPO_ROOT, entry);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');
    total += (content.match(new RegExp(moduleName, 'g')) || []).length;
  }
  return total;
}
