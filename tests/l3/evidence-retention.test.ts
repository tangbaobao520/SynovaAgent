/**
 * tests/l3/evidence-retention.test.ts — D717 证据保留分级维护
 *
 * 覆盖：
 *   1. 策略解析 — 默认永久 / 分级窗口 / 非法配置（fail-safe 与 fail-loud 两侧）
 *   2. 保留维护 — 正常清理 / 永久跳过 / 边界（cutoff 严格小于）/ 降级（DB 不可用）
 *   3. cron 作业 — 生产入口行为 + 降级回调传播（铁律 31）
 *   4. 接线断言 — expireOld 的生产调用方物理存在（铁律 0-2 Step 5 WIRE CHECK）
 *
 * 历史背景：`evidence-store.expireOld()` 建成后全仓零生产调用方（M3），
 * 本文件是它的接线回归锁。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import Database from 'better-sqlite3';
import { EvidenceStore } from '../../src/evidence/evidence-store';
import {
  parseEvidenceRetentionPolicy,
  runEvidenceRetention,
  createEvidenceRetentionJob,
  EvidenceRetentionError,
  EVIDENCE_RETENTION_JOB_NAME,
  EVIDENCE_RETENTION_CRON,
} from '../../src/l3/evidence-retention';

const MS_PER_DAY = 86_400_000;
/** 冻结时钟 — cutoff 边界可精确断言 */
const NOW = new Date('2026-09-13T00:00:00.000Z').getTime();

let db: Database.Database;

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

/** 写入一条证据（collectedAt 显式指定，便于构造年龄） */
function seed(id: string, collectedAt: string): void {
  new EvidenceStore(db).add({
    id,
    source: 'interviewee',
    sourceId: 'org-1',
    type: 'interview_response',
    content: `证据内容 ${id}`,
    confidence: 0.8,
    collectedAt,
    orgId: 'org-1',
  });
}

function countEvidence(): number {
  return new EvidenceStore(db).query({}).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  db = new Database(':memory:');
});

afterEach(() => {
  vi.useRealTimers();
  if (db.open) db.close();
});

// ════════════════════════════════════════════════════════════════
// 1. 策略解析
// ════════════════════════════════════════════════════════════════

describe('parseEvidenceRetentionPolicy', () => {
  it('无配置 → permanent（永久，不按时间清理 — D660）', () => {
    const policy = parseEvidenceRetentionPolicy({});
    expect(policy.tier).toBe('permanent');
    expect(policy.windowMs).toBeNull();
  });

  it('tier=periodic / temporary → 各自默认窗口', () => {
    expect(parseEvidenceRetentionPolicy({ SYNOVA_EVIDENCE_RETENTION_TIER: 'periodic' }).windowMs).toBe(180 * MS_PER_DAY);
    expect(parseEvidenceRetentionPolicy({ SYNOVA_EVIDENCE_RETENTION_TIER: 'temporary' }).windowMs).toBe(7 * MS_PER_DAY);
  });

  it('边界：tier 大小写与空格容错', () => {
    expect(parseEvidenceRetentionPolicy({ SYNOVA_EVIDENCE_RETENTION_TIER: '  PERIODIC ' }).tier).toBe('periodic');
  });

  it('降级：tier 未识别 → fail-safe 回落 permanent（绝不按未定义窗口删证据）', () => {
    const policy = parseEvidenceRetentionPolicy({ SYNOVA_EVIDENCE_RETENTION_TIER: 'forever-ish' });
    expect(policy.tier).toBe('permanent');
    expect(policy.windowMs).toBeNull();
  });

  it('days 覆盖窗口：permanent + days=30 → 提升为 periodic/30 天', () => {
    const policy = parseEvidenceRetentionPolicy({ SYNOVA_EVIDENCE_RETENTION_DAYS: '30' });
    expect(policy.tier).toBe('periodic');
    expect(policy.windowMs).toBe(30 * MS_PER_DAY);
  });

  it('边界：days=0 → 显式永久（关闭时间清理）', () => {
    const policy = parseEvidenceRetentionPolicy({
      SYNOVA_EVIDENCE_RETENTION_TIER: 'temporary',
      SYNOVA_EVIDENCE_RETENTION_DAYS: '0',
    });
    expect(policy.tier).toBe('permanent');
    expect(policy.windowMs).toBeNull();
  });

  it('非法 days（负数 / 小数 / 非数字）→ 抛分类错误，且不静默降级', () => {
    for (const bad of ['-1', '1.5', 'abc']) {
      const err = (() => {
        try {
          parseEvidenceRetentionPolicy({ SYNOVA_EVIDENCE_RETENTION_DAYS: bad });
          return null;
        } catch (e: unknown) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(EvidenceRetentionError);
      expect((err as EvidenceRetentionError).code).toBe('EVIDENCE_RETENTION_CONFIG');
      expect((err as EvidenceRetentionError).phase).toBe('evidence-retention');
      expect((err as EvidenceRetentionError).retryable).toBe(false);
    }
  });

  it('窗口常量导出面：作业名/cron 为装配方唯一真相', () => {
    expect(EVIDENCE_RETENTION_JOB_NAME).toBe('evidence-retention');
    expect(EVIDENCE_RETENTION_CRON).toBe('30 3 * * *');
  });
});

// ════════════════════════════════════════════════════════════════
// 2. 保留维护
// ════════════════════════════════════════════════════════════════

describe('runEvidenceRetention', () => {
  it('正常路径：窗口外的证据被清理，窗口内保留', () => {
    seed('ev_old', iso(30 * MS_PER_DAY));
    seed('ev_new', iso(1 * MS_PER_DAY));

    const result = runEvidenceRetention(db, parseEvidenceRetentionPolicy({ SYNOVA_EVIDENCE_RETENTION_DAYS: '7' }));

    expect(result.skipped).toBe(false);
    expect(result.degraded).toBe(false);
    expect(result.deleted).toBe(1);
    const left = new EvidenceStore(db).query({});
    expect(left.map((e) => e.id)).toEqual(['ev_new']);
  });

  it('边界：collected_at 恰等于 cutoff → 不删（SQL 为严格小于）；早 1ms → 删', () => {
    const window = 7 * MS_PER_DAY;
    seed('ev_exact', iso(window));          // == cutoff
    seed('ev_older_1ms', iso(window + 1));  // 早 1ms

    const result = runEvidenceRetention(db, { tier: 'temporary', windowMs: window, source: 'test' });

    expect(result.deleted).toBe(1);
    expect(new EvidenceStore(db).query({}).map((e) => e.id)).toEqual(['ev_exact']);
  });

  it('降级：空表 → 清理 0 行且不降级', () => {
    const result = runEvidenceRetention(db, { tier: 'temporary', windowMs: MS_PER_DAY, source: 'test' });
    expect(result.deleted).toBe(0);
    expect(result.degraded).toBe(false);
  });

  it('永久分级：不调用 expireOld，证据原样保留（skipped=true）', () => {
    seed('ev_ancient', iso(999 * MS_PER_DAY));

    const result = runEvidenceRetention(db, parseEvidenceRetentionPolicy({}));

    expect(result.skipped).toBe(true);
    expect(result.deleted).toBe(0);
    expect(result.windowMs).toBeNull();
    expect(countEvidence()).toBe(1);
  });

  it('降级：DB 不可用 → degraded=true + 分类码，且不抛错（铁律 24/31）', () => {
    seed('ev_old', iso(30 * MS_PER_DAY));
    db.close();

    const result = runEvidenceRetention(db, { tier: 'periodic', windowMs: 7 * MS_PER_DAY, source: 'test' });

    expect(result.degraded).toBe(true);
    expect(result.errorCode).toBe('EVIDENCE_RETENTION_SWEEP_FAILED');
    expect(result.deleted).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. cron 作业（生产入口形态）
// ════════════════════════════════════════════════════════════════

describe('createEvidenceRetentionJob', () => {
  it('正常路径：env 开启窗口 → 作业删旧留新，不回调降级', async () => {
    seed('ev_old', iso(30 * MS_PER_DAY));
    seed('ev_new', iso(1 * MS_PER_DAY));
    const degradedCalls: string[] = [];

    const job = createEvidenceRetentionJob(db, (m) => degradedCalls.push(m), { SYNOVA_EVIDENCE_RETENTION_DAYS: '7' });
    await job();

    expect(new EvidenceStore(db).query({}).map((e) => e.id)).toEqual(['ev_new']);
    expect(degradedCalls).toEqual([]);
  });

  it('默认（无 env）= 永久：作业执行但零删除', async () => {
    seed('ev_ancient', iso(999 * MS_PER_DAY));

    await createEvidenceRetentionJob(db, undefined, {})();

    expect(countEvidence()).toBe(1);
  });

  it('配置非法：作业不抛错、不删证据，且把降级信号传给装配方', async () => {
    seed('ev_ancient', iso(999 * MS_PER_DAY));
    const degradedCalls: string[] = [];

    const job = createEvidenceRetentionJob(db, (m) => degradedCalls.push(m), { SYNOVA_EVIDENCE_RETENTION_DAYS: 'abc' });
    await expect(job()).resolves.toBeUndefined();

    expect(countEvidence()).toBe(1);
    expect(degradedCalls).toHaveLength(1);
    expect(degradedCalls[0]).toContain('EVIDENCE_RETENTION_CONFIG');
  });

  it('降级：DB 不可用 → 作业不抛错 + 降级回调携带分类码', async () => {
    seed('ev_old', iso(30 * MS_PER_DAY));
    db.close();
    const degradedCalls: string[] = [];

    const job = createEvidenceRetentionJob(db, (m) => degradedCalls.push(m), { SYNOVA_EVIDENCE_RETENTION_DAYS: '7' });
    await expect(job()).resolves.toBeUndefined();

    expect(degradedCalls).toHaveLength(1);
    expect(degradedCalls[0]).toContain('EVIDENCE_RETENTION_SWEEP_FAILED');
  });
});

// ════════════════════════════════════════════════════════════════
// 4. 接线断言（铁律 0-2 Step 5：新 export 必须在生产入口有引用）
// ════════════════════════════════════════════════════════════════

describe('D717 接线断言 — expireOld 的生产调用方', () => {
  it('生产模块调用 expireOld（非测试文件）', () => {
    const content = readFileSync('src/l3/evidence-retention.ts', 'utf-8');
    expect(content).toContain('expireOld(');
    expect(content).toContain('new EvidenceStore(db)');
  });

  it('装配根注册启动清理 + 每日 cron（bootstrap Phase 5c）', () => {
    const content = readFileSync('src/deploy/bootstrap.ts', 'utf-8');
    expect(content).toContain("import('../l3/evidence-retention')");
    expect(content).toContain('retention.runEvidenceRetention(db, policy)');
    expect(content).toContain('retention.createEvidenceRetentionJob(db');
    expect(content).toContain('retention.EVIDENCE_RETENTION_JOB_NAME');
    expect(content).toContain('retention.EVIDENCE_RETENTION_CRON');
  });

  it('装配根把降级信号记入 degradedModules（铁律 31）', () => {
    const content = readFileSync('src/deploy/bootstrap.ts', 'utf-8');
    expect(content).toContain("ctx.addDegraded(5, 'evidence-retention'");
  });

  it('被调用方仍是证据存储的唯一过期实现', () => {
    const content = readFileSync('src/evidence/evidence-store.ts', 'utf-8');
    expect(content).toContain('expireOld(maxAgeMs: number): number');
  });
});
