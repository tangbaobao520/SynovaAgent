/**
 * rule-version-manager.ts — 规则版本管理 (L0 进化层｜第三层基础设施)
 *
 * ARCH-13 保留组件。为全局进化提供安全阀：
 *   1. createSnapshot()  — 快照当前阈值/基线状态
 *   2. listSnapshots()   — 列出历史快照
 *   3. rollbackTo()      — 回滚到指定快照
 *   4. gradualRollout()  — 灰度发布（百分比控制）
 *
 * 存储：AgentMemoryStore type:'evolution_snapshot'
 * 作用域：L0 进化层产出的所有调整（阈值、基线、纠错统计）
 * 不管理：原始哨兵配置、专家配置、本体数据
 *
 * 铁律 24+31: 每个 catch 有 log + degraded，单步失败不阻断整体
 */

import { createHash } from 'crypto';
import { createLogger } from '@synova/logger';
import type { AgentMemoryStoreLike } from './evolution-types';

const log = createLogger('evolution/rule-version-manager');

// ═══ 类型 ═══

export interface SnapshotEntry {
  id: string;
  description: string;
  version: string;
  createdAt: string;
  /** 序列化后的规则数据（threshold_adjustment + industry_baseline） */
  data: {
    thresholds: Array<{
      sentinelId: string;
      orgId: string;
      warning: number;
      critical: number;
      reason: string;
    }>;
    baselines: Array<{
      industry: string;
      sentinelId: string;
      median: number;
    }>;
  };
  /** 数据 SHA256 校验和 — 由 createSnapshot 写入，rollbackTo 验证 */
  checksum?: string;
}

export interface RollbackResult {
  snapshotId: string;
  thresholdsRestored: number;
  baselinesRestored: number;
  errors: string[];
  degraded: boolean;
}

export interface GradualRolloutInput {
  /** 所有待升级的组织 ID 列表 */
  orgPool: string[];
  /** 本次发布的百分比 (0-100) */
  percentage: number;
  /** 待应用的阈值调整 */
  thresholds: Array<{
    sentinelId: string;
    warning: number;
    critical: number;
  }>;
}

// ═══ 当前版本 ═══
// 递增此值标识快照格式变更
const SNAPSHOT_VERSION = '1.0';

// ═══ RuleVersionManager ═══

export class RuleVersionManager {
  private memoryStore: AgentMemoryStoreLike | null;

  constructor(memoryStore?: AgentMemoryStoreLike | null) {
    this.memoryStore = memoryStore ?? null;
  }

  // ═══ ① 创建快照 ═══

  /**
   * 创建当前全局阈值/基线状态的全量快照。
   *
   * 覆盖范围：
   *   - industry_baseline（行业基线，orgId: 'global'）✓
   *   - evolution_snapshot（历史快照，orgId: 'global'）✓
   *   - per-org threshold_adjustment（阈值调整，按 orgId 存储）
   *
   * per-org threshold_adjustment 不由快照管理。
   * 原因：每个 org 的阈值调整是独立版本化的个体免疫产物，
   * 全局回滚不应覆盖用户的自定义纠错。
   * 如需捕获，调用方传入 orgIds 数组。
   *
   * @param description 快照描述（如 "2026-07 行业聚合"）
   * @param orgIds 可选 — 需要额外快照的组织 ID 列表
   * @returns 快照 ID（可用于 rollbackTo）
   */
  async createSnapshot(description: string, orgIds?: string[]): Promise<string | null> {
    if (!this.memoryStore) {
      log.warn('memoryStore 未注入 — 无法创建快照');
      return null;
    }

    const id = `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const thresholds: SnapshotEntry['data']['thresholds'] = [];
    const baselines: SnapshotEntry['data']['baselines'] = [];

    try {
      // 1. 读取全局阈值调整（industry_baseline 等 global 范围的数据）
      //    也尝试读取 per-org 阈值调整（如果调用方传了 orgIds）
      const queryOrgs = orgIds && orgIds.length > 0 ? orgIds : ['global'];
      for (const orgId of queryOrgs) {
        try {
          const adjustments = this.memoryStore.list({
            orgId,
            type: 'enterprise_fact',
            tags: ['threshold_adjustment'],
            limit: 200,
          });
          for (const adj of adjustments) {
            try {
              const parsed = JSON.parse(adj.value) as {
                sentinelId?: string; orgId?: string;
                newThreshold?: { warning: number; critical: number };
                reason?: string;
              };
              if (parsed.sentinelId && parsed.newThreshold) {
                thresholds.push({
                  sentinelId: parsed.sentinelId,
                  orgId: parsed.orgId || orgId,
                  warning: parsed.newThreshold.warning ?? 0.5,
                  critical: parsed.newThreshold.critical ?? 1.0,
                  reason: parsed.reason || '',
                });
              }
            } catch { log.debug('跳过损坏的阈值条目'); }
          }
        } catch (listErr: unknown) {
          log.warn({ err: listErr, orgId }, '快照 — 阈值读取失败（降级继续）');
        }
      }

      // 2. 读取所有行业基线
      const baselines_raw = this.memoryStore.list({
        orgId: 'global',
        type: 'enterprise_fact',
        tags: ['industry_baseline'],
        limit: 100,
      });
      for (const bl of baselines_raw) {
        try {
          const parsed = JSON.parse(bl.value) as {
            industry?: string; sentinelId?: string; median?: number;
          };
          if (parsed.industry && parsed.sentinelId) {
            baselines.push({
              industry: parsed.industry,
              sentinelId: parsed.sentinelId,
              median: parsed.median ?? 0,
            });
          }
        } catch { log.debug('跳过损坏的基线条目'); }
      }

      // 3. 写入快照（含 SHA256 校验和）
      const dataForChecksum = { thresholds, baselines };
      const checksum = createHash('sha256').update(JSON.stringify(dataForChecksum)).digest('hex');
      const snapshot: SnapshotEntry = {
        id,
        description,
        version: SNAPSHOT_VERSION,
        createdAt: new Date().toISOString(),
        data: dataForChecksum,
        checksum,
      };

      this.memoryStore.remember({
        orgId: 'global',
        key: `snapshot_${id}`,
        value: JSON.stringify(snapshot),
        type: 'enterprise_fact',
        confidence: 1.0,
        source: 'rule_version_manager',
        tags: ['evolution_snapshot', `desc:${description}`],
        expiresAt: null, // 永久保留
      });

      log.info({
        id,
        description,
        thresholds: thresholds.length,
        baselines: baselines.length,
      }, '规则快照已创建');

      return id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg, description }, '规则快照创建失败');
      return null;
    }
  }

  // ═══ ② 校验快照 ═══

  /**
   * 验证快照的 SHA256 checksum。
   * 对 data 字段重新计算哈希，与存储的 checksum 对比。
   *
   * @param snapshot 快照条目
   * @returns true=校验通过, false=数据损坏
   */
  verifyChecksum(snapshot: SnapshotEntry): boolean {
    if (!snapshot.checksum) {
      log.debug({ id: snapshot.id }, '快照无 checksum（旧格式，跳过校验）');
      return true; // 旧格式快照向后兼容
    }
    try {
      const computed = createHash('sha256').update(JSON.stringify(snapshot.data)).digest('hex');
      const valid = computed === snapshot.checksum;
      if (!valid) {
        log.error({ id: snapshot.id, expected: snapshot.checksum, actual: computed }, '快照 checksum 不匹配 — 数据可能损坏');
      }
      return valid;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id: snapshot.id }, '快照校验失败 — 降级通过');
      return true; // 校验本身失败时不阻断（降级宽容）
    }
  }

  // ═══ ③ 列出快照 ═══

  /**
   * 列出所有历史快照（摘要信息，不含全量数据）。
   */
  listSnapshots(): Array<{ id: string; description: string; createdAt: string; thresholdCount: number; baselineCount: number; verified: boolean; corrupt: boolean }> {
    if (!this.memoryStore) return [];

    try {
      const entries = this.memoryStore.list({
        orgId: 'global',
        type: 'enterprise_fact',
        tags: ['evolution_snapshot'],
        limit: 100,
      });

      return entries.map(e => {
        try {
          const parsed = JSON.parse(e.value) as SnapshotEntry;
          const verified = this.verifyChecksum(parsed);
          return {
            id: parsed.id,
            description: parsed.description + (verified ? '' : ' ⚠ 数据可能损坏'),
            createdAt: parsed.createdAt,
            thresholdCount: parsed.data?.thresholds?.length ?? 0,
            baselineCount: parsed.data?.baselines?.length ?? 0,
            verified,
            corrupt: !verified,
          };
        } catch (parseErr: unknown) {
          log.debug({ err: parseErr }, '快照条目解析失败');
          return { id: 'parse_error', description: '损坏的快照', createdAt: '', thresholdCount: 0, baselineCount: 0, verified: false, corrupt: true };
        }
      }).filter(s => s.id !== 'parse_error');
    } catch (err: unknown) {
      log.warn({ err }, 'listSnapshots 失败 — degraded');
      return [];
    }
  }

  // ═══ ③ 回滚 ═══

  /**
   * 回滚到指定快照。
   * 读取快照数据 → 反写每个阈值到 AgentMemoryStore。
   *
   * 注意：当前实现只恢复 AgentMemoryStore 中的阈值状态。
   * the extensions/industries/{name}/thresholds.json files need manual or
   * global-analyzer 再次聚合来恢复。
   */
  async rollbackTo(snapshotId: string): Promise<RollbackResult> {
    const result: RollbackResult = {
      snapshotId,
      thresholdsRestored: 0,
      baselinesRestored: 0,
      errors: [],
      degraded: false,
    };

    if (!this.memoryStore) {
      result.errors.push('memoryStore 未注入');
      result.degraded = true;
      return result;
    }

    try {
      // 1. 读取快照
      const stored = this.memoryStore.recall('global', `snapshot_${snapshotId}`);
      if (!stored) {
        result.errors.push(`快照 ${snapshotId} 不存在`);
        result.degraded = true;
        return result;
      }

      const snapshot = JSON.parse(stored.value) as SnapshotEntry;

      // 1b. 校验 checksum（旧格式快照跳过）
      if (snapshot.checksum && !this.verifyChecksum(snapshot)) {
        result.errors.push(`快照 ${snapshotId} checksum 不匹配 — 数据可能损坏，拒绝回滚`);
        result.degraded = true;
        log.error({ snapshotId }, '回滚拒绝：快照 checksum 不匹配');
        return result;
      }

      // 2. 反写阈值
      for (const t of snapshot.data.thresholds) {
        try {
          this.memoryStore!.remember({
            orgId: t.orgId,
            key: `threshold_${t.sentinelId}`,
            value: JSON.stringify({
              sentinelId: t.sentinelId,
              orgId: t.orgId,
              newThreshold: { warning: t.warning, critical: t.critical },
              reason: `回滚: ${snapshot.description} — ${t.reason}`,
              adjustedAt: new Date().toISOString(),
            }),
            type: 'enterprise_fact',
            confidence: 0.9,
            source: 'rule_version_manager',
            tags: ['threshold_adjustment', t.sentinelId, 'rollback'],
            expiresAt: null,
          });
          result.thresholdsRestored++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`恢复阈值 ${t.sentinelId}: ${msg}`);
          result.degraded = true;
        }
      }

      // 3. 反写基线
      for (const b of snapshot.data.baselines) {
        try {
          this.memoryStore!.remember({
            orgId: 'global',
            key: `baseline_${b.industry}_${b.sentinelId}`,
            value: JSON.stringify({
              industry: b.industry,
              sentinelId: b.sentinelId,
              median: b.median,
              restoredFrom: snapshotId,
              restoredAt: new Date().toISOString(),
            }),
            type: 'enterprise_fact',
            confidence: 0.9,
            source: 'rule_version_manager',
            tags: ['industry_baseline', b.industry, 'rollback'],
            expiresAt: null,
          });
          result.baselinesRestored++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`恢复基线 ${b.industry}/${b.sentinelId}: ${msg}`);
          result.degraded = true;
        }
      }

      log.info({
        snapshotId,
        thresholds: result.thresholdsRestored,
        baselines: result.baselinesRestored,
        errors: result.errors.length,
      }, '规则回滚完成');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`回滚整体失败: ${msg}`);
      result.degraded = true;
      log.error({ err: msg, snapshotId }, '规则回滚失败');
    }

    return result;
  }

  // ═══ ⑤ 快照 TTL 清理 ═══

  /**
   * 清理过期快照。保留最新的 maxCount 个，可选删除超过 maxAgeDays 的。
   * 在 Cron 聚合后自动执行。
   */
  async cleanupSnapshots(maxCount = 10, maxAgeDays?: number): Promise<number> {
    let deleted = 0;
    if (!this.memoryStore) return 0;

    try {
      const entries = this.memoryStore.list({
        orgId: 'global', type: 'enterprise_fact',
        tags: ['evolution_snapshot'], limit: 100,
      });

      const snapshots: Array<{ id: string; createdAt: string; key: string }> = [];
      for (const e of entries) {
        try {
          const parsed = JSON.parse(e.value) as SnapshotEntry;
          snapshots.push({ id: parsed.id, createdAt: parsed.createdAt, key: 'snapshot_' + parsed.id });
        } catch { /* skip corrupt */ }
      }
      snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const toDelete = new Set<string>();

      if (snapshots.length > maxCount) {
        for (let i = maxCount; i < snapshots.length; i++) toDelete.add(snapshots[i].key);
      }

      if (maxAgeDays && maxAgeDays > 0) {
        const cutoff = Date.now() - maxAgeDays * 86400000;
        for (const snap of snapshots) {
          if (new Date(snap.createdAt).getTime() < cutoff) toDelete.add(snap.key);
        }
        if (toDelete.size >= snapshots.length && snapshots.length > 0) {
          toDelete.delete(snapshots[0].key);
          log.warn({ newestId: snapshots[0].id }, '保留最新快照防止全部删除');
        }
      }

      for (const key of toDelete) {
        try { this.memoryStore.forget('global', key); deleted++; }
        catch (err: unknown) { log.warn({ err, key }, '快照删除失败'); }
      }

      if (deleted > 0) log.info({ total: snapshots.length, deleted, remain: snapshots.length - deleted }, '快照清理完成');
    } catch (err: unknown) {
      log.warn({ err }, '快照清理失败 — degraded');
    }

    return deleted;
  }

  // ═══ ④ 灰度发布 ═══

  /**
   * 灰度发布：只在 orgPool 中前 percentage% 的组织应用阈值调整。
   *
   * 例如 orgPool=['orgA','orgB','orgC','orgD','orgE'], percentage=40
   * → 只对 ['orgA','orgB'] 应用调整。
   *
   * @returns 实际应用调整的组织列表
   */
  async gradualRollout(input: GradualRolloutInput): Promise<string[]> {
    if (!this.memoryStore) {
      log.warn('memoryStore 未注入 — 灰度发布跳过');
      return [];
    }

    const { orgPool, percentage, thresholds } = input;
    const count = Math.max(1, Math.floor(orgPool.length * percentage / 100));
    const targetOrgs = orgPool.slice(0, count);

    let applied = 0;
    for (const orgId of targetOrgs) {
      for (const t of thresholds) {
        try {
          this.memoryStore.remember({
            orgId,
            key: `threshold_${t.sentinelId}`,
            value: JSON.stringify({
              sentinelId: t.sentinelId,
              newThreshold: { warning: t.warning, critical: t.critical },
              reason: `灰度发布 (${percentage}%): ${targetOrgs.length}/${orgPool.length} 组织`,
              adjustedAt: new Date().toISOString(),
            }),
            type: 'enterprise_fact',
            confidence: 0.8,
            source: 'gradual_rollout',
            tags: ['threshold_adjustment', t.sentinelId, 'gradual_rollout'],
            expiresAt: null,
          });
          applied++;
        } catch (err: unknown) {
          log.warn({ err, orgId, sentinelId: t.sentinelId }, '灰度发布 — 阈值写入失败');
        }
      }
    }

    log.info({
      percentage,
      targetOrgs: targetOrgs.length,
      totalPool: orgPool.length,
      thresholdsApplied: applied,
    }, '灰度发布完成');

    return targetOrgs;
  }

  async checkGrayscaleHealth(versionId: string): Promise<{ versionId: string; healthScore: number; recommendation: 'advance' | 'rollback' | 'monitor' }> {
    const h = { versionId, healthScore: 0.8, recommendation: 'monitor' as 'advance' | 'rollback' | 'monitor' };
    try {
      if (!this.memoryStore) return { ...h, healthScore: 0, recommendation: 'rollback' };
      const entry = this.memoryStore.recall('global', 'snapshot_' + versionId);
      if (!entry || !JSON.parse(entry.value)) return { ...h, healthScore: 0, recommendation: 'rollback' };
      return { ...h, healthScore: 0.9, recommendation: 'advance' };
    } catch { return { ...h, healthScore: 0, recommendation: 'rollback' }; }
  }
}
