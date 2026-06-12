/**
 * sentinel/adapters/helpers.ts — 哨兵适配器辅助函数
 *
 * 提供 DB 上下文切换 + 团队发现 + 报告→Finding 转换工具。
 * 所有引擎模块通过 getEngineContext().database.getDb() 访问 DB，
 * 哨兵通过 context.db 获得 DB 实例——两者需指向同一实例。
 *
 * Iron Law 24: 所有 catch 带 log.warn/error + degraded 标记
 */

import type { SentinelContext, SentinelCheckResult, SentinelFinding } from '../types';
import { getEngineContext } from '../../../packages/engine-core/src/engine-context';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/adapter-helpers');

/**
 * 临时将引擎上下文的 DB 引用替换为 context.db。
 * 返回恢复函数——调用方必须在 finally 块中调用。
 *
 * 生产环境两者指向同一实例（无实际效果）；
 * 测试环境可用此机制注入 mock DB。
 */
export function swapDbForContext(context: SentinelContext): () => void {
  const engineCtx = getEngineContext();
  const originalGetDb = engineCtx.database.getDb;
  engineCtx.database.getDb = () => context.db;
  return () => {
    engineCtx.database.getDb = originalGetDb;
  };
}

/**
 * 从 diagnosis_snapshots 表发现所有已知团队 ID。
 * 空表或无权限时回退到 ['default']。
 */
export function discoverTeams(context: SentinelContext): string[] {
  try {
    const db = context.db as { prepare(sql: string): { all(): Array<{ team_id: string }> } } | null;
    if (!db || typeof db.prepare !== 'function') {
      log.debug('db 不可用 — 回退到 default 团队');
      return ['default'];
    }
    const rows = db
      .prepare('SELECT DISTINCT team_id FROM diagnosis_snapshots ORDER BY team_id')
      .all();
    if (rows && rows.length > 0) return rows.map((r) => r.team_id);
  } catch (err: unknown) {
    log.warn({ err: (err as Error)?.message || String(err) }, '团队发现查询失败 — 回退到 default');
  }
  return ['default'];
}

/**
 * 对单个团队执行 compute 函数，包装为标准 SentinelCheckResult。
 *
 * @param sentinelId  — 哨兵 ID
 * @param teamId      — 目标团队
 * @param now         — 检查时间
 * @param computeFn   — 实际计算函数 (teamId: string) => report | null
 * @param findingsFn  — 报告 → SentinelFinding[] 转换函数
 * @param label       — 日志标签
 */
export async function checkTeam(
  sentinelId: string,
  teamId: string,
  now: Date,
  computeFn: (teamId: string) => unknown,
  findingsFn: (report: unknown) => SentinelFinding[],
  label: string,
): Promise<SentinelCheckResult> {
  const checkedAt = now.toISOString();
  try {
    const report = await Promise.resolve(computeFn(teamId));
    if (!report) {
      return {
        sentinelId,
        ok: true,
        findings: [],
        durationMs: 0,
        checkedAt,
        degraded: true,
      };
    }
    const findings = findingsFn(report);
    return {
      sentinelId,
      ok: true,
      findings,
      durationMs: 0,
      checkedAt,
      degraded: findings.length === 0,
    };
  } catch (err: unknown) {
    // Iron Law 24: catch 必须打 log.error + 区分错误类型
    const msg = (err as Error)?.message || String(err);
    log.error({ sentinelId, teamId, err: msg, code: 'SENTINEL_CHECK_FAILED', phase: 3, retryable: true },
      `[${label}] 团队 ${teamId} 检查失败`);
    return {
      sentinelId,
      ok: false,
      findings: [],
      durationMs: 0,
      checkedAt,
      error: msg,
      degraded: true,
    };
  }
}
