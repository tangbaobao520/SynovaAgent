/**
 * components/NotificationCenter.tsx — 通知中心 (Phase 2.2)
 *
 * 标题栏铃铛图标点击展开.
 * 显示最近 20 条通知, 按优先级排序 (critical → warning → info).
 * 未读通知高亮, 点击标记已读.
 */
import React, { useState, useCallback } from 'react';
import { useAppStore } from '../stores/app-store';

interface AppNotification {
  id: string;
  type: 'alert' | 'update' | 'complete' | 'correction';
  priority: 'critical' | 'warning' | 'info';
  title: string;
  body: string;
  workspaceId?: string;
  createdAt: string;
  read: boolean;
}

const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', type: 'alert', priority: 'critical', title: '现金流预警', body: '现金流健康度降至 0.3，低于警戒线', createdAt: new Date().toISOString(), read: false },
  { id: 'n2', type: 'alert', priority: 'warning', title: '组织风险', body: '关键岗位离职率上升 15%', createdAt: new Date(Date.now() - 3600000).toISOString(), read: false },
  { id: 'n3', type: 'complete', priority: 'info', title: '诊断完成', body: '财务诊断报告已生成', createdAt: new Date(Date.now() - 7200000).toISOString(), read: true },
  { id: 'n4', type: 'update', priority: 'info', title: '方案更新', body: '增长方案 v2 已更新', createdAt: new Date(Date.now() - 86400000).toISOString(), read: true },
  { id: 'n5', type: 'correction', priority: 'warning', title: '纠错通知', body: 'GA 对"市场定位"结论提交了纠错', createdAt: new Date(Date.now() - 172800000).toISOString(), read: false },
];

const PRIORITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function sortByPriority(a: AppNotification, b: AppNotification): number {
  return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
}

const TYPE_ICONS: Record<string, string> = {
  alert: '🚨', update: '📋', complete: '✅', correction: '✏️',
};

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ open, onClose }) => {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const setAlertCount = useAppStore((s) => s.setAlertCount);

  // 按优先级排序取前 20
  const sorted = [...notifications].sort(sortByPriority).slice(0, 20);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      setAlertCount(next.filter((n) => !n.read).length);
      return next;
    });
  }, [setAlertCount]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      setAlertCount(0);
      return next;
    });
  }, [setAlertCount]);

  if (!open) return null;

  return (
    <div className="notif-overlay" onClick={onClose}>
      <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
        <div className="notif-header">
          <span className="notif-title">通知{unreadCount > 0 ? ` (${unreadCount})` : ''}</span>
          {unreadCount > 0 && (
            <button className="notif-mark-all-btn" onClick={markAllRead}>
              全部已读
            </button>
          )}
          <button className="notif-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="notif-list">
          {sorted.map((n) => (
            <div
              key={n.id}
              className={`notif-item${n.read ? '' : ' unread'} priority-${n.priority}`}
              onClick={() => markAsRead(n.id)}
            >
              <div className="notif-item-icon">{TYPE_ICONS[n.type] || '📌'}</div>
              <div className="notif-item-body">
                <div className="notif-item-title">{n.title}</div>
                <div className="notif-item-body-text">{n.body}</div>
                <div className="notif-item-time">{fmtRelative(n.createdAt)}</div>
              </div>
              <div className={`notif-priority-dot priority-${n.priority}`} />
            </div>
          ))}

          {sorted.length === 0 && (
            <div className="notif-empty fade-in">
              <div className="notif-empty-icon">🔔</div>
              <div className="notif-empty-text">暂无通知</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function fmtRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default React.memo(NotificationCenter);
