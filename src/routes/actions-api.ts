/**
 * actions-api.ts — 行动项 CRUD (PRD §7, v3.5)
 * POST /api/actions → 创建 | GET /api/actions → 列表 | PUT /api/actions/:id/status → 状态流转
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger';

const log = createLogger('routes/actions-api');
const router = Router();

interface ActionItem {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  status: 'pending' | 'confirmed' | 'executing' | 'completed' | 'rejected';
  priority: 'critical' | 'high' | 'medium' | 'low';
  owner?: string;
  createdAt: string;
  updatedAt: string;
}

const store = new Map<string, ActionItem>();

router.post('/api/actions', (req: Request, res: Response) => {
  const { workspaceId, title, description, priority } = req.body as Record<string, string>;
  if (!workspaceId || !title) return res.status(400).json({ ok: false, error: 'workspaceId and title required' });
  const id = `act_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const item: ActionItem = { id, workspaceId, title, description: description || '', status: 'pending', priority: (priority as ActionItem['priority']) || 'medium', createdAt: now, updatedAt: now };
  store.set(id, item);
  log.info({ id, title }, '行动项已创建');
  res.json({ ok: true, action: item });
});

router.get('/api/actions', (req: Request, res: Response) => {
  const wsId = String(req.query.workspaceId || '');
  const list = Array.from(store.values())
    .filter(a => !wsId || a.workspaceId === wsId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json({ ok: true, actions: list });
});

router.put('/api/actions/:id/status', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const item = store.get(id);
  if (!item) return res.status(404).json({ ok: false, error: 'action not found' });
  const { status } = req.body as { status?: string };
  if (!status) return res.status(400).json({ ok: false, error: 'status required' });
  const valid = ['pending', 'confirmed', 'executing', 'completed', 'rejected'];
  if (!valid.includes(status)) return res.status(400).json({ ok: false, error: `invalid status: ${status}` });
  item.status = status as ActionItem['status'];
  item.updatedAt = new Date().toISOString();
  store.set(id, item);
  log.info({ id, status }, '行动项状态已更新');
  res.json({ ok: true, action: item });
});

export default router;
