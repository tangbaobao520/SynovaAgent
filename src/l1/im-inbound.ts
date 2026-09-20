/**
 * l1/im-inbound.ts — IM 入站消息处理 (M1-Slice2)
 *
 * 接收飞书/企微 webhook 推送 → 解析用户身份 → 存储消息到 Session → 会话级复用引擎生成 AI 回复
 *
 * 流程:
 *   Webhook POST → 提取 sender_id → 身份缓存查找
 *     → 新用户: 创建 Session → 注册会话注册表 → 存储消息
 *     → 老用户: 复用注册表中的 Session（进程内）→ 存储消息
 *     → 回复通过 IMSender 异步发回
 *
 * D823: 会话连续性由「会话级引擎复用」承载 —— 同一发送者的连续消息复用同一 ConversationEngine
 *   实例，模型上下文真实跨轮（修复前调用的「历史追加」方法在 ConversationEngine 上并不存在，
 *   可选链把「不存在」静默吞掉 → 每轮只送当前一句；根因与实证见 memory/notes/proposed/2026-09-20-D823-im-inbound-history.md）。
 *   跨进程重启后注册表为空 → 该用户从新会话起步：跨重启的**历史恢复**受阻于 L2 缺少可用的历史注入
 *   API（唯一 restore API `ConversationEngine.fromState` 实证数组引用脱钩、恢复后连本轮用户消息都
 *   进不了模型 —— 见 memory/notes/proposed/2026-09-20-D823-im-inbound-history.md），本文件**不留
 *   永远返回空的假恢复动作**，只显式记账（log）。
 *
 * 铁律 31: 降级信号传播 — 任何环节失败返回 degraded 或 log（铁律 24: 禁静默吞）
 */
import { createLogger } from '@synova/logger';
import type Database from 'better-sqlite3';
import type { PIIScrubber } from '../security/pii-scrubber';
import type { ConversationEngine } from '../agent/conversation-engine';

// L1 本地类型镜像 — 避免静态跨层依赖 (铁律 39, 审计 2026-06-18)
// D823: db 以 better-sqlite3 类型镜像（对齐 src/tui-v2/lib/commands.ts:18 先例）—— 消除 never 断言逃逸（CT-46）
interface SessionStoreLike {
  listSessions(limit: number): Array<{ id: string; updatedAt: string }>;
  createSession(teamId: string, userId: string): { id: string };
  deleteSession(id: string): void;
  addMessage(sessionId: string, role: string, content: string): void;
  db?: Database.Database;
}

const log = createLogger('l1/im-inbound');

// ═══ 身份缓存 ═══

interface CachedIdentity {
  userId: string;
  openId: string;
  name: string;
  email: string;
  teamId: string;
  roles: string[];
  lastSeen: number;
}

const identityCache = new Map<string, CachedIdentity>();
const TTL_MS = 3_600_000; // 1 hour

// ═══ 消息类型 ═══

export interface InboundMessage {
  platform: 'feishu' | 'wecom';
  senderId: string;
  content: string;
  timestamp: string;
  rawPayload: Record<string, unknown>;
}

export interface InboundResult {
  ok: boolean;
  degraded: boolean;
  sessionId?: string;
  error?: string;
}

// ═══ 用户识别 ═══

function resolveSender(payload: Record<string, unknown>): CachedIdentity | null {
  const event = (payload.event || payload) as Record<string, unknown>;
  const sender: Record<string, unknown> | string | undefined =
    (event.sender || event.sender_id) as Record<string, unknown> | string | undefined;

  if (!sender) { log.warn({ payload: JSON.stringify(payload).slice(0, 200) }, 'Webhook 缺少 sender'); return null; }

  if (typeof sender === 'string') {
    const cached = identityCache.get(sender);
    if (cached && (Date.now() - cached.lastSeen < TTL_MS)) { return cached; }
    return createIdentity(sender, { name: `用户_${sender.slice(0, 8)}`, email: '', teamId: 'default', roles: ['employee'] });
  }

  const openId = (sender.open_id || sender.user_id || '') as string;
  if (!openId) return null;

  const cached = identityCache.get(openId);
  if (cached && (Date.now() - cached.lastSeen < TTL_MS)) { return cached; }

  return createIdentity(openId, {
    name: (sender.name || sender.user_name || `用户_${openId.slice(0, 8)}`) as string,
    email: (sender.email || '') as string,
    teamId: (sender.team_id || 'default') as string,
    roles: (sender.roles || ['employee']) as string[],
  });
}

function createIdentity(openId: string, extra: { name: string; email: string; teamId: string; roles: string[] }): CachedIdentity {
  const entry: CachedIdentity = {
    userId: `feishu:${openId}`,
    openId,
    name: extra.name,
    email: extra.email || `${openId.slice(0, 8)}@placeholder.local`,
    teamId: extra.teamId,
    roles: extra.roles,
    lastSeen: Date.now(),
  };
  identityCache.set(openId, entry);
  log.info({ userId: entry.userId }, '新用户已缓存');
  return entry;
}

// ═══ 会话注册表 (D823) ═══

/** IM 会话条目 —— 进程内（userId → 会话 + 引擎） */
interface ImSessionEntry {
  /** 真实 store 会话 id（消息落库目标） */
  sessionId: string;
  /** 会话级引擎实例（进程内复用 → 模型上下文跨轮连续）；null = 尚未装配 */
  engine: ConversationEngine | null;
  /** 同用户生成链 —— 复用引擎禁止并发进入（每 userId 一条链 ⇒ 跨用户互不阻塞） */
  chain: Promise<void>;
  /** 最近活跃时刻（空闲回收用） */
  lastSeen: number;
}

/**
 * IM 会话注册表契约 (铁律 47)：
 *   @input  — userId（resolveSender 产出的稳定身份键）
 *   @output — ImSessionEntry：同一 userId 的连续消息复用同一 sessionId + 同一引擎实例
 *   @degrade— 引擎装配失败 → log.error + 本轮无回复（上轮失败不阻断本轮，链上已 catch）；
 *             store.db 缺失 → 跳过事件流/内置工具装配（log.error + degraded:true），消息与回复仍处理
 *   @bound  — IM_SESSION_MAX = 200，超限 FIFO 逐出最旧（对齐 src/routes/conversations.ts:63 先例）
 *   @边界   — 进程重启后注册表为空 → 该用户从新会话起步（跨重启历史恢复受阻于 L2，仅 log 记账）
 */
const imSessions = new Map<string, ImSessionEntry>();
const IM_SESSION_MAX = 200;

/** FIFO 逐出：注册表有界（长驻进程不得无界增长；逐出即该用户下轮新建会话） */
function evictOverflow(): void {
  while (imSessions.size > IM_SESSION_MAX) {
    const oldest = imSessions.keys().next().value;
    if (oldest === undefined) return;
    imSessions.delete(oldest);
    log.info({ userId: oldest, size: imSessions.size, limit: IM_SESSION_MAX }, 'IM 会话注册表超限 — FIFO 逐出最旧条目');
  }
}

/** 会话归位：注册表命中即复用；未命中新建真实 store 会话并登记 */
function resolveImSession(store: SessionStoreLike, identity: CachedIdentity): ImSessionEntry {
  const cached = imSessions.get(identity.userId);
  if (cached) { cached.lastSeen = Date.now(); return cached; }

  const created = store.createSession(identity.teamId, identity.userId);
  const entry: ImSessionEntry = {
    sessionId: created.id,
    engine: null,
    chain: Promise.resolve(),
    lastSeen: Date.now(),
  };
  imSessions.set(identity.userId, entry);
  evictOverflow();
  log.info({ sessionId: entry.sessionId, userId: identity.userId }, '新 IM 会话已创建');
  return entry;
}

/** 回收：会话已被删除（清理器/显式删除）或条目空闲超时 → 移除，防向已删会话写消息 */
function sweepImSessions(store: SessionStoreLike, timeoutMs: number): number {
  const alive = new Set(store.listSessions(200).map(s => s.id));
  const now = Date.now();
  let removed = 0;
  for (const [userId, entry] of imSessions) {
    if (!alive.has(entry.sessionId) || now - entry.lastSeen > timeoutMs) {
      imSessions.delete(userId);
      removed++;
    }
  }
  if (removed > 0) log.info({ removed }, 'IM 会话注册表回收完成');
  return removed;
}

// ═══ 消息处理 ═══

/**
 * 处理入站 IM 消息。
 * 存储用户消息（真实 store）→ 归位会话（注册表）→ 异步生成 AI 回复（会话级复用引擎）。
 *
 * 契约:
 *   @input  — store（SessionStoreLike 镜像）/ piiScrubber / msg
 *   @output — InboundResult{ok,degraded,sessionId?,error?}（异步回复不阻塞 Webhook 响应）
 *   @degrade— 身份不可解析 → ok:false/degraded:false；处理抛错 → ok:false/degraded:true + log.warn
 */
export function handleInboundMessage(
  store: SessionStoreLike,
  piiScrubber: PIIScrubber,
  msg: InboundMessage,
): InboundResult {
  try {
    // Step 1: 用户识别
    const identity = resolveSender(msg.rawPayload);
    if (!identity) {
      return { ok: false, degraded: false, error: '无法解析发送者身份' };
    }

    // Step 2: 会话归位（注册表命中即复用；listSessions 行不含 user_id，故不按其匹配 —— 见 D823 note）
    const entry = resolveImSession(store, identity);

    // Step 3: PII 脱敏输入
    const scrubbed = piiScrubber.scrub(msg.content, 'S2');
    const userInput = scrubbed.cleaned || msg.content;

    // Step 4: 存储用户消息（真实 store 会话）
    store.addMessage(entry.sessionId, 'user', userInput);

    // Step 5: AI 回复 — 同用户串行链（复用引擎禁止并发进入），不阻塞 Webhook 响应
    entry.chain = entry.chain
      .catch(() => undefined) // 上轮失败已 log，不阻断本轮
      .then(() => generateAIReply(store, entry, identity, userInput))
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        log.error({ err: error, sessionId: entry.sessionId, degraded: true }, 'IM AI 回复生成失败 — 本轮无回复（degraded）');
      });

    // 先返回 200 确认收到（飞书要求 3s 内响应，AI 回复异步发送）
    return { ok: true, degraded: false, sessionId: entry.sessionId };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ err: error, senderId: msg.senderId }, 'IM 消息处理失败 — degraded');
    return { ok: false, degraded: true, error };
  }
}

// ═══ AI 回复生成 ═══

/**
 * 装配会话级引擎（每会话一次；此后复用实例 → 模型上下文跨轮连续）。
 *
 * 契约:
 *   @input  — store（提供 db 句柄时装配事件流 + 内置工具）/ sessionId / identity
 *   @output — ConversationEngine（注入 sessionManager + sessionStore 以续写会话事件流）
 *   @degrade— store.db 缺失 → 跳过事件流与内置工具装配（log.error + degraded:true），引擎仍可用
 */
async function createImEngine(
  store: SessionStoreLike,
  sessionId: string,
  identity: CachedIdentity,
): Promise<ConversationEngine> {
  const { createProvider } = await import('../providers');
  const { detectProvider } = await import('../providers/detect');
  const { ConversationEngine } = await import('../agent/conversation-engine');
  const { SessionStore } = await import('../store/session-store');
  const { registerBuiltinTools } = await import('../agent/builtin-tools');
  const { SessionManager } = await import('../orchestrator/session-manager');

  const provider = createProvider(detectProvider(), {
    apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
    gatewayHost: process.env.OPENCLAW_GATEWAY_HOST,
    baseUrl: process.env.LLM_BASE_URL,
  });

  // D487: 会话事件装配 — builtinStore 先建，sessionManager+sessionStore 注入引擎
  // （诊断事件落 session_events；SessionManager 与 store 同源，消息事件持久化生效）
  const db = store.db;
  let builtinStore: InstanceType<typeof SessionStore> | null = null;
  if (db) {
    builtinStore = new SessionStore(db);
  } else {
    // 铁律 24/31: 显式降级，不静默（无 db 句柄 → 事件流与内置工具无法装配）
    log.error(
      { sessionId, userId: identity.userId, degraded: true },
      'store.db 缺失 — 会话事件流与内置工具装配跳过（消息与回复仍处理）',
    );
  }

  const conv = new ConversationEngine(provider, {
    sessionId,
    sessionManager: builtinStore ? new SessionManager({}, builtinStore) : undefined,
    sessionStore: builtinStore ?? undefined,
  });
  if (builtinStore) {
    registerBuiltinTools(conv.getToolRegistry(), builtinStore, sessionId, () => conv.getPhase(), () => identity.teamId);
  }

  // D823 边界记账（不掩盖）：注册表冷启动（进程重启/逐出）时本会话从零开始 —— 跨重启历史恢复
  // 需 L2 提供可用的历史注入 API（当前唯一 restore API fromState 实证失效），本文件不留假动作。
  log.info(
    { sessionId, userId: identity.userId, modelContextRestored: false },
    'IM 会话引擎已装配（进程内会话级复用；跨重启历史恢复待 L2，本轮为新会话起点）',
  );
  return conv;
}

async function generateAIReply(
  store: SessionStoreLike,
  entry: ImSessionEntry,
  identity: CachedIdentity,
  userInput: string,
): Promise<void> {
  // 会话级复用：命中即用（模型上下文跨轮连续）；未命中才装配
  if (!entry.engine) {
    entry.engine = await createImEngine(store, entry.sessionId, identity);
  }
  const conv = entry.engine;

  const result = await conv.processMessage(userInput);
  const reply = result.reply || '抱歉，我暂时无法回答。';

  // 存储 AI 回复
  store.addMessage(entry.sessionId, 'assistant', reply);

  // 通过 IM 通道发送
  const { getIMRegistry } = await import('./im-channel');
  const imReg = getIMRegistry();
  const active = imReg.getActive();
  if (active) {
    await active.sendMessage(identity.openId, {
      text: reply.slice(0, 2000), // 飞书单条消息限制
    });
  }
}

// ═══ 会话清理 ═══

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startSessionCleanup(
  store: SessionStoreLike,
  timeoutMs = 1_800_000,
  intervalMs = 300_000,
): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const allSessions = store.listSessions(200);
    let cleaned = 0;
    for (const s of allSessions) {
      if (now - new Date(s.updatedAt).getTime() > timeoutMs) {
        store.deleteSession(s.id);
        cleaned++;
      }
    }
    // D823: 同步回收注册表 —— 会话已删/空闲超时的条目必须移除，否则复用已删会话 → 外键写失败
    const swept = sweepImSessions(store, timeoutMs);
    if (cleaned > 0 || swept > 0) log.info({ cleaned, swept }, '会话超时清理完成');
  }, intervalMs);
  log.info('会话超时清理器已启动 (30min)');
}

export function stopSessionCleanup(): void {
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}
