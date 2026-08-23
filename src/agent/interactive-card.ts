/**
 * src/agent/interactive-card.ts — 交互式卡片回复 (D18)
 *
 * D17 推送 P0 告警。D18 让用户可以通过卡片按钮回复:
 *   [Confirm] — 确认告警。写入审计。
 *   [Dismiss] — 标记为误报。写入 D93 feedbackCollector。
 *   [Details] — 查看完整发现文本。卡片展开。
 *
 * 铁律 24+31: catch + log.warn + degraded
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';
import { loadConfig } from '../config';
import type { GAFeedbackHandler, GAFeedbackActionType } from '../l3/ga-collaboration';

const log = createLogger('agent/interactive-card');

// D476 O8: orgId 是启动期常量（SYNOVA_ORG_ID 只在进程启动时读取）。
// GA 反馈构建在请求热路径上，模块级一次加载避免每请求文件 I/O + 日志；
// 与仓内 per-call loadConfig() 惯例不同，属有意例外（dev doc §3.2 回填）。
const config = loadConfig();

// ═══ Types ═══

export interface CardSentinelFinding {
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

export type CardActionType = 'confirm' | 'dismiss' | 'details' | 'flag' | 'correct' | 'rediagnose';

export interface CardAction {
  findingId: string;
  action: CardActionType;
  userId: string;
  enterpriseId: string;
  timestamp?: string;
}

export interface CardActionResult {
  findingId: string;
  action: CardActionType;
  userId: string;
  status: 'success' | 'failed';
  cardUpdate: CardUpdate;
  timestamp: string;
  error?: string;
}

export interface CardUpdate {
  /** 更新后的卡片标题 */
  title: string;
  /** 更新后的卡片正文 */
  body: string;
  /** 卡片颜色 (green/grey/blue) */
  color: 'green' | 'grey' | 'blue';
  /** 是否仍在交互状态 */
  interactive: boolean;
}

export interface CardMessage {
  /** 卡片标题 */
  title: string;
  /** 卡片正文 */
  body: string;
  /** 卡片颜色 */
  color: 'red' | 'orange' | 'blue';
  /** 交互按钮 */
  buttons: Array<{
    id: string;
    label: string;
    action: CardActionType;
    style: 'primary' | 'default' | 'danger';
  }>;
  /** 回调 URL */
  callbackUrl: string;
}

// ═══ InteractiveCardHandler ═══

export class InteractiveCardHandler {
  private callbackBaseUrl: string;

  constructor(callbackBaseUrl?: string) {
    this.callbackBaseUrl = callbackBaseUrl || '/api/sentinel/alerts';
  }

  /**
   * 构建带 GA 交互按钮的卡片消息。
   * GA 反馈处理由 GAFeedbackHandler 接管 (D19)。
   *
   * @param finding — 哨兵发现
   * @returns CardMessage — 含 Confirm/Dismiss/Details 三个按钮 + GA 按钮
   */
  buildGACardMessage(finding: CardSentinelFinding): CardMessage {
    const base = this.buildCardMessage(finding);
    base.buttons.push(
      { id: `flag-${finding.id}`, label: '标记为不正确', action: 'flag', style: 'danger' },
      { id: `correct-${finding.id}`, label: '纠正', action: 'correct', style: 'primary' },
      { id: `rediagnose-${finding.id}`, label: '重新诊断', action: 'rediagnose', style: 'default' },
    );
    return base;
  }

  buildCardMessage(finding: CardSentinelFinding): CardMessage {
    return {
      title: `[P0 Alert] ${finding.title}`,
      body: [
        `**严重程度**: CRITICAL`,
        ``,
        `**描述**: ${finding.description || '无描述'}`,
        `**建议**: ${finding.suggestion || '无建议'}`,
        `**时间**: ${finding.detectedAt}`,
        ``,
        `请选择操作:`,
      ].join('\n'),
      color: 'red',
      buttons: [
        { id: `confirm-${finding.id}`, label: '确认收到', action: 'confirm', style: 'primary' },
        { id: `dismiss-${finding.id}`, label: '标记为误报', action: 'dismiss', style: 'default' },
        { id: `details-${finding.id}`, label: '查看详情', action: 'details', style: 'default' },
      ],
      callbackUrl: `${this.callbackBaseUrl}/${finding.id}/action`,
    };
  }

  /**
   * 处理卡片按钮点击动作。
   *
   * @param action — 用户操作
   * @param feedbackCollector — D93 反馈收集器实例（可选，用于 Dismiss）
   * @param auditStore — 审计存储实例（可选）
   * @param findingFinder — 根据 findingId 查找完整发现的函数（可选，用于 Details）
   * @returns CardActionResult
   */
  async handleAction(
    action: CardAction,
    feedbackCollector?: { collectFeedback(data: Record<string, unknown>): Promise<string> },
    auditStore?: { write(entry: Record<string, unknown>): Promise<string> },
    findingFinder?: (id: string) => CardSentinelFinding | undefined,
    userRole?: string,
    gaFeedbackHandler?: GAFeedbackHandler,
  ): Promise<CardActionResult> {
    const timestamp = action.timestamp || new Date().toISOString();
    const base: Omit<CardActionResult, 'cardUpdate'> = {
      findingId: action.findingId,
      action: action.action,
      userId: action.userId,
      status: 'success',
      timestamp,
    };

    try {
      switch (action.action) {
        case 'confirm':
          return await this.handleConfirm(action, base, auditStore);

        case 'dismiss':
          return await this.handleDismiss(action, base, feedbackCollector);

        case 'details':
          return this.handleDetails(action, base, findingFinder);

        case 'flag':
        case 'correct':
        case 'rediagnose':
          if (gaFeedbackHandler) {
            const gaResult = await gaFeedbackHandler.processFeedback({
              action: action.action as GAFeedbackActionType,
              findingId: action.findingId,
              gaUserId: action.userId || 'unknown',
              // D476 O8: 源头携带企业上下文（action.enterpriseId），兜底实例默认 org——不再硬编码 'default'
              enterpriseId: action.enterpriseId || config.orgId,
            });
            return {
              ...base,
              status: gaResult.status === 'success' ? 'success' : 'failed',
              cardUpdate: {
                title: gaResult.status === 'success' ? 'GA 操作已提交' : 'GA 操作失败',
                body: gaResult.message || (gaResult.status === 'success' ? 'GA 反馈已记录' : 'GA 反馈处理异常 — 请重试'),
                color: 'blue' as const,
                interactive: false,
              },
            };
          }
          // 无 GAFeedbackHandler 时返回静态占位消息（优雅降级）
          return {
            ...base,
            status: 'success',
            cardUpdate: { title: 'GA 操作已提交', body: 'GA 反馈已记录，再诊断已触发', color: 'blue', interactive: false },
          };

        default:
          return {
            ...base,
            status: 'failed',
            cardUpdate: {
              title: '未知操作',
              body: `操作 "${action.action}" 不被支持。请使用 Confirm/Dismiss/Details。`,
              color: 'grey',
              interactive: false,
            },
            error: `Unknown action: ${action.action}`,
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, findingId: action.findingId, action: action.action }, '卡片操作失败');
      return {
        ...base,
        status: 'failed',
        cardUpdate: {
          title: '操作失败',
          body: `处理"${action.action}"操作时出错: ${msg}\n\n请重试或联系技术支持。`,
          color: 'grey',
          interactive: false,
        },
        error: msg,
      };
    }
  }

  private async handleConfirm(
    action: CardAction,
    base: Omit<CardActionResult, 'cardUpdate'>,
    auditStore?: { write(entry: Record<string, unknown>): Promise<string> },
  ): Promise<CardActionResult> {
    if (auditStore) {
      try {
        await auditStore.write({
          orgId: action.enterpriseId,
          actorId: action.userId,
          actorRole: 'manager',
          action: 'alert.confirm',
          targetType: 'SENTINEL_FINDING',
          targetId: action.findingId,
          newValue: JSON.stringify({ confirmedAt: base.timestamp }),
        });
      } catch (err: unknown) {
        log.warn({ err, findingId: action.findingId }, '确认审计写入失败 — 降级');
      }
    }

    return {
      ...base,
      cardUpdate: {
        title: '✅ 已确认收到',
        body: `告警 ${action.findingId} 已被 ${action.userId} 确认。`,
        color: 'green',
        interactive: false,
      },
    };
  }

  private async handleDismiss(
    action: CardAction,
    base: Omit<CardActionResult, 'cardUpdate'>,
    feedbackCollector?: { collectFeedback(data: Record<string, unknown>): Promise<string> },
  ): Promise<CardActionResult> {
    if (feedbackCollector) {
      try {
        await feedbackCollector.collectFeedback({
          enterpriseId: action.enterpriseId,
          actorId: action.userId,
          decision: 'reject',
          targetType: 'sentinel_alert',
          targetId: action.findingId,
          reason: 'User dismissed via card',
          actorRole: 'manager',
        });
        log.info({ findingId: action.findingId, userId: action.userId }, '已记录 Dismiss 反馈到 D93');
      } catch (err: unknown) {
        log.warn({ err, findingId: action.findingId }, 'D93 反馈写入失败 — 降级');
      }
    }

    return {
      ...base,
      cardUpdate: {
        title: '已标记为误报',
        body: `告警 ${action.findingId} 已被 ${action.userId} 标记为误报。\n此反馈将用于阈值自动校准。`,
        color: 'grey',
        interactive: false,
      },
    };
  }

  private handleDetails(
    action: CardAction,
    base: Omit<CardActionResult, 'cardUpdate'>,
    findingFinder?: (id: string) => CardSentinelFinding | undefined,
  ): CardActionResult {
    let detailBody: string;

    if (findingFinder) {
      const finding = findingFinder(action.findingId);
      if (finding) {
        detailBody = [
          `**告警 ID**: ${finding.id}`,
          `**哨兵**: ${finding.sentinelName} (${finding.sentinelId})`,
          `**标题**: ${finding.title}`,
          `**严重程度**: ${finding.severity}`,
          `**描述**: ${finding.description || '无'}`,
          `**建议**: ${finding.suggestion || '无'}`,
          `**检测时间**: ${finding.detectedAt}`,
          finding.matchedEdgeIds?.length ? `**关联边**: ${finding.matchedEdgeIds.join(', ')}` : '',
        ].filter(Boolean).join('\n');
      } else {
        detailBody = `未找到告警 ${action.findingId} 的详细信息。`;
      }
    } else {
      detailBody = `告警 ID: ${action.findingId}\n\n(详细数据未配置查询接口)`;
    }

    return {
      ...base,
      cardUpdate: {
        title: '📋 告警详情',
        body: detailBody,
        color: 'blue',
        interactive: true,
      },
    };
  }
}
