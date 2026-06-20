/**
 * workspaces-api.ts — 工作区 CRUD API (PRD v1.6 Slice 2)
 *
 * GET  /api/workspaces          → 工作区列表
 * POST /api/workspaces          → 创建工作区
 * GET  /api/workspaces/:id      → 工作区详情
 * PUT  /api/workspaces/:id/status → 更新状态
 * POST /api/workspaces/:id/messages → 发送消息
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger';

const log = createLogger('routes/workspaces-api');
const router = Router();

interface Workspace {
  id: string;
  title: string;
  type: 'diagnostic' | 'manual';
  status: 'pending' | 'analyzing' | 'confirmed' | 'executing' | 'resolved' | 'shelved';
  priority: 'critical' | 'high' | 'medium' | 'low';
  expert?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory store (Phase 1; Phase 2 → SQLite via SessionStore)
const store = new Map<string, Workspace>();

router.get('/api/workspaces', (_req: Request, res: Response) => {
  const list = Array.from(store.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  res.json({ ok: true, workspaces: list });
});

router.post('/api/workspaces', (req: Request, res: Response) => {
  const { title, type = 'manual' } = req.body as { title?: string; type?: 'diagnostic' | 'manual' };
  if (!title) return res.status(400).json({ ok: false, error: 'title is required' });

  const id = `ws_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const ws: Workspace = {
    id, title, type, status: 'pending', priority: 'medium', createdAt: now, updatedAt: now,
  };
  store.set(id, ws);
  log.info({ id, title }, '工作区已创建');
  res.json({ ok: true, workspace: ws });
});

router.get('/api/workspaces/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const ws = store.get(id);
  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });
  res.json({ ok: true, workspace: ws });
});

router.put('/api/workspaces/:id/status', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const ws = store.get(id);
  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });

  const { status, priority } = req.body as { status?: Workspace['status']; priority?: Workspace['priority'] };
  if (status) ws.status = status;
  if (priority) ws.priority = priority;
  ws.updatedAt = new Date().toISOString();
  store.set(id, ws);
  log.info({ id, status }, '工作区状态已更新');
  res.json({ ok: true, workspace: ws });
});

router.post('/api/workspaces/:id/messages', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const ws = store.get(id);
  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });

  const { content } = req.body as { content?: string };
  if (!content) return res.status(400).json({ ok: false, error: 'content is required' });

  // Phase 1: simple echo (Phase 2 → ConversationEngine)
  const reply = `[${ws.title}] 收到: ${content.slice(0, 200)}。诊断引擎将在 Phase 2 接入。`;
  res.json({ ok: true, reply, workspaceId: ws.id });
});

export default router;
