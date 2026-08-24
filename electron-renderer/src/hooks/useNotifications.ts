/**
 * hooks/useNotifications.ts — 通知轮询 hook (Phase 2.2)
 *
 * 调用 GET /api/notifications，30s 轮询。
 * 管理 unreadCount 状态，替换 NotificationCenter 中的 MOCK_NOTIFICATIONS。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/app-store';
import { getApiBase } from '../lib/api';

export interface AppNotification {
  id: string;
  orgId: string;
  title: string;
  body: string;
  severity: 'critical' | 'warning' | 'info';
  workspaceId?: string;
  createdAt: string;
  read: boolean;
}

const POLL_INTERVAL = 30_000; // 30s

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAlertCount = useAppStore((s) => s.setAlertCount);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getApiBase()}/api/notifications`);
      const data = await res.json() as { ok: boolean; notifications: AppNotification[]; degraded?: boolean };
      if (data.ok) {
        setNotifications(data.notifications);
        const unreadCount = data.notifications.filter(n => !n.read).length;
        setAlertCount(unreadCount);
        setError(null);
      } else {
        setError('获取通知失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[useNotifications] fetch failed', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setAlertCount]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch(`${getApiBase()}/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => {
        const next = prev.map(n => n.id === id ? { ...n, read: true } : n);
        setAlertCount(next.filter(n => !n.read).length);
        return next;
      });
    } catch (err: unknown) {
      console.warn('[useNotifications] markAsRead failed', err instanceof Error ? err.message : String(err));
    }
  }, [setAlertCount]);

  const markAllRead = useCallback(async () => {
    try {
      await fetch(`${getApiBase()}/api/notifications/read-all`, { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setAlertCount(0);
    } catch (err: unknown) {
      console.warn('[useNotifications] markAllRead failed', err instanceof Error ? err.message : String(err));
    }
  }, [setAlertCount]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // 初始加载 + 30s 轮询
  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllRead,
    refresh: fetchNotifications,
  };
}
