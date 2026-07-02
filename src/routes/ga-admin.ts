/**
 * routes/ga-admin.ts — GA 管理 API (Phase 3.1, Desktop 实施方案)
 *
 * GET  /api/ga/clients        — GA 管理的客户列表
 * POST /api/ga/clients        — 新增客户（需要企业主授权码）
 * POST /api/ga/switch/:orgId  — 切换当前活跃客户
 *
 * 设计原则:
 * - mock 数据模式（Phase 3.2 接入真实数据源）
 * - JWT 鉴权依赖上层 jwtAuthMiddleware
 * - GA 角色访问权限由 rbac.ts 控制
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';

const log = createLogger('routes/ga-admin');
const router = Router();

// ═══ Mock 客户数据 ═══

interface GAClient {
  orgId: string;
  name: string;
  industry: string;
  teamSize: string;
  revenue: string;
  status: 'active' | 'inactive';
  createdAt: string;
  metrics: {
    flywheelSpeed: number;
    activeAlerts: number;
    pendingPlans: number;
  };
}

const MOCK_CLIENTS: Record<string, GAClient> = {
  'acme-corp': {
    orgId: 'acme-corp',
    name: 'Acme Corp', industry: '制造', teamSize: '80-90人', revenue: '3000万',
    status: 'active', createdAt: '2026-06-01',
    metrics: { flywheelSpeed: 0.42, activeAlerts: 3, pendingPlans: 2 },
  },
  'techflow': {
    orgId: 'techflow',
    name: 'TechFlow', industry: '科技', teamSize: '45人', revenue: '1200万',
    status: 'active', createdAt: '2026-06-15',
    metrics: { flywheelSpeed: 0.58, activeAlerts: 1, pendingPlans: 4 },
  },
  'healthway': {
    orgId: 'healthway',
    name: '健康之路', industry: '医疗', teamSize: '120人', revenue: '8000万',
    status: 'active', createdAt: '2026-05-20',
    metrics: { flywheelSpeed: 0.35, activeAlerts: 5, pendingPlans: 0 },
  },
};

// ════════════════════════════════════════════════════════════════
// GET /api/ga/clients
// ════════════════════════════════════════════════════════════════

router.get('/api/ga/clients', (req: Request, res: Response) => {
  try {
    const authCtx = extractAuthFromRequest(req);
    if (!authCtx || (authCtx.role !== 'ga' && authCtx.role !== 'admin')) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅 GA 和管理员可访问' });
    }

    const clients = Object.values(MOCK_CLIENTS).map(({ metrics, ...c }) => ({
      ...c, metrics,
    }));

    res.json({ ok: true, clients });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询客户列表异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/ga/clients — 新增客户
// ════════════════════════════════════════════════════════════════

router.post('/api/ga/clients', (req: Request, res: Response) => {
  try {
    const authCtx = extractAuthFromRequest(req);
    if (!authCtx || authCtx.role !== 'ga') {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅 GA 可创建客户' });
    }

    const { name, industry, teamSize, revenue } = req.body as Record<string, string>;
    if (!name || !industry) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '企业名称和行业必填' });
    }

    const orgId = name.toLowerCase().replace(/\s+/g, '-');
    if (MOCK_CLIENTS[orgId]) {
      return res.status(409).json({ ok: false, code: 'CONFLICT', message: '该客户已存在' });
    }

    const newClient: GAClient = {
      orgId, name, industry, teamSize: teamSize || '', revenue: revenue || '',
      status: 'active', createdAt: new Date().toISOString(),
      metrics: { flywheelSpeed: 0, activeAlerts: 0, pendingPlans: 0 },
    };

    log.info({ orgId, name }, 'GA 新增客户');
    res.status(201).json({ ok: true, client: newClient });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '新增客户异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════════
// POST /api/ga/switch/:orgId — 切换活跃客户
// ════════════════════════════════════════════════════════════════

router.post('/api/ga/switch/:orgId', (req: Request, res: Response) => {
  try {
    const authCtx = extractAuthFromRequest(req);
    if (!authCtx || authCtx.role !== 'ga') {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN' });
    }

    const orgId = String(req.params.orgId || '');
    const client = MOCK_CLIENTS[orgId];
    if (!client) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '客户不存在' });
    }

    log.info({ orgId, switchedBy: authCtx.userId }, 'GA 切换客户');
    res.json({ ok: true, client });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '切换客户异常');
    res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
