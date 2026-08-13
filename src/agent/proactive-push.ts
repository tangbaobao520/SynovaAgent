/**
 * src/agent/proactive-push.ts — P0 哨兵告警主动推送服务
 *
 * D17: SentinelRunner 检测到 P0(critical) finding 时自动推送到配置通道。
 * 复用 D05 推送管道，增加重试(3次指数退避)+审计记录。
 *
 * 流程:
 * 1. SentinelRunner 检测 P0 finding → 调用 onP0Finding
 * 2. 并行推送到所有配置通道 (Promise.allSettled)
 * 3. 失败通道: 3 次重试 (10s, 30s, 90s)
 * 4. 重试耗尽: 写入审计日志
 * 5. P1/P2: 过滤不推送
 *
 * 契约:
 *   @input  — SentinelFinding (critical severity)
 *   @output — PushResult[]
 *   @degraded — 推送失败 → log.warn + retry → 最终写入审计
 */
import type { ActionStoreLike } from "../growth/action-types";
import type { WorkspaceRole } from "../middleware/rbac";
import { createLogger } from '@synova/logger';
import { InteractiveCardHandler } from './interactive-card';

const log = createLogger('agent/proactive-push');

// D18: 交互式卡片处理器
const cardHandler = new InteractiveCardHandler();

// ═══ Types ═══

export interface SentinelFinding {
  id: string;
  sentinelId: string;
  sentinelName: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description?: string;
  suggestion?: string;
  detectedAt: string;
  matchedEdgeIds?: string[];
}

export interface PushChannel {
  /** 通道标识 */
  id: string;
  /** 通道类型 */
  type: 'feishu' | 'email' | 'webhook' | 'signal-file' | 'electron-notify';
  /** 发送函数（返回 messageId） */
  send: (message: PushMessage) => Promise<string>;
  /** 是否启用 */
  enabled: boolean;
  /** D272: 去重键（同 key 5 分钟内不重复） */
  dedupKey?: string;
}

export interface PushMessage {
  title: string;
  body: string;
  severity: string;
  timestamp: string;
  link?: string;
  /** D285: 目标角色过滤 (undefined=全体可见, 消费端按角色过滤) */
  targetRoles?: WorkspaceRole[];
}

export interface PushResult {
  findingId: string;
  channelId: string;
  status: 'delivered' | 'failed' | 'filtered';
  messageId?: string;
  error?: string;
  retries: number;
  deliveredAt?: string;
}

// ═══ 默认推送消息格式 ═══

function formatPushMessage(finding: SentinelFinding, dashboardUrl?: string): PushMessage {
  const link = dashboardUrl ? `${dashboardUrl}/alerts/${finding.id}` : undefined;
  return {
    title: `[Synova P0 Alert] ${finding.sentinelName}: ${finding.title}`,
    body: [
      `Severity: CRITICAL`,
      `Description: ${finding.description || '无描述'}`,
      `Suggestion: ${finding.suggestion || '无建议'}`,
      `Detected: ${finding.detectedAt}`,
      link ? `View: ${link}` : '',
    ].filter(Boolean).join('\n'),
    severity: 'critical',
    timestamp: finding.detectedAt,
    link,
  };
}

// ═══ 重试调度 ═══

const RETRY_DELAYS = [10_000, 30_000, 90_000]; // 10s, 30s, 90s

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══ ProactivePush ═══

export class ProactivePush {
  private channels: PushChannel[];
  private retryDelays: number[];
  private actionStore: ActionStoreLike | null;
  private auditStore: { write(entry: Record<string, unknown>): Promise<string> } | null;
  private dashboardUrl: string;
  /** D272: 去重缓存 — dedupKey → timestamp */
  private dedupCache: Map<string, number>;
  /** D272: 去重窗口 (5分钟) */
  private readonly DEDUP_WINDOW_MS = 300_000;
  /** D272: 去重缓存最大条目 (超过后淘汰 oldest 25%) */
  private readonly MAX_DEDUP_SIZE = 1000;
  /** D272: 过期条目保留的宽限期 (超过后 sweep 清理) */
  private readonly DEDUP_SWEEP_GRACE_MS = 600_000; // 10 min (2x window)
  /** D272: sweep 调用计数器 (每 32 次完整 onP0Finding 执行一次 sweep) */
  private sweepCounter = 0;

  constructor(
    channels: PushChannel[],
    dashboardUrl?: string,
    retryDelays?: number[],
  ) {
    this.channels = channels.filter(c => c.enabled);
    this.retryDelays = retryDelays || RETRY_DELAYS;
    this.actionStore = null;
    this.auditStore = null;
    this.dashboardUrl = dashboardUrl || 'http://localhost:3000';
    this.dedupCache = new Map();
  }

  /** 注入审计存储 */
  setActionStore(store: ActionStoreLike): void {
    this.actionStore = store;
  }

  setAuditStore(store: { write(entry: Record<string, unknown>): Promise<string> }): void {
    this.auditStore = store;
  }

  /**
   * P0 finding 处理器 — 被 SentinelRunner 调用。
   * P1/P2 被过滤不推送。
   */
  async onP0Finding(finding: SentinelFinding): Promise<PushResult[]> {
    // 仅推送 critical 级别
    if (finding.severity !== 'critical') {
      log.debug({ findingId: finding.id, severity: finding.severity }, '非 P0 finding — 过滤');
      return [{
        findingId: finding.id, channelId: 'filter',
        status: 'filtered', retries: 0,
      }];
    }

    // D18: 使用交互式卡片替代纯文本
    const cardMessage = cardHandler.buildCardMessage(finding);
    // D285: 按 severity 标注目标角色
    const targetRoles: WorkspaceRole[] = finding.severity === 'critical'
      ? ['admin', 'manager', 'liaison', 'staff', 'ga']
      : finding.severity === 'warning'
      ? ['admin', 'manager', 'ga']
      : ['admin'];
    const message: PushMessage = {
      title: cardMessage.title,
      body: cardMessage.body + '\n\n' + cardMessage.buttons.map(b =>
        `[${b.label}](${cardMessage.callbackUrl}?action=${b.action})`
      ).join(' | '),
      severity: finding.severity,
      timestamp: finding.detectedAt,
      link: cardMessage.callbackUrl,
      targetRoles,
    };
    const results: PushResult[] = [];

    // D21: 创建 Action（推送到通道前创建，保证因果锚点）
    if (this.actionStore) {
      try {
        const action = this.actionStore.createAction(finding);
        log.info({ actionId: action.id, signalId: finding.id }, "D21 Action 已从 P0 信号创建");
      } catch (err) {
        log.warn({ err, signalId: finding.id }, "D21 Action 创建失败 — 不阻断推送");
      }
    }

    // D249: 产出控制塔信号 — Electron main.cjs 轮询 cockpit/data 触发桌面通知
    try {
      const { execSync } = require('child_process');
      const script = require('path').join(process.cwd(), 'scripts/control-tower/emit-signal.py');
      const sigStatus = finding.severity === 'critical' ? 'red' : finding.severity === 'warning' ? 'yellow' : 'green';
      execSync('python "' + script + '" sentinel ' + sigStatus + ' "' + (finding.title || 'P0 finding').slice(0, 80) + '"', { timeout: 5000, stdio: 'ignore' });
    } catch (err) {
      log.warn({ err }, 'D249 emitSignal 失败 — 降级');
    }

    // D272: 去重检查 — 同 finding id + channel id 组合 5 分钟内不重复
    const dedupKey = finding.id;
    const now = Date.now();
    const lastPush = this.dedupCache.get(dedupKey);
    if (lastPush && (now - lastPush) < this.DEDUP_WINDOW_MS) {
      log.info({ findingId: finding.id, dedupKey }, `去重: 同 key ${(now - lastPush) / 1000}s 前已推送`);
      return [{
        findingId: finding.id, channelId: 'dedup',
        status: 'filtered', retries: 0,
      }];
    }
    this.dedupCache.set(dedupKey, now);

    // D272: 去重缓存家政 — 上限保护 + 过期条目 sweep
    if (this.dedupCache.size > this.MAX_DEDUP_SIZE) {
      // 淘汰 oldest 25% 条目
      const sorted = [...this.dedupCache.entries()].sort((a, b) => a[1] - b[1]);
      const toEvict = Math.ceil(this.MAX_DEDUP_SIZE * 0.25);
      for (let i = 0; i < toEvict && i < sorted.length; i++) {
        this.dedupCache.delete(sorted[i][0]);
      }
      log.info({ evicted: toEvict, remaining: this.dedupCache.size }, 'dedupCache 上限保护 — 已淘汰 oldest 25%');
    }
    // 轻量 sweep: 删除超过宽限期的条目 (每 32 次 onP0Finding 执行一次)
    this.sweepCounter++;
    if (this.dedupCache.size > 0 && this.sweepCounter % 32 === 0) {
      const cutoff = now - this.DEDUP_WINDOW_MS - this.DEDUP_SWEEP_GRACE_MS;
      let swept = 0;
      for (const [k, ts] of this.dedupCache) {
        if (ts < cutoff) {
          this.dedupCache.delete(k);
          swept++;
        }
      }
      if (swept > 0) {
        log.debug({ swept, remaining: this.dedupCache.size }, 'dedupCache sweep 完成');
      }
    }

    // 并行推送到所有通道
    const pushResults = await Promise.allSettled(
      this.channels.map(channel => this.pushToChannel(channel, finding, message)),
    );

    for (const result of pushResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }

    // 记录失败推送
    const failed = results.filter(r => r.status === 'failed');
    if (failed.length > 0 && this.auditStore) {
      try {
        await this.auditStore.write({
          orgId: 'synova',
          actorId: 'system:proactive-push',
          actorRole: 'system',
          action: 'proactive_push.failed',
          targetType: 'SENTINEL_FINDING',
          targetId: finding.id,
          newValue: JSON.stringify({ failedChannels: failed.map(f => ({ channelId: f.channelId, error: f.error })) }),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err: msg, findingId: finding.id }, '审计日志写入失败 — 降级');
      }
    }

    return results;
  }

  /**
   * 推送到单个通道（含重试逻辑）。
   */
  async pushToChannel(channel: PushChannel, finding: SentinelFinding, message?: PushMessage): Promise<PushResult> {
    const msg = message || formatPushMessage(finding, this.dashboardUrl);

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        const messageId = await channel.send(msg);
        log.info({ findingId: finding.id, channelId: channel.id, messageId }, 'P0 推送成功');
        return {
          findingId: finding.id, channelId: channel.id,
          status: 'delivered', messageId, retries: attempt,
          deliveredAt: new Date().toISOString(),
        };
      } catch (err: unknown) {
        const msg_err = err instanceof Error ? err.message : String(err);
        log.warn({ findingId: finding.id, channelId: channel.id, attempt: attempt + 1, err: msg_err }, 'P0 推送失败 — 重试流程');

        if (attempt < this.retryDelays.length) {
          log.warn({ findingId: finding.id, channelId: channel.id, attempt: attempt + 1, err: msg_err },
            `P0 推送失败，${this.retryDelays.length - attempt - 1} 次重试剩余`);
          await delay(this.retryDelays[attempt]);
        } else {
          log.error({ findingId: finding.id, channelId: channel.id, err: msg_err },
            'P0 推送失败 — 重试耗尽');
          return {
            findingId: finding.id, channelId: channel.id,
            status: 'failed', error: msg_err, retries: attempt,
          };
        }
      }
    }

    // 不应到达这里
    return { findingId: finding.id, channelId: channel.id, status: 'failed', error: 'unknown', retries: RETRY_DELAYS.length };
  }

  /**
   * 手动重试失败的推送。
   */
  async retryFailed(findingId: string, maxRetries: number = 3): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (const channel of this.channels) {
      const result = await this.pushToChannel(channel, {
        id: findingId, sentinelId: 'retry', sentinelName: 'Retry',
        severity: 'critical', title: '重试推送', detectedAt: new Date().toISOString(),
      });
      results.push(result);
    }
    return results;
  }
}
