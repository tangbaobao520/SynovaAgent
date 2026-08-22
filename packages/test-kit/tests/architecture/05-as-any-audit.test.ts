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
      fs.writeFileSync(path.join(tmp, 'view.tsx'), 'const v = (p as any).ui;\n');
      fs.writeFileSync(path.join(tmp, 'decl.d.ts'), 'const y = (p as any).z;\n');
      fs.writeFileSync(path.join(tmp, 'spec.test.ts'), 'const z = (p as any).w;\n');
      fs.writeFileSync(path.join(tmp, 'node_modules', 'dep.ts'), 'const w = (p as any).v;\n');
      const files = findTsFiles(tmp);
      expect(files.map(f => path.basename(f)).sort()).toEqual(['clean.ts', 'view.tsx', 'violation.ts']);
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
        '// const c = (p as any).z * 2;',
        '/**',
        ' * 铁律 38: 零 as any', // 块注释续行（多行块注释中间）不得误报
        ' */',
        'export const ok = 1;',
      ].join('\n'));
      fs.writeFileSync(path.join(tmp, 'real.ts'), [
        'const b = (p as any).y;',
        'const m = (p as any).z * 2;', // * 运算符不得被当作块注释而整行漏报
        "const u = (p as any).url('http://x');", // 字符串内 // 不得吞掉匹配
        '/* block */ const bb = (p as any).w;', // 代码行前有块注释仍须命中
        '/* multi', // 多行块注释开启
        'const hidden = (p as any).hidden;', // 块注释内部 → 不报
        ' */ const e = (p as any).q;', // 闭合符之后仍是代码 → 必须命中
      ].join('\n'));
      const violations = collectAsAnyViolations([tmp]);
      expect(violations).toHaveLength(5);
      expect(violations[0]).toContain('real.ts:1');
      expect(violations[4]).toContain('real.ts:7');
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
      // 块注释状态机（跨行）:
      // 旧版 `!line.includes('*')` 靠"行内含 * 即跳过"漏掉代码行 * 运算符（乘法）;
      // 纯同行剥离又会把多行块注释的续行（如 JSDoc 的 ` * 零 as any`）误报。
      // 正确做法: 跨行追踪块注释开合，只对剥离注释后的残余代码做匹配。
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        let rest = lines[i];
        if (inBlockComment) {
          const close = rest.indexOf('*/');
          if (close < 0) continue; // 整行仍在块注释内
          rest = ' '.repeat(close + 2) + rest.slice(close + 2);
          inBlockComment = false;
        }
        // 同行内完整闭合的块注释剥离（以等长空格保持列位）
        rest = rest.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
        const open = rest.indexOf('/*');
        if (open >= 0) {
          inBlockComment = true; // 未闭合: 其后（含跨行续行）视为注释
          rest = rest.slice(0, open);
        }
        const lineComment = rest.indexOf('//');
        if (lineComment >= 0) rest = rest.slice(0, lineComment);
        // 已知残余限制（可接受）: 字符串/正则字面量内含 // 且位于 as any 之前
        // 的同一行（如 'http://x' 之后同一行再写 as any），仍会漏报——
        // 代价远低于旧版整行跳过。
        if (/\bas\s+any\b/.test(rest)) {
          const rel = path.relative(REPO_ROOT, file);
          violations.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
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
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx')
      ) {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}
