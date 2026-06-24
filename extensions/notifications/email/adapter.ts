/** Email 通知适配器 */
import type { NotificationAdapter, Notification, NotificationResult } from '../../../src/notifications/types';
export const emailNotificationAdapter: NotificationAdapter = {
  channel: 'email',
  shouldHandle(n: Notification) { return n.targetSystem === 'email' || !n.targetSystem; },
  async send(n: Notification): Promise<NotificationResult> {
    console.log('[email] would send:', n.title, 'to org', n.orgId);
    return { success: true, externalId: 'email-' + n.id };
  },
};
