/**
 * diagnosis/persistence.ts — SQLite 持久化层
 *
 * 在现有内存 Map 基础上追加持久化写入，进程重启后从 SQLite 恢复到内存。
 * 写入：内存 Map + SQLite 双写（SQLite 写入失败不阻塞内存操作）
 * 读取：从内存 Map 读取（SQLite 仅用于启动恢复）
 *
 * 通过 EngineContext.database.getDb() 获取 SQLite 实例。
 * 数据库未注入时降级为纯内存模式。
 */

import { getEngineContext } from '../../engine-context';
import type { GapSnapshot, GapDimension, SelfAssessmentRecord, FinancialBaseline } from './types';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/diagnosis/persistence');

// ====================================================================
// DB access helper
// ====================================================================

function getDb(): any | null {
  try {
    return getEngineContext().database.getDb();
  } catch {
    log.debug('[diagnosis/persistence] database not available via engine context, falling back to memory-only mode');
    return null;
  }
}

// ====================================================================
// Snapshots (gap-recorder)
// ====================================================================

export function saveSnapshot(snapshot: GapSnapshot): void {
  const db = getDb();
  if (!db) return;

  try {
    db.prepare(`
      INSERT INTO diagnosis_snapshots (team_id, snapshot_json, created_at)
      VALUES (?, ?, ?)
    `).run(snapshot.teamId, JSON.stringify(snapshot), new Date().toISOString());
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId: snapshot.teamId },
      '[diagnosis/persistence] 保存快照失败，继续使用内存存储');
  }
}

export function loadTimeline(teamId: string): GapSnapshot[] {
  const db = getDb();
  if (!db) return [];

  const log = getEngineContext().logger;
  const snapshots: GapSnapshot[] = [];

  try {
    const rows = db.prepare(`
      SELECT snapshot_json, rowid FROM diagnosis_snapshots
      WHERE team_id = ?
      ORDER BY created_at ASC
    `).all(teamId) as Array<{ snapshot_json: string; rowid: number }>;

    for (const row of rows) {
      try {
        snapshots.push(JSON.parse(row.snapshot_json) as GapSnapshot);
      } catch (parseErr) {
        log.warn({ parseErr, teamId, rowid: row.rowid },
          '[diagnosis/persistence] 跳过损坏的快照行');
      }
    }
  } catch (err) {
    log.warn({ err, teamId },
      '[diagnosis/persistence] 加载快照失败');
    return [];
  }
  return snapshots;
}

export function loadAllTimelines(): Map<string, GapSnapshot[]> {
  const db = getDb();
  if (!db) return new Map();

  const log = getEngineContext().logger;
  const timelines = new Map<string, GapSnapshot[]>();
  let badRows = 0;
  try {
    const rows = db.prepare(`
      SELECT team_id, snapshot_json, rowid FROM diagnosis_snapshots
      ORDER BY created_at ASC
    `).all() as Array<{ team_id: string; snapshot_json: string; rowid: number }>;

    for (const row of rows) {
      try {
        const snapshots = timelines.get(row.team_id) ?? [];
        snapshots.push(JSON.parse(row.snapshot_json) as GapSnapshot);
        timelines.set(row.team_id, snapshots);
      } catch (parseErr) {
        badRows++;
        log.warn({ parseErr, teamId: row.team_id, rowid: row.rowid },
          '[diagnosis/persistence] 跳过损坏的快照行');
      }
    }
  } catch (err) {
    log.warn({ err },
      '[diagnosis/persistence] 加载全部快照失败');
  }
  if (badRows > 0) {
    log.warn({ badRows, totalTeams: timelines.size },
      '[diagnosis/persistence] 部分快照行损坏已跳过');
  }
  return timelines;
}

// ====================================================================
// Attention logs (attention-allocator)
// ====================================================================

export function saveAttentionLog(
  teamId: string,
  logType: string,
  key: string,
  count: number,
): void {
  const db = getDb();
  if (!db) return;

  try {
    db.prepare(`
      INSERT INTO diagnosis_attention_logs (team_id, log_type, key, count, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(team_id, log_type, key) DO UPDATE SET
        count = excluded.count,
        updated_at = excluded.updated_at
    `).run(teamId, logType, key, count, new Date().toISOString());
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId, logType, key },
      '[diagnosis/persistence] 保存注意力日志失败');
  }
}

export function loadAttentionLogs(teamId: string): {
  topicLogs: Map<string, number>;
  decisionLogs: Map<string, number>;
  interactionCounts: { ops: number; innovation: number };
  agentConsumption: Map<string, number>;
} {
  const db = getDb();
  const empty = {
    topicLogs: new Map<string, number>(),
    decisionLogs: new Map<string, number>(),
    interactionCounts: { ops: 0, innovation: 0 },
    agentConsumption: new Map<string, number>(),
  };
  if (!db) return empty;

  try {
    const rows = db.prepare(`
      SELECT log_type, key, count FROM diagnosis_attention_logs
      WHERE team_id = ?
    `).all(teamId) as Array<{ log_type: string; key: string; count: number }>;

    for (const row of rows) {
      switch (row.log_type) {
        case 'topic':
          empty.topicLogs.set(row.key, row.count);
          break;
        case 'decision':
          empty.decisionLogs.set(row.key, row.count);
          break;
        case 'interaction_ops':
          empty.interactionCounts.ops += row.count;
          break;
        case 'interaction_innovation':
          empty.interactionCounts.innovation += row.count;
          break;
        case 'agent_consumption':
          empty.agentConsumption.set(row.key, row.count);
          break;
      }
    }
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/persistence] 加载注意力日志失败');
  }
  return empty;
}

// ====================================================================
// Identity data (identity-extractor)
// ====================================================================

export function saveIdentityData(teamId: string, sentences: string[]): void {
  const db = getDb();
  if (!db) return;

  try {
    db.prepare(`
      INSERT INTO diagnosis_identity_data (team_id, sentences_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(team_id) DO UPDATE SET
        sentences_json = excluded.sentences_json,
        updated_at = excluded.updated_at
    `).run(teamId, JSON.stringify(sentences), new Date().toISOString());
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/persistence] 保存身份数据失败');
  }
}

export function loadIdentityData(teamId: string): string[] {
  const db = getDb();
  if (!db) return [];

  try {
    const row = db.prepare(`
      SELECT sentences_json FROM diagnosis_identity_data
      WHERE team_id = ?
    `).get(teamId) as { sentences_json: string } | undefined;

    if (row) {
      return JSON.parse(row.sentences_json) as string[];
    }
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/persistence] 加载身份数据失败');
  }
  return [];
}

// ====================================================================
// Self-assessments (self-awareness)
// ====================================================================

export function saveSelfAssessment(record: SelfAssessmentRecord): void {
  const db = getDb();
  if (!db) return;

  try {
    db.prepare(`
      INSERT INTO diagnosis_self_assessments (team_id, dimension, score, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(record.teamId, record.dimension, record.score, record.recordedAt);
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId: record.teamId },
      '[diagnosis/persistence] 保存自评数据失败');
  }
}

export function loadSelfAssessments(teamId: string): SelfAssessmentRecord[] {
  const db = getDb();
  if (!db) return [];

  try {
    const rows = db.prepare(`
      SELECT team_id, dimension, score, recorded_at FROM diagnosis_self_assessments
      WHERE team_id = ?
      ORDER BY recorded_at ASC
    `).all(teamId) as Array<{
      team_id: string;
      dimension: string;
      score: number;
      recorded_at: string;
    }>;

    return rows.map(r => ({
      teamId: r.team_id,
      dimension: r.dimension as GapDimension,
      score: r.score,
      recordedAt: r.recorded_at,
    }));
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/persistence] 加载自评数据失败');
    return [];
  }
}

// ====================================================================
// Financial baselines (financial-impact)
// ====================================================================

export function saveFinancialBaselineToDb(teamId: string, baseline: FinancialBaseline): void {
  const db = getDb();
  if (!db) return;

  try {
    db.prepare(`
      INSERT INTO diagnosis_financial_baselines (team_id, baseline_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(team_id) DO UPDATE SET
        baseline_json = excluded.baseline_json,
        updated_at = excluded.updated_at
    `).run(teamId, JSON.stringify(baseline), new Date().toISOString());
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/persistence] 保存财务基线失败');
  }
}

export function loadFinancialBaselineFromDb(teamId: string): FinancialBaseline | null {
  const db = getDb();
  if (!db) return null;

  try {
    const row = db.prepare(`
      SELECT baseline_json FROM diagnosis_financial_baselines
      WHERE team_id = ?
    `).get(teamId) as { baseline_json: string } | undefined;

    if (row) {
      return JSON.parse(row.baseline_json) as FinancialBaseline;
    }
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/persistence] 加载财务基线失败');
  }
  return null;
}

export function loadAllFinancialBaselines(): Map<string, FinancialBaseline> {
  const db = getDb();
  const baselines = new Map<string, FinancialBaseline>();
  if (!db) return baselines;

  const log = getEngineContext().logger;
  try {
    const rows = db.prepare(`
      SELECT team_id, baseline_json FROM diagnosis_financial_baselines
    `).all() as Array<{ team_id: string; baseline_json: string }>;

    for (const row of rows) {
      try {
        baselines.set(row.team_id, JSON.parse(row.baseline_json) as FinancialBaseline);
      } catch (parseErr) {
        log.warn({ parseErr, teamId: row.team_id },
          '[diagnosis/persistence] 跳过损坏的财务基线行');
      }
    }
  } catch (err) {
    log.warn({ err },
      '[diagnosis/persistence] 加载全部财务基线失败');
  }
  return baselines;
}