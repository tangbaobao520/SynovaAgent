/**
 * l1/im-inbound.ts — IM 入站消息处理 (M1-Slice2)
 *
 * 接收飞书/企微 webhook 推送 → 解析用户身份 → 存储消息到 Session
 *
 * 流程:
 *   Webhook POST → 提取 sender_id → 身份缓存查找
 *     → 新用户: 创建 Session → 存储消息
 *     → 老用户: 恢复 Session → 存储消息
 *     → 回复通过 IMSender 异步发回
 *
 * 铁律 31: 降级信号传播 — 任何环节失败返回 degraded
 */
import { createLogger } from '../logger';
import type { SessionStore } from '../store/session-store';
import type { PIIScrubber } from '../security/pii-scrubber';

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

// ═══ 消息处理 ═══

/**
 * 处理入站 IM 消息。
 * 当前只存储消息到 Session，AI 回复在 Slice 3 (L4 权限过滤) 之后接入。
 */
export function handleInboundMessage(
  store: SessionStore,
  piiScrubber: PIIScrubber,
  msg: InboundMessage,
): InboundResult {
  try {
    // Step 1: 用户识别
    const identity = resolveSender(msg.rawPayload);
    if (!identity) {
      return { ok: false, degraded: false, error: '无法解析发送者身份' };
    }

    // Step 2: 查找已有 Session (按 userId 匹配最近一次会话)
    const sessions = store.listSessions(50);
    const existing = sessions.find(s =>
      (s as unknown as Record<string, unknown>).userId === identity.userId ||
      (s as unknown as Record<string, unknown>).userId === identity.openId
    );

    let sessionId: string;
    if (existing) {
      sessionId = existing.id;
    } else {
      const newSession = store.createSession(identity.teamId, identity.userId);
      sessionId = newSession.id;
      log.info({ sessionId, userId: identity.userId }, '新 IM 会话已创建');
    }

    // Step 3: PII 脱敏输入
    const scrubbed = piiScrubber.scrub(msg.content, 'S2');

    // Step 4: 存储消息
    store.addMessage(sessionId, 'user', scrubbed.cleaned || msg.content);

    // Step 5: 构造回复 (AI 回复由 ConversationEngine 在后续请求中异步生成)
    // 当前返回确认消息
    const reply = `已收到你的消息 (会话 ${sessionId.slice(-6)})`;

    // 存储系统回复
    store.addMessage(sessionId, 'assistant', reply);

    return { ok: true, degraded: false, sessionId };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ err: error, senderId: msg.senderId }, 'IM 消息处理失败 — degraded');
    return { ok: false, degraded: true, error };
  }
}

// ═══ 会话清理 ═══

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startSessionCleanup(
  store: SessionStore,
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
    if (cleaned > 0) log.info({ cleaned }, '会话超时清理完成');
  }, intervalMs);
  log.info('会话超时清理器已启动 (30min)');
}

export function stopSessionCleanup(): void {
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}
