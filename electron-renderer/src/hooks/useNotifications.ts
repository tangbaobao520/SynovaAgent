/**
 * hooks/useNotifications.ts — 通知轮询 hook (Phase 2.2 + D602 数据源切换)
 *
 * D602: 数据源切 GET /api/sentinel/tickets（D580 工单状态机真实数据源，spec §5.3 决策 3-B）——
 *   原 GET /api/notifications 上游零写入方恒空（sentinel_finding 记忆类型全仓无写入方，
 *   死数据源登记台账归哨兵线，本任务不修 src/routes/notifications.ts）。
 * alertCount 语义 = **open 工单数**（TitleBar 角标 / StatusBar 告警 / 托盘角标三者同源诚实化，
 * spec §5.1②——告警数 = 未处理告警）。
 * 已读状态 = 本地 localStorage 集合 `synova:read-tickets`（服务端已读模型属死数据源问题域，spec §6）。
 * 纯函数 loadTicketNotifications/actOnTicket 导出供测试直调（D593 loadSentinelData 先例）。
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
  /** D602: 哨兵工单扩展——存在时渲染动作按钮；值 = 工单状态机状态（open|acknowledged|resolved|dismissed） */
  ticketStatus?: string;
}

/** D602: 本地已读工单集合 localStorage 键（spec §5.1① 固定值） */
export const READ_TICKETS_STORAGE_KEY = 'synova:read-tickets';

/** D602: 工单动作（confirm→acknowledged / dismiss→dismissed，POST transition body.to 映射） */
export type TicketAction = 'confirm' | 'dismiss';

export interface TicketActionResult { ok: boolean; error?: string }

export interface TicketLoadResult {
  notifications: AppNotification[];
  /** alertCount 同源: open 工单数（hook 内 setAlertCount 消费） */
  openCount: number;
  degraded: boolean;
  error: string | null;
}

const POLL_INTERVAL = 30_000; // 30s

/** 工单状态 → 中文标签（非枚举值原样透传，不猜） */
export function ticketStatusLabel(status: string): string {
  switch (status) {
    case 'open': return '待处理';
    case 'acknowledged': return '已确认';
    case 'resolved': return '已解决';
    case 'dismissed': return '已标记误报';
    default: return status;
  }
}

/**
 * readReadTickets — 本地已读集合读取
 * @input  无（读 localStorage[READ_TICKETS_STORAGE_KEY]）
 * @output id 集合（无 window/无键 → 空集，正常缺省）
 * @degraded JSON.parse 失败/形状非法 → console.warn + 空集（铁律 24: 缺省与损坏区分，均不抛）
 */
function readReadTickets(): Set<string> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return new Set();
    const raw = window.localStorage.getItem(READ_TICKETS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('[useNotifications] 已读集合形状非法 — 按空集处理');
      return new Set();
    }
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch (err) {
    console.warn('[useNotifications] 已读集合读取失败 — 按空集处理:',
      err instanceof Error ? err.message : String(err));
    return new Set();
  }
}

/**
 * markTicketReadLocally — 工单 id 写入本地已读集合
 * @degraded localStorage 不可达/写失败 → console.warn 不抛（内存态已读仍生效，铁律 24）
 */
function markTicketReadLocally(id: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const next = readReadTickets();
    next.add(id);
    window.localStorage.setItem(READ_TICKETS_STORAGE_KEY, JSON.stringify([...next]));
  } catch (err) {
    console.warn('[useNotifications] 已读集合写入失败:',
      err instanceof Error ? err.message : String(err));
  }
}

/** 形状守卫的合法工单项（D580 SentinelTicketView 桌面侧最小投影） */
interface TicketView {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  createdAt: string;
  status: string;
}

/**
 * asTicketViews — GET /api/sentinel/tickets 响应形状守卫（RightPanel asSentinelTickets 先例，铁律 38）
 * @input  响应 JSON（unknown——不信任上游形状）
 * @output { tickets, skipped }；tickets 非数组（整体形状非法）→ null
 * @degraded 单项畸形（缺 id/title/createdAt）→ 跳过并计数，由调用方 warn（不静默）
 */
function asTicketViews(v: unknown): { tickets: TicketView[]; skipped: number } | null {
  if (typeof v !== 'object' || v === null) return null;
  const arr = (v as { tickets?: unknown }).tickets;
  if (!Array.isArray(arr)) return null;
  const out: TicketView[] = [];
  let skipped = 0;
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) { skipped++; continue; }
    const t = item as Record<string, unknown>;
    if (typeof t.id !== 'string' || t.id === '' || typeof t.title !== 'string' || typeof t.createdAt !== 'string') {
      skipped++;
      continue;
    }
    const severity = t.severity === 'critical' || t.severity === 'warning' || t.severity === 'info' ? t.severity : 'info';
    out.push({
      id: t.id,
      title: t.title,
      severity,
      createdAt: t.createdAt,
      status: typeof t.status === 'string' ? t.status : 'open',
    });
  }
  return { tickets: out, skipped };
}

/**
 * loadTicketNotifications — D602 数据源装载（纯函数，测试直调；spec §5.1①）
 * @input  无（fetch GET {getApiBase()}/api/sentinel/tickets，白名单免 JWT）
 * @output TicketLoadResult
 * @degraded 网络/HTTP 非 2xx → error 文案 + degraded + 空列表（不抛，铁律 24）；
 *           形状非法（tickets 非数组）→ error '通知数据形状非法'；memory-fallback → 数据照常
 *           装载 + degraded:true（诚实降级非错误，通知中心渲染降级提示）
 */
export async function loadTicketNotifications(): Promise<TicketLoadResult> {
  try {
    const res = await fetch(`${getApiBase()}/api/sentinel/tickets`);
    if (!res.ok) {
      console.warn('[useNotifications] tickets 请求失败 HTTP', res.status);
      return { notifications: [], openCount: 0, degraded: true, error: `获取通知失败 (HTTP ${res.status})` };
    }
    const data: unknown = await res.json();
    const guard = asTicketViews(data);
    if (guard === null) {
      console.warn('[useNotifications] tickets 响应形状非法（tickets 非数组）');
      return { notifications: [], openCount: 0, degraded: true, error: '通知数据形状非法' };
    }
    if (guard.skipped > 0) {
      console.warn('[useNotifications] 跳过畸形工单项:', guard.skipped);
    }
    const source = (data as { source?: unknown }).source;
    const degraded = source === 'memory-fallback' || (data as { degraded?: unknown }).degraded === true;
    const readSet = readReadTickets();
    const notifications: AppNotification[] = guard.tickets.map((t) => ({
      id: t.id,
      orgId: '',
      title: t.title,
      body: `哨兵巡检工单 · ${ticketStatusLabel(t.status)}`,
      severity: t.severity,
      createdAt: t.createdAt,
      read: readSet.has(t.id),
      ticketStatus: t.status,
    }));
    const openCount = notifications.filter((n) => n.ticketStatus === 'open').length;
    return { notifications, openCount, degraded, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[useNotifications] fetch failed', msg);
    return { notifications: [], openCount: 0, degraded: true, error: msg };
  }
}

/**
 * actOnTicket — 工单动作（纯函数，测试直调；spec §5.1③ / §5.3 决策 4）
 * @input  ticket id + action（confirm→acknowledged / dismiss→dismissed）
 * @output { ok:true } 或 { ok:false, error }（400/404/409/5xx/网络异常均不抛——UI 呈现失败提示，铁律 24）
 * @route  POST /api/sentinel/tickets/:id/transition（D580 状态机真实落库；alerts/:id/action
 *         零依赖注入空洞端点不接，spec §1 勘误 4）
 * @side-effect 成功后工单 id 入本地已读集合（通知面板不再计未读）
 */
export async function actOnTicket(id: string, action: TicketAction): Promise<TicketActionResult> {
  const to = action === 'confirm' ? 'acknowledged' : 'dismissed';
  try {
    const res = await fetch(`${getApiBase()}/api/sentinel/tickets/${encodeURIComponent(id)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    const data = await res.json().catch(() => null) as { ok?: unknown; error?: unknown } | null;
    if (res.ok && data !== null && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
      markTicketReadLocally(id);
      return { ok: true };
    }
    const errMsg = data !== null && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : `transition 失败 (HTTP ${res.status})`;
    console.warn('[useNotifications] actOnTicket 失败:', errMsg, { id, to, status: res.status });
    return { ok: false, error: errMsg };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[useNotifications] actOnTicket 异常:', msg, { id, to });
    return { ok: false, error: msg };
  }
}

/**
 * useNotifications — 通知轮询 hook（30s）
 * @output { notifications, unreadCount, loading, error, degraded, markAsRead, markAllRead, actOnTicket, refresh }
 * @degraded 加载失败 → error 透出（NotificationCenter 渲染 error banner，铁律 31 消灭假空态）
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const setAlertCount = useAppStore((s) => s.setAlertCount);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const result = await loadTicketNotifications();
    setNotifications(result.notifications);
    setDegraded(result.degraded);
    setError(result.error);
    // D602: alertCount = open 工单数（TitleBar/StatusBar/托盘角标同源诚实化）
    setAlertCount(result.openCount);
    setLoading(false);
  }, [setAlertCount]);

  // D602: 已读 = 本地 localStorage 集合（原 POST /api/notifications/:id/read 属死数据源族，移除；
  // 已读不改变 alertCount——open 工单数语义与已读解耦）
  const markAsRead = useCallback((id: string) => {
    markTicketReadLocally(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    // localStorage 写在 updater 外（updater 保持纯函数；notifications 经 deps 捕获当前值）
    for (const n of notifications) markTicketReadLocally(n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [notifications]);

  // D602: 动作 wrapper——成功后刷新拿状态机落库后的新状态（按钮消失/状态标签更新，spec §5.1③）
  const actOnTicketAndRefresh = useCallback(async (id: string, action: TicketAction): Promise<TicketActionResult> => {
    const result = await actOnTicket(id, action);
    if (result.ok) await fetchNotifications();
    return result;
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

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
    degraded,
    markAsRead,
    markAllRead,
    actOnTicket: actOnTicketAndRefresh,
    refresh: fetchNotifications,
  };
}
