/**
 * tests/sentinel/measurements-wiring.test.ts — D967 ③/⑤ 跨 PR 联合验收
 *
 * **依赖声明（栈式）**：本测试断言「跑一次哨兵 ⇒ measurements 有行」，而 `measurements`
 * 表与 store API 由 **PR-A**（`feat/D967a-measurements-store`）交付。**PR-A 未合时本测试必红**
 * —— 这正是栈式两支的联合验收点，不是缺陷（PR-B 的 base = PR-A）。
 *
 * 覆盖（铁律 48: 正常 / 降级 / 边界）:
 *   1. 正常: `runner.runOnce(sentinelId)` → measurements 出现该哨兵的 3 个 metric 行
 *   2. 正常: 行内容与本次 findings 一致（finding/critical/warning 三类计数）
 *   3. 产品价值（Done ⑤）: 两次运行 ⇒ 同 metric 两个 computed_at 可相减
 *   4. 边界: 零 finding 的运行也落盘（value=0 是"测到 0"，不是"没测"）
 *   5. 判别性: 若把 runner 里的 recordMeasurements 撤掉 → 1/2/3/4 全红
 *
 * 铁律 33: 单元测试（`:memory:` SQLite）；Done ⑦: **不触碰 `data/synova.db`**。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CronScheduler } from '../../src/cron/scheduler';
import { SentinelRunner, setGlobalSentinelRunner } from '../../src/sentinel/runner';
import { destroySentinelRegistry, getSentinelRegistry } from '../../src/sentinel/registry';
import { createSentinelEventsTable } from '../../src/sentinel/sentinel-events';
import { reconcileSchema } from '../../src/store/schema-migration';
import { queryMeasurements, diffMeasurement } from '../../src/store/measurements';
import type { SentinelCheckResult, SentinelFinding } from '../../src/sentinel/types';

const SID = 'd967b-probe';

/** 由测试控制的 findings 数量（用于验证三类计数与"零 finding 也落盘"） */
let nextFindings: SentinelFinding[] = [];

function finding(i: number, severity: 'critical' | 'warning'): SentinelFinding {
  return {
    id: `f${i}`,
    severity,
    title: `t${i}`,
    description: `d${i}`,
    evidence: [],
    detectedAt: new Date().toISOString(),
  };
}

function registerProbeSentinel(): void {
  getSentinelRegistry().register({
    config: {
      id: SID,
      name: 'D967b 探针哨兵',
      description: 'measurements 接线验收探针',
      category: 'growth',
      priority: 'P1',
      mode: 'on-demand',
      version: '1',
      requiredDataSources: [],
    },
    async check(): Promise<SentinelCheckResult> {
      return {
        sentinelId: SID,
        ok: true,
        findings: nextFindings,
        durationMs: 1,
        checkedAt: new Date().toISOString(),
      };
    },
  });
}

let db: Database.Database;
let scheduler: CronScheduler;
let runner: SentinelRunner;

beforeEach(() => {
  db = new Database(':memory:');
  // 生产启动路径：SqliteGraphStore 构造器会调 reconcileSchema（此处显式调用以镜像之）
  reconcileSchema(db);
  scheduler = new CronScheduler(db);
  runner = new SentinelRunner(scheduler, db);
  createSentinelEventsTable(db);
  destroySentinelRegistry();
  registerProbeSentinel();
});

afterEach(() => {
  setGlobalSentinelRunner(null);
  destroySentinelRegistry();
  scheduler.stop();
  db.close();
  nextFindings = [];
});

describe('D967 ③/⑤ — runner 接线 measurements（跨 PR 联合验收）', () => {
  it('① 跑一次哨兵 → measurements 出现该哨兵的 3 个 metric 行', async () => {
    nextFindings = [finding(1, 'critical'), finding(2, 'warning'), finding(3, 'warning')];

    const res = await runner.runOnce(SID);
    expect(res).not.toBeNull();

    const rows = queryMeasurements(db, { metricId: `${SID}:finding_count` });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('sentinel');
    expect(typeof rows[0].inputDigest).toBe('string');
    expect(rows[0].defVersion).toBe('sentinel-counters/v1');

    const metrics = queryMeasurements(db).map((r) => r.metricId).sort();
    expect(metrics).toEqual([`${SID}:critical_count`, `${SID}:finding_count`, `${SID}:warning_count`]);
  });

  it('② 行内容与 findings 一致（finding/critical/warning 三类计数）', async () => {
    nextFindings = [finding(1, 'critical'), finding(2, 'warning'), finding(3, 'warning')];
    await runner.runOnce(SID);

    const val = (m: string): number => queryMeasurements(db, { metricId: `${SID}:${m}` })[0].value;
    expect(val('finding_count')).toBe(3);
    expect(val('critical_count')).toBe(1);
    expect(val('warning_count')).toBe(2);
  });

  it('③ 产品价值: 两次运行 ⇒ 同 metric 两个 computed_at 可相减', async () => {
    nextFindings = [finding(1, 'warning')];
    await runner.runOnce(SID);
    const t1 = queryMeasurements(db, { metricId: `${SID}:finding_count` })[0].computedAt;

    await new Promise((r) => setTimeout(r, 8)); // 保证 computedAt 不同（毫秒精度）
    nextFindings = [finding(1, 'warning'), finding(2, 'warning'), finding(3, 'warning')];
    await runner.runOnce(SID);

    const series = queryMeasurements(db, { metricId: `${SID}:finding_count` });
    expect(series.length).toBeGreaterThanOrEqual(2);

    const t2 = series[series.length - 1].computedAt;
    const d = diffMeasurement(db, '', `${SID}:finding_count`, t1, t2);
    expect(d).not.toBeNull();
    expect(d?.delta).toBe(2); // 1 → 3
    expect(d?.defVersionMatched).toBe(true);
  });

  it('④ 边界: 零 finding 的运行也落盘（0 = "测到 0"，不是"没测"）', async () => {
    nextFindings = [];
    await runner.runOnce(SID);

    const rows = queryMeasurements(db, { metricId: `${SID}:finding_count` });
    // 关键判别：**有行**且值为 0 —— 而不是"无行"（后者会让"没跑"与"跑出 0"不可区分）
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(0);
    expect(queryMeasurements(db, { metricId: `${SID}:critical_count` })[0].value).toBe(0);
  });

  it('⑤ 时序落盘失败不阻断运行结果（铁律 31: 降级可观测且不阻断）', async () => {
    // 撤掉 measurements 表 → 落盘必失败 → 但 runOnce 仍须正常返回结果
    db.exec('DROP TABLE measurements');
    nextFindings = [finding(1, 'warning')];

    const res = await runner.runOnce(SID);

    expect(res).not.toBeNull();
    expect(res?.ok).toBe(true);
    expect(res?.findings).toHaveLength(1); // 运行结果不受时序落盘失败影响
  });
});
