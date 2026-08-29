/**
 * tests/architecture/05-as-any-audit.test.ts
 *
 * 铁律 38: as any 零容忍。
 * 47 次历史教训。除测试文件外，生产代码中 .as any 零存在。
 * D471 (K3 P1-C1): 扫描根扩到 src/ + packages/，并补 expect 断言
 * （原测试只有 console.warn，violations > 0 时照样通过 = 空壳测试，违反铁律 48）。
 * D558 (CT-46 配套): 扫描模式扩 as never / as unknown as（类型信任崩溃同族）。
 *   与 pre-commit 组 1 语义一致（CT-46 拦新增、存量独立清理）：
 *   全仓扫描用「棘轮基线」——存量不高于基线，新增即红；清理存量后应同步下调基线。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const SCAN_ROOTS = [path.join(REPO_ROOT, 'src'), path.join(REPO_ROOT, 'packages')];

/** 类型逃逸模式（铁律 38 精神：类型断言信任崩溃三族） */
interface EscapePattern { label: string; regex: RegExp }
const AS_ANY: EscapePattern = { label: 'as any', regex: /\bas\s+any\b/ };
const TYPE_ESCAPE_PATTERNS: EscapePattern[] = [
  AS_ANY,
  { label: 'as never', regex: /\bas\s+never\b/ },
  { label: 'as unknown as', regex: /\bas\s+unknown\s+as\b/ },
];

/**
 * 棘轮基线（D558, 2026-08-29）——mcp/index.ts getDatabase() as never 清理后由本扫描器实测。
 * 语义与 pre-commit 组 1 CT-46 修复一致：拦新增（> 基线即红）、存量独立清理。
 * 清理存量后必须同步下调本基线（棘轮只许收紧）；上调 = 新增类型逃逸 = 违规。
 */
const ESCAPE_BASELINE: Record<string, number> = {
  'as never': 9, // D558: mcp/index.ts 两处 getDatabase() 冗余断言清理后实测（含 .tsx 口径）
  'as unknown as': 87, // 含 .tsx（grep 仅 *.ts 会低估 4 处，以本扫描器实测为准）
};

describe('铁律 38: as any 审计', () => {
  it('src/ 与 packages/ 生产代码中无 as any (非测试/非声明文件)', () => {
    const violations = collectAsAnyViolations(SCAN_ROOTS);
    expect(violations, `发现 ${violations.length} 处 as any:\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('棘轮: as never / as unknown as 代码行存量不高于基线（新增即红，CT-46/D558）', () => {
    const counts = countByLabel(collectViolations(SCAN_ROOTS, TYPE_ESCAPE_PATTERNS));
    for (const { label } of TYPE_ESCAPE_PATTERNS) {
      const baseline = ESCAPE_BASELINE[label];
      if (baseline === undefined) continue; // as any 由上方零容忍断言覆盖
      expect(
        counts[label] ?? 0,
        `${label} 存量 ${counts[label] ?? 0} > 基线 ${baseline}——新增类型逃逸被棘轮拦截；` +
        `清理存量后请同步下调 ESCAPE_BASELINE（棘轮只许收紧）`,
      ).toBeLessThanOrEqual(baseline);
    }
  });

  it('棘轮非空转: as never / as unknown as 代码行命中 + 注释行不误报', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'type-escape-audit-'));
    try {
      fs.writeFileSync(path.join(tmp, 'escape.ts'), [
        'const a = p as never;',
        'const b = q as unknown as Shape;',
        '// const c = r as never;', // 行注释不误报
        '/* const d = s as unknown as T; */', // 同行块注释不误报
        'const ok = 1;',
      ].join('\n'));
      const counts = countByLabel(collectViolations([tmp], TYPE_ESCAPE_PATTERNS));
      expect(counts['as never']).toBe(1);
      expect(counts['as unknown as']).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('主扫描非空转: 实际读入了文件（防 REPO_ROOT 漂移/目录缺失致假绿）', () => {
    const files = SCAN_ROOTS.flatMap((r) => findTsFiles(r));
    expect(files.length).toBeGreaterThan(100);
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
      fs.writeFileSync(path.join(tmp, 'spec.test.tsx'), 'const zx = (p as any).wx;\n');
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
        '// line comment with /* trap', // 行注释内含 /* 不得开启块注释状态
        'const t = (p as any).trap;', // 后续行仍须被扫描（行注释陷阱不得吞行）
      ].join('\n'));
      const violations = collectAsAnyViolations([tmp]);
      expect(violations).toHaveLength(6);
      expect(violations[0]).toContain('real.ts:1');
      expect(violations[4]).toContain('real.ts:7');
      expect(violations[5]).toContain('real.ts:9');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function collectAsAnyViolations(roots: string[]): string[] {
  return collectViolations(roots, [AS_ANY]);
}

/** 按模式集扫描代码行（注释剥离状态机同 D471），命中行格式 `${rel}:${line}: ${code}` */
function collectViolations(roots: string[], patterns: EscapePattern[]): string[] {
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
        const lineComment = rest.indexOf('//');
        const open = rest.indexOf('/*');
        // 未闭合 /* 且不在行注释内: 其后（含跨行续行）视为注释
        if (open >= 0 && (lineComment < 0 || open < lineComment)) {
          inBlockComment = true;
          rest = rest.slice(0, open);
        } else if (lineComment >= 0) {
          rest = rest.slice(0, lineComment);
        }
        // 已知残余限制（可接受）: 字符串/正则字面量内含 // 且位于模式之前
        // 的同一行仍会漏报; 字符串字面量内含 /* 会误开块注释状态（与 // 限制对称）——
        // 两者代价都远低于旧版整行跳过。
        for (const { label, regex } of patterns) {
          if (regex.test(rest)) {
            const rel = path.relative(REPO_ROOT, file);
            violations.push(`${label}\t${rel}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
            break; // 一行只记一次（归入最靠前的命中模式）
          }
        }
      }
    }
  }
  return violations;
}

function countByLabel(violations: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of violations) {
    const label = v.split('\t')[0];
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
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
