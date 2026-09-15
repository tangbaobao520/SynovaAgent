/**
 * l3/evidence-retention.ts — 证据保留分级维护 (D717)
 *
 * 修 M3「机制建成未接线」：`src/evidence/evidence-store.ts` 的 `expireOld()` 此前全仓零生产调用方。
 * 本模块是它唯一的生产调用方；接线点 = `src/deploy/bootstrap.ts` Phase 5c：
 *   ① 启动即跑一次（桌面端/短生命周期进程常在 03:30 不在线）
 *   ② 注册每日内务 cron（`EVIDENCE_RETENTION_CRON`，紧随 db-backup 之后）
 *
 * 策略依据：
 *   - `docs/synova/coordination/board-backlog.json#PLAN-expireold-wiring`：「统一保留分级（永久/定期/临时）」
 *   - `… #PLAN-d660-data-lifecycle`（创始人 2026-09-10）：「按时间清理是错误模型」，
 *     Evidence 过期 = 蒸馏完成 → 故默认 `permanent`（不按时间删）。D660 spec 落地后，
 *     「蒸馏完成」触发条件只需接在本模块的单点解析处，调用方无需改动。
 *
 * 保留分级（tier）：
 *   permanent (永久，默认) — 不调用 expireOld；证据保留到蒸馏完成（D660）。
 *   periodic  (定期)       — 默认窗口 180 天。
 *   temporary (临时)       — 默认窗口 7 天。
 *
 * 配置（env，均可选）：
 *   SYNOVA_EVIDENCE_RETENTION_TIER = permanent | periodic | temporary   默认 permanent
 *   SYNOVA_EVIDENCE_RETENTION_DAYS = 正整数=窗口覆盖（天）| 0=永久       非法值 → 抛错且不删证据
 *
 * 契约（铁律 47）：
 *   @input  parseEvidenceRetentionPolicy(env) → 分级策略；
 *           runEvidenceRetention(db, policy) → 清理结果；
 *           createEvidenceRetentionJob(db, onDegraded, env) → cron 作业函数
 *   @output EvidenceRetentionResult { tier, windowMs, deleted, skipped, degraded, errorCode? }
 *   @degraded 清理失败 → log.warn + result.degraded=true + onDegraded(msg)（装配方记 degradedModules）；
 *             配置非法 → 抛 EvidenceRetentionError(code=EVIDENCE_RETENTION_CONFIG)，调用方据此不注册作业
 *
 * 铁律 39：L3 通过 EvidenceStore(L4) 操作数据，不直接访问 L5（本文件零 db.prepare/exec）。
 * 铁律 24/31/32：失败必 log + degraded 标记 + 分类错误（code/phase/retryable）。
 * 铁律 38：零 as any。
 */
import type Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';
import { EvidenceStore } from '../evidence/evidence-store';

const log = createLogger('l3/evidence-retention');

/** cron 作业名 — 装配方注册用（= bootstrap 的唯一真相） */
export const EVIDENCE_RETENTION_JOB_NAME = 'evidence-retention';

/** 每日 03:30 — 紧随 db-backup（03:00）之后，在当日备份快照上清理 */
export const EVIDENCE_RETENTION_CRON = '30 3 * * *';

/**
 * 分级 → 默认窗口（ms）。null = 永久（不调用 expireOld）。
 *
 * 单一真相：分级清单与默认窗口同源于此表（新增分级 = 加一行，不改类型定义）。
 * 窗口可被 SYNOVA_EVIDENCE_RETENTION_DAYS 覆盖；D660 spec 落地后在此收敛。
 */
const TIER_WINDOWS_MS = {
  permanent: null,
  periodic: 180 * 86_400_000,
  temporary: 7 * 86_400_000,
} as const;

/** 保留分级 — 从数据表派生（keyof），非硬编码联合（组 8 文件驱动门禁） */
export type EvidenceRetentionTier = keyof typeof TIER_WINDOWS_MS;

const MS_PER_DAY = 86_400_000;

/** 已解析的证据保留策略 */
export interface EvidenceRetentionPolicy {
  tier: EvidenceRetentionTier;
  /** null = 永久（跳过清理） */
  windowMs: number | null;
  /** 策略来源（env 溯源，便于日志核对） */
  source: string;
}

/** 一次保留维护的结果 */
export interface EvidenceRetentionResult {
  tier: EvidenceRetentionTier;
  windowMs: number | null;
  /** 被清理的证据行数（expireOld 返回值） */
  deleted: number;
  /** true = 永久分级，跳过清理 */
  skipped: boolean;
  /** true = 清理失败（策略本轮未生效） */
  degraded: boolean;
  /** 失败分类码（degraded 时存在） */
  errorCode?: string;
}

/** 证据保留维护错误 — 分类载体（铁律 32） */
export class EvidenceRetentionError extends Error {
  readonly code: string;
  readonly phase = 'evidence-retention';
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'EvidenceRetentionError';
    this.code = code;
    this.retryable = retryable;
  }
}

/** 类型守卫 — 数据表驱动 + 避免 `as` 断言（铁律 38） */
function isEvidenceRetentionTier(value: string): value is EvidenceRetentionTier {
  return Object.prototype.hasOwnProperty.call(TIER_WINDOWS_MS, value);
}

/**
 * 解析证据保留策略（纯函数，env 注入以便测试）。
 *
 * 规则：
 *   - 无配置                        → permanent（永久，不清理）
 *   - TIER 未识别                    → fail-safe 回落 permanent + log.warn（绝不按未定义窗口删证据）
 *   - DAYS = 0                      → permanent（显式关闭时间清理）
 *   - DAYS = 正整数                  → 覆盖窗口；tier=permanent 时提升为 periodic（有窗口即定期）
 *   - DAYS 非法（负数/小数/非数字）    → 抛 EvidenceRetentionError(EVIDENCE_RETENTION_CONFIG, retryable=false)
 *
 * @throws EvidenceRetentionError 配置非法（调用方须据此**不**执行清理）
 */
export function parseEvidenceRetentionPolicy(
  env: Record<string, string | undefined> = {},
): EvidenceRetentionPolicy {
  const rawTier = (env.SYNOVA_EVIDENCE_RETENTION_TIER ?? '').trim().toLowerCase();
  const rawDays = (env.SYNOVA_EVIDENCE_RETENTION_DAYS ?? '').trim();

  let tier: EvidenceRetentionTier = 'permanent';
  let source = 'default:permanent';

  if (rawTier) {
    if (isEvidenceRetentionTier(rawTier)) {
      tier = rawTier;
      source = `env:tier=${rawTier}`;
    } else {
      log.warn({ rawTier }, '证据保留分级未识别 — 回落 permanent（不清理证据）');
      source = `env:tier=${rawTier}(未识别→permanent)`;
    }
  }

  let windowMs = TIER_WINDOWS_MS[tier];

  if (rawDays) {
    const days = Number(rawDays);
    if (!Number.isInteger(days) || days < 0) {
      throw new EvidenceRetentionError(
        'EVIDENCE_RETENTION_CONFIG',
        `SYNOVA_EVIDENCE_RETENTION_DAYS 非法: "${rawDays}"（须为非负整数天）`,
        false,
      );
    }
    if (days === 0) {
      tier = 'permanent';
      windowMs = null;
      source = `${source}+days=0→permanent`;
    } else {
      if (tier === 'permanent') tier = 'periodic'; // 显式给窗口 = 定期分级
      windowMs = days * MS_PER_DAY;
      source = `${source}+days=${days}`;
    }
  }

  return { tier, windowMs, source };
}

/**
 * 执行一次证据保留维护（生产入口之一，bootstrap 启动即调用）。
 *
 * @param db SQLite 实例（装配方注入）
 * @param policy 已解析策略；缺省 = permanent（不清理）
 * @returns 清理结果 — **永不抛错**（失败走 degraded 标记，铁律 24/31）
 */
export function runEvidenceRetention(
  db: Database.Database,
  policy: EvidenceRetentionPolicy = { tier: 'permanent', windowMs: null, source: 'default:permanent' },
): EvidenceRetentionResult {
  if (policy.windowMs === null) {
    log.info(
      { tier: policy.tier, source: policy.source },
      '证据保留分级=永久 — 跳过过期清理（证据是蒸馏前资产，D660）',
    );
    return { tier: policy.tier, windowMs: null, deleted: 0, skipped: true, degraded: false };
  }

  try {
    const store = new EvidenceStore(db);
    const deleted = store.expireOld(policy.windowMs);
    log.info(
      { tier: policy.tier, windowMs: policy.windowMs, deleted, source: policy.source },
      '证据过期清理完成',
    );
    return { tier: policy.tier, windowMs: policy.windowMs, deleted, skipped: false, degraded: false };
  } catch (err: unknown) {
    const classified = new EvidenceRetentionError(
      'EVIDENCE_RETENTION_SWEEP_FAILED',
      err instanceof Error ? err.message : String(err),
      true,
    );
    log.warn(
      { err, code: classified.code, tier: policy.tier, windowMs: policy.windowMs },
      '证据过期清理失败 — degraded，本轮保留策略未生效（不阻断进程）',
    );
    return {
      tier: policy.tier,
      windowMs: policy.windowMs,
      deleted: 0,
      skipped: false,
      degraded: true,
      errorCode: classified.code,
    };
  }
}

/**
 * 构造每日证据保留维护作业（cron handler）。
 *
 * @param db SQLite 实例（装配方注入）
 * @param onDegraded 降级回调（装配方据此写 degradedModules；铁律 31）
 * @param env 环境变量源（默认 process.env；测试可注入）
 * @returns 异步作业函数 — **永不抛错**（cron handler 抛错会变 unhandled rejection）
 */
export function createEvidenceRetentionJob(
  db: Database.Database,
  onDegraded?: (message: string) => void,
  env: Record<string, string | undefined> = process.env,
): () => Promise<void> {
  return async () => {
    let policy: EvidenceRetentionPolicy;
    try {
      policy = parseEvidenceRetentionPolicy(env);
    } catch (err: unknown) {
      const message = err instanceof EvidenceRetentionError
        ? `${err.code}: ${err.message}`
        : err instanceof Error ? err.message : String(err);
      log.warn(
        { err, tier: env.SYNOVA_EVIDENCE_RETENTION_TIER, days: env.SYNOVA_EVIDENCE_RETENTION_DAYS },
        '证据保留配置非法 — 本轮未清理（fail-safe：不删证据）',
      );
      onDegraded?.(message);
      return;
    }

    const result = runEvidenceRetention(db, policy);
    if (result.degraded) {
      onDegraded?.(`${result.errorCode ?? 'EVIDENCE_RETENTION_SWEEP_FAILED'}: 证据过期清理失败`);
    }
  };
}
