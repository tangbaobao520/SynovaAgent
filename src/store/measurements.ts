/**
 * src/store/measurements.ts — 哨兵时序层 store API（append-only）
 *
 * 定位: L5 存储。`measurements` 表是**哨兵的时序记忆** —— 每次运行把「算出来的当前值」
 *       落一条不可变记录，从而让「同 metric 两个时点相减」成为可能
 *       （回答"上月 runway 3 个月、本月 1 个月"）。
 *
 * 表由 `src/store/migrations/003-measurements-table.ts` 建立（version 4）。
 * 本模块**只提供读写 API**，且**只有 INSERT 与 SELECT**（append-only，Done ②）。
 *
 * 契约（铁律 47）:
 *   @input  — `Database.Database`（better-sqlite3 实例；调用方负责其生命周期与迁移）
 *   @output — 见各函数 JSDoc
 *   @degraded — 本模块**不吞错**：SQL 失败即抛出（由调用方决定降级；哨兵侧的降级在 runner）。
 *               查询类函数在表缺失时抛错而非返回空数组 —— 空数组会被误读为"无数据"，
 *               与 P7 教训（"查询失败被当成无边"）同型，故显式 fail-closed。
 *   @error  — 表不存在 → 抛 `SqliteError`（提示先跑 reconcileSchema）；参数非法 → 抛 TypeError
 */
import type Database from 'better-sqlite3';

/** 一条测量记录（不可变；修正历史 = 追加新记录，而非改写旧记录） */
export interface MeasurementRecord {
  /** 实体标识（组织级指标用 `''`） */
  entityId: string;
  /** 指标标识（与哨兵 manifest 的 metric_id 同源） */
  metricId: string;
  /** 测量值（数值；口径由 defVersion 定义） */
  value: number;
  /** 计算时刻（ISO 8601 / SQLite datetime 字符串，调用方给定时点） */
  computedAt: string;
  /** 本次运行的标识（同一次 run 的多个 metric 共享） */
  runId: string;
  /** 数据来源标识（如 'sentinel' / 'diagnosis'） */
  source: string;
  /** 输入指纹（同一 metric 喂不同输入 → 不同 digest，便于追溯"这数是怎么来的"） */
  inputDigest: string;
  /** 计算定义版本（口径变更时递增，避免把不同定义的值直接相减） */
  defVersion: string;
}

/** 查询条件（全部可选；组合为 AND） */
export interface MeasurementQuery {
  entityId?: string;
  metricId?: string;
  /** 闭区间下界（含），按 `computed_at` 比较 */
  since?: string;
  /** 闭区间上界（含），按 `computed_at` 比较 */
  until?: string;
  /** 结果条数上限（> 0）；省略 = 不限制 */
  limit?: number;
}

/** 两个时点的差值结果（Done ⑤：同 metric 两个 computed_at 可相减） */
export interface MeasurementDiff {
  from: MeasurementRecord;
  to: MeasurementRecord;
  /** `to.value - from.value`（同 defVersion 才有直读意义，见 defVersionMatched） */
  delta: number;
  /** 两个时点的 `defVersion` 是否一致（不一致 ⇒ delta 仅供提示，不可直接当"变化"解读） */
  defVersionMatched: boolean;
}

const INSERT_SQL = `INSERT INTO measurements
  (entity_id, metric_id, value, computed_at, run_id, source, input_digest, def_version)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const SELECT_COLS = `entity_id AS entityId, metric_id AS metricId, value,
  computed_at AS computedAt, run_id AS runId, source,
  input_digest AS inputDigest, def_version AS defVersion`;

/** 写入一条测量记录（append-only；同主键重复写入 → 覆盖为同一内容，SQLite UPSERT 语义） */
export function recordMeasurement(db: Database.Database, rec: MeasurementRecord): void {
  if (!rec.metricId) throw new TypeError('recordMeasurement: metricId 不可为空');
  if (!Number.isFinite(rec.value)) throw new TypeError(`recordMeasurement: value 非有限数 (${rec.value})`);
  if (!rec.computedAt) throw new TypeError('recordMeasurement: computedAt 不可为空');
  if (!rec.runId) throw new TypeError('recordMeasurement: runId 不可为空');
  db.prepare(INSERT_SQL).run(
    rec.entityId,
    rec.metricId,
    rec.value,
    rec.computedAt,
    rec.runId,
    rec.source,
    rec.inputDigest,
    rec.defVersion,
  );
}

/**
 * 批量写入（单事务）。全成功或全回滚 —— 半批写入会让时序层出现"看起来完整实际缺条"的假象。
 * @returns 写入条数
 */
export function recordMeasurements(db: Database.Database, recs: MeasurementRecord[]): number {
  const tx = db.transaction((rows: MeasurementRecord[]): number => {
    for (const r of rows) recordMeasurement(db, r);
    return rows.length;
  });
  return tx(recs);
}

/** 按条件查询（按 `computed_at` 升序） */
export function queryMeasurements(db: Database.Database, q: MeasurementQuery = {}): MeasurementRecord[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.entityId !== undefined) { where.push('entity_id = ?'); params.push(q.entityId); }
  if (q.metricId !== undefined) { where.push('metric_id = ?'); params.push(q.metricId); }
  if (q.since !== undefined) { where.push('computed_at >= ?'); params.push(q.since); }
  if (q.until !== undefined) { where.push('computed_at <= ?'); params.push(q.until); }
  let sql = `SELECT ${SELECT_COLS} FROM measurements${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY computed_at ASC`;
  if (q.limit !== undefined) {
    if (!Number.isInteger(q.limit) || q.limit <= 0) throw new TypeError(`queryMeasurements: limit 须为正整数 (${q.limit})`);
    sql += ' LIMIT ?';
    params.push(q.limit);
  }
  return db.prepare(sql).all(...params) as MeasurementRecord[];
}

/** 取某 (entityId, metricId) 的最新一条；无记录 → null */
export function latestMeasurement(
  db: Database.Database,
  entityId: string,
  metricId: string,
): MeasurementRecord | null {
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM measurements WHERE entity_id = ? AND metric_id = ? ORDER BY computed_at DESC, run_id DESC LIMIT 1`)
    .all(entityId, metricId) as MeasurementRecord[];
  return rows[0] ?? null;
}

/**
 * 两个时点相减（Done ⑤ 的产品价值）。
 * @returns 两端任一缺失 → null（**不**用 0 冒充"没有数据"）；两端都在 → delta + defVersion 一致性标记
 */
export function diffMeasurement(
  db: Database.Database,
  entityId: string,
  metricId: string,
  fromAt: string,
  toAt: string,
): MeasurementDiff | null {
  const at = (t: string): MeasurementRecord | null => {
    const rows = db
      .prepare(
        `SELECT ${SELECT_COLS} FROM measurements
         WHERE entity_id = ? AND metric_id = ? AND computed_at <= ?
         ORDER BY computed_at DESC, run_id DESC LIMIT 1`,
      )
      .all(entityId, metricId, t) as MeasurementRecord[];
    return rows[0] ?? null;
  };
  const from = at(fromAt);
  const to = at(toAt);
  if (!from || !to) return null;
  return {
    from,
    to,
    delta: to.value - from.value,
    defVersionMatched: from.defVersion === to.defVersion,
  };
}
