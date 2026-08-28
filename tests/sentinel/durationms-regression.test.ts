/**
 * tests/sentinel/durationms-regression.test.ts — D546 durationMs duration 语义回归网（DS4）
 *
 * 背景: K3 §4.6 发现「durationMs 当 checkedAt 时间戳 → 恒 1970-01-01」——历史缺陷位于
 *   src/agent/sentinel-service.ts（L97 修复前形态），已随 D394 片1（a8a5857e）修复。
 *   派单所列 runner.ts 5 处 durationMs 候选经逐一实读均为正确 duration 语义（spec §7.1）。
 *   本文件不做任何"修复"，只建立回归网——防同类「数值当时间戳」缺陷无声复发。
 *
 * 契约（铁律 47）:
 *   @input  — SentinelRegistry（fixture 哨兵 + 真实内置适配器）+ SentinelRunner（executeSentinel
 *             生产路径）+ sentinel_events 事件流 + getSentinelFindings（L2 sentinel-service）
 *   @output — 4 用例断言:
 *             ① 真实 check durationMs ∈ (0, 60000]——生产路径用真实耗时覆盖哨兵内部值
 *                （runner L1080-1081: result.durationMs = Date.now() - startTime）
 *             ② checkedAt/detectedAt 为 ISO 8601 UTC 字符串且年份 ≥ 2026（纪元防护，
 *                run 结果面 + 事件 payload 面双查）
 *             ③ getSentinelFindings 输出 checkedAt 来源 = run.result.checkedAt
 *                （sentinel-service L97 现状锁定）
 *             ④ S-5 故障注入 red——历史缺陷形态 new Date(durationMs).toISOString()
 *                必须被纪元防护断言抓住（throw）
 *   @degraded — 无（纯测试文件；生产降级语义由 runner/sentinel-service 各自契约保证）
 *
 * red 语义（S-5 诚实 red）: 用例④以真实历史缺陷形态注入，断言必须红——证明网有效，禁伪造 red。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSentinelEventsTable, replaySentinelEvents } from '../../src/sentinel/sentinel-events';
import { SentinelRunner, setGlobalSentinelRunner } from '../../src/sentinel/runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { getSentinelFindings } from '../../src/agent/sentinel-service';
import { integrationHealthSentinel } from '../../src/sentinel/adapters/integration-health-sentinel';
import { CronScheduler } from '../../src/cron/scheduler';
import type { SentinelCheckResult, SentinelFinding } from '../../src/sentinel/types';

// ═══ 断言器（D546 spec §7.3.2 纪元防护） ═══

/** C6: payload/结果内时间戳字段 = ISO 8601 UTC 字符串 */
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/**
 * assertIsoUtcTimestamp — 纪元防护断言器。
 * 时间戳必须为 ISO 8601 UTC 字符串且年份 ≥ 2026。duration 值冒充的时间戳仍是合法 ISO
 * 字符串，唯有年份防护能抓住——两道检查缺一不可。违约 → throw（测试红 = 网有效）。
 */
function assertIsoUtcTimestamp(value: unknown, field: string): void {
  if (typeof value !== 'string' || !ISO_UTC_RE.test(value)) {
    throw new Error(
      `[纪元防护] ${field} 必须为 ISO 8601 UTC 字符串，实得 ${JSON.stringify(value) ?? String(value)}（${typeof value}）——数值型纪元值禁止充当时间戳`
    );
  }
  const year = new Date(value).getFullYear();
  if (!Number.isFinite(year) || year < 2026) {
    throw new Error(
      `[纪元防护] ${field} 年份 ${year} < 2026 —— duration/纪元值冒充时间戳（K3 §4.6「恒 1970」缺陷形态）`
    );
  }
}

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

// ═══ Fixtures ═══

const FIXED_CHECKED_AT = '2026-08-28T08:30:00.000Z';

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1',
    severity: 'warning',
    title: 'durationMs 回归测试发现',
    description: 'D546 DS4 fixture',
    evidence: [],
    suggestion: '建议',
    detectedAt: FIXED_CHECKED_AT,
    ...overrides,
  };
}

/**
 * registerDurationSentinel — 注册 fixture 哨兵: check 内含真实异步工作（6ms sleep），
 * 且返回**伪内部值 durationMs: 999999**——生产路径（executeSentinel L1080-1081）必须用
 * 真实耗时覆盖它。这使「覆盖语义」本身成为被测行为。
 */
function registerDurationSentinel(id: string): void {
  getSentinelRegistry().register({
    config: {
      id, name: 'duration 哨兵', description: 'D546 DS4 回归网', category: 'growth', priority: 'P1',
      mode: 'on-demand', version: '1', requiredDataSources: [],
    },
    async check(): Promise<SentinelCheckResult> {
      await sleep(6);
      return {
        sentinelId: id,
        ok: true,
        findings: [makeFinding({ id: `f-${id}` })],
        durationMs: 999999, // 哨兵内部值——若生产路径未覆盖，①断言必红
        checkedAt: new Date().toISOString(),
      };
    },
  });
}

// ═══ Setup ═══

let db: Database.Database;
let scheduler: CronScheduler;
let runner: SentinelRunner;

beforeEach(() => {
  db = new Database(':memory:');
  scheduler = new CronScheduler(db);
  runner = new SentinelRunner(scheduler, db);
  createSentinelEventsTable(db);
});

afterEach(() => {
  setGlobalSentinelRunner(null);
  destroySentinelRegistry();
  scheduler.stop();
  db.close();
});

// ═══ Tests ═══

describe('D546 DS4: durationMs duration 语义回归网', () => {
  it('① 真实 check 经 executeSentinel 生产路径 → durationMs ∈ (0, 60000]（真实耗时覆盖哨兵内部值 L1080-1081）', async () => {
    registerDurationSentinel('d546-duration');

    // 为真实内置适配器构造直连上下文: runner db 附带 queryNodes（executeSentinel 对带
    // queryNodes 的 db 走直连路径，不再包 SqliteGraphStore），integration-health 经
    // context.db.prepare 直查 SQLite。预置 2000 行 graph_nodes → 真实 check 执行真实的
    // 图查询 + 逐行 JSON 解析（毫秒级 CPU 工作），生产计时器测得确定的非零真实耗时。
    const graphAwareDb = db as unknown as { queryNodes: () => unknown[] };
    graphAwareDb.queryNodes = () => [];
    db.exec('CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, type TEXT, props TEXT)');
    const insertNode = db.prepare(`INSERT INTO graph_nodes (id, type, props) VALUES (?, 'TOOL', ?)`);
    for (let i = 0; i < 2000; i++) {
      insertNode.run(`tool-${i}`, JSON.stringify({
        name: `系统${i}`,
        mcpSupport: i % 3 === 0 ? 'native' : 'none',
        apiAccess: 'partial',
        connector: i % 2 === 0,
      }));
    }
    getSentinelRegistry().register(integrationHealthSentinel);

    const res = await runner.runOnce('d546-duration');
    expect(res).not.toBeNull();
    expect(res!.durationMs).toBeGreaterThan(0); // 合理正值（非 0——派单口径）
    expect(res!.durationMs).toBeLessThanOrEqual(60000); // 非纪元级巨数
    expect(res!.durationMs).not.toBe(999999); // 生产路径必须覆盖哨兵内部伪值

    const builtinRes = await runner.runOnce(integrationHealthSentinel.config.id);
    expect(builtinRes).not.toBeNull();
    expect(builtinRes!.durationMs).toBeGreaterThan(0);
    expect(builtinRes!.durationMs).toBeLessThanOrEqual(60000);
    expect(Number.isFinite(builtinRes!.durationMs)).toBe(true);

    // I2 一致性: 事件流 payload 的 durationMs 与生产结果一致（写路径不篡改 duration 语义）
    const rows = replaySentinelEvents(db);
    const runRow = rows.find(r => r.event_type === 'run_completed' && r.sentinel_id === 'd546-duration');
    expect(runRow).toBeDefined();
    const payload = runRow!.payload as { durationMs: unknown };
    expect(payload.durationMs).toBe(res!.durationMs);
  });

  it('② 纪元防护: checkedAt/detectedAt 为 ISO 8601 UTC 且年份 ≥ 2026（run 结果面 + 事件 payload 面双查）', async () => {
    registerDurationSentinel('d546-duration');
    const res = await runner.runOnce('d546-duration');
    expect(res).not.toBeNull();

    // run 结果面
    expect(res!.checkedAt).toMatch(ISO_UTC_RE);
    expect(new Date(res!.checkedAt).getFullYear()).toBeGreaterThanOrEqual(2026);
    assertIsoUtcTimestamp(res!.checkedAt, 'result.checkedAt');
    assertIsoUtcTimestamp(res!.findings[0].detectedAt, 'result.findings[0].detectedAt');

    // 事件流面（持久化 payload 不引入纪元值——K3 缺陷的落库形态）
    const rows = replaySentinelEvents(db);
    const runRow = rows.find(r => r.event_type === 'run_completed');
    const findingRow = rows.find(r => r.event_type === 'finding');
    expect(runRow).toBeDefined();
    expect(findingRow).toBeDefined();
    const runPayload = runRow!.payload as { checkedAt: unknown };
    const findingPayload = findingRow!.payload as { finding: SentinelFinding };
    assertIsoUtcTimestamp(runPayload.checkedAt, 'run_completed.payload.checkedAt');
    assertIsoUtcTimestamp(findingPayload.finding.detectedAt, 'finding.payload.finding.detectedAt');
  });

  it('③ 映射断言: getSentinelFindings 输出 checkedAt 来源 = run.result.checkedAt（sentinel-service L97 现状锁定）', async () => {
    getSentinelRegistry().register({
      config: {
        id: 'd546-mapping', name: '映射哨兵', description: '', category: 'growth', priority: 'P1',
        mode: 'on-demand', version: '1', requiredDataSources: [],
      },
      async check(): Promise<SentinelCheckResult> {
        return {
          sentinelId: 'd546-mapping',
          ok: true,
          findings: [makeFinding({ id: 'f-map' })],
          durationMs: 42, // 若回归为 new Date(durationMs).toISOString() → 1970 ≠ 固定值 → 下方断言红
          checkedAt: FIXED_CHECKED_AT,
        };
      },
    });

    const res = await runner.runOnce('d546-mapping');
    expect(res).not.toBeNull();
    expect(res!.checkedAt).toBe(FIXED_CHECKED_AT);

    setGlobalSentinelRunner(runner);
    const findings = getSentinelFindings();
    expect(findings.ok).toBe(true);
    const mapped = findings.findings.filter(f => f.sentinelId === 'd546-mapping');
    expect(mapped.length).toBeGreaterThan(0);
    for (const f of mapped) {
      // 来源锁定: 输出 checkedAt === run.result.checkedAt（L97 现状）
      expect(f.checkedAt).toBe(FIXED_CHECKED_AT);
      assertIsoUtcTimestamp(f.checkedAt, 'getSentinelFindings[].checkedAt');
    }
  });

  it('④ S-5 故障注入 red: 历史缺陷形态 new Date(durationMs).toISOString() → 纪元防护必须 throw', () => {
    // 历史缺陷形态（K3 §4.6 原文）: checkedAt = new Date(run.result.durationMs).toISOString()
    const defective = new Date(42).toISOString(); // '1970-01-01T00:00:00.042Z'
    expect(defective).toMatch(ISO_UTC_RE); // 违约值本身合法 ISO——证明网抓的是纪元年份，不是格式
    expect(defective.startsWith('1970-01-01')).toBe(true);
    expect(() => assertIsoUtcTimestamp(defective, 'checkedAt')).toThrow(/年份 1970/);

    // 数值型纪元变体（C6: 禁止数值型纪元值）
    expect(() => assertIsoUtcTimestamp(42, 'checkedAt')).toThrow(/ISO 8601/);
    expect(() => assertIsoUtcTimestamp(null, 'checkedAt')).toThrow(/ISO 8601/);

    // 负对照: 合法当前时间不触发防护（网不过度开火，防告警疲劳）
    expect(() => assertIsoUtcTimestamp(new Date().toISOString(), 'checkedAt')).not.toThrow();
  });
});
