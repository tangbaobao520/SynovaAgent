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

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

/** 已知的 L2↔L4 桥接文件（架构允许的例外，已标注原因） */
const L2_L4_BRIDGE_EXCEPTIONS = [
  'src/agent/conversation-engine.ts',
  'src/agent/diagnosis-launcher.ts',
  'src/agent/engine-context.ts',
  'src/agent/ontology-syncer.ts',
];

/**
 * 已知的 L1→L4 / L1→agent-observer 架构违规（已知待修复）
 * 记录在 AUDIT-COMPREHENSIVE-20260604 ARCH-01
 */
const KNOWN_L1_VIOLATIONS = [
  'src/routes/knowledge.ts',
  'src/routes/agent-observer.ts',
  'src/mcp/tool-registration.ts',
  'src/routes/ontology.ts',
];

/** 判断文件是否在例外列表中 */
function isException(file: string, prohibited: string): boolean {
  const rel = file.replace(/\\/g, '/').replace(REPO_ROOT.replace(/\\/g, '/') + '/', '');
  for (const exc of L2_L4_BRIDGE_EXCEPTIONS) {
    if (rel.startsWith(exc) || rel === exc) return true;
  }
  for (const exc of KNOWN_L1_VIOLATIONS) {
    if (rel.startsWith(exc) || rel === exc) return true;
  }
  return false;
}

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
              if (isException(f, prohibited)) return false;
              const content = fs.readFileSync(f, 'utf-8');
              return content.includes(`from '${prohibited}`) ||
                     content.includes(`from "${prohibited}`) ||
                     content.includes(`require('${prohibited}`) ||
                     content.includes(`from '..${prohibited}`) ||
                     content.includes(`from '../${prohibited.slice(3)}`) ||
                     content.includes(`from "./${prohibited.slice(3)}`);
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
