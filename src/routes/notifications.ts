/**
 * routes/notifications.ts — 通知系统 API (Phase 2.1)
 *
 * 从 AgentMemoryStore 读取 type=sentinel_finding 的记录作为通知。
 * 支持已读状态追踪（内存级，服务重启后重置）。
 *
 * 端点:
 *   GET    /api/notifications              — 通知列表 (?unread=true 过滤)
 *   POST   /api/notifications/:id/read     — 标记已读
 *   POST   /api/notifications/read-all     — 全部已读
 *   GET    /api/notifications/unread-count — 未读数
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/notifications');
const router = Router();

// 已读追踪（内存级 — 服务重启后重置）
const readIds = new Set<string>();

/** MemoryEntryLike 最小接口（避免 L1→L4 跨层 import） */
interface MemoryEntryLike {
  id: string;
  orgId: string;
  key: string;
  value: string;
  type: string;
  tags: string[];
  createdAt: string;
}

interface NotificationResponse {
  id: string;
  orgId: string;
  title: string;
  body: string;
  severity: 'critical' | 'warning' | 'info';
  workspaceId?: string;
  createdAt: string;
  read: boolean;
}

/** 将 AgentMemoryStore 条目转为通知响应 */
function entryToNotification(entry: MemoryEntryLike): NotificationResponse {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(entry.value) as Record<string, unknown>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, '通知 JSON 解析失败');
    parsed = { title: entry.id, body: entry.value };
  }

  // 从 tags 中提取 severity
  const severity = entry.tags?.includes('critical') ? 'critical'
    : entry.tags?.includes('warning') ? 'warning'
    : 'info';

  return {
    id: entry.id,
    orgId: entry.orgId,
    title: (parsed.title as string) || '哨兵通知',
    body: (parsed.body as string) || (parsed.message as string) || entry.value.slice(0, 200),
    severity,
    workspaceId: parsed.workspaceId as string | undefined,
    createdAt: entry.createdAt,
    read: readIds.has(entry.id),
  };
}

// GET /api/notifications — 通知列表
router.get('/api/notifications', (req: Request, res: Response) => {
  try {
    const { getAgentMemoryStore } = require('../l4/agent-memory-store');
    const { getDatabase } = require('../init/engine-context');
    const memStore = getAgentMemoryStore(getDatabase());

    const unreadOnly = req.query.unread === 'true';

    // 查询所有 sentinel_finding 类型的记忆（跨组织）
    const entries: MemoryEntryLike[] = memStore.listByType('sentinel_finding', 50);

    let notifications: NotificationResponse[] = entries.map(entryToNotification);

    // 按 createdAt 降序排列
    notifications.sort((a: NotificationResponse, b: NotificationResponse) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (unreadOnly) {
      notifications = notifications.filter((n: NotificationResponse) => !n.read);
    }

    res.json({ ok: true, notifications, total: notifications.length, degraded: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'GET /api/notifications 失败 — degraded');
    res.json({ ok: false, notifications: [], total: 0, degraded: true, error: msg });
  }
});

// POST /api/notifications/:id/read — 标记已读
router.post('/api/notifications/:id/read', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    readIds.add(id);
    res.json({ ok: true, id, degraded: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'POST /api/notifications/:id/read 失败 — degraded');
    res.json({ ok: false, degraded: true, error: msg });
  }
});

// POST /api/notifications/read-all — 全部已读
router.post('/api/notifications/read-all', (req: Request, res: Response) => {
  try {
    const { getAgentMemoryStore } = require('../l4/agent-memory-store');
    const { getDatabase } = require('../init/engine-context');
    const memStore = getAgentMemoryStore(getDatabase());

    const entries: MemoryEntryLike[] = memStore.listByType('sentinel_finding', 200);

    for (const entry of entries) {
      readIds.add(entry.id);
    }

    res.json({ ok: true, count: entries.length, degraded: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'POST /api/notifications/read-all 失败 — degraded');
    res.json({ ok: false, degraded: true, error: msg });
  }
});

// GET /api/notifications/unread-count — 未读数
router.get('/api/notifications/unread-count', (req: Request, res: Response) => {
  try {
    const { getAgentMemoryStore } = require('../l4/agent-memory-store');
    const { getDatabase } = require('../init/engine-context');
    const memStore = getAgentMemoryStore(getDatabase());

    const entries: MemoryEntryLike[] = memStore.listByType('sentinel_finding', 200);
    const unreadCount = entries.filter((e: MemoryEntryLike) => !readIds.has(e.id)).length;

    res.json({ ok: true, count: unreadCount, degraded: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'GET /api/notifications/unread-count 失败 — degraded');
    res.json({ ok: false, count: 0, degraded: true, error: msg });
  }
});

export default router;
