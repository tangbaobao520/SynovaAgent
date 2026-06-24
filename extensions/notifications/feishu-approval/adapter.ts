/** 飞书审批通知适配器 */
import type { NotificationAdapter, Notification, NotificationResult } from '../../../src/notifications/types';
export const feishuApprovalAdapter: NotificationAdapter = {
  channel: 'feishu-approval',
  shouldHandle(n: Notification) { return n.targetSystem === 'feishu-approval'; },
  async send(n: Notification): Promise<NotificationResult> {
    console.log('[feishu-approval] would create approval:', n.title);
    return { success: true, externalId: 'feishu-' + n.id };
  },
};
