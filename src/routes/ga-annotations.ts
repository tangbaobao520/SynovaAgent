/**
 * ga-annotations.ts — GA哨兵标注工具 API
 *
 * T3: GA在诊断报告审查时标注哨兵Finding质量。
 * 标注数据存储在 AgentMemoryStore（L4），供 T9 哨兵可信度基线消费。
 *
 * 设计原则:
 * - 标注数据不可覆盖——每次提交新增记录，旧记录保留为审计轨迹
 * - 每个 catch 必须有 log.error + 返回 degraded: true（铁律 24+31）
 * - 不依赖任何新包（复用现有 JWT 认证 + AgentMemoryStore）
 *
 * @module routes/ga-annotations
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';
import type {
  CreateAnnotationRequest,
  ListAnnotationsQuery,
  AnnotationRecord,
  CreateAnnotationResponse,
  ListAnnotationsResponse,
  AnnotationStatsResponse,
} from './ga-annotations-types';

const log = createLogger('routes/ga-annotations');
const router = Router();

// ═══ 工具函数 ═══

/** 延迟获取 AgentMemoryStore 实例（避免循环依赖） */
async function getStore() {
  const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
  const { getDatabase } = await import('../init/engine-context');
  return getAgentMemoryStore(getDatabase());
}

/** GA 角色验证中间件 */
function requireGa(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '需要认证' });
    return false;
  }
  if (auth.role !== 'ga' && auth.role !== 'admin') {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅GA可标注' });
    return false;
  }
  return true;
}

// ═══ POST /api/ga/annotations ═══

/**
 * 创建一条标注记录
 *
 * 输入: CreateAnnotationRequest
 * 降级: AgentMemoryStore 不可用时返回 500 + degraded: true
 */
router.post('/api/ga/annotations', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const { findingId, annotation, correctionNote } = req.body as Record<string, unknown>;

    // 验证必填字段
    if (!findingId || typeof findingId !== 'string' || findingId.trim().length === 0) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'findingId 必填' });
    }

    // 验证 annotation 值
    const VALID_ANNOTATIONS = ['confirmed', 'false_alarm', 'uncertain'] as const;
    if (!annotation || !VALID_ANNOTATIONS.includes(annotation as typeof VALID_ANNOTATIONS[number])) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: `annotation 必须是: ${VALID_ANNOTATIONS.join(', ')}`,
      });
    }

    // 验证 correctionNote 长度
    if (correctionNote !== undefined && correctionNote !== null) {
      if (typeof correctionNote !== 'string') {
        return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'correctionNote 必须是字符串' });
      }
      if (correctionNote.length > 2000) {
        return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'correctionNote 不能超过2000字符' });
      }
    }

    const store = await getStore();
    const now = new Date().toISOString();
    const key = `sentinel_annotation:${findingId}:${Date.now()}`;

    const entry = store.remember({
      orgId: auth.orgId || 'default',
      key,
      value: JSON.stringify({
        findingId: findingId.trim(),
        sentinelId: req.body.sentinelId as string || 'unknown',
        severity: req.body.severity as string || '',
        title: req.body.title as string || '',
        annotation,
        correctionNote: correctionNote as string | undefined,
        gaId: auth.userId,
        orgId: auth.orgId || 'default',
        annotatedAt: now,
      }),
      type: 'sentinel_annotation',
      confidence: 1.0,
      source: `ga:${auth.userId}`,
      tags: ['sentinel_annotation', req.body.sentinelId as string || 'unknown', annotation as string],
      expiresAt: null,
    });

    log.info({ findingId, annotation, gaId: auth.userId }, 'GA 标注已提交');
    res.status(201).json({ ok: true, annotationId: entry.id });
  } catch (err: unknown) {
    log.error({ err }, '提交标注异常');
    res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: (err as Error).message || '标注服务异常',
      degraded: true,
    });
  }
});

// ═══ GET /api/ga/annotations ═══

/**
 * 查询标注记录
 *
 * 支持按 findingId / sentinelId / annotation 筛选，支持分页。
 * 降级: AgentMemoryStore 不可用时返回 500 + degraded: true
 */
router.get('/api/ga/annotations', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const store = await getStore();

    const findingId = req.query.findingId as string | undefined;
    const sentinelId = req.query.sentinelId as string | undefined;
    const annotation = req.query.annotation as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // 收集筛选条件
    const tags: string[] = ['sentinel_annotation'];
    if (sentinelId) tags.push(sentinelId);
    if (annotation && ['confirmed', 'false_alarm', 'uncertain'].includes(annotation)) {
      tags.push(annotation);
    }

    let results = store.list({
      orgId: auth.orgId || 'default',
      tags,
      limit: 200, // 获取足够多数据再做二次筛选
      offset: 0,
    });

    // 二次筛选: findingId（tags不支持精确匹配）
    if (findingId) {
      results = results.filter((r: any) => {
        try {
          const val = JSON.parse(r.value);
          return val.findingId === findingId;
        } catch { log.debug({ entry: r.id }, '解析标注数据失败 — findingId筛选跳过'); return false; }
      });
    }

    // 按 updatedAt 降序排列
    results.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const total = results.length;
    const paginated = results.slice(offset, offset + limit);

    const annotations = paginated.map((r: any) => {
      let val: Record<string, unknown> = {};
      try { val = JSON.parse(r.value) as Record<string, unknown>; } catch { log.debug({ err: r.id }, '解析标注数据失败 — 跳过'); }
      return {
        id: r.id,
        findingId: (val.findingId as string) || '',
        sentinelId: (val.sentinelId as string) || '',
        severity: (val.severity as string) || '',
        title: (val.title as string) || '',
        annotation: (val.annotation as string) || '',
        correctionNote: val.correctionNote as string | undefined,
        gaId: (val.gaId as string) || '',
        orgId: (val.orgId as string) || '',
        annotatedAt: r.createdAt,
      };
    });

    res.json({ ok: true, annotations, total });
  } catch (err: unknown) {
    log.error({ err }, '查询标注异常');
    res.status(500).json({ ok: false, degraded: true, message: (err as Error).message || '查询标注异常' });
  }
});

// ═══ GET /api/ga/annotations/stats ═══

/**
 * 获取标注统计（按哨兵 + 总体）
 *
 * T9 哨兵精度基线从此端点消费数据。
 * 降级: AgentMemoryStore 不可用时返回 500 + degraded: true
 */
router.get('/api/ga/annotations/stats', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const store = await getStore();

    const results = store.list({
      orgId: auth.orgId || 'default',
      tags: ['sentinel_annotation'],
      limit: 500,
      offset: 0,
    });

    const bySentinel: Record<string, { total: number; confirmed: number; falseAlarm: number; uncertain: number }> = {};
    let totalConfirmed = 0;
    let totalFalseAlarm = 0;
    let totalUncertain = 0;

    for (const r of results) {
      let val: Record<string, unknown> = {};
      try { val = JSON.parse(r.value); } catch { log.debug({ entry: r.id }, '解析标注数据失败 — stats跳过'); continue; }
      const sentinelId = (val.sentinelId as string) || 'unknown';
      const annotationType = (val.annotation as string) || '';

      if (!bySentinel[sentinelId]) {
        bySentinel[sentinelId] = { total: 0, confirmed: 0, falseAlarm: 0, uncertain: 0 };
      }
      bySentinel[sentinelId].total++;

      if (annotationType === 'confirmed') {
        bySentinel[sentinelId].confirmed++;
        totalConfirmed++;
      } else if (annotationType === 'false_alarm') {
        bySentinel[sentinelId].falseAlarm++;
        totalFalseAlarm++;
      } else if (annotationType === 'uncertain') {
        bySentinel[sentinelId].uncertain++;
        totalUncertain++;
      }
    }

    const totalAnnotations = totalConfirmed + totalFalseAlarm + totalUncertain;

    res.json({
      ok: true,
      bySentinel,
      overall: {
        totalAnnotations,
        confirmedRate: totalAnnotations > 0 ? totalConfirmed / totalAnnotations : 0,
        falseAlarmRate: totalAnnotations > 0 ? totalFalseAlarm / totalAnnotations : 0,
        uncertainRate: totalAnnotations > 0 ? totalUncertain / totalAnnotations : 0,
      },
    });
  } catch (err: unknown) {
    log.error({ err }, '查询标注统计异常');
    res.status(500).json({ ok: false, degraded: true, message: (err as Error).message || '查询标注统计异常' });
  }
});

export default router;
