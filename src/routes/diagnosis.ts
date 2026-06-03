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

export default router;
