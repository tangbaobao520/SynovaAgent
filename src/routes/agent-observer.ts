/**
 * routes/agent-observer.ts — Agent Observer HTTP 路由
 *
 * POST /api/agent-observer/report — 外部 Agent 上报活动到 Synova SOG 图谱
 *
 * 铁律 39: L1 交互层。接收 HTTP 请求，委托给 L4 collector。
 * 铁律 31: 收集器失败时返回 200 + degraded: true，不阻断调用方。
 */

import { Router, type Request, type Response } from 'express';
import { createGraphStore } from '@synova/diagnosis-engine';
import { getDatabase } from '../init/engine-context';
import { createLogger } from '../logger';
import { collectActivity, collectActivities } from '../agent-observer/collector';
import type { AgentActivity, BatchReportResponse, ReportResponse } from '../agent-observer/types';

const log = createLogger('routes/agent-observer');
const router = Router();

// ── 请求校验 ──

const REQUIRED_FIELDS = ['agentId', 'platform', 'name', 'timestamp', 'activityType'] as const;

interface ValidationError { valid: false; error: string }
interface ValidationSuccess { valid: true; activity: AgentActivity }

function validateActivity(body: unknown): ValidationError | ValidationSuccess {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '请求体必须是 JSON 对象' };
  }
  const b = body as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    const val = b[field];
    if (!val || typeof val !== 'string') {
      return { valid: false, error: `缺少必填字段: ${field} (string)` };
    }
  }

  // timestamp 格式校验
  if (typeof b.timestamp === 'string' && isNaN(Date.parse(b.timestamp))) {
    return { valid: false, error: 'timestamp 必须是有效的 ISO 8601 格式' };
  }

  // agentType 校验 (如果提供)
  if (b.agentType && typeof b.agentType === 'string') {
    if (!['internal', 'external'].includes(b.agentType)) {
      return { valid: false, error: 'agentType 必须是 "internal" 或 "external"' };
    }
  }

  // 构造类型安全的 AgentActivity
  const activity: AgentActivity = {
    agentId: String(b.agentId),
    platform: String(b.platform),
    name: String(b.name),
    agentType: (b.agentType as 'internal' | 'external') || 'external',
    activityType: String(b.activityType) as AgentActivity['activityType'],
    timestamp: String(b.timestamp),
    teamId: b.teamId ? String(b.teamId) : undefined,
    model: b.model ? String(b.model) : undefined,
    status: b.status as AgentActivity['status'],
    lastToolName: b.lastToolName ? String(b.lastToolName) : undefined,
    detail: b.detail as string | Record<string, unknown> | undefined,
    sessionId: b.sessionId ? String(b.sessionId) : undefined,
    success: typeof b.success === 'boolean' ? b.success : undefined,
    durationMs: typeof b.durationMs === 'number' ? b.durationMs : undefined,
    tokenIn: typeof b.tokenIn === 'number' ? b.tokenIn : undefined,
    tokenOut: typeof b.tokenOut === 'number' ? b.tokenOut : undefined,
    costUsd: typeof b.costUsd === 'number' ? b.costUsd : undefined,
  };

  return { valid: true, activity };
}

// ── POST /api/agent-observer/report ──

router.post('/api/agent-observer/report', (req: Request, res: Response) => {
  try {
    // 支持单条或数组批量上报
    const isArray = Array.isArray(req.body);
    const rawActivities: unknown[] = isArray ? req.body : [req.body];

    // 逐条校验
    const activities: AgentActivity[] = [];
    for (const raw of rawActivities) {
      const validation = validateActivity(raw);
      if (!validation.valid) {
        return res.status(400).json({ ok: false, error: validation.error, code: 'VALIDATION_ERROR' });
      }
      activities.push(validation.activity);
    }

    // 创建 GraphStore 并收集活动
    const store = createGraphStore('sqlite', getDatabase());

    if (activities.length === 1) {
      const result = collectActivity(store, activities[0]);
      res.status(200).json(result);
    } else {
      const { results, degraded } = collectActivities(store, activities);
      const body: BatchReportResponse = {
        ok: true,
        results,
        count: results.length,
        degraded,
      };
      res.status(200).json(body);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Agent Observer 路由异常');
    res.status(500).json({ ok: false, error: msg, code: 'OBSERVER_ERROR', degraded: true });
  }
});

export default router;
