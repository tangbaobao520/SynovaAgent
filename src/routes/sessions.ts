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
import { createLogger } from '@synova/logger';
import { loadConfig } from '../config';
// D603 跨层修复（簇4）: SessionStore 构造/句柄直取下沉 L2——注入优先（server.ts
// app.locals.sessionStore ← Bootstrap Phase 0 单例），未注入环境兜底装配（行为同前）。
import { createSystemSessionStore, type SessionStore } from '../agent/session-storage-service';

const router = Router();
const log = createLogger('routes/sessions');

function getStore(req: Request): SessionStore {
  const injected = (req.app.locals as Record<string, unknown>).sessionStore as SessionStore | undefined;
  if (injected) return injected;
  return createSystemSessionStore();
}

// ═══ List ═══
router.get('/api/sessions', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const store = getStore(req);
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
    const store = getStore(req);
    const session = store.createSession(orgId);
    res.status(201).json({ ok: true, session });
  } catch (err: any) {
    log.error({ err }, '创建会话失败');
    res.status(500).json({ ok: false, error: err.message, code: 'SESSION_CREATE_ERROR' });
  }
});

// ═══ Search (MUST be before /:id to avoid route conflict) ═══

/**
 * D826: 会话搜索的**租户权威链**（唯一实现处，勿在别处复制）。
 *
 * 契约:
 *   @input  — req（已过中间件的请求）
 *   @output — orgId: 权威租户 + source: 来源标记（审计/测试可核）
 *   @rule   — ① `req.auth?.orgId`（JWT 经中间件**验签后**才存在）为唯一身份来源；
 *             ② 取不到 → **服务端实例 org** `loadConfig().orgId`（= SYNOVA_ORG_ID，默认 'default'）——
 *                /api/sessions 是 D590 白名单路径（单机本地信任），无 req.auth 属常态；
 *             ③ **永不**采信 `?orgId=` / `x-synova-token` / 其他 header 或 query 作为租户来源
 *                （前者是客户端可控选择器；后者无签名校验——两者都会把租户权威交给调用方）。
 *   @degrade— 无失败路径（两边都有值）
 */
function resolveSearchOrgId(req: Request): { orgId: string; source: 'auth' | 'instance' } {
  const authOrgId = (req as Request & { auth?: { orgId?: string } }).auth?.orgId;
  if (authOrgId) return { orgId: authOrgId, source: 'auth' };
  return { orgId: loadConfig().orgId, source: 'instance' };
}

router.get('/api/sessions/search', (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      return res.status(400).json({ ok: false, error: 'q 参数必填', code: 'VALIDATION_ERROR' });
    }
    const store = getStore(req);

    // D826: 租户只取自权威链（认证身份 / 服务端实例 org），客户端入参一律忽略
    const { orgId, source } = resolveSearchOrgId(req);
    const requestedOrgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
    if (requestedOrgId !== undefined && requestedOrgId !== orgId) {
      log.warn(
        { requestedOrgId, authoritativeOrgId: orgId, path: req.path },
        '客户端尝试指定租户 — 已忽略并记录（D826）',
      );
    } else if (source === 'instance') {
      log.debug({ authoritativeOrgId: orgId }, '未认证（白名单路径）— 使用服务端实例 org 作为租户');
    }

    // limit 边界收敛（非法/超界不抛）
    const parsedLimit = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 10;

    const results = store.search(q, orgId, limit);
    res.json({ ok: true, results, count: results.length, orgId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // D826: FTS5 语法类异常 → 400（客户端输入问题），不再以 500 冒充服务故障
    if (/unterminated string|unknown special query|fts5: syntax error|malformed MATCH/i.test(message)) {
      log.warn({ err: message, code: 'SEARCH_QUERY_INVALID' }, '检索词语法非法 — 400（D826）');
      return res.status(400).json({ ok: false, error: '检索词非法', code: 'SEARCH_QUERY_INVALID' });
    }
    log.error({ err: message }, '搜索会话失败');
    res.status(500).json({ ok: false, error: message, code: 'SESSION_SEARCH_ERROR' });
  }
});

// ═══ Get ═══
router.get('/api/sessions/:id', (req: Request, res: Response) => {
  try {
    const store = getStore(req);
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

// ═══ Rename (D251) ═══
router.patch('/api/sessions/:id/title', (req: Request, res: Response) => {
  try {
    const { title } = req.body as { title?: string };
    if (!title || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'title 必填', code: 'VALIDATION_ERROR' });
    }
    const store = getStore(req);
    const session = store.getSession(req.params.id as string);
    if (!session) {
      return res.status(404).json({ ok: false, error: '会话不存在', code: 'NOT_FOUND' });
    }
    const ok = store.renameSession(req.params.id as string, title.trim());
    if (!ok) {
      return res.status(500).json({ ok: false, error: '重命名失败', code: 'RENAME_ERROR', degraded: true });
    }
    res.json({ ok: true, id: req.params.id, title: title.trim() });
  } catch (err: any) {
    log.error({ err }, '重命名会话失败');
    res.status(500).json({ ok: false, error: err.message, code: 'SESSION_RENAME_ERROR', degraded: true });
  }
});

// ═══ Delete ═══
router.delete('/api/sessions/:id', (req: Request, res: Response) => {
  try {
    const store = getStore(req);
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
