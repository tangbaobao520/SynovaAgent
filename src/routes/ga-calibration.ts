/**
 * ga-calibration.ts — GA 诊断校准 API（D551 · Module-3 蓝图 §3.2/§3.3，spec SYNOVA-IMPL-DSH-D551）
 *
 * 三块能力（左栏 GA 协同面板的后端契约，前端接线 = 后续切片）:
 *   ① POST /api/ga/calibration         — 诊断校准（标记错误/补充背景/重写逻辑/降级标记，蓝图 §3.2.1 四操作）
 *   ② GET  /api/ga/calibration         — 校准列表（latest 链头 / ?includeChain=1 全链，append-only + supersedes 版本链）
 *   ③ POST /api/ga/calibration/signals — 手动信号注入（蓝图 §3.3.1 五要素 → 哨兵事件流，§6.2）
 *   ④ GET  /api/ga/calibration/stats   — 反馈效用仪表（贡献计数 + 回流计数；"采纳率"诚实降级为回流计数，§8.2）
 *
 * 单源与边界（防膨胀红线）:
 *   - 存储单源 AgentMemoryStore（type='ga_calibration'/'manual_signal'，append-only 不可覆盖——
 *     annotations L8 原则延伸；不引入独立版本表，supersedes 链即版本）
 *   - 回流单源 feedback_log（getFeedbackCollector() 活单例 — 禁 ga-collaboration 死链 GAFeedbackHandler）；
 *     add_context 不回流（背景卡是上下文增强，非纠错信号——§7.1）
 *   - 注入单源哨兵事件流（sentinel-service.injectManualSignal → runner.injectManualFinding →
 *     persistRunEvents + projectRunRecord，I2 零旁路；路由不直写 sentinel_events）
 *   - 诚实声明（本任务最高优先级）: 回流收口 = feedback_log 行 + getAggregatedSignals 聚合可见；
 *     "进化动作生成/采纳率/诊断变好"不在本单（engine 白名单未改 + 无采纳数据源）——§7.2/§7.3 分层
 *
 * 每个 catch 必须 log.error + degraded: true（铁律 24/31）；as any = 0（铁律 38）
 *
 * @module routes/ga-calibration
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';
import { requireGa } from './ga-auth';
import { getFeedbackCollector, type FeedbackDecision } from '../growth/feedback-collector';
import { injectManualSignal } from '../agent/sentinel-service';

const log = createLogger('routes/ga-calibration');
const router = Router();

// ═══ 权威值域（蓝图 §3.2.1 / §3.3.1 原文枚举，spec §6.1/§6.2） ═══

const TARGET_TYPES = ['diagnosis_conclusion', 'diagnosis_logic', 'signal_relevance'] as const;
const CALIBRATION_ACTIONS = ['mark_error', 'add_context', 'rewrite_logic', 'demote_signal'] as const;
const ERROR_TYPES = ['事实错误', '归因错误', '遗漏关键信息', '过于笼统'] as const;
const SIGNAL_TYPES = ['人员变动', '战略转向', '竞品动态', '客户反馈', '监管变化', '供应商变化', '市场传闻', '技术突破', '内部冲突', '其他'] as const;

/** 校准动作 → 回流 decision 映射（spec §7.1；add_context 不回流） */
const REFLUX_DECISION: Partial<Record<(typeof CALIBRATION_ACTIONS)[number], FeedbackDecision>> = {
  mark_error: 'reject',
  rewrite_logic: 'modify',
  demote_signal: 'ineffective',
};

/** 校准条目 value 结构（spec §6.1） */
interface CalibrationValue {
  targetType: string;
  targetId: string;
  action: string;
  errorType?: string;
  correctedContent?: string;
  contextCard?: string;
  originalVersion?: string;
  rewrittenVersion?: string;
  sentinelId?: string;
  supersedes?: string | null;
  gaId: string;
  orgId: string;
  calibratedAt: string;
}

// ═══ 工具函数 ═══

/** 延迟获取 AgentMemoryStore 实例（避免循环依赖，对齐 ga-annotations L37-41 模式） */
async function getStore() {
  const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
  const { getDatabase } = await import('../init/engine-context');
  return getAgentMemoryStore(getDatabase());
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function readQuery(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === 'string' ? v : undefined;
}

function parseIntSafe(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** 回流 reason 组装（校准语义摘要，截断防膨胀） */
function buildRefluxReason(action: string, body: Record<string, unknown>): string {
  const parts: string[] = [`GA 校准 ${action}`];
  if (typeof body.errorType === 'string' && body.errorType) parts.push(body.errorType);
  if (typeof body.sentinelId === 'string' && body.sentinelId) parts.push(`sentinel=${body.sentinelId}`);
  if (typeof body.correctedContent === 'string' && body.correctedContent) parts.push(body.correctedContent.slice(0, 200));
  return parts.join(' — ');
}

function internalError(res: Response, err: unknown, scope: string): Response {
  log.error({ err, scope }, 'GA 校准路由异常');
  return res.status(500).json({
    ok: false,
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'GA 校准服务异常',
    degraded: true,
  });
}

// ═══ ① POST /api/ga/calibration — 诊断校准提交（spec §8.2 端点 1） ═══

/**
 * 创建一条校准记录（append-only + supersedes 版本链）。
 *
 * 校验: mark_error 必填 errorType(蓝图四值)+correctedContent；add_context 必填 contextCard；
 * rewrite_logic 必填 originalVersion+rewrittenVersion；demote_signal 必填 sentinelId；
 * supersedes 存在须指向同 targetType+targetId 存量条目（否则 400 CHAIN_ERROR）。
 * 回流: mark_error→reject / rewrite_logic→modify / demote_signal→ineffective 双写 feedback_log
 * （target_type='diagnosis_conclusion'，actor_role='ga'，evidence_refs=[校准 entry id] 互链）。
 * 降级: store 异常 → 500 + degraded:true（铁律 24/31）；回流写失败 → 校准仍 201 + refluxDegraded 传播。
 */
router.post('/api/ga/calibration', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const body = req.body as Record<string, unknown>;

    const { targetType, targetId, action } = body;
    if (!isNonEmptyString(targetType) || !(TARGET_TYPES as readonly string[]).includes(targetType)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: `targetType 必须是: ${TARGET_TYPES.join(', ')}` });
    }
    if (!isNonEmptyString(targetId)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'targetId 必填' });
    }
    if (!isNonEmptyString(action) || !(CALIBRATION_ACTIONS as readonly string[]).includes(action)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: `action 必须是: ${CALIBRATION_ACTIONS.join(', ')}` });
    }

    // 动作专属必填校验（spec §8.2 端点 1 括号规则）
    if (action === 'mark_error') {
      const { errorType, correctedContent } = body as { errorType?: unknown; correctedContent?: unknown };
      if (!isNonEmptyString(errorType) || !(ERROR_TYPES as readonly string[]).includes(errorType)) {
        return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: `mark_error 必填 errorType（${ERROR_TYPES.join('/')}）` });
      }
      if (!isNonEmptyString(correctedContent)) {
        return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'mark_error 必填 correctedContent（正确信息或补充说明）' });
      }
    }
    if (action === 'add_context' && !isNonEmptyString(body.contextCard)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'add_context 必填 contextCard（背景卡片）' });
    }
    if (action === 'rewrite_logic' && (!isNonEmptyString(body.originalVersion) || !isNonEmptyString(body.rewrittenVersion))) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'rewrite_logic 必填 originalVersion + rewrittenVersion（并列存储）' });
    }
    if (action === 'demote_signal' && !isNonEmptyString(body.sentinelId)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'demote_signal 必填 sentinelId（目标哨兵）' });
    }

    const store = await getStore();

    // supersedes 版本链校验（DS3）: 须指向同 targetType+targetId 的存量校准条目
    let supersedes: string | null = null;
    if (body.supersedes !== undefined && body.supersedes !== null) {
      if (!isNonEmptyString(body.supersedes)) {
        return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'supersedes 必须是字符串（被取代条目 id）' });
      }
      const prior = store.list({ orgId: auth.orgId, tags: ['ga_calibration', targetType, targetId], limit: 200, offset: 0 })
        .find((e) => e.id === body.supersedes);
      if (!prior) {
        return res.status(400).json({ ok: false, code: 'CHAIN_ERROR', message: 'supersedes 必须指向同 targetType+targetId 的存量校准条目' });
      }
      supersedes = body.supersedes;
    }

    const now = new Date().toISOString();
    const value: CalibrationValue = {
      targetType,
      targetId,
      action,
      gaId: auth.userId,
      orgId: auth.orgId,
      calibratedAt: now,
      supersedes,
    };
    if (typeof body.errorType === 'string') value.errorType = body.errorType;
    if (typeof body.correctedContent === 'string') value.correctedContent = body.correctedContent;
    if (typeof body.contextCard === 'string') value.contextCard = body.contextCard;
    if (typeof body.originalVersion === 'string') value.originalVersion = body.originalVersion;
    if (typeof body.rewrittenVersion === 'string') value.rewrittenVersion = body.rewrittenVersion;
    if (typeof body.sentinelId === 'string') value.sentinelId = body.sentinelId;

    // key 对齐 ga-corrections L32 形态（spec §6.1）; tags 对齐 annotations L122 过滤模式
    const entry = store.remember({
      orgId: auth.orgId,
      key: `ga_calibration:${targetType}:${targetId}:${Date.now()}`,
      value: JSON.stringify(value),
      type: 'ga_calibration',
      confidence: 1.0,
      source: `ga:${auth.userId}`,
      tags: ['ga_calibration', targetType, targetId, action],
      expiresAt: null,
    });

    // 回流双写（spec §7.1）: feedback_log 单源（getFeedbackCollector 活单例 — 非 ga-collaboration 死链）。
    // add_context 不写 feedback_log（背景卡是上下文增强，非纠错信号）。
    let refluxDegraded = false;
    const decision = REFLUX_DECISION[action as (typeof CALIBRATION_ACTIONS)[number]];
    if (decision) {
      const rec = getFeedbackCollector().collectFeedback({
        enterpriseId: auth.orgId,
        actorId: auth.userId,
        decision,
        targetType: 'diagnosis_conclusion',
        targetId,
        reason: buildRefluxReason(action, body),
        actorRole: 'ga',
        evidenceRefs: [entry.id],
      });
      refluxDegraded = rec.degraded === true;
      if (refluxDegraded) {
        log.warn({ calibrationId: entry.id }, '校准回流写 feedback_log 降级 — 校准已存，回流计数暂缺（铁律 31 传播）');
      }
    }

    log.info({ calibrationId: entry.id, action, targetType, targetId, gaId: auth.userId }, 'GA 校准已提交');
    return res.status(201).json({ ok: true, calibrationId: entry.id, supersedes, ...(refluxDegraded ? { refluxDegraded: true } : {}) });
  } catch (err: unknown) {
    return internalError(res, err, 'POST /api/ga/calibration');
  }
});

// ═══ ② GET /api/ga/calibration — 校准列表（spec §8.2 端点 2） ═══

/**
 * 查询校准记录。默认仅返回 latest 链头（未被任何后续条目 supersedes 引用的条目）；
 * ?includeChain=1 返回全版本数组（按 calibratedAt 升序）。
 * supersededBy = 反向索引（后续条目 supersedes 指向它即被取代）。
 * 分页/筛选语义与 GET /api/ga/annotations（L147-206）一致——前端零新概念（§8.3）。
 */
router.get('/api/ga/calibration', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const store = await getStore();

    const targetType = readQuery(req, 'targetType');
    const targetId = readQuery(req, 'targetId');
    const action = readQuery(req, 'action');
    const includeChain = readQuery(req, 'includeChain') === '1';
    const limit = Math.min(parseIntSafe(readQuery(req, 'limit'), 50), 200);
    const offset = Math.max(parseIntSafe(readQuery(req, 'offset'), 0), 0);

    const tags: string[] = ['ga_calibration'];
    if (targetType) tags.push(targetType);
    if (targetId) tags.push(targetId);
    if (action) tags.push(action);

    const results = store.list({ orgId: auth.orgId, tags, limit: 200, offset: 0 });

    const items: Array<{ id: string; val: Partial<CalibrationValue>; createdAt: string }> = [];
    for (const r of results) {
      try {
        items.push({ id: r.id, val: JSON.parse(r.value) as Partial<CalibrationValue>, createdAt: r.createdAt });
      } catch {
        log.debug({ entry: r.id }, '解析校准数据失败 — 列表跳过（不静默）');
      }
    }

    // supersededBy 反向索引: 有后续条目 supersedes 指向的条目 = 被取代
    const supersededBy = new Map<string, string>();
    for (const it of items) {
      if (it.val.supersedes) supersededBy.set(it.val.supersedes, it.id);
    }

    const visible = includeChain ? items : items.filter((it) => !supersededBy.has(it.id));
    const timeOf = (it: { val: Partial<CalibrationValue>; createdAt: string }) => it.val.calibratedAt ?? it.createdAt;
    visible.sort((a, b) => (includeChain
      ? timeOf(a).localeCompare(timeOf(b))            // 全链: calibratedAt 升序（§8.2 注）
      : timeOf(b).localeCompare(timeOf(a))));         // 默认: 最新优先（对齐 annotations L184 降序）

    const total = visible.length;
    const calibrations = visible.slice(offset, offset + limit).map((it) => ({
      calibrationId: it.id,
      targetType: it.val.targetType,
      targetId: it.val.targetId,
      action: it.val.action,
      errorType: it.val.errorType,
      correctedContent: it.val.correctedContent,
      contextCard: it.val.contextCard,
      originalVersion: it.val.originalVersion,
      rewrittenVersion: it.val.rewrittenVersion,
      sentinelId: it.val.sentinelId,
      supersedes: it.val.supersedes ?? undefined,
      gaId: it.val.gaId,
      calibratedAt: timeOf(it),
      ...(supersededBy.has(it.id) ? { supersededBy: supersededBy.get(it.id) } : {}),
    }));

    return res.json({ ok: true, calibrations, total });
  } catch (err: unknown) {
    return internalError(res, err, 'GET /api/ga/calibration');
  }
});

// ═══ ③ POST /api/ga/calibration/signals — 手动信号注入（spec §8.2 端点 3） ═══

/**
 * GA 手动信号注入（蓝图 §3.3.1 五要素）。
 *
 * 链路: 校验（枚举/越界在路由层拦截，不落事件不落库）→ sentinel-service.injectManualSignal
 * （L2）→ runner.injectManualFinding（L3，sentinel_events + 投影，I2 零旁路）→ memory 审计条目
 * （type='manual_signal'，append-only）。注入响应 findingId 可在 GET /api/sentinel/findings 查。
 * 降级: runner 未初始化 → 503 + degraded:true（GA 输入仍落 memory 审计，铁律 24/31 诚实传播）。
 */
router.post('/api/ga/calibration/signals', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const body = req.body as Record<string, unknown>;

    const { signalType, title, description, severity, confidence } = body;
    if (!isNonEmptyString(signalType) || !(SIGNAL_TYPES as readonly string[]).includes(signalType)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: `signalType 必须是: ${SIGNAL_TYPES.join(', ')}` });
    }
    if (!isNonEmptyString(title)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'title 必填' });
    }
    if (!isNonEmptyString(description)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'description 必填' });
    }
    if (typeof severity !== 'number' || !Number.isFinite(severity) || severity < 1 || severity > 10) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'severity 必须是 1-10 的数值' });
    }
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'confidence 必须是 0-100 的数值' });
    }
    const relatedEdges = body.relatedEdges;
    const relatedNodes = body.relatedNodes;
    if (relatedEdges !== undefined && (!Array.isArray(relatedEdges) || !relatedEdges.every((e) => typeof e === 'string'))) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'relatedEdges 必须是字符串数组' });
    }
    if (relatedNodes !== undefined && (!Array.isArray(relatedNodes) || !relatedNodes.every((n) => typeof n === 'string'))) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'relatedNodes 必须是字符串数组' });
    }

    // L1 → L2 → L3 注入链（I2 零旁路: 路由不直写 sentinel_events）
    const injection = injectManualSignal({
      signalType,
      title,
      description,
      severity,
      confidence,
      relatedEdges: relatedEdges as string[] | undefined,
      relatedNodes: relatedNodes as string[] | undefined,
      gaId: auth.userId,
      orgId: auth.orgId,
    });

    const store = await getStore();
    const now = new Date().toISOString();
    const auditValue = JSON.stringify({
      signalType, title, description, severity, confidence,
      relatedEdges: (relatedEdges as string[] | undefined) ?? [],
      relatedNodes: (relatedNodes as string[] | undefined) ?? [],
      findingId: injection.findingId,
      injectionError: injection.error ?? null,
      gaId: auth.userId,
      orgId: auth.orgId,
      injectedAt: now,
    });

    if (!injection.ok || injection.findingId === null) {
      // 注入失败 — GA 输入仍落 memory 审计（append-only），响应降级诚实传播（铁律 24/31）
      store.remember({
        orgId: auth.orgId,
        key: `manual_signal:${Date.now()}`,
        value: auditValue,
        type: 'manual_signal',
        confidence: 1.0,
        source: `ga:${auth.userId}`,
        tags: ['manual_signal', signalType],
        expiresAt: null,
      });
      log.warn({ signalType, gaId: auth.userId, err: injection.error }, 'GA 手动信号注入失败 — 降级（审计条目已存）');
      return res.status(503).json({
        ok: false,
        code: 'SENTINEL_RUNNER_UNAVAILABLE',
        message: injection.error ?? '哨兵注入服务不可用',
        degraded: true,
      });
    }

    const entry = store.remember({
      orgId: auth.orgId,
      key: `manual_signal:${Date.now()}`,
      value: auditValue,
      type: 'manual_signal',
      confidence: 1.0,
      source: `ga:${auth.userId}`,
      tags: ['manual_signal', signalType],
      expiresAt: null,
    });

    log.info({ signalId: entry.id, findingId: injection.findingId, signalType, gaId: auth.userId }, 'GA 手动信号已提交');
    return res.status(201).json({ ok: true, signalId: entry.id, findingId: injection.findingId, ...(injection.degraded ? { degraded: true } : {}) });
  } catch (err: unknown) {
    return internalError(res, err, 'POST /api/ga/calibration/signals');
  }
});

// ═══ ④ GET /api/ga/calibration/stats — 反馈效用仪表（spec §8.2 端点 4） ═══

/**
 * 效用统计（数据源 A: 校准/注入条目 = AgentMemoryStore；数据源 B: feedback_log 只读聚合）。
 *
 * 诚实降级（spec §3.3 排除 + §8.2 note）: 蓝图 §3.4"采纳率"依赖"系统自动评估"数据源，
 * 现系统无采纳判定数据 → 采纳率不伪造，回流计数 + note 显式声明。
 * reflux 只读 queryFeedback（enterpriseId 必填，D338 fail-closed）+ actorRole='ga' 过滤。
 */
router.get('/api/ga/calibration/stats', async (req: Request, res: Response) => {
  try {
    if (!requireGa(req, res)) return;
    const auth = extractAuthFromRequest(req)!;
    const store = await getStore();

    // 数据源 A1: 校准条目计数（tags 过滤对齐 annotations stats L227-232 模式）
    const byAction: Record<string, number> = { mark_error: 0, add_context: 0, rewrite_logic: 0, demote_signal: 0 };
    let calibrationTotal = 0;
    for (const r of store.list({ orgId: auth.orgId, tags: ['ga_calibration'], limit: 200, offset: 0 })) {
      try {
        const val = JSON.parse(r.value) as { action?: string };
        if (val.action && val.action in byAction) {
          byAction[val.action]++;
          calibrationTotal++;
        }
      } catch {
        log.debug({ entry: r.id }, '解析校准数据失败 — stats 跳过（不静默）');
      }
    }

    // 数据源 A2: 注入条目计数（byType 固定含 10 枚举键，蓝图 §3.3.1）
    const byType: Record<string, number> = {};
    for (const t of SIGNAL_TYPES) byType[t] = 0;
    let injectionTotal = 0;
    for (const r of store.list({ orgId: auth.orgId, tags: ['manual_signal'], limit: 200, offset: 0 })) {
      try {
        const val = JSON.parse(r.value) as { signalType?: string };
        if (val.signalType && val.signalType in byType) {
          byType[val.signalType]++;
          injectionTotal++;
        }
      } catch {
        log.debug({ entry: r.id }, '解析信号数据失败 — stats 跳过（不静默）');
      }
    }

    // 数据源 B: feedback_log 只读（GA 角色回流行数 + decision 分布）
    const reflux = getFeedbackCollector().queryFeedback({ enterpriseId: auth.orgId, limit: 1000 });
    const byDecision: Record<string, number> = { reject: 0, modify: 0, ineffective: 0 };
    let feedbackCount = 0;
    for (const row of reflux.entries) {
      if (row.actorRole !== 'ga') continue;
      feedbackCount++;
      if (row.decision in byDecision) byDecision[row.decision]++;
    }

    return res.json({
      ok: true,
      calibration: { total: calibrationTotal, byAction },
      injection: { total: injectionTotal, byType },
      reflux: { feedbackCount, byDecision },
      note: '回流计数 ≠ 采纳率——采纳判定数据源不存在（spec §3.3 排除），指标诚实降级',
      ...(reflux.degraded ? { degraded: true } : {}),
    });
  } catch (err: unknown) {
    return internalError(res, err, 'GET /api/ga/calibration/stats');
  }
});

export default router;
