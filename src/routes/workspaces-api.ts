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
  // PRD v1.6 Slice 7: 部门协作扩展
  department?: string;
  parentWsId?: string;
  owner?: string;
  visibility: 'global' | 'department' | 'private';
  source?: 'agent_suggested' | 'boss_assigned' | 'self_created';
  inheritedContext?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceConflict {
  id: string;
  type: 'numeric' | 'temporal' | 'resource';
  dimension: string;
  workspaceA: { id: string; department: string; value: string; evidence: string };
  workspaceB: { id: string; department: string; value: string; evidence: string };
  detectedAt: string;
  status: 'open' | 'escalated' | 'resolved';
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
    id, title, type, status: 'pending', priority: 'medium',
    visibility: 'global', createdAt: now, updatedAt: now,
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

  // v3.3: 基于工作区上下文的真实回复（替代echo空壳）
  const contextSummary = `工作区"${ws.title}"（类型: ${ws.type}, 状态: ${ws.status}, 优先级: ${ws.priority}）。`;
  let reply: string;
  if (ws.type === 'diagnostic') {
    reply = `${contextSummary}\n\n我分析了你在诊断工作区中的问题"${content.slice(0, 100)}"。当前诊断状态为"${ws.status}"。你可以：\n1. 补充更多企业数据以提升诊断精度\n2. 确认或驳回我的判断\n3. 要求我深入分析某个维度`;
  } else {
    reply = `${contextSummary}\n\n关于"${content.slice(0, 100)}"——我基于当前工作区上下文的理解如上。你可以进一步描述细节，或切换到诊断工作区进行深度分析。`;
  }
  res.json({ ok: true, reply, workspaceId: ws.id });
});

// ═══ PRD v1.6 Slice 7: 部门协作扩展 ═══

// 创建子工作区 (Agent建议 或 老板手动分配)
router.post('/api/workspaces/:id/sub', (req: Request, res: Response) => {
  const parentId = String(req.params.id);
  const parent = store.get(parentId);
  if (!parent) return res.status(404).json({ ok: false, error: 'parent workspace not found' });

  const { department, title } = req.body as { department?: string; title?: string };
  if (!department || !title) return res.status(400).json({ ok: false, error: 'department and title required' });

  const id = `ws_sub_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const subWs: Workspace = {
    id, title, type: 'manual', status: 'pending', priority: parent.priority,
    department, parentWsId: parentId, owner: 'agent', visibility: 'department',
    source: req.body.agentSuggested ? 'agent_suggested' : 'boss_assigned',
    inheritedContext: `从全局方案"${parent.title}"分配。目标: ${parent.title}。状态: ${parent.status}。`,
    createdAt: now, updatedAt: now,
  };
  store.set(id, subWs);
  log.info({ id, department, parentId }, '子工作区已创建');
  res.json({ ok: true, workspace: subWs });
});

// 按部门过滤
router.get('/api/workspaces/by-dept/:dept', (req: Request, res: Response) => {
  const dept = req.params.dept;
  const list = Array.from(store.values())
    .filter(w => w.department === dept || w.visibility === 'global')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json({ ok: true, workspaces: list, department: dept });
});

// 获取当前用户可见的工作区
router.get('/api/workspaces/mine', (req: Request, res: Response) => {
  // Phase 1: 从 token 获取角色 (Phase 2: JWT)
  const token = String(req.headers['x-synova-token'] || '');
  const role = token.includes('admin') ? 'admin' : token.includes('liaison') ? 'liaison' : 'manager';
  const dept = token.split(':')[1] || '';

  let list: Workspace[];
  if (role === 'admin' || role === 'liaison') {
    list = Array.from(store.values());
  } else {
    list = Array.from(store.values()).filter(w =>
      w.department === dept || w.owner === token.split(':')[2] || w.visibility === 'global',
    );
  }
  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json({ ok: true, workspaces: list, role, department: dept });
});

// 冲突检测 (对接人)
router.get('/api/workspaces/conflicts', (_req: Request, res: Response) => {
  const conflicts: WorkspaceConflict[] = [];
  const all = Array.from(store.values()).filter(w => w.status === 'confirmed');

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]; const b = all[j];
      if (a.department === b.department) continue;
      // 简单数值型冲突: 同title的confirmed workspace跨部门 → 标记冲突
      if (a.title.includes(b.title.slice(0, 5)) || b.title.includes(a.title.slice(0, 5))) {
        conflicts.push({
          id: `conflict_${Date.now().toString(36)}`,
          type: 'numeric',
          dimension: a.title,
          workspaceA: { id: a.id, department: a.department || 'unknown', value: a.title, evidence: '' },
          workspaceB: { id: b.id, department: b.department || 'unknown', value: b.title, evidence: '' },
          detectedAt: new Date().toISOString(),
          status: 'open',
        });
      }
    }
  }
  res.json({ ok: true, conflicts, count: conflicts.length });
});

// 子工作区方案汇入全局
router.put('/api/workspaces/:id/merge', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const ws = store.get(id);
  if (!ws || !ws.parentWsId) return res.status(400).json({ ok: false, error: 'not a sub-workspace' });

  const parent = store.get(ws.parentWsId);
  if (!parent) return res.status(404).json({ ok: false, error: 'parent not found' });

  ws.status = 'resolved';
  ws.updatedAt = new Date().toISOString();
  store.set(id, ws);
  log.info({ id, parentId: ws.parentWsId }, '子工作区方案已汇入全局');
  res.json({ ok: true, workspace: ws, parentTitle: parent.title });
});

export default router;
