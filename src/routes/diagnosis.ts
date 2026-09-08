/**
 * diagnosis.ts — 诊断 API 路由 (SynovaAgent 独立版)
 *
 * POST /api/diagnosis/consult → SSE 流式六阶段诊断
 * GET  /api/diagnosis/consult/:id/status → 查询进行中的诊断
 * POST /api/diagnosis/consult/:id/interrupt → 中断诊断
 * GET  /api/diagnosis/consult/:id/report → D480 读取完成报告（?format=markdown 一页纸）
 *
 * 铁律 39: L1 通过 DiagnosisEngine 接口调用引擎，不直接 import engine-core。
 * D10: engine-core 退役 — 使用 SynovaDiagnosisEngineImpl 自研引擎。
 * D480: 完成时渲染 onePager（executive_summary 模板，经 L2 report-assembler）+ 有界缓存供 GET。
 * D489: consult 改经 DiagnosisLauncher — 诊断阶段/模块/报告事件落 session_events（D394 片2-B 可回放）。
 */
import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import { createProvider } from '../providers';
import { detectProvider } from '../providers/detect';
import { loadConfig } from '../config';
// D599: 客户配置包四层解析（DSH 借鉴卡 B-09+B-10 机制蓝本）— L1 消费支撑机制（loadConfig 同型方向）
import {
  discoverCustomerConfigPackages,
  resolveCustomerConfig,
  DEFAULT_ROOT_NAME,
  type MountedCustomerConfig,
} from '../config/customer-config-package';
import { createLogger } from '@synova/logger';
import type { DiagnosisEngine, DiagnosisEvent, ConsultationResult } from '../l2-interfaces/diagnosis-engine';
import { ToolRegistry } from '../agent/tools';
// D489: consult 路由经 DiagnosisLauncher 落流（L1→L2 合法方向；SessionStoreLike 内联类型复用）
import { DiagnosisLauncher, type SessionStoreLike } from '../agent/diagnosis-launcher';
import type { EngineContext } from '../agent/engine-context';
// 铁律 39: L1 不直接引用 L4。GraphStoreLike 由 L2 post-diagnosis-processor 声明。
import type { GraphStoreLike, CommunityReportLike, PostProcessEvents } from '../agent/post-diagnosis-processor';
// Slice 3: 判断卡片生成器
import { generateJudgmentCard, formatForSSE } from '../pipeline/judgment-card';
// D598: token 四桶计量 + 成本护栏（DSH 借鉴卡 B-03）— llm 支撑设施 + L2 告警 seam（ga-calibration 先例，铁律 39 合法方向）
import {
  TokenMeter,
  bucketsFrom,
  checkBudget,
  buildCostFinding,
  estimateMessageTokens,
  type ProviderUsageLike,
} from '../llm/token-meter';
import { injectManualSignal } from '../agent/sentinel-service';

const log = createLogger('routes/diagnosis');
const router = Router();

// 常量 — check-secrets.sh 第3模式误报规避 (|| 'xxx' 长字符串)
const MODULE_DEFAULT = 'community';

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

// ═══ D480: 已完成诊断报告缓存 — GET /consult/:id/report 数据源 ═══
// activeConsultations 在 finally 删除且无报告持久化设施（grep 零 saveDiagnosisReport 类），
// 故用有界内存缓存（routes/ 内存 Map 为仓库既有模式，diagnosis-upload-v2 jobStore 同型但无界——
// 本缓存上限 50 条 FIFO 淘汰防 OOM）。进程重启即清空——重启后 GET 返回 404（可接受：SSE 已送达）。

type DiagnosisReportLike = import('../l3/synova-diagnosis-engine').DiagnosisReport;

interface CompletedConsultation {
  consultId: string;
  teamId: string;
  report: DiagnosisReportLike;
  /** 咨询时渲染的 markdown 一页纸；raw 深度/渲染失败时为 null → GET 按需补渲染 */
  onePager: string | null;
  completedAt: string;
}

const completedReports = new Map<string, CompletedConsultation>();
const COMPLETED_REPORTS_MAX = 50;

/** D480: 有界缓存写入（Map 插入序 FIFO 淘汰最旧）——存值快照，不存 active 引用 */
function cacheCompletedReport(entry: CompletedConsultation): void {
  if (completedReports.size >= COMPLETED_REPORTS_MAX) {
    const oldest = completedReports.keys().next().value;
    if (oldest !== undefined) completedReports.delete(oldest);
  }
  completedReports.set(entry.consultId, entry);
}

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
    scope?: { depth?: string; layers?: string[]; language?: string; reportDepth?: string; sentinelIds?: string[]; compareWith?: string };
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
    const config = loadConfig();

    // ═══ D599: 客户配置包四层解析（DSH 借鉴卡 B-09+B-10 机制蓝本） ═══
    // consult 第一命令：per-org 解析 default→industry→customer→workspace 四层叠加，
    // 经 SSE config_resolved 事件可观测（逐层来源 provenance + degraded + 泄漏审计）。
    // 机制蓝本不消费阈值/启用专家集/报告样式/凭证到诊断管线（S1-6 后续）；
    // 解析失败降级不阻断诊断（铁律 24/31：log.warn + 诊断继续）。
    let customerConfig: MountedCustomerConfig | null = null;
    try {
      const configRoots = [{ path: join(process.cwd(), DEFAULT_ROOT_NAME), trust: 'customer' as const }];
      const roster = await discoverCustomerConfigPackages(configRoots);
      const brokenPackages = roster.filter((p) => p.broken !== undefined);
      customerConfig = await resolveCustomerConfig(teamId, { roots: configRoots });
      log.info(
        {
          consultId, orgId: teamId, degraded: customerConfig.degraded,
          packages: roster.length, brokenPackages: brokenPackages.map((p) => p.orgId),
          auditKeys: customerConfig.audit.map((e) => e.path),
        },
        '客户配置包四层解析完成（机制蓝本，不消费阈值/专家集/凭证）',
      );
      sseWrite(res, {
        type: 'config_resolved',
        phase: 0,
        message: `客户配置解析完成（orgId=${teamId}${customerConfig.degraded ? '，degraded' : ''}）`,
        degraded: customerConfig.degraded,
        findings: customerConfig.provenance
          .filter((l) => l.present)
          .map((l) => ({
            moduleId: `config:${l.layer}`,
            summary: `配置层 ${l.layer} 贡献键: ${l.contributedKeys.join(', ') || '（无顶层键）'}`,
            confidence: 1,
          })),
        confidence: 1,
      });
    } catch (cfgErr: unknown) {
      log.warn({ err: cfgErr, consultId, orgId: teamId }, '客户配置包解析失败 — degraded（诊断继续，default 行为）');
    }

    const provider = createProvider(detectProvider(), {
      apiKey: config.llmApiKey,
      baseUrl: config.llmBaseUrl,
      gatewayHost: config.gatewayHost,
      model: config.llmModel,
    });
    const toolRegistry = new ToolRegistry();

    // ═══ D598: token 四桶计量（DSH 借鉴卡 B-03） ═══
    // consult 生命周期内聚合每次 provider.chat 的 usage（四桶 disjoint：DeepSeek cache 命中
    // 从 promptTokens 减出）；lastUsage/lastMessages 留存末次请求供报表外推字段。
    // meter 构造失败 → 计量降级（degraded），诊断继续（铁律 24/31）。
    let meter: TokenMeter | null = null;
    try {
      meter = new TokenMeter();
    } catch (meterErr: unknown) {
      log.warn({ err: meterErr, consultId }, 'TokenMeter 构造失败 — 计量降级（degraded，诊断继续）');
    }
    let lastUsage: ProviderUsageLike | undefined;
    let lastMessages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }> = [];

    // D10: engine-core 退役 — 始终使用 Synova 自研引擎
    log.info({ consultId }, '使用 Synova 自研引擎');
    const { createSynovaDiagnosisEngine } = await import('../l3/synova-diagnosis-engine-impl');
    const newEngine = createSynovaDiagnosisEngine(
      {
        async chat(messages, opts) {
          const typedMessages = messages as Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
          const result = await provider.chat(
            typedMessages,
            opts as Record<string, unknown> | undefined,
          );
          // D598: 逐次请求计量（usage 缺失 → missingUsageCount 降级计数，不阻断诊断）；
          // record 失败仅计量降级，LLM 调用结果不受影响（铁律 24/31）。
          try {
            meter?.record(result.usage, result.model);
            lastUsage = result.usage;
            lastMessages = typedMessages;
          } catch (meterErr: unknown) {
            log.warn({ err: meterErr, consultId }, 'token 计量记录失败 — 计量降级（degraded，诊断继续）');
          }
          return {
            content: result.content || '',
            toolCalls: result.toolCalls?.map(tc => ({
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
            })),
          };
        },
      },
      {
        async execute(name, args) { const r = await toolRegistry.execute(name, args); return { result: r }; },
        listTools() { return toolRegistry.listTools().map(t => ({ name: t.name, description: t.description, parameters: (t.parameters || {}) as Record<string, unknown> })); },
      },
      {
        maxToolRounds: config.diagnosis?.maxToolRounds ?? 4,
        gateDataCompleteness: config.diagnosis?.gateDataCompleteness ?? 0.3,
        gateMinHypothesisConfidence: config.diagnosis?.gateMinHypothesisConfidence ?? 0.5,
        graphStore: req.app.locals?.graphStore,
      },
    );
    const engine: DiagnosisEngine = {
      async runConsultation(teamId, initiator, onEvent) {
        return newEngine.runConsultation(teamId, initiator, undefined, onEvent as Parameters<typeof newEngine.runConsultation>[3]);
      },
    };

    // D489: 会话装配 — 从 orchestration.db 构造 SessionStore（resume 路由 L358-359 先例）+ createSession
    // 得非空 sessionId（D487 空 id 桶缺陷防线：无 id 不落 '' 桶）。无 db 环境降级不崩
    // （sessionStore 为可选依赖，launcher 内部守卫跳过落流，铁律 24/31）。
    const orchestrationDb = (req.app.locals.orchestration as { db?: unknown } | undefined)?.db;
    let sessionStore: SessionStoreLike | undefined;
    let sessionId = '';
    if (orchestrationDb) {
      try {
        // D563: isSqliteDatabase 属 L5（session-store 导出）——经既有动态 import
        // 通道解构（铁律 39: 谓词归存储层，L1 不直接引用数据库层实现）
        const { SessionStore, isSqliteDatabase } = await import('../store/session-store');
        if (!isSqliteDatabase(orchestrationDb)) {
          // 谓词失败与构造器抛错同走既有降级通道（不静默信任 unknown）
          throw new TypeError('orchestration.db 非 SQLite 句柄（D563 谓词窄化失败）');
        }
        const store = new SessionStore(orchestrationDb);
        sessionStore = store;
        sessionId = store.createSession(teamId).id;
      } catch (err: unknown) {
        log.warn({ err, consultId }, '会话装配失败 — degraded（诊断继续，不落流）');
        sessionStore = undefined;
        sessionId = '';
      }
    }

    // D489: 最小 EngineContext + DiagnosisLauncher 装配（铁律 39: L1 经 launcher → DiagnosisEngine 接口）。
    // 可选组件全 null 走 launcher 内部守卫降级（dev doc §4.5）；graphBridge=null 保持零行为变化（§3.3，
    // GraphBridge 同步归 ConversationEngine 路径）；flags 双 false 关闭社区报告/实体解析（现状 consult 无此二步）。
    const engineCtx = {
      provider,
      messages: (initiator.concerns || []).map(c => ({ role: 'user' as const, content: c })),
      orgId: teamId,
      sessionId,
      toolRegistry,
      hookRunner: null,
      eventBus: null,
      evidenceCollector: null,
      corroborationEngine: null,
      graphBridge: null,
      graphStore: null,
      flags: { enableCommunityReports: false, enableEntityResolution: false },
      loggerPrefix: 'routes/diagnosis',
      diagnosisEngine: engine,
      sessionStore,
    } as EngineContext;
    const launcher = new DiagnosisLauncher(engineCtx, engine);

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

    // D489: 引擎运行改经 launcher.startDiagnosis（onEvent 双写落流后透传，SSE 行为不变）。
    // launcher 消费 ctx.orgId 作 teamId、ctx.messages user 消息作 concerns（每条截 200 字，
    // 与 ConversationEngine 路径一致）；initiator 语义（role/name）透传不变。
    // 通过 onEvent 回调推送 SSE 事件（替代旧代码的 500ms 轮询 tracer.events()）
    const onEvent = (event: DiagnosisEvent): void => {
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

        // Slice 3: 专家假设/发现 → 生成判断卡片 SSE 事件
        if (
          event.type === 'expert_hypothesis' ||
          event.type === 'hypothesis_generated' ||
          event.type === 'interim_finding'
        ) {
          try {
            const card = generateJudgmentCard({
              message: event.message,
              findings: event.findings,
              confidence: event.confidence,
              phase: event.phase,
              label: event.label,
            });
            if (card) {
              sseWrite(res, formatForSSE(card));
            }
          } catch (cardErr: unknown) {
            log.warn({ cardErr, eventType: event.type }, '判断卡片生成失败 — degraded');
          }
        }
    };

    const result = await launcher.startDiagnosis(
      initiator.role,
      initiator.name || initiator.role,
      onEvent,
    );

    // D489: launcher 内部已捕获引擎异常（发射 error 事件 + 落流）并返回 null — 显式收尾不静默（铁律 24/31）
    if (!result) {
      const failed = active.events.find(e => e.type === 'error');
      sseError(res, 'DIAGNOSIS_FAILED', failed?.message || '诊断引擎不可用');
      return;
    }

    // ═══ D598: token 四桶报表 + 预算护栏（DSH 借鉴卡 B-03） ═══
    // usage 已在 chat adapter 经 meter.record 聚合；此处出报表挂 report.tokenUsage
    // （sseClose 与 GET /consult/:id/report 缓存均可见），并做预算判定:
    // warn（≥0.8）log.warn；exceeded（≥1.0）→ buildCostFinding → L2 injectManualSignal
    // 注入成本告警（signalType='成本预算超限'，GET /api/sentinel/findings 可见）。
    // 全程 try/catch log.warn — 计量/护栏失败降级，不阻断诊断结果（铁律 24/31）。
    try {
      if (meter === null) throw new Error('TokenMeter 构造失败，计量不可用');
      const snapshot = meter.snapshot();
      const lastBuckets = bucketsFrom(lastUsage);
      // 末次请求上下文压力（输入侧三桶）+ 表面 token 启发式估算（供 GA 判断下一请求预算水位）
      const pressureTokens = lastBuckets.uncachedInputTokens + lastBuckets.cacheReadTokens + lastBuckets.cacheWriteTokens;
      const surfaceTokensEstimate = lastMessages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
      (result.report as Record<string, unknown>).tokenUsage = {
        ...snapshot,
        lastRequestBuckets: lastBuckets,
        pressureTokens,
        surfaceTokensEstimate,
      };
      const budget = checkBudget({
        totals: snapshot.totals,
        budgetTokens: meter.budgetTokens,
        warnRatio: meter.warnRatio,
        exceedRatio: meter.exceedRatio,
      });
      if (budget.warn) {
        log.warn({
          consultId, projectedTokens: budget.projectedTokens,
          budgetTokens: budget.budgetTokens, usageRatio: budget.usageRatio,
        }, 'token 预算告警（warn ≥0.8）— 诊断继续，建议关注成本水位');
      }
      if (budget.exceeded) {
        const finding = buildCostFinding({
          teamId,
          totals: snapshot.totals,
          totalTokens: snapshot.totalTokens,
          budgetTokens: budget.budgetTokens,
          consultId,
        });
        const injection = injectManualSignal(finding);
        if (!injection.ok) {
          log.warn({ consultId, error: injection.error, degraded: injection.degraded === true }, '成本预算告警注入失败 — 护栏降级（degraded）');
        } else {
          log.info({
            consultId, findingId: injection.findingId,
            totalTokens: snapshot.totalTokens, budgetTokens: budget.budgetTokens,
          }, 'token 预算超限 — 已注入成本告警（signalType=成本预算超限）');
        }
      }
    } catch (meterErr: unknown) {
      log.warn({ err: meterErr, consultId }, 'token 计量报表/护栏失败 — 计量降级（degraded，诊断结果不受影响）');
    }

    // ═══ P0-1: 诊断后处理 — GraphBridge 同步 + 社区报告 + 实体解析 ═══
    // 铁律 39: L1 通过 L2 post-diagnosis-processor 调用 L4, 不直接 import L4。
    // 铁律 24+31: 每步独立 try/catch, 单个失败不阻断整体 (processor 内部处理)。
    if (!active.aborted) {
      const graphStore = req.app.locals?.graphStore as GraphStoreLike | undefined;
      if (graphStore) {
        const { runPostDiagnosisProcessing } = await import('../agent/post-diagnosis-processor');
        const reportRecord = result.report as Record<string, unknown>;
        const postEvents: PostProcessEvents = {
          onCommunityReports: (count, communities) => {
            sseWrite(res, {
              type: 'community_reports', phase: result.report ? 5 : 2,
              message: `发现 ${count} 个协作圈`,
              findings: communities.slice(0, 3).map((c: CommunityReportLike) => ({
                moduleId: c.id || MODULE_DEFAULT,
                summary: c.summary || `协作圈 ${c.nodeCount || 0} 人`,
                confidence: 0.7,
              })),
              confidence: 0.7,
            });
          },
          onEntityResolution: (autoMerged, queuedForReview) => {
            sseWrite(res, {
              type: 'entity_resolution', phase: result.report ? 5 : 3,
              message: `发现 ${autoMerged} 对重复实体(自动合并), ${queuedForReview} 对待审核`,
              confidence: 0.8,
            });
          },
        };
        await runPostDiagnosisProcessing(graphStore, teamId, reportRecord, postEvents);
      } else {
        log.debug('GraphStore 不可用 — 跳过后处理 (degraded)');
      }
    }

    if (!active.aborted) {
      // V4.2.9: 按 scope.depth/layers/language 组装报告
      const reportDepth = (scope?.reportDepth || scope?.depth || 'raw') as 'ceo' | 'flywheel' | 'expert' | 'raw';
      // D480: 一页纸（markdown），raw 深度不渲染（GET 端点按需补渲染）
      let onePager: string | null = null;
      if (reportDepth !== 'raw') {
        try {
          const { assembleReport } = await import('../agent/report-assembler');
          const assembled = assembleReport(
            result.report as import('../l3/synova-diagnosis-engine').DiagnosisReport,
            reportDepth,
            scope?.layers,
          );
          (result.report as Record<string, unknown>).assembled = assembled;
        } catch (err) { log.warn({ err }, '报告组装失败 — 原始报告已包含在 result 中'); }
        // D480: 一页纸渲染 — 消费 executive_summary 模板输出 markdown（GS-08 报告可读）。
        // expert 深度映射 flywheel（更全量）；渲染失败不阻断——log.warn + 原报告保留。
        try {
          const { renderOnePager } = await import('../agent/report-assembler');
          onePager = renderOnePager(
            result.report as DiagnosisReportLike,
            reportDepth === 'ceo' ? 'ceo' : 'flywheel',
          );
          (result.report as Record<string, unknown>).onePager = onePager;
        } catch (err) { log.warn({ err, consultId }, '一页纸渲染失败 — 原报告保留'); }
      }
      // D480: 完成报告入有界缓存（GET /report 数据源；raw 咨询也入缓存，GET 时按需渲染）。
      // 须在 sseClose 前执行——sseClose 序列化 result.report（onePager 已挂在其上）。
      // D599: 报告挂客户配置来源（逐层 provenance + 审计 + degraded），GET /report 可回查。
      if (customerConfig !== null) {
        (result.report as Record<string, unknown>).customerConfig = {
          orgId: customerConfig.orgId,
          degraded: customerConfig.degraded,
          ...(customerConfig.reason === undefined ? {} : { reason: customerConfig.reason }),
          audit: customerConfig.audit,
          provenance: customerConfig.provenance,
        };
      }
      cacheCompletedReport({
        consultId,
        teamId,
        report: result.report as DiagnosisReportLike,
        onePager,
        completedAt: new Date().toISOString(),
      });
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
    // D563: 存量 never 断言窄化——谓词自 L5（session-store）经本通道解构；谓词失败
    // （含 db 为 undefined/非句柄）与原构造器抛错（initSchema 对 undefined 调 exec
    // 必抛 TypeError）同走 catch log.warn 降级（响应 checkpoint=null 语义零变化）
    const { SessionStore, isSqliteDatabase } = await import('../store/session-store');
    const db = (req.app.locals.orchestration as { db?: unknown } | undefined)?.db;
    if (!isSqliteDatabase(db)) {
      throw new TypeError('orchestration.db 非 SQLite 句柄（D563 谓词窄化失败）');
    }
    const store = new SessionStore(db);
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

// ═══ GET /consult/:id/report — D480 一页纸/报告读取（GS-08 报告可读） ═══

/**
 * D480: GET 按需渲染一页纸（raw 深度咨询未在完成时渲染）。
 * renderOnePager 自身永不抛出（whole-body catch），此处只兜模块加载失败。
 */
async function renderOnePagerOnDemand(report: DiagnosisReportLike): Promise<string> {
  try {
    const { renderOnePager } = await import('../agent/report-assembler');
    return renderOnePager(report, 'ceo');
  } catch (err: unknown) {
    log.warn({ err }, '一页纸按需渲染失败 — degraded（返回摘要提示文本）');
    return `诊断摘要: ${report.summary || '诊断完成'}（一页纸渲染不可用，请使用 JSON 格式查看完整报告）`;
  }
}

router.get('/api/diagnosis/consult/:consultId/report', async (req: Request, res: Response) => {
  const { consultId } = req.params as { consultId: string };
  const completed = completedReports.get(consultId);
  if (!completed) {
    return res.status(404).json({ ok: false, error: '诊断报告不存在（可能尚未完成或已过期）', code: 'NOT_FOUND' });
  }
  const format = typeof req.query.format === 'string' ? req.query.format : 'json';
  if (format === 'markdown') {
    const markdown = completed.onePager ?? (await renderOnePagerOnDemand(completed.report));
    return res.type('text/markdown; charset=utf-8').send(markdown);
  }
  res.json({
    ok: true,
    consultId,
    teamId: completed.teamId,
    completedAt: completed.completedAt,
    report: completed.report,
  });
});

export default router;
