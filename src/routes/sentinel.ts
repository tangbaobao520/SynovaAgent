/**
 * routes/sentinel.ts — Sentinel 哨兵 API (L1)
 * @state: real
 *
 * GET  /api/sentinel/findings   — 哨兵发现列表 (可按 sentinelId/severity 过滤)
 * GET  /api/sentinel/signals    — 信号聚合结果 (交叉关联 + 专家建议)
 * POST /api/sentinel/run/:id    — 手动触发一次哨兵检查
 * GET  /api/sentinel/reports    — 专家报告列表
 * GET  /api/sentinel/tickets    — 工单列表 (D580 8-2: 表读同源, 表空/读失败 → 内存兜底 + degraded; ?status= 过滤)
 * POST /api/sentinel/tickets/:id/transition — 工单状态机迁移 (D580 8-4: open→acknowledged→resolved / open→dismissed, 非法迁移 409)
 *
 * 铁律 39: L1 通过 L2 sentinel-service 获取数据，不直接访问 L3。
 */

import { Router, type Request, type Response } from 'express';
import {
  getSentinelFindings,
  getAggregatedSignals,
  runSentinelOnce,
  getSentinelExpertReports,
  getSentinelTickets,
  transitionSentinelTicket,
} from '../agent/sentinel-service';
import type { TicketStatus } from '../sentinel/runner';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/sentinel');
const router = Router();

/** sentinel_tickets.status 四态（DDL CHECK 枚举; ?status= 白名单 — 非法值按缺省处理, 对齐 findings 路由 idiom） */
const TICKET_STATUSES: readonly string[] = ['open', 'acknowledged', 'resolved', 'dismissed'];

// ═══ GET /api/sentinel/findings ═══

router.get('/findings', (req: Request, res: Response) => {
  try {
    const sentinelId = typeof req.query.sentinelId === 'string' ? req.query.sentinelId : undefined;
    const severity = ['critical', 'warning', 'info'].includes(req.query.severity as string)
      ? (req.query.severity as 'critical' | 'warning' | 'info')
      : undefined;
    const limit = req.query.limit ? Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 50), 200) : 50;
    const offset = req.query.offset ? Math.max(0, parseInt(req.query.offset as string, 10) || 0) : 0;

    const result = getSentinelFindings({ sentinelId, severity, limit, offset });
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] findings 查询失败');
    res.status(500).json({ ok: false, total: 0, findings: [] });
  }
});

// ═══ GET /api/sentinel/signals ═══

router.get('/signals', (_req: Request, res: Response) => {
  try {
    const result = getAggregatedSignals();
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] signals 聚合失败');
    res.status(500).json({ ok: false, total: 0, criticalCount: 0, warningCount: 0, signals: [] });
  }
});

// ═══ POST /api/sentinel/run/:id ═══

router.post('/run/:id', async (req: Request, res: Response) => {
  try {
    const sentinelId = String(req.params.id);
    if (!sentinelId) {
      res.status(400).json({ ok: false, sentinelId: '', result: null, error: '缺少 sentinelId' });
      return;
    }
    const result = await runSentinelOnce(sentinelId);
    const status = result.ok ? 200 : result.error === 'SentinelRunner 未启动' ? 503 : 404;
    res.status(status).json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] runOnce 失败');
    res.status(500).json({ ok: false, sentinelId: req.params.id, result: null, error: (err as Error)?.message || '未知错误' });
  }
});

// ═══ GET /api/sentinel/reports ═══

router.get('/reports', (_req: Request, res: Response) => {
  try {
    const result = getSentinelExpertReports();
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] reports 查询失败');
    res.status(500).json({ ok: false, total: 0, reports: [] });
  }
});

// ═══ GET /api/sentinel/tickets — D580 8-2: 表读同源（死变量修复: status 过滤接通） ═══

router.get('/tickets', (req: Request, res: Response) => {
  try {
    const raw = typeof req.query.status === 'string' ? req.query.status : undefined;
    const status = raw !== undefined && TICKET_STATUSES.includes(raw) ? (raw as TicketStatus) : undefined;
    const result = getSentinelTickets(status);
    res.json(result);
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] tickets 查询失败');
    res.status(500).json({ ok: false, source: 'memory-fallback', degraded: true, tickets: [] });
  }
});

// ═══ POST /api/sentinel/tickets/:id/transition — D580 8-4: 工单状态机迁移 ═══
//   200 { ok: true, ticket }                          — 迁移成功
//   400 { ok: false, error }                          — body 缺 to / to 非法枚举（INVALID_TARGET）
//   404 { ok: false, error: 'TICKET_NOT_FOUND' }      — 无此工单行
//   409 { ok: false, error: 'ILLEGAL_TRANSITION', from, to } — 白名单外迁移（含终态/同态）
//   503 { ok: false, degraded: true, error }          — db 不可用（degraded 传播链终点）

router.post('/tickets/:id/transition', (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as { to?: unknown } | undefined;
    if (!body || typeof body.to !== 'string' || body.to === '') {
      res.status(400).json({ ok: false, error: '缺少 to 字段（可选值: acknowledged | resolved | dismissed）' });
      return;
    }
    const result = transitionSentinelTicket(id, body.to);
    if (result.ok) {
      res.status(200).json(result);
      return;
    }
    switch (result.error) {
      case 'INVALID_TARGET':
        res.status(400).json(result);
        break;
      case 'TICKET_NOT_FOUND':
        res.status(404).json(result);
        break;
      case 'ILLEGAL_TRANSITION':
        res.status(409).json(result);
        break;
      default:
        // degraded: db 不可用 / runner 未初始化
        res.status(503).json({ ok: false, degraded: true, error: result.error });
    }
  } catch (err: unknown) {
    log.error({ err }, '[sentinel] 工单迁移失败');
    res.status(500).json({ ok: false, degraded: true, error: (err as Error)?.message || '未知错误' });
  }
});

// ═══ POST /api/sentinel/alerts/:id/action — 交互式卡片回复 (D18) ═══

router.post('/alerts/:id/action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { action, userId, enterpriseId } = req.body as {
      action: 'confirm' | 'dismiss' | 'details';
      userId: string;
      enterpriseId?: string;
    };

    if (!action || !userId) {
      res.status(400).json({ ok: false, error: 'Missing required fields: action, userId' });
      return;
    }

    const { InteractiveCardHandler } = await import('../agent/interactive-card');
    const handler = new InteractiveCardHandler();

    const result = await handler.handleAction(
      { findingId: id, action, userId, enterpriseId: enterpriseId || 'synova' },
    );

    res.json({ ok: result.status === 'success', cardUpdate: result.cardUpdate });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, alertId: req.params.id }, '卡片操作处理失败');
    res.status(500).json({
      ok: false,
      cardUpdate: {
        title: '操作失败',
        body: '处理卡片操作时出错，请重试。',
        color: 'grey',
        interactive: false,
      },
    });
  }
});

export default router;
