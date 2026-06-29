/**
 * routes/sessions.ts — 会话 REST API (Era 3.1)
 *
 * GET    /api/sessions              → 列表
 * POST   /api/sessions              → 创建
 * GET    /api/sessions/:id          → 详情 + 消息
 * GET    /api/sessions/search?q=    → FTS5 搜索
 * DELETE /api/sessions/:id          → 删除
 */
import { Router, type Request, type Response } from 'express';
import { SessionStore } from '../store/session-store';
import { createLogger } from '@synova/logger';
import { getDatabase } from '../init/engine-context';

const router = Router();
const log = createLogger('routes/sessions');

function getStore(): SessionStore {
  return new SessionStore(getDatabase());
}

// ═══ List ═══
router.get('/api/sessions', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const store = getStore();
    const sessions = store.listSessions(limit);
    res.json({ ok: true, sessions, count: sessions.length });
  } catch (err: any) {
    log.error({ err }, '列出会话失败');
    res.status(500).json({ ok: false, error: err.message, code: 'SESSION_LIST_ERROR' });
  }
});

// ═══ Create ═══
router.post('/api/sessions', (req: Request, res: Response) => {
  try {
    const { orgId } = req.body;
    if (!orgId) {
      return res.status(400).json({ ok: false, error: 'orgId 必填', code: 'VALIDATION_ERROR' });
    }
    const store = getStore();
    const session = store.createSession(orgId);
    res.status(201).json({ ok: true, session });
  } catch (err: any) {
    log.error({ err }, '创建会话失败');
    res.status(500).json({ ok: false, error: err.message, code: 'SESSION_CREATE_ERROR' });
  }
});

// ═══ Search (MUST be before /:id to avoid route conflict) ═══
router.get('/api/sessions/search', (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      return res.status(400).json({ ok: false, error: 'q 参数必填', code: 'VALIDATION_ERROR' });
    }
    const store = getStore();
    const results = store.search(q, 10);
    res.json({ ok: true, results, count: results.length });
  } catch (err: any) {
    log.error({ err }, '搜索会话失败');
    res.status(500).json({ ok: false, error: err.message, code: 'SESSION_SEARCH_ERROR' });
  }
});

// ═══ Get ═══
router.get('/api/sessions/:id', (req: Request, res: Response) => {
  try {
    const store = getStore();
    const session = store.getSession(req.params.id as string);
    if (!session) {
      return res.status(404).json({ ok: false, error: '会话不存在', code: 'NOT_FOUND' });
    }
    const messages = store.getMessages(req.params.id as string);
    res.json({ ok: true, session, messages });
  } catch (err: any) {
    log.error({ err }, '获取会话失败');
    res.status(500).json({ ok: false, error: err.message, code: 'SESSION_GET_ERROR' });
  }
});

// ═══ Delete ═══
router.delete('/api/sessions/:id', (req: Request, res: Response) => {
  try {
    const store = getStore();
    const session = store.getSession(req.params.id as string);
    if (!session) {
      return res.status(404).json({ ok: false, error: '会话不存在', code: 'NOT_FOUND' });
    }
    store.deleteSession(req.params.id as string);
    res.json({ ok: true, deleted: req.params.id });
  } catch (err: any) {
    log.error({ err }, '删除会话失败');
    res.status(500).json({ ok: false, error: err.message, code: 'SESSION_DELETE_ERROR' });
  }
});

export default router;
