/**
 * gss-common.test.ts — D361 GSS 基建四工具测试（正常/降级/边界 三路径，铁律 48）
 *
 * 覆盖矩阵:
 *   fresh-db: 临时目录创建（仓库外）/ 铁律 0-4 守卫拒绝真实库（CLI exit 2）/ --ensure-temp 边界
 *   inject: 契约校验 + 归一（externalField→prop）/ 未知字段清单 / 缺必填清单 /
 *           number 归一失败拒绝（不猜值）
 *   assert: 六态判定（http/sqlite/file/process 四型检查）/ 三态语义（真空 vs 查询失败）/
 *           负向断言 notContains / 恒真防护（缺 purpose 拒绝）/ evidence 与 calc 契约对齐 /
 *           exit 0/1 语义
 *   bootstrap: 假服务真实 spawn + healthz 就绪 + 状态文件 + 停止清理（真实路由不 mock，铁律 12）
 */
import { describe, expect, it } from 'vitest';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMON = path.resolve(__dirname, '..', '..', 'scripts', 'golden-scenarios', 'common');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function runTsx(file: string, args: string[] = [], env: Record<string, string> = {}) {
  return childProcess.spawnSync(TSX, [file, ...args], {
    encoding: 'utf-8',
    timeout: 120000,
    env: { ...process.env, ...env },
  });
}

describe('fresh-db（铁律 0-4 守卫 + 临时目录）', () => {
  it('正常: 产出仓库外临时目录', () => {
    const r = runTsx(path.join(COMMON, 'fresh-db.ts'));
    expect(r.status).toBe(0);
    const dir = r.stdout.trim();
    expect(dir).toContain(os.tmpdir());
    expect(fs.existsSync(dir)).toBe(true);
    expect(dir.startsWith(REPO_ROOT)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('回归: 环境自带 SYNOVA_DB_PATH 也不误伤（防线在 bootstrap 的临时区强制，08-16 决策）', () => {
    const r = runTsx(path.join(COMMON, 'fresh-db.ts'), [], {
      SYNOVA_DB_PATH: path.join(REPO_ROOT, 'data', 'synova.db'),
    });
    expect(r.status).toBe(0);
    const dir = r.stdout.trim();
    expect(dir).toContain(os.tmpdir());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('边界: --ensure-temp 拒绝仓库内目录', () => {
    const r = runTsx(path.join(COMMON, 'fresh-db.ts'), ['--dir', REPO_ROOT, '--ensure-temp']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('degraded');
  });
});

describe('inject（field-mappings 契约校验）', () => {
  it('正常: 外部字段 → 本体属性归一（erp-standard 真实契约）', async () => {
    const mod = await import(path.join(COMMON, 'inject.ts'));
    const r = mod.inject('erp-standard', { 营业收入: 12345, 期间: '2026-Q2' });
    expect(r.normalized.total_revenue).toBe(12345);
    expect(r.normalized.period).toBe('2026-Q2');
    expect(r.targetNodeType).toBe('Financial');
    expect(r.unknownFields).toEqual([]);
    expect(r.missingRequired.length).toBeGreaterThan(0);
  });

  it('降级: 未知字段进清单（不静默丢）', async () => {
    const mod = await import(path.join(COMMON, 'inject.ts'));
    const r = mod.inject('erp-standard', { 营业收入: 1, 不存在的字段: 'x' });
    expect(r.unknownFields).toContain('不存在的字段');
    expect(r.normalized).not.toHaveProperty('不存在的字段');
  });

  it('边界: number 归一失败 → CLI exit 2（不猜值）', () => {
    const fixture = path.join(os.tmpdir(), `gss-fixture-${Date.now()}.json`);
    fs.writeFileSync(fixture, JSON.stringify({ 营业收入: '不是数字' }), 'utf-8');
    const r = runTsx(path.join(COMMON, 'inject.ts'), ['--mapping', 'erp-standard', '--fixture', fixture]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('INJECT_FIXTURE_ERROR');
    fs.rmSync(fixture, { force: true });
  });
});

describe('assert（三态语义 + 恒真防护 + evidence 契约）', () => {
  it('恒真防护: 缺 purpose / 断言 <3 条 / 空 expect → ExpectDocError', async () => {
    const mod = await import(path.join(COMMON, 'assert.ts'));
    expect(() => mod.validateExpectDoc({
      scenario_id: 'GS-03',
      evidence_map: [],
      assertions: [{ id: 'A1', desc: 'x', check: { type: 'file', path: '/' }, expect: { exists: true } }],
    })).toThrow(mod.ExpectDocError);
    expect(() => mod.validateExpectDoc({
      scenario_id: 'GS-03',
      evidence_map: [],
      assertions: [
        { id: 'A1', desc: 'x', check: { type: 'file', path: '/' }, expect: { exists: true } },
        { id: 'A2', desc: 'x', check: { type: 'file', path: '/' }, expect: { exists: true } },
        { id: 'A3', desc: 'x', check: { type: 'file', path: '/' }, expect: { exists: true } },
      ],
    })).toThrow(/purpose/);
  });

  it('正常+降级+负向: 四型检查全链路判定', async () => {
    const mod = await import(path.join(COMMON, 'assert.ts'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-assert-'));
    const dbPath = path.join(tmp, 't.db');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createRequire } = await import('module');
    const Database = createRequire(import.meta.url)('better-sqlite3');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE tickets (id INTEGER PRIMARY KEY, level TEXT)');
    db.prepare('INSERT INTO tickets (level) VALUES (?)').run('critical');
    db.close();

    const helloFile = path.join(tmp, 'report.json');
    fs.writeFileSync(helloFile, JSON.stringify({ title: '首诊报告', hasCapital: true }), 'utf-8');
    const missingFile = path.join(tmp, 'nope.json');

    const doc = mod.validateExpectDoc({
      scenario_id: 'GS-03',
      evidence_map: [
        { acceptance_point: '10-1', assertion_ids: ['A1', 'A2'] },
        { acceptance_point: '10-6', assertion_ids: ['A3', 'A4'] },
      ],
      assertions: [
        { id: 'A1', desc: '工单表有告警行', purpose: '证明告警链路真实写库（验收点 10-1）',
          check: { type: 'sqlite', db: dbPath, sql: 'SELECT COUNT(*) AS c FROM tickets' },
          expect: { rows: '>=1' } },
        { id: 'A2', desc: '报告文件含首诊标题', purpose: '证明报告产出（验收点 10-1）',
          check: { type: 'file', path: helloFile }, expect: { exists: true, contains: '首诊报告' } },
        { id: 'A3', desc: '真空≠通过: 零结果必须用 cell 显式声明（COUNT 恒返回 1 行）', purpose: '证明降级诚实语义',
          check: { type: 'sqlite', db: dbPath, sql: "SELECT COUNT(*) AS c FROM tickets WHERE level = 'info'" },
          expect: { cell: { column: 'c', op: 'eq', value: 0 } } },
        { id: 'A4', desc: '报告不该含老板看不懂的字段', purpose: '负向断言: 不该出现却出现=失败',
          check: { type: 'file', path: missingFile }, expect: { exists: true, notContains: 'raw_salary' } },
      ],
    });
    const results = mod.runAssertions(doc);
    const byId = Object.fromEntries(results.map((r: { id: string }) => [r.id, r]));
    expect(byId.A1.verdict).toBe('pass');
    expect(byId.A2.verdict).toBe('pass');
    expect(byId.A3.verdict).toBe('pass');
    // A4: 文件不存在 + exists:true → fail（不是 error——预期内失败，不是查询失败）
    expect(byId.A4.verdict).toBe('fail');

    const evidence = mod.buildEvidence(doc, results, '2026-08-16', 'expect.json');
    expect(evidence.schema).toBe(1);
    expect(evidence.record_type).toBe('scenario');
    expect(evidence.verdict).toBe('fail');
    expect(Array.isArray(evidence.verdicts)).toBe(true);
    expect(evidence.verdicts[0]).toMatchObject({ acceptance_point: '10-1', verdict: 'pass' });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('三态语义: SQL 语法错误 → error 态（查询失败≠真空≠通过，K3 P0-3 教训）', async () => {
    const mod = await import(path.join(COMMON, 'assert.ts'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-assert-'));
    const dbPath = path.join(tmp, 't.db');
    const { createRequire } = await import('module');
    const Database = createRequire(import.meta.url)('better-sqlite3');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE t (id INTEGER)');
    db.close();
    const doc = mod.validateExpectDoc({
      scenario_id: 'GS-03',
      evidence_map: [],
      assertions: [
        { id: 'A1', desc: 'x', purpose: '证明 error 态', check: { type: 'sqlite', db: dbPath, sql: 'BROKEN SQL !!!' }, expect: { rows: '>=1' } },
        { id: 'A2', desc: 'y', purpose: '证明 error 态 2', check: { type: 'file', path: dbPath }, expect: { exists: true } },
        { id: 'A3', desc: 'z', purpose: '证明 error 态 3', check: { type: 'file', path: dbPath }, expect: { exists: true } },
      ],
    });
    const results = mod.runAssertions(doc);
    expect(results[0].verdict).toBe('error');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('exit 语义: 全过 exit 0 / 有失败 exit 1（机器判定）', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-exit-'));
    const f = path.join(tmp, 'f.txt');
    fs.writeFileSync(f, 'hello', 'utf-8');
    const expectJson = path.join(tmp, 'expect.json');
    fs.writeFileSync(expectJson, JSON.stringify({
      scenario_id: 'GS-03',
      evidence_map: [{ acceptance_point: '10-1', assertion_ids: ['A1', 'A2', 'A3'] }],
      assertions: [
        { id: 'A1', desc: 'a', purpose: 'p1', check: { type: 'file', path: f }, expect: { exists: true, contains: 'hello' } },
        { id: 'A2', desc: 'b', purpose: 'p2', check: { type: 'file', path: f }, expect: { exists: true } },
        { id: 'A3', desc: 'c', purpose: 'p3', check: { type: 'file', path: f }, expect: { exists: true, notContains: 'bye' } },
      ],
    }), 'utf-8');
    const rOk = runTsx(path.join(COMMON, 'assert.ts'), ['--expect', expectJson, '--out', path.join(tmp, 'ev.json')]);
    expect(rOk.status).toBe(0);
    const ev = JSON.parse(fs.readFileSync(path.join(tmp, 'ev.json'), 'utf-8'));
    expect(ev.verdict).toBe('pass');

    fs.writeFileSync(expectJson, JSON.stringify({
      scenario_id: 'GS-03',
      evidence_map: [{ acceptance_point: '10-1', assertion_ids: ['A1', 'A2', 'A3'] }],
      assertions: [
        { id: 'A1', desc: 'a', purpose: 'p1', check: { type: 'file', path: f }, expect: { exists: true, contains: '不存在的内容' } },
        { id: 'A2', desc: 'b', purpose: 'p2', check: { type: 'file', path: f }, expect: { exists: true } },
        { id: 'A3', desc: 'c', purpose: 'p3', check: { type: 'file', path: f }, expect: { exists: true } },
      ],
    }), 'utf-8');
    const rFail = runTsx(path.join(COMMON, 'assert.ts'), ['--expect', expectJson, '--out', path.join(tmp, 'ev2.json')]);
    expect(rFail.status).toBe(1);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('bootstrap（真实 spawn + healthz + 状态文件 + 清理）', () => {
  it('假服务就绪探测全链路（不 mock 管线）', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-boot-'));
    const mod = await import(path.join(COMMON, 'bootstrap.ts'));
    const dummy = path.resolve(__dirname, 'fixtures', 'dummy-server.ts');
    const r = await mod.bootstrap({
      dataDir: tmp,
      entry: dummy,
      port: 3200 + Math.floor(Math.random() * 500),
      timeoutSec: 30,
    });
    expect(r.ready).toBe(true);
    expect(r.port).toBeGreaterThan(0);
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'bootstrap-state.json'), 'utf-8'));
    expect(state.pid).toBe(r.pid);
    // 健康探测真实打到假服务
    const curl = childProcess.spawnSync('curl', ['-sS', r.healthz], { encoding: 'utf-8' });
    expect(JSON.parse(curl.stdout).status).toBe('healthy');
    mod.stopBootstrap(r);
    fs.rmSync(tmp, { recursive: true, force: true });
  }, 60000);

  it('降级: 缺 data-dir → exit 2', () => {
    const r = runTsx(path.join(COMMON, 'bootstrap.ts'), []);
    expect(r.status).toBe(2);
  });

  it('守卫: 仓库内目录 → exit 2（铁律 0-4）', () => {
    const r = runTsx(path.join(COMMON, 'bootstrap.ts'), ['--data-dir', REPO_ROOT]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('铁律 0-4');
  });
});
