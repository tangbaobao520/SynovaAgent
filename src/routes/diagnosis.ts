/**
 * diagnosis.ts — 诊断 API 路由 (SynovaAgent 独立版)
 *
 * POST /api/diagnosis/consult → SSE 流式六阶段诊断
 * GET  /api/diagnosis/consult/:id/status → 查询进行中的诊断
 * POST /api/diagnosis/consult/:id/interrupt → 中断诊断
 *
 * 铁律 39: L1 通过 DiagnosisEngine 接口调用引擎，不直接 import engine-core。
 * 审计 P0-20260604: 移除 @synova/engine-core 直接依赖 → 改用 EngineCoreVendorAdapter。
 */
import { Router, type Request, type Response } from 'express';
import { createProvider } from '../providers';
import { detectProvider } from '../providers/detect';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { EngineCoreVendorAdapter } from '../adapters/engine-core-adapter';
import type { DiagnosisEngine, DiagnosisEvent, ConsultationResult } from '../l2-interfaces/diagnosis-engine';
import { ToolRegistry } from '../agent/tools';
import type { GraphStore } from '../l4/graph-bridge';
import type { CommunityReport } from '../l4/community-reports';

const log = createLogger('routes/diagnosis');
const router = Router();

// ═══ Active Consultations ═══

interface ActiveConsultation {
  consultId: string;
  teamId: string;
  phase: number;
  aborted: boolean;
  engine: DiagnosisEngine;
  events: Array<{ type: string; phase: number; label?: string; message?: string }>;
}

const activeConsultations = new Map<string, ActiveConsultation>();

// ═══ SSE helpers ═══

function sseWrite(res: Response, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseClose(res: Response, result: ConsultationResult): void {
  sseWrite(res, {
    type: 'complete',
    teamId: result.teamId,
    totalDurationMs: result.totalDurationMs,
    degradedModules: result.degradedModules,
    report: result.report,
  });
  res.end();
}

function sseError(res: Response, code: string, message: string): void {
  sseWrite(res, { type: 'error', code, message });
  res.end();
}

// ═══ POST /consult — SSE 流式六阶段诊断 ═══

router.post('/api/diagnosis/consult', async (req: Request, res: Response) => {
  const { teamId, initiator, scope } = req.body as {
    teamId?: string;
    initiator?: { role: string; name?: string; teamId?: string; concerns?: string[] };
    scope?: { depth?: string };
  };

  if (!teamId) {
    res.status(400).json({ ok: false, error: 'teamId 必填', code: 'VALIDATION_ERROR' });
    return;
  }
  if (!initiator || !initiator.role) {
    res.status(400).json({ ok: false, error: 'initiator.role 必填', code: 'VALIDATION_ERROR' });
    return;
  }

  const consultId = `diag-${teamId}-${Date.now().toString(36)}`;

  // SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Consult-Id': consultId,
  });

  try {
    // 铁律 39: L1 → L2 接口 — 通过 EngineCoreVendorAdapter (不直接 import engine-core)
    const config = loadConfig();
    const provider = createProvider(detectProvider(), {
      apiKey: config.llmApiKey,
      baseUrl: config.llmBaseUrl,
      gatewayHost: config.gatewayHost,
      model: config.llmModel,
    });
    const toolRegistry = new ToolRegistry();
    const engine = new EngineCoreVendorAdapter(provider, toolRegistry);

    const active: ActiveConsultation = {
      consultId, teamId, phase: 0, aborted: false,
      engine, events: [],
    };
    activeConsultations.set(consultId, active);

    // 客户端断连后清理，防止 OOM
    req.on('close', () => {
      active.aborted = true;
      setTimeout(() => activeConsultations.delete(consultId), 5000);
    });

    // 通过 onEvent 回调推送 SSE 事件（替代旧代码的 500ms 轮询 tracer.events()）
    const result = await engine.runConsultation(
      teamId,
      {
        role: initiator.role,
        name: initiator.name || initiator.role,
        teamId,
        concerns: initiator.concerns || [],
      },
      (event: DiagnosisEvent) => {
        if (active.aborted) return;
        active.phase = event.phase;
        active.events.push({
          type: event.type,
          phase: event.phase,
          label: event.label,
          message: event.message,
        });
        // L1-P0: 富事件输出 — 支持前端进度条 + 发现卡片 + 图更新渲染
        sseWrite(res, {
          type: event.type,
          phase: event.phase,
          label: event.label,
          message: event.message,
          findings: event.findings,
          confidence: event.confidence,
          nodesCreated: event.nodesCreated,
          edgesCreated: event.edgesCreated,
        });
      },
    );

    // ═══ P0-1: 诊断后处理 — GraphBridge 同步 + 社区报告 + 实体解析 ═══
    // 此前 HTTP 路径跑完诊断但没有把结果写回本体层。
    // 铁律 24+31: 每步独立 try/catch, 单个失败不阻断整体。
    if (!active.aborted) {
      const graphStore = req.app.locals?.graphStore as GraphStore | undefined;
      if (graphStore) {
        // 延迟导入 — 仅在 graphStore 可用时加载
        const [{ createGraphBridge }, { generateCommunityReports }, { resolveEntitiesL3 }] = await Promise.all([
          import('../l4/graph-bridge'),
          import('../l4/community-reports'),
          import('../l4/entity-resolver'),
        ]);
        const graphBridge = createGraphBridge(graphStore, teamId);

        // 关键人风险同步
        try {
          const report = result.report as Record<string, unknown>;
          const findings = (report?.keyFindings || report?.findings) as Array<Record<string, unknown>> | undefined;
          if (findings?.length) {
            const risks = findings
              .filter(f => f.riskLevel)
              .map(f => ({
                roleId: (f.entity || f.roleId || '') as string,
                riskLevel: (f.riskLevel || 'medium') as string,
                knowledgeDomains: (f.domains || []) as string[],
                busFactor: (f.busFactor || 1) as number,
              }));
            if (risks.length > 0) graphBridge.upsertFromKeyPersonRisk(risks);
          }
        } catch (err: unknown) { log.warn({ err }, 'GraphBridge keyPersonRisk sync failed — degraded'); }

        // 社区报告生成
        try {
          const communities = generateCommunityReports(graphStore, teamId);
          if (communities.length > 0) {
            log.info({ teamId, count: communities.length }, 'P0-1 社区报告已生成');
            sseWrite(res, {
              type: 'community_reports', phase: result.report ? 5 : 2,
              message: `发现 ${communities.length} 个协作圈`,
              findings: communities.slice(0, 3).map((c: CommunityReport) => ({
                moduleId: c.id || 'community',
                summary: c.summary || `协作圈 ${c.nodeCount || 0} 人`,
                confidence: 0.7,
              })),
              confidence: 0.7,
            });
          }
        } catch (err: unknown) { log.warn({ err }, 'CommunityReports failed — degraded'); }

        // 实体解析
        try {
          const resolution = await resolveEntitiesL3(graphStore, teamId);
          if (resolution.autoMerged > 0 || resolution.queuedForReview > 0) {
            log.info({ teamId, autoMerged: resolution.autoMerged, queued: resolution.queuedForReview }, 'P0-1 实体解析完成');
            sseWrite(res, {
              type: 'entity_resolution', phase: result.report ? 5 : 3,
              message: `发现 ${resolution.autoMerged} 对重复实体(自动合并), ${resolution.queuedForReview} 对待审核`,
              confidence: 0.8,
            });
          }
        } catch (err: unknown) { log.warn({ err }, 'EntityResolution failed — degraded'); }
      } else {
        log.debug('GraphStore 不可用 — 跳过后处理 (degraded)');
      }
    }

    if (!active.aborted) {
      sseClose(res, result);
    }
  } catch (err: any) {
    log.error({ err, consultId }, '诊断执行失败');
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message, code: 'DIAGNOSIS_ERROR' });
    } else {
      sseError(res, 'DIAGNOSIS_FAILED', err.message || '诊断失败');
    }
  } finally {
    activeConsultations.delete(consultId);
  }
});

// ═══ GET /consult/:id/status ═══

router.get('/api/diagnosis/consult/:consultId/status', (req: Request, res: Response) => {
  const { consultId } = req.params as { consultId: string };
  const active = activeConsultations.get(consultId);
  if (!active) {
    return res.status(404).json({ ok: false, error: '诊断不存在或已完成', code: 'NOT_FOUND' });
  }
  res.json({
    ok: true,
    consultId: active.consultId,
    teamId: active.teamId,
    phase: active.phase,
    eventCount: active.events.length,
    aborted: active.aborted,
  });
});

// ═══ POST /consult/:id/interrupt ═══

router.post('/api/diagnosis/consult/:consultId/interrupt', (req: Request, res: Response) => {
  const { consultId } = req.params as { consultId: string };
  const active = activeConsultations.get(consultId);
  if (!active) {
    return res.status(404).json({ ok: false, error: '诊断不存在或已完成', code: 'NOT_FOUND' });
  }
  active.aborted = true;
  res.json({ ok: true, consultId, interrupted: true });
});

// ═══ POST /consult/:id/resume — P2 Loop Engineering 缺口修复 ═══

router.post('/api/diagnosis/consult/:consultId/resume', async (req: Request, res: Response) => {
  const { consultId } = req.params as { consultId: string };
  const active = activeConsultations.get(consultId);
  if (!active || !active.aborted) {
    return res.status(404).json({ ok: false, error: '诊断不存在或未中断', code: 'NOT_FOUND' });
  }
  // 从 SessionStore 加载检查点
  try {
    const { SessionStore } = await import('../store/session-store');
    const store = new SessionStore((req.app.locals.orchestration as { db: unknown })?.db as never);
    const checkpoint = store.getDiagnosisCheckpoint ? store.getDiagnosisCheckpoint(consultId) : null;
    active.aborted = false;
    res.json({
      ok: true, consultId, resumed: true,
      checkpoint: checkpoint || null,
      message: checkpoint ? '已从检查点恢复' : '检查点不可用，从头开始',
    });
  } catch (err: unknown) {
    log.warn({ err, consultId }, '[diagnosis] resume 加载检查点失败 — degraded');
    active.aborted = false;
    res.json({ ok: true, consultId, resumed: true, checkpoint: null, message: '检查点加载失败，从头开始' });
  }
});

export default router;
