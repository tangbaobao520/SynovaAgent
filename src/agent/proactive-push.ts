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
  type: 'feishu' | 'email' | 'webhook';
  /** 发送函数（返回 messageId） */
  send: (message: PushMessage) => Promise<string>;
  /** 是否启用 */
  enabled: boolean;
}

export interface PushMessage {
  title: string;
  body: string;
  severity: string;
  timestamp: string;
  link?: string;
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
    const message: PushMessage = {
      title: cardMessage.title,
      body: cardMessage.body + '\n\n' + cardMessage.buttons.map(b =>
        `[${b.label}](${cardMessage.callbackUrl}?action=${b.action})`
      ).join(' | '),
      severity: 'critical',
      timestamp: finding.detectedAt,
      link: cardMessage.callbackUrl,
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
      execSync('python "' + script + '" sentinel red "' + (finding.title || 'P0 finding').slice(0, 80) + '"', { timeout: 5000, stdio: 'ignore' });
    } catch (err) {
      log.warn({ err }, 'D249 emitSignal 失败 — 降级');
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
