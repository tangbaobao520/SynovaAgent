/**
 * tests/store/measurements.test.ts — 哨兵时序层 store API（append-only）
 *
 * 覆盖（铁律 48: 正常 / 降级 / 边界）:
 *   1. 正常: record → query 往返；latest 取最新
 *   2. 产品价值（Done ⑤）: 同 metric 两个 computed_at 可相减（"上月 3 → 本月 1"）
 *   3. 降级: diff 任一端缺失 → null（**不用 0 冒充"没有数据"**）
 *   4. 边界: 非法参数抛 TypeError；limit 生效；实体过滤
 *   5. append-only（Done ②）: 只 INSERT/SELECT —— 源码内 `UPDATE/DELETE measurements` 计数为 0
 *      （见同目录 measurements-append-only.test.ts 的静态断言）
 *   6. 口径漂移: 两端 defVersion 不同 → defVersionMatched=false（禁止把不同定义的值当"变化"直读）
 *
 * 铁律 33: 单元测试，全部 `:memory:` SQLite。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { reconcileSchema } from '../../src/store/schema-migration';
import {
  recordMeasurement,
  recordMeasurements,
  queryMeasurements,
  latestMeasurement,
  diffMeasurement,
  type MeasurementRecord,
} from '../../src/store/measurements';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  reconcileSchema(db); // 建 measurements 表（version 4）
  return db;
}

function rec(over: Partial<MeasurementRecord> = {}): MeasurementRecord {
  return {
    entityId: '',
    metricId: 'cash_runway_months',
    value: 3,
    computedAt: '2026-08-01T00:00:00Z',
    runId: 'run-1',
    source: 'sentinel',
    inputDigest: 'd1',
    defVersion: 'v1',
    ...over,
  };
}

describe('measurements store（append-only 时序层）', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  it('正常: record → query 往返（8 字段完整）', () => {
    recordMeasurement(db, rec());
    const rows = queryMeasurements(db, { metricId: 'cash_runway_months' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(rec());
  });

  it('正常: 多时点按 computed_at 升序；latest 取最新', () => {
    recordMeasurements(db, [
      rec({ computedAt: '2026-09-01T00:00:00Z', value: 1, runId: 'run-3' }),
      rec({ computedAt: '2026-08-01T00:00:00Z', value: 3, runId: 'run-1' }),
      rec({ computedAt: '2026-08-15T00:00:00Z', value: 2, runId: 'run-2' }),
    ]);
    const vals = queryMeasurements(db, { metricId: 'cash_runway_months' }).map((r) => r.value);
    expect(vals).toEqual([3, 2, 1]);

    const latest = latestMeasurement(db, '', 'cash_runway_months');
    expect(latest?.value).toBe(1);
    expect(latest?.computedAt).toBe('2026-09-01T00:00:00Z');
  });

  it('产品价值（Done ⑤）: 同 metric 两个 computed_at 相减 = 上月 3 → 本月 1', () => {
    recordMeasurements(db, [
      rec({ computedAt: '2026-08-01T00:00:00Z', value: 3, runId: 'r-aug' }),
      rec({ computedAt: '2026-09-01T00:00:00Z', value: 1, runId: 'r-sep' }),
    ]);
    const d = diffMeasurement(db, '', 'cash_runway_months', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');
    expect(d).not.toBeNull();
    expect(d?.from.value).toBe(3);
    expect(d?.to.value).toBe(1);
    expect(d?.delta).toBe(-2); // 跑道缩短 2 个月
    expect(d?.defVersionMatched).toBe(true);
  });

  it('降级: diff 任一端缺失 → null（不用 0 冒充"没有数据"）', () => {
    recordMeasurement(db, rec({ computedAt: '2026-09-01T00:00:00Z', value: 1 }));
    // from 端早于任何记录 → 无数据
    expect(diffMeasurement(db, '', 'cash_runway_months', '2026-01-01T00:00:00Z', '2026-09-01T00:00:00Z')).toBeNull();
    // 未记录过的 metric → 无数据
    expect(diffMeasurement(db, '', 'never_recorded', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')).toBeNull();
  });

  it('口径漂移: 两端 defVersion 不同 → defVersionMatched=false（delta 不可直读为"变化"）', () => {
    recordMeasurements(db, [
      rec({ computedAt: '2026-08-01T00:00:00Z', value: 3, defVersion: 'v1', runId: 'r1' }),
      rec({ computedAt: '2026-09-01T00:00:00Z', value: 1, defVersion: 'v2', runId: 'r2' }),
    ]);
    const d = diffMeasurement(db, '', 'cash_runway_months', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');
    expect(d?.defVersionMatched).toBe(false);
  });

  it('边界: 实体过滤与 limit 生效；limit 非法则抛 TypeError', () => {
    recordMeasurements(db, [
      rec({ entityId: 'e1', computedAt: '2026-09-01T00:00:00Z', value: 1 }),
      rec({ entityId: 'e2', computedAt: '2026-09-01T00:00:00Z', value: 2 }),
    ]);
    expect(queryMeasurements(db, { entityId: 'e1' })).toHaveLength(1);
    expect(queryMeasurements(db, { limit: 1 })).toHaveLength(1);
    expect(() => queryMeasurements(db, { limit: 0 })).toThrowError(TypeError);
    expect(() => queryMeasurements(db, { limit: 1.5 })).toThrowError(TypeError);
  });

  it('边界: 非法记录被拒绝（空 metricId / 非有限 value / 空 runId）', () => {
    expect(() => recordMeasurement(db, rec({ metricId: '' }))).toThrowError(TypeError);
    expect(() => recordMeasurement(db, rec({ value: Number.NaN }))).toThrowError(TypeError);
    expect(() => recordMeasurement(db, rec({ value: Number.POSITIVE_INFINITY }))).toThrowError(TypeError);
    expect(() => recordMeasurement(db, rec({ runId: '' }))).toThrowError(TypeError);
  });

  it('边界: 批量写入为单事务（全成功，条数正确）', () => {
    const n = recordMeasurements(db, [rec({ runId: 'a' }), rec({ runId: 'b' })]);
    expect(n).toBe(2);
    expect(queryMeasurements(db)).toHaveLength(2);
  });

  it('降级-fail-closed: 表缺失时抛错，而非返回空数组（防"查询失败被当成无数据"）', () => {
    const bare = new Database(':memory:');
    expect(() => queryMeasurements(bare, { metricId: 'x' })).toThrowError(/no such table/);
    bare.close();
  });
});
