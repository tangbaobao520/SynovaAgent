/**
 * security/root-hash-publisher.ts — 根哈希定时发布器 (D41)
 *
 * 安全规范 4.2: 定时（每小时）将审计日志链尾的 current_hash 发布到外部不可变存储。
 * 发布失败不影响系统正常运行（降级）。
 *
 * 设计原则:
 * - 独立生命周期：start() / stop() 控制
 * - 降级不阻断：外部存储不可用时，本地哈希链仍可验证
 * - 可测试：intervalMs 可注入（测试时用短间隔）
 */
import { createLogger } from '@synova/logger';
import { signRootHash, type ExternalHashStore } from './external-hash-store';
import { AuditStore } from '../l4/audit-store';

const log = createLogger('security/root-hash-publisher');

export interface PublishRecord {
  orgId: string;
  rootHash: string;
  timestamp: string;
  signature: string;
  stored: boolean;
  publishedAt: string;
}

export class RootHashPublisher {
  private readonly auditStore: AuditStore;
  private readonly externalStore: ExternalHashStore;
  private readonly intervalMs: number;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly signingSecret: string;
  private readonly monitoredOrgs: string[];

  /**
   * @param auditStore     - AuditStore 实例（用于查询链尾哈希）
   * @param externalStore  - 外部存储实现（默认 LocalFileHashStore）
   * @param intervalMs     - 发布间隔（默认 3600000ms = 1 小时）
   * @param signingSecret  - 签名密钥（默认 "synova-root-hash-secret"）
   * @param monitoredOrgs  - 需要监控的组织列表（默认空 = 仅手动发布）
   */
  constructor(
    auditStore: AuditStore,
    externalStore: ExternalHashStore,
    intervalMs: number = 3600000,
    signingSecret: string = 'synova-root-hash-secret',
    monitoredOrgs: string[] = [],
  ) {
    this.auditStore = auditStore;
    this.externalStore = externalStore;
    this.intervalMs = intervalMs;
    this.signingSecret = signingSecret;
    this.monitoredOrgs = monitoredOrgs;
  }

  /**
   * 启动定时发布。
   * - 立即发布一次（启动时）
   * - 之后按 intervalMs 间隔发布
   */
  start(): void {
    if (this.timerId) {
      log.warn('RootHashPublisher 已在运行');
      return;
    }

    log.info({ intervalMs: this.intervalMs, orgs: this.monitoredOrgs.length }, 'RootHashPublisher 启动');

    // 立即发布一次
    this.publishForAllOrgs().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'RootHashPublisher 首次发布失败 — degraded');
    });

    // 定时发布
    this.timerId = setInterval(() => {
      this.publishForAllOrgs().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err: msg }, 'RootHashPublisher 定时发布失败 — degraded');
      });
    }, this.intervalMs);
  }

  /**
   * 停止定时发布。
   */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      log.info('RootHashPublisher 已停止');
    }
  }

  /**
   * 手动为指定 org 发布根哈希。
   * @param orgId - 组织 ID
   * @returns 发布记录
   */
  async publishForOrg(orgId: string): Promise<PublishRecord> {
    const chain = this.auditStore.verifyChain(orgId);
    if (chain.totalRecords === 0) {
      log.warn({ orgId }, '无审计记录，跳过根哈希发布');
      return {
        orgId,
        rootHash: '',
        timestamp: new Date().toISOString(),
        signature: '',
        stored: false,
        publishedAt: new Date().toISOString(),
      };
    }

    // 查询链尾最后一条 current_hash
    const lastEntry = this.auditStore.rawQuery(
      'SELECT current_hash FROM audit_log WHERE org_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      [orgId],
    );

    const lastRow = lastEntry[0] as { current_hash?: string } | undefined;
    const rootHash = lastRow?.current_hash || '';

    if (!rootHash) {
      log.warn({ orgId }, '链尾无 current_hash，跳过根哈希发布');
      return {
        orgId,
        rootHash: '',
        timestamp: new Date().toISOString(),
        signature: '',
        stored: false,
        publishedAt: new Date().toISOString(),
      };
    }

    const timestamp = new Date().toISOString();
    const signature = signRootHash(rootHash, this.signingSecret);
    const result = await this.externalStore.publish(orgId, rootHash, timestamp, signature);

    log.info({
      orgId,
      stored: result.stored,
      location: result.location || '(none)',
    }, rootHash ? '根哈希已发布' : '根哈希发布失败');

    return {
      orgId,
      rootHash,
      timestamp,
      signature,
      stored: result.stored,
      publishedAt: new Date().toISOString(),
    };
  }

  /**
   * 为所有监控的组织发布根哈希。
   */
  async publishForAllOrgs(): Promise<PublishRecord[]> {
    if (this.monitoredOrgs.length === 0) {
      log.debug('无监控组织，跳过自动发布');
      return [];
    }
    const results = await Promise.allSettled(
      this.monitoredOrgs.map(orgId => this.publishForOrg(orgId)),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<PublishRecord> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * 检查发布器是否正在运行。
   */
  get isRunning(): boolean {
    return this.timerId !== null;
  }
}
