/**
 * tests/sentinel/d751-new-sentinel-e2e.test.ts — D751「新增生效」端到端硬断言
 *
 * 派单 §一: 我们宣称「文件驱动：加一个哨兵就生效」，但没有任何断言证明
 *   「新增 → 被发现 → 被路由 → 进派发」。本测试用夹具哨兵（= 新增的一个哨兵）
 *   在**真实管线**上断言三环（铁律 12: 不 mock 加载/聚合/派发管线）：
 *     环 1  发现: loadSentinels() 扫描到夹具（SENTINELS_FIXTURE_DIR 注入缝指向夹具根）
 *     环 2  路由: aggregateSignals() 聚合后 recommendedExperts 含 manifest.expert
 *                （D750 manifest 权威 expert 通道）
 *     环 3  派发: 全公开管线 runner.runOnce()（真实执行 check 产 finding）→
 *                runner.aggregateAndDispatch()（真实聚合+派发）→ runExpert 被调用 +
 *                报告入 getExpertReports()（结果可见，铁律 4/5）
 *
 * 夹具防假绿设计: manifest.expert = fundamental-efficiency（资金效率）与
 *   layer = technology（LAYER_EXPERTS 映射 → technology-foundation）**分属不同问题域**，
 *   断言命中只能是 manifest 声明通道，不能是 layer 默认映射的巧合。
 *   反向验证（派单硬要求，手动流程）: 删夹具 manifest.expert → expertOf 未命中 →
 *   fallback inferCategory('sentinel-e2e-fixture-01') → health → ['technology-foundation']
 *   → 环 2/环 3 必红（证明断言真在读声明，非空跑）。
 *
 * mock 边界（仅 LLM 侧，非管线）: expert-dispatcher.runExpert（记录调用）+
 *   expert-registry.listTypes（VALID_EXPERTS 过滤白名单）。
 * 铁律 48: 正常路径（三环）+ 降级路径（fixture check 无 store → degraded）+
 *   边界（注册 id 拼接契约 sentinel- + name）。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CronScheduler } from '../../src/cron/scheduler';

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'd751-sentinel-root');
const FIXTURE_SENTINEL_ID = 'sentinel-e2e-fixture-01'; // = manifest.id = 'sentinel-' + manifest.name
const FIXTURE_EXPERT = 'fundamental-efficiency'; // manifest.expert（与 layer 域不同，防巧合）

// ═══ mock 边界（仅 LLM 侧）═══

/** 记录派发目标专家（环 3 证据） */
const runExpertCalls: string[] = [];

vi.mock('../../src/l3/expert-dispatcher', () => ({
  getGlobalExpertDispatcher: () => ({
    runExpert: async (expertType: string) => {
      runExpertCalls.push(expertType);
      return { summary: `fixture report by ${expertType}`, suggestedActions: ['act'] };
    },
  }),
}));

vi.mock('../../src/l3/expert-registry', () => ({
  getExpertRegistry: () => ({
    listTypes: () => ['technology-foundation', 'fundamental-efficiency', 'competitive-strategy', 'organizational-capability', 'host'],
  }),
}));

// ═══ 真实管线 import（env 在 beforeAll 设——扫描根惰性求值，见注入缝）═══

import { loadSentinels, clearSentinelCache, registerLoadedSentinels } from '../../src/sentinel/sentinel-loader';
import { aggregateSignals } from '../../src/sentinel/signal-aggregator';
import { SentinelRunner } from '../../src/sentinel/runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import type { SentinelCheckResult, SentinelFinding } from '../../src/sentinel/types';

/** 构造夹具哨兵的一次运行结果（sentinelId 对齐生产格式 'sentinel-' + manifest.name） */
function mkFixtureResult(severity: SentinelFinding['severity'] = 'critical'): SentinelCheckResult {
  const finding: SentinelFinding = {
    id: 'f_d751_fixture',
    severity,
    title: 'E2E夹具信号: 新增哨兵生效检查',
    description: 'D751 端到端断言夹具 finding',
    evidence: ['source=D751_FIXTURE'],
    suggestion: 'n/a',
    detectedAt: new Date().toISOString(),
  };
  return { sentinelId: FIXTURE_SENTINEL_ID, ok: true, findings: [finding], durationMs: 1, checkedAt: new Date().toISOString() };
}

/** 工单/去重表 DDL（与 runner.start() 相同——测试自建，不触发 cron 副作用） */
const TICKET_DDL = `CREATE TABLE IF NOT EXISTS sentinel_tickets (
  id TEXT PRIMARY KEY, signal_id TEXT NOT NULL, severity TEXT NOT NULL, expert_type TEXT NOT NULL,
  diagnosis TEXT, suggested_actions TEXT, status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT
)`;

/** 结构子集 fake scheduler（本测试不触达 cron；直接 as 具体类型，铁律 38 非 any/unknown 链） */
function mkFakeScheduler(): CronScheduler {
  return { schedule: () => {}, remove: () => {}, listJobs: () => [] } as CronScheduler;
}

beforeAll(() => {
  // 注入缝: 扫描根指向夹具目录（生产路径 = extensions/sentinels，不受影响）
  process.env.SENTINELS_FIXTURE_DIR = FIXTURE_ROOT;
  clearSentinelCache();
  destroySentinelRegistry();
});

afterAll(() => {
  delete process.env.SENTINELS_FIXTURE_DIR;
  clearSentinelCache();
  destroySentinelRegistry();
});

describe('D751 「新增生效」端到端硬断言（真实管线三环）', () => {
  it('环 1 — 发现: loadSentinels() 扫描到新增夹具哨兵', () => {
    const { sentinels, errors } = loadSentinels();
    expect(errors).toEqual([]);
    const found = sentinels.find(s => s.manifest.name === 'e2e-fixture-01');
    expect(found).toBeDefined();
    // 夹具声明被原样读出（断言在读 manifest 声明，非空跑）
    expect(found?.manifest.expert).toBe(FIXTURE_EXPERT);
  });

  it('环 1.5 — 边界: registerLoadedSentinels 注册 id 拼接契约（sentinel- + name）', async () => {
    const { registered, errors } = await registerLoadedSentinels();
    expect(registered).toBe(1);
    expect(errors).toEqual([]);
    const registry = getSentinelRegistry();
    expect(registry.get(FIXTURE_SENTINEL_ID)).toBeDefined();
  });

  it('环 2 — 路由: 聚合信号 recommendedExperts 含 manifest.expert（D750 权威通道）', () => {
    const { signals } = aggregateSignals([mkFixtureResult('critical')]);
    expect(signals.length).toBeGreaterThan(0);
    const exps = signals[0].recommendedExperts;
    // manifest.expert 必须出现——夹具 layer(technology) 映射的是 technology-foundation，
    // 命中 fundamental-efficiency 只能来自 manifest 声明通道（防 layer 巧合假绿）
    expect(exps).toContain(FIXTURE_EXPERT);
  });

  it('环 3 — 派发（全公开管线）: runOnce 真实 check → aggregateAndDispatch → runExpert + 报告可见', async () => {
    const db = new Database(':memory:');
    db.exec(TICKET_DDL);
    const runner = new SentinelRunner(mkFakeScheduler(), db);
    try {
      // 3a: 真实执行夹具 check（executeSentinel 构造 ctx → fixture check 产 critical finding）
      const result = await runner.runOnce(FIXTURE_SENTINEL_ID);
      expect(result).not.toBeNull();
      expect(result?.ok).toBe(true);
      expect(result?.findings.some(f => f.id === 'f_d751_fixture_01')).toBe(true);

      // 3b: 真实聚合 + 派发（aggregateAndDispatch → dispatchSignalsToExperts → runExpert）
      await runner.aggregateAndDispatch();

      // 派发证据 1: runExpert 收到 manifest.expert（critical 交叉验证 → targetExperts 并集含它）
      expect(runExpertCalls).toContain(FIXTURE_EXPERT);
      // 派发证据 2: 报告入内存报告池（结果可见，铁律 4/5）
      const reports = runner.getExpertReports();
      expect(reports.some(r => r.expertType === FIXTURE_EXPERT)).toBe(true);
    } finally {
      db.close();
    }
  });

  it('降级路径 — 夹具 check 无可用 store → 返回 degraded（铁律 24/31，不静默）', async () => {
    const { e2eFixtureSentinel } = await import('./fixtures/d751-sentinel-root/sentinel-e2e-fixture-01/aggregate');
    const raw = await e2eFixtureSentinel.check({}, 'default');
    expect(Array.isArray(raw)).toBe(false);
    const degraded = raw as { findings: SentinelFinding[]; degraded: boolean };
    expect(degraded.degraded).toBe(true);
    expect(degraded.findings).toEqual([]);
  });
});
