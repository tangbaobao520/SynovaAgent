/**
 * tests/architecture/05-as-any-audit.test.ts
 *
 * 铁律 38: as any 零容忍。
 * 47 次历史教训。除测试文件外，生产代码中 .as any 零存在。
 * D471 (K3 P1-C1): 扫描根扩到 src/ + packages/，并补 expect 断言
 * （原测试只有 console.warn，violations > 0 时照样通过 = 空壳测试，违反铁律 48）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const SCAN_ROOTS = [path.join(REPO_ROOT, 'src'), path.join(REPO_ROOT, 'packages')];

describe('铁律 38: as any 审计', () => {
  it('src/ 与 packages/ 生产代码中无 as any (非测试/非声明文件)', () => {
    const violations = collectAsAnyViolations(SCAN_ROOTS);
    expect(violations, `发现 ${violations.length} 处 as any:\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('排除规则: .d.ts / .test.ts / node_modules 不参与扫描', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-any-audit-'));
    try {
      fs.mkdirSync(path.join(tmp, 'node_modules'));
      fs.writeFileSync(path.join(tmp, 'clean.ts'), 'export const a = 1;\n');
      fs.writeFileSync(path.join(tmp, 'violation.ts'), 'const x = (p as any).amount;\n');
      fs.writeFileSync(path.join(tmp, 'decl.d.ts'), 'const y = (p as any).z;\n');
      fs.writeFileSync(path.join(tmp, 'spec.test.ts'), 'const z = (p as any).w;\n');
      fs.writeFileSync(path.join(tmp, 'node_modules', 'dep.ts'), 'const w = (p as any).v;\n');
      const files = findTsFiles(tmp);
      expect(files.map(f => path.basename(f)).sort()).toEqual(['clean.ts', 'violation.ts']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('排除规则: 注释行不误报, 代码行必须命中', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-any-audit-'));
    try {
      fs.writeFileSync(path.join(tmp, 'comments.ts'), [
        '// const a = (p as any).x;',
        '/** uses as any */',
        'export const ok = 1;',
      ].join('\n'));
      fs.writeFileSync(path.join(tmp, 'real.ts'), 'const b = (p as any).y;\n');
      const violations = collectAsAnyViolations([tmp]);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('real.ts:1');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function collectAsAnyViolations(roots: string[]): string[] {
  const violations: string[] = [];
  for (const root of roots) {
    for (const file of findTsFiles(root)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 匹配 as any 后跟各种字符; 跳过注释行 (// 与块注释 *)
        if (/\bas\s+any\b/.test(line) && !line.includes('//') && !line.includes('*')) {
          const rel = path.relative(REPO_ROOT, file);
          violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      }
    }
  }
  return violations;
}

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
