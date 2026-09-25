/**
 * src/store/migrations/003-measurements-table.ts — 哨兵时序层 `measurements` 建表
 *
 * 背景（D967 ①）: 哨兵每次运行只产出「当前值」，基线比较缺**时序** ⇒ 无法回答
 * "上月 runway 3 个月、本月 1 个月"这类问题。本迁移建立 append-only 的测量记录表。
 *
 * 契约（铁律 47）:
 *   @input  — better-sqlite3 Database 实例
 *   @output — void；成功后存在 `measurements` 表（8 列 + 主键 + 1 索引），
 *             且 `idx_measurements_entity_metric_time` 可用于「同 metric 两个时点相减」
 *   @degraded — 无（表已存在 → `CREATE TABLE IF NOT EXISTS` 幂等 no-op；
 *               索引已存在 → `CREATE INDEX IF NOT EXISTS` 幂等 no-op）
 *   @error  — 任一步 SQL 失败 → 抛错（fail-closed，迁移失败必须阻止启动）
 *
 * 表设计要点:
 *   - **append-only**（Done ②）: 不设 UPDATE/DELETE 路径，也不建 `updated_at`；
 *     修正历史错误 = 追加一条新记录（`run_id` + `computed_at` 提供追溯）。
 *   - `run_id` / `input_digest` / `def_version` 三列是**可追溯性的三要素**：
 *     哪一次运行（run_id）、喂了什么输入（input_digest）、按哪个定义版本算的（def_version）。
 *   - `entity_id` 允许 ''（组织级指标无实体），故不给 NOT NULL 以外语义约束。
 */
import type Database from 'better-sqlite3';
import type { Migration } from '../schema-migration';

/** canonical measurements DDL（单处定义；测试夹具复用同一常量避免漂移） */
export const MEASUREMENTS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS measurements (
  entity_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  value REAL NOT NULL,
  computed_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  def_version TEXT NOT NULL,
  PRIMARY KEY (entity_id, metric_id, computed_at, run_id)
)`;

/** 时序索引：支撑「同 metric 两个 computed_at 相减」与「取最新一条」 */
export const MEASUREMENTS_INDEX_DDL =
  `CREATE INDEX IF NOT EXISTS idx_measurements_entity_metric_time ON measurements(entity_id, metric_id, computed_at)`;

export const measurementsTableMigration: Migration = {
  version: 4,
  name: 'measurements-table',
  up: (db: Database.Database): void => {
    db.exec(MEASUREMENTS_TABLE_DDL);
    db.exec(MEASUREMENTS_INDEX_DDL);
  },
};
