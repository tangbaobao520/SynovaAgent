/**
 * tests/store/migrations/003-measurements-table.test.ts — measurements 建表迁移
 *
 * 覆盖（铁律 48: 正常 / 降级 / 边界）:
 *   1. 正常: reconcileSchema → measurements 表存在，8 列齐全且类型/约束符合契约
 *   2. 正常: 时序索引 `idx_measurements_entity_metric_time` 存在且列序正确
 *   3. 幂等: 连续两次 reconcileSchema 不报错、表与索引不重复
 *   4. 边界: 迁移的 DDL 常量可直接用于独立建表（无隐式依赖）
 *   5. 边界: 复合主键允许"同 metric 同 run 不同时点"与"同 metric 同时点不同 run"共存
 *   6. 降级: 无（本迁移不吞错 —— 失败即抛，见 schema-migration 的 fail-closed）
 *
 * 铁律 33: 单元测试，`:memory:` SQLite。
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { reconcileSchema, SCHEMA_VERSION } from '../../../src/store/schema-migration';
import {
  measurementsTableMigration,
  MEASUREMENTS_TABLE_DDL,
  MEASUREMENTS_INDEX_DDL,
} from '../../../src/store/migrations/003-measurements-table';

const REQUIRED_COLUMNS: Array<{ name: string; notnull: number }> = [
  { name: 'entity_id', notnull: 1 },
  { name: 'metric_id', notnull: 1 },
  { name: 'value', notnull: 1 },
  { name: 'computed_at', notnull: 1 },
  { name: 'run_id', notnull: 1 },
  { name: 'source', notnull: 1 },
  { name: 'input_digest', notnull: 1 },
  { name: 'def_version', notnull: 1 },
];

describe('003 measurements 建表迁移', () => {
  it('正常: reconcileSchema 后 8 列齐全且 NOT NULL 契约成立', () => {
    const db = new Database(':memory:');
    reconcileSchema(db);

    const cols = db.pragma('table_info(measurements)') as Array<{ name: string; notnull: number }>;
    expect(cols).toHaveLength(8);
    for (const want of REQUIRED_COLUMNS) {
      const got = cols.find((c) => c.name === want.name);
      expect(got, `缺列 ${want.name}`).toBeDefined();
      expect(got?.notnull, `${want.name} 应为 NOT NULL`).toBe(want.notnull);
    }
    db.close();
  });

  it('正常: 时序索引存在且列序 = (entity_id, metric_id, computed_at)', () => {
    const db = new Database(':memory:');
    reconcileSchema(db);

    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_measurements_entity_metric_time'")
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe('idx_measurements_entity_metric_time');

    const info = db.pragma('index_info(idx_measurements_entity_metric_time)') as Array<{ seqno: number; name: string }>;
    expect(info.sort((a, b) => a.seqno - b.seqno).map((i) => i.name)).toEqual([
      'entity_id',
      'metric_id',
      'computed_at',
    ]);
    db.close();
  });

  it('幂等: 两次 reconcileSchema 不报错，列数与显式索引数不增长', () => {
    const db = new Database(':memory:');
    reconcileSchema(db);
    expect(() => reconcileSchema(db)).not.toThrow();

    const cols = db.pragma('table_info(measurements)') as unknown[];
    // 只数**显式**索引：复合主键会另生成 sqlite_autoindex_measurements_1（隐式，不算重复建索引）
    const idx = db
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND tbl_name='measurements' AND name NOT LIKE 'sqlite_autoindex%'",
      )
      .get() as { n: number };
    expect(cols).toHaveLength(8);
    expect(idx.n).toBe(1);
    db.close();
  });

  it('边界: 迁移 DDL 常量可独立建表（无隐式依赖）', () => {
    const db = new Database(':memory:');
    db.exec(MEASUREMENTS_TABLE_DDL);
    db.exec(MEASUREMENTS_INDEX_DDL);
    const cols = db.pragma('table_info(measurements)') as unknown[];
    expect(cols).toHaveLength(8);
    db.close();
  });

  it('边界: 复合主键语义 —— 同 metric 不同时点 / 同时点不同 run 均可共存', () => {
    const db = new Database(':memory:');
    reconcileSchema(db);
    const ins = db.prepare(
      `INSERT INTO measurements (entity_id, metric_id, value, computed_at, run_id, source, input_digest, def_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    ins.run('', 'runway', 3, '2026-08-01', 'r1', 'sentinel', 'd1', 'v1');
    ins.run('', 'runway', 1, '2026-09-01', 'r2', 'sentinel', 'd2', 'v1'); // 不同时点
    ins.run('', 'runway', 1, '2026-09-01', 'r3', 'sentinel', 'd3', 'v1'); // 同时点不同 run
    const n = db.prepare('SELECT COUNT(*) AS n FROM measurements').get() as { n: number };
    expect(n.n).toBe(3);

    // 主键完全相同的重复写 → 冲突（append-only 表不接受同 run 同刻重复）
    expect(() => ins.run('', 'runway', 3, '2026-08-01', 'r1', 'sentinel', 'd1', 'v1')).toThrow();
    db.close();
  });

  it('契约: 迁移版本号 == SCHEMA_VERSION（本迁移是当前最高版本）', () => {
    expect(measurementsTableMigration.version).toBe(SCHEMA_VERSION);
    expect(measurementsTableMigration.name).toBe('measurements-table');
    expect(typeof measurementsTableMigration.up).toBe('function');
  });
});
