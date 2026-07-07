/**
 * components/NotificationCenter.tsx — 通知中心 (Phase 2.2 + 2.3)
 *
 * 标题栏铃铛图标点击展开。
 * 使用 useNotifications hook 获取真实数据，30s 轮询。
 * 通知点击 → 导航到对应工作区。
 */
import React from 'react';
import { useAppStore } from '../stores/app-store';
import { useNotifications, type AppNotification } from '../hooks/useNotifications';

const TYPE_ICONS: Record<string, string> = {
  critical: '🚨', warning: '⚠️', info: '🔔',
};

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ open, onClose }) => {
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const { notifications, unreadCount, markAsRead, markAllRead, loading } = useNotifications();

  // 按 severity 排序取前 20
  const PRIORITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = [...notifications]
    .sort((a, b) => (PRIORITY_ORDER[a.severity] ?? 9) - (PRIORITY_ORDER[b.severity] ?? 9))
    .slice(0, 20);

  const handleClick = (n: AppNotification) => {
    markAsRead(n.id);
    if (n.workspaceId) {
      setActiveWorkspaceId(n.workspaceId);
      onClose();
    }
  };

  const handleMarkAll = () => {
    markAllRead();
  };

  if (!open) return null;

  return (
    <div className="notif-overlay" onClick={onClose}>
      <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
        <div className="notif-header">
          <span className="notif-title">通知{unreadCount > 0 ? ` (${unreadCount})` : ''}</span>
          {unreadCount > 0 && (
            <button className="notif-mark-all-btn" onClick={handleMarkAll}>
              全部已读
            </button>
          )}
          <button className="notif-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="notif-list">
          {loading && sorted.length === 0 && (
            <div className="notif-empty fade-in">
              <div className="notif-empty-text">加载中...</div>
            </div>
          )}

          {sorted.map((n) => (
            <div
              key={n.id}
              className={`notif-item${n.read ? '' : ' unread'} priority-${n.severity}`}
              onClick={() => handleClick(n)}
            >
              <div className="notif-item-icon">{TYPE_ICONS[n.severity] || '📌'}</div>
              <div className="notif-item-body">
                <div className="notif-item-title">{n.title}</div>
                <div className="notif-item-body-text">{n.body}</div>
                <div className="notif-item-time">{fmtRelative(n.createdAt)}</div>
              </div>
              <div className={`notif-priority-dot priority-${n.severity}`} />
            </div>
          ))}

          {!loading && sorted.length === 0 && (
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
