/**
 * diagnosis.ts — 诊断 API 路由 (SynovaAgent 独立版)
 *
 * POST /api/diagnosis/consult → SSE 流式六阶段诊断
 * GET  /api/diagnosis/consult/:id/status → 查询进行中的诊断
 * POST /api/diagnosis/consult/:id/interrupt → 中断诊断
 */
import { Router, type Request, type Response } from 'express';
import {
  DiagnosisOrchestrator,
  MemorySessionTracer,
  DiagnosisEventStream,
  createFdeToolExecutor,
  runModules,
  getGapTimeline,
} from '@synova/engine-core';
import type {
  InitiatorProfile,
  DiagnosisScope,
  DiagnosisEvent,
  DiagnosisLLMClient,
  LLMResponse,
  ToolExecutor,
  ToolResult,
} from '@synova/engine-core';
import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('routes/diagnosis');
const router = Router();

// ═══ LLM Client ═══

function createLLMClient(): DiagnosisLLMClient {
  const config = loadConfig();

  return {
    async consult(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
      // Gateway 模式优先
      const gatewayHost = config.gatewayHost;
      if (gatewayHost) {
        try {
          const res = await fetch(`${gatewayHost}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: config.llmModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
              ],
              temperature: 0.7,
              max_tokens: 4000,
            }),
            signal: AbortSignal.timeout(120_000),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Gateway LLM 错误 (${res.status}): ${text.slice(0, 200)}`);
          }
          const data = await res.json() as any;
          const content = data?.choices?.[0]?.message?.content;
          if (!content) throw new Error('Gateway 返回数据缺少 choices[0].message.content');
          return { content, model: config.llmModel };
        } catch (gwErr) {
          log.warn({ err: gwErr }, 'Gateway 失败，fallback 直连');
        }
      }

      // 直连模式
      if (!config.llmApiKey) {
        throw new Error('LLM_API_KEY 未配置，无法调用 LLM');
      }
      const res = await fetch(`${config.llmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.llmApiKey}`,
        },
        body: JSON.stringify({
          model: config.llmModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM 错误 (${res.status}): ${text.slice(0, 200)}`);
      }
      const data = await res.json() as any;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM 返回数据缺少 choices[0].message.content');
      return { content, model: config.llmModel };
    },
  };
}

// ═══ Tool Executor ═══

function createToolExecutor(): ToolExecutor {
  return {
    async execute(toolName: string, input: string): Promise<ToolResult> {
      try {
        const parsed = JSON.parse(input || '{}');
        const teamId = parsed.teamId || 'unknown';

        switch (toolName) {
          case 'runDiagnosisModules': {
            const modules = parsed.modules || undefined;
            const results = await runModules(teamId, modules);
            return { content: JSON.stringify(results) };
          }
          case 'getGapTimeline': {
            const limit = parsed.limit || 10;
            const timeline = getGapTimeline(teamId, limit);
            return { content: JSON.stringify(timeline) };
          }
          default:
            return { content: JSON.stringify({ error: `未知工具: ${toolName}` }) };
        }
      } catch (err: any) {
        return { content: JSON.stringify({ error: err.message }) };
      }
    },
  };
}

// ═══ Active Consultations ═══

interface ActiveConsultation {
  consultId: string;
  teamId: string;
  phase: number;
  aborted: boolean;
  orchestrator: DiagnosisOrchestrator<any, any>;
  events: DiagnosisEvent[];
}

const activeConsultations = new Map<string, ActiveConsultation>();

// ═══ POST /consult — SSE 流式六阶段诊断 ═══

router.post('/api/diagnosis/consult', async (req: Request, res: Response) => {
  const { teamId, initiator, scope } = req.body as {
    teamId?: string;
    initiator?: InitiatorProfile;
    scope?: DiagnosisScope;
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

  const stream = new DiagnosisEventStream(res);

  try {
    const llmClient = createLLMClient();
    const toolExecutor = createToolExecutor();
    const tracer = new MemorySessionTracer();

    const orchestrator = new DiagnosisOrchestrator(llmClient, toolExecutor)
      .withSessionTracer(tracer);

    if (scope?.depth === 'deep') {
      orchestrator.withGateDataCompleteness(0.9);
    }

    const active: ActiveConsultation = {
      consultId, teamId, phase: 0, aborted: false,
      orchestrator, events: [],
    };
    activeConsultations.set(consultId, active);

    // 启动诊断（异步）
    const consultationPromise = orchestrator.runConsultation(teamId, initiator);

    // 轮询 tracer 事件并推送 SSE
    let lastEventIdx = 0;
    const pollInterval = setInterval(() => {
      if (active.aborted) {
        clearInterval(pollInterval);
        stream.interrupt(consultId);
        return;
      }
      const events = tracer.events();
      while (lastEventIdx < events.length) {
        stream.write(events[lastEventIdx]);
        active.events.push(events[lastEventIdx]);
        lastEventIdx++;
      }
    }, 100);

    // 等待诊断完成
    let result;
    try {
      result = await consultationPromise;
    } catch (diagErr: any) {
      log.error({ err: diagErr, consultId }, '诊断执行失败');
      stream.error('DIAGNOSIS_FAILED', diagErr.message || '诊断失败');
      clearInterval(pollInterval);
      activeConsultations.delete(consultId);
      return;
    }

    clearInterval(pollInterval);

    // 推送剩余事件
    const remaining = tracer.events();
    while (lastEventIdx < remaining.length) {
      stream.write(remaining[lastEventIdx]);
      lastEventIdx++;
    }

    stream.close(result);
  } catch (err: any) {
    log.error({ err, consultId }, 'SSE 流失败');
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message, code: 'DIAGNOSIS_ERROR' });
    } else {
      stream.error(err.message);
    }
  } finally {
    activeConsultations.delete(consultId);
  }
});

// ═══ GET /consult/:id/status ═══

router.get('/api/diagnosis/consult/:consultId/status', (req: Request, res: Response) => {
  const { consultId } = req.params;
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
  const { consultId } = req.params;
  const active = activeConsultations.get(consultId);
  if (!active) {
    return res.status(404).json({ ok: false, error: '诊断不存在或已完成', code: 'NOT_FOUND' });
  }
  active.aborted = true;
  res.json({ ok: true, consultId, interrupted: true });
});

export default router;
