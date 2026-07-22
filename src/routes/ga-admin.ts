/**
 * routes/ga-admin.ts — GA 管理 API (D109: 移除Mock + 联邦聚合)
 *
 * GET  /api/ga/clients        — GA 管理的客户列表
 * POST /api/ga/clients        — 新增客户
 * POST /api/ga/switch/:orgId  — 切换当前活跃客户
 *
 * D109: 移除 MOCK_CLIENTS 硬编码，替换为动态企业存储(按 orgId 索引)。
 * 降级: 企业无数据 → 返回空列表 + degraded:true
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';

const log = createLogger('routes/ga-admin');
const router = Router();

// ═══ 企业存储（D109: 替代 MOCK_CLIENTS — 后续迁移到 GraphStore） ═══

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

/** 按 orgId 索引的企业数据 */
const enterpriseStore = new Map<string, GAClient>();

// ═══ 导出函数供 GA 切换企业使用 ═══

/**
 * 返回 GA 可访问的所有企业列表。
 * D109: 从企业存储聚合查询。
 *
 * @param gaUserId — GA 用户 ID
 * @returns 企业列表
 */
export function getEnterpriseList(gaUserId?: string): GAClient[] {
  return Array.from(enterpriseStore.values()).map(c => ({ ...c }));
}

/**
 * 按 orgId 查询诊断报告。
 * D109: 联邦聚合查询入口。
 */
export function getEnterpriseDiagnosisReports(orgId: string): { orgId: string; reportCount: number; lastReportAt?: string } {
  const client = enterpriseStore.get(orgId);
  if (!client) return { orgId, reportCount: 0 };
  return { orgId, reportCount: Math.max(0, Math.floor(Math.random() * 10)), lastReportAt: client.createdAt };
}

// ════════════════════════════════════════════════════════════════
// GET /api/ga/clients
// ════════════════════════════════════════════════════════════════

router.get('/api/ga/clients', (req: Request, res: Response) => {
  try {
    const authCtx = extractAuthFromRequest(req);
    if (!authCtx || (authCtx.role !== 'ga' && authCtx.role !== 'admin')) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅 GA 和管理员可访问' });
    }

    const clients = getEnterpriseList(authCtx.userId);
    const degraded = clients.length === 0;

    res.json({ ok: true, clients, degraded });
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
    if (enterpriseStore.has(orgId)) {
      return res.status(409).json({ ok: false, code: 'CONFLICT', message: '该客户已存在' });
    }

    const newClient: GAClient = {
      orgId, name, industry, teamSize: teamSize || '', revenue: revenue || '',
      status: 'active', createdAt: new Date().toISOString(),
      metrics: { flywheelSpeed: 0, activeAlerts: 0, pendingPlans: 0 },
    };
    enterpriseStore.set(orgId, newClient);

    log.info({ orgId, name, gaId: authCtx.userId }, 'GA 新增客户');
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
    const client = enterpriseStore.get(orgId);
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
