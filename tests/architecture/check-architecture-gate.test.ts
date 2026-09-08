/**
 * tests/architecture/check-architecture-gate.test.ts — CT-64 门禁行为测试
 *
 * 契约（铁律 47）—— scripts/check-architecture.sh L1 段修补后的行为契约：
 *   @input  真实仓库 src/（默认）或 SYNO_ARCH_SRC 注入的沙箱源目录；
 *           存量基线 tests/architecture/l1-cross-layer-baseline.txt（默认）或 SYNO_ARCH_BASELINE 注入；
 *           SYNO_CI=1 时进入 CI strict 模式（D515/D516 先例）。
 *   @output 按方向（L1→L3 / L1→L4 / L1→L5）逐行打印违规 file:line:内容；
 *           exit 0 = 通过（含基线内存量）；exit 1 = 基线外新增违规且 SYNO_CI=1；
 *           exit 2 = 检查自身失败（扫描目标缺失等，fail-closed，禁止吞）。
 *   @degraded 无（本门禁不允许降级放行——环境失败必须 exit 2 可见）。
 *
 * 覆盖矩阵（铁律 48）：
 *   [正常]   真实仓库 62 处存量逐行命中（对照 L1跨层违规扫描-20260908.md §二；D595 哨兵簇修复后 68→62）
 *   [正常]   存量在本地与 SYNO_CI=1 下均不阻断（棘轮——台账 CT-64：先修脚本→分批修 src/）
 *   [正常]   沙箱新增违规：本地 exit 0 软提示；SYNO_CI=1 exit 1 硬阻断
 *   [边界]   干净文件零误报：类型位置四形态 / URL 字符串 / 注释 / L2 合法引用
 *   [回归]   修补2：agent-observer / ga-annotations 文件内违规必须命中（名字豁免已删）
 *   [回归]   修补1：动态形态 await import( / import( / require( 必须命中
 *   [边界]   // arch-allow(reason) 行内豁免生效
 *   [边界]   基线棘轮：超基线=新增；低于基线=提示收紧（不阻断）
 *   [降级]   扫描目标缺失 → exit 2（fail-closed，M1 fail-open 根除回归）
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-architecture.sh');
const BASELINE = path.join(REPO_ROOT, 'tests', 'architecture', 'l1-cross-layer-baseline.txt');

interface RunResult {
  status: number;
  stdout: string;
}

function runScript(env: Record<string, string>, cwd = REPO_ROOT): RunResult {
  const res = spawnSync('bash', [SCRIPT], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    timeout: 60_000,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '' };
}

/** 扫描报告 §二 的 runtime 违规（file:line，权威清单——修补后必须逐行命中）。
 *  D595 (2026-09-09) 棘轮同步: 哨兵簇 6 处修复移出（mcp/index.ts :123/:138/:156/:169 L1→L3、
 *  :141 L1→L4、:140 L1→L5）；D601 存量 4 处随处理器原样迁移至 tool-definitions.ts
 *  （:203→:390、:236→:425、:193→:380、:231→:420，计数平移非新增）。68 → 62，
 *  对照 l1-cross-layer-baseline.txt 总量（D524 教训：修复方必须同步钉线清单）。 */
const EXPECTED_62: string[] = [
  // §2.1 L1→L3（12 处——D595 修复 src/mcp/index.ts ×4 后余量）
  'src/mcp/skill-installer.ts:126', 'src/routes/conversations.ts:120', 'src/routes/diagnosis.ts:207',
  'src/routes/evolution.ts:34', 'src/routes/expert.ts:11', 'src/routes/expert.ts:12',
  'src/routes/ga-annotations.ts:28', 'src/server.ts:180', 'src/server.ts:181',
  'src/server.ts:249', 'src/server.ts:251', 'src/tui-v2/chat.tsx:187',
  // §2.2 L1→L4（14 处——D595: :141 修复移出；:203 迁移至 tool-definitions.ts:391）
  'src/mcp/tool-definitions.ts:391', 'src/mcp/tool-registration.ts:104',
  'src/routes/agent-observer.ts:11', 'src/routes/auth.ts:16', 'src/routes/chat.ts:38',
  'src/routes/evolution.ts:27', 'src/routes/ga-annotations.ts:38', 'src/routes/ga-calibration.ts:70',
  'src/routes/ga-corrections.ts:9', 'src/routes/knowledge-ask.ts:39', 'src/routes/ontology.ts:10',
  'src/routes/ontology-admin.ts:16', 'src/routes/overflow.ts:15', 'src/tui-v2/chat.tsx:57',
  // §2.3a L1→L5 存储/调度导入（15 处——D595: :236 迁移至 tool-definitions.ts:426；
  // diagnosis.ts :215/:505 因 D599 合并漂移至 :261/:561，随本单同步）
  'src/cli.ts:14', 'src/cli.ts:21', 'src/l1/im-inbound.ts:171', 'src/mcp/tool-definitions.ts:426',
  'src/routes/conversations.ts:98', 'src/routes/diagnosis.ts:261', 'src/routes/diagnosis.ts:561',
  'src/routes/im.ts:42', 'src/routes/sessions.ts:11', 'src/server.ts:25', 'src/server.ts:405',
  'src/tui-v2/chat.tsx:15', 'src/tui-v2/lib/bootstrap.ts:13', 'src/tui-v2/lib/bootstrap.ts:17',
  'src/tui-v2/lib/commands.ts:14',
  // §2.3b L1→L5 getDatabase/init-engine-context（21 处——D595: :140 修复移出；
  // :193/:231 迁移至 tool-definitions.ts:381/:421）
  'src/index.ts:14', 'src/l1/qa-router.ts:13', 'src/mcp/tool-definitions.ts:381',
  'src/mcp/tool-definitions.ts:421', 'src/mcp/tool-registration.ts:105', 'src/routes/admin-knowledge.ts:19',
  'src/routes/agent-observer.ts:12', 'src/routes/auth.ts:17', 'src/routes/chat.ts:39',
  'src/routes/documents.ts:10', 'src/routes/evolution.ts:28', 'src/routes/expert.ts:13',
  'src/routes/ga-annotations.ts:39', 'src/routes/ga-calibration.ts:71', 'src/routes/ga-corrections.ts:10',
  'src/routes/im.ts:41', 'src/routes/knowledge.ts:12', 'src/routes/knowledge-ask.ts:38',
  'src/routes/ontology.ts:11', 'src/routes/permissions.ts:14', 'src/routes/sessions.ts:13',
];

function makeSandbox(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'ct64-arch-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const EMPTY_BASELINE = path.join(tmpdir(), 'ct64-empty-baseline.txt');
writeFileSync(EMPTY_BASELINE, '# empty baseline\n');

describe('CT-64: check-architecture.sh 四类漏网修补 — 存量 62 处全命中（D595 棘轮同步后）', () => {
  it('真实仓库：62 处存量违规逐行出现在输出（对照扫描报告 §二 file:line，D595 同步后）', () => {
    const { status, stdout } = runScript({ SYNO_CI: '0' });
    const missing = EXPECTED_62.filter((loc) => !stdout.includes(loc));
    expect(missing, `未命中的存量违规 (${missing.length}/${EXPECTED_62.length}): ${missing.join(', ')}`).toEqual([]);
    expect(status).toBe(0); // 棘轮：存量不阻断
  });

  it('真实仓库：SYNO_CI=1 下存量仍 exit 0（基线棘轮——避免一次性全红压垮编码线）', () => {
    const { status, stdout } = runScript({ SYNO_CI: '1' });
    expect(stdout).toContain('存量');
    expect(status).toBe(0);
  });

  it('基线文件总数 = 62（D595 修复 6 处 + 迁移 4 处后，与扫描报告权威计数只减不增对齐）', () => {
    const content = spawnSync('cat', [BASELINE], { encoding: 'utf-8' });
    const total = (content.stdout ?? '')
      .split('\n')
      .filter((l) => /=\d+\s*$/.test(l))
      .reduce((sum, l) => sum + Number(l.split('=')[1]), 0);
    expect(total).toBe(62);
  });
});

describe('CT-64: 新增违规 — soft→SYNO_CI 转硬（D515/D516 语义）', () => {
  it('沙箱新增违规：本地 exit 0 + 逐行点名；SYNO_CI=1 exit 1', () => {
    const { dir, cleanup } = makeSandbox({
      'routes/new-violation.ts': [
        "import { SessionStore } from '../store/session-store';",
        "const { getSentinelRegistry } = await import('../sentinel/registry');",
        'export const X = 1;',
      ].join('\n'),
    });
    try {
      const local = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: EMPTY_BASELINE });
      expect(local.status).toBe(0); // 本地软提示不阻断
      expect(local.stdout).toContain('routes/new-violation.ts:1');
      expect(local.stdout).toContain('routes/new-violation.ts:2');
      expect(local.stdout).toContain('新增');

      const ci = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: EMPTY_BASELINE, SYNO_CI: '1' });
      expect(ci.status).toBe(1); // CI strict 硬阻断
      expect(ci.stdout).toContain('routes/new-violation.ts:1');
    } finally {
      cleanup();
    }
  });

  it('基线棘轮：同文件同方向超基线计数 = 新增（按 file=count 粒度，行号漂移免疫）', () => {
    const { dir, cleanup } = makeSandbox({
      'routes/partial.ts': [
        "import { SessionStore } from '../store/session-store';",
        "import Database from 'better-sqlite3';",
      ].join('\n'),
    });
    const baselinePath = path.join(dir, 'baseline.txt');
    writeFileSync(baselinePath, '[L1→L5]\nroutes/partial.ts=1\n');
    try {
      const ci = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: baselinePath, SYNO_CI: '1' });
      expect(ci.status).toBe(1); // 实际 2 > 基线 1 → 新增 1 → CI 阻断
    } finally {
      cleanup();
    }
  });

  it('基线棘轮：低于基线 = 已修复，提示收紧但不阻断', () => {
    const { dir, cleanup } = makeSandbox({
      'routes/fixed-one.ts': "import { SessionStore } from '../store/session-store';",
    });
    const baselinePath = path.join(dir, 'baseline.txt');
    writeFileSync(baselinePath, '[L1→L5]\nroutes/fixed-one.ts=3\n');
    try {
      const local = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: baselinePath });
      expect(local.status).toBe(0);
      expect(local.stdout).toContain('收紧');
    } finally {
      cleanup();
    }
  });
});

describe('CT-64: 零误报 — 干净文件不命中', () => {
  it('类型位置四形态 + URL 字符串 + 注释 + L2 合法引用：全部零命中', () => {
    const { dir, cleanup } = makeSandbox({
      'routes/clean.ts': [
        "import type { GraphStore } from '../l4/graph-bridge';",                    // import type
        'let s: import("../sentinel/types").SentinelFinding[] = [];',               // : import(
        'const r = report as import("../l3/synova-diagnosis-engine").DiagnosisReport;', // as import(
        'type Alias = import("../l4/knowledge-store").KnowledgeStore;',             // type X = import(
        "const url = '/api/sentinel/findings';",                                    // URL 字符串
        "router.get('/api/expert/contribute', handler);",                           // URL 路由
        ' * GET /api/sentinel/reports — 注释',                                      // 注释
        "import { sentinelService } from '../agent/sentinel-service';",             // L2 合法
        "const { loadExpertConfig } = await import('../agent/expert-config-loader');", // L2 合法（裸 expert 不得误报）
        "import { DiagnosisEngine } from '../l2-interfaces/diagnosis-engine';",     // L2 接口合法
        'export const OK = 1;',
      ].join('\n'),
    });
    try {
      const { status, stdout } = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: EMPTY_BASELINE });
      expect(status).toBe(0);
      expect(stdout).not.toContain('clean.ts:');
    } finally {
      cleanup();
    }
  });

  it('修补1 回归：动态形态 await import( / import( / require( 必须命中（不再只认 from）', () => {
    const { dir, cleanup } = makeSandbox({
      'mcp/dynamic.ts': [
        "const { Registry } = await import('../sentinel/registry');",
        "const mod = import('../l3/expert-registry');",
        "const legacy = require('../store/session-store');",
      ].join('\n'),
    });
    try {
      const { status, stdout } = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: EMPTY_BASELINE });
      expect(status).toBe(0); // 本地软提示
      expect(stdout).toContain('mcp/dynamic.ts:1');
      expect(stdout).toContain('mcp/dynamic.ts:2');
      expect(stdout).toContain('mcp/dynamic.ts:3');
    } finally {
      cleanup();
    }
  });

  it('修补2 回归：agent-observer / ga-annotations 文件内违规必须命中（名字豁免已删除）', () => {
    const { dir, cleanup } = makeSandbox({
      'routes/agent-observer.ts': "import { SqliteGraphStore } from '../adapters/sqlite-graph-store';",
      'routes/ga-annotations.ts': "import { computeSentinelAccuracy } from '../sentinel/sentinel-accuracy';",
    });
    try {
      const { status, stdout } = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: EMPTY_BASELINE });
      expect(status).toBe(0);
      expect(stdout).toContain('routes/agent-observer.ts:1');
      expect(stdout).toContain('routes/ga-annotations.ts:1');
    } finally {
      cleanup();
    }
  });

  it('行内豁免：// arch-allow(L1→L3): 理由 的行豁免且豁免本身透明可见', () => {
    const { dir, cleanup } = makeSandbox({
      'routes/with-allow.ts': [
        "import { Registry } from '../sentinel/registry'; // arch-allow(L1→L3): 组合根 DI 装配，待 init/ 收敛",
        "import { SessionStore } from '../store/session-store';",
      ].join('\n'),
    });
    try {
      const { status, stdout } = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: EMPTY_BASELINE });
      expect(status).toBe(0);
      expect(stdout).toContain('with-allow.ts:1'); // 豁免行仍列出（透明）
      expect(stdout).toContain('arch-allow');
      expect(stdout).toContain('with-allow.ts:2'); // 未豁免行计违规
    } finally {
      cleanup();
    }
  });

  it('修补3：修补后的路径形态（expert-platform / store / cron / l5 / engine-context / sqlite-graph-store）各自命中', () => {
    const { dir, cleanup } = makeSandbox({
      'routes/forms.ts': [
        "import { Validator } from '../expert-platform/validator';",
        "import { SessionStore } from '../store/session-store';",
        "import { getScheduler } from '../cron/scheduler';",
        "import { getBus } from './l5/ontology-event-bus';",
        "import { getDatabase } from './init/engine-context';",
        "import { SqliteGraphStore } from '../adapters/sqlite-graph-store';",
        "import { Bridge } from '../cycles/overflow-graph-bridge';",
      ].join('\n'),
    });
    try {
      const { stdout } = runScript({ SYNO_ARCH_SRC: dir, SYNO_ARCH_BASELINE: EMPTY_BASELINE });
      for (let line = 1; line <= 7; line++) {
        expect(stdout).toContain(`routes/forms.ts:${line}`);
      }
    } finally {
      cleanup();
    }
  });
});

describe('CT-64: 三态退出码 — fail-closed（M1 fail-open 根除）', () => {
  it('扫描目标缺失 → exit 2（检查自身失败，绝不与通过混同）', () => {
    const { status, stdout } = runScript({ SYNO_ARCH_SRC: path.join(tmpdir(), 'ct64-does-not-exist'), SYNO_ARCH_BASELINE: EMPTY_BASELINE });
    expect(status).toBe(2);
    expect(stdout).toContain('exit 2');
  });
});
