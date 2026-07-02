/**
 * services/stuck-session-detector.ts — 卡住会话检测 (Phase 2.2)
 *
 * 检测运行时间超过 5 分钟无新消息的诊断会话。
 * 写入 AgentMemoryStore + 注入系统消息通知用户。
 *
 * 铁律 24: 降级路径有 log.warn
 * 铁律 31: 错误不阻止继续 — 单次检测失败不影响下次
 * 铁律 38: 纯类型安全
 */
import { createLogger } from '@synova/logger';

const log = createLogger('services/stuck-session-detector');

// ═══ 类型 ═══

export interface StuckResult {
  sessionId: string;
  stuckMinutes: number;
}

/** SessionStore 最小接口 */
export interface SessionStoreLike {
  listSessions(limit?: number): Array<{
    id: string;
    orgId: string;
    phase: number;
    stateJson: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  addMessage(sessionId: string, role: string, content: string): void;
  saveState(sessionId: string, state: Record<string, unknown>): void;
}

/** AgentMemoryStore 最小接口 — 匹配实际 remember() 签名 */
export interface MemoryStoreLike {
  remember(entry: Record<string, unknown>): unknown;
}

// ═══ StuckSessionDetector ═══

export class StuckSessionDetector {
  private sessionStore: SessionStoreLike;
  private memoryStore: MemoryStoreLike;
  /** 卡住阈值（分钟） */
  private stuckThresholdMinutes = 5;

  constructor(sessionStore: SessionStoreLike, memoryStore: MemoryStoreLike) {
    this.sessionStore = sessionStore;
    this.memoryStore = memoryStore;
  }

  /**
   * 执行一次卡住检测。
   * Cron 每 60 秒调用一次。
   */
  async detect(): Promise<StuckResult[]> {
    const stuck: StuckResult[] = [];

    try {
      const sessions = this.sessionStore.listSessions(50);
      const now = new Date();

      for (const session of sessions) {
        // 只检查有 state_json 的活跃会话
        if (!session.stateJson) continue;

        const updatedAt = new Date(session.updatedAt);
        const elapsedMin = (now.getTime() - updatedAt.getTime()) / 60_000;

        if (elapsedMin >= this.stuckThresholdMinutes) {
          log.warn({ sessionId: session.id, elapsedMin: Math.round(elapsedMin) },
            `会话 ${session.id} 已卡住 ${Math.round(elapsedMin)} 分钟`);
          stuck.push({ sessionId: session.id, stuckMinutes: Math.round(elapsedMin) });

          // 写入 AgentMemoryStore
          try {
            this.memoryStore.remember({
              orgId: session.orgId,
              key: `stuck_session:${session.id}`,
              value: JSON.stringify({
                sessionId: session.id,
                phase: session.phase,
                stuckMinutes: Math.round(elapsedMin),
                detectedAt: now.toISOString(),
              }),
              type: 'stuck_session',
              confidence: 1.0,
              source: 'stuck-session-detector',
              tags: ['stuck_session', `phase_${session.phase}`],
              expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24h TTL
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn({ err: msg, sessionId: session.id }, '写入 stuck_session 到 AgentMemoryStore 失败');
          }

          // 注入系统消息通知用户
          try {
            this.sessionStore.addMessage(
              session.id,
              'system',
              '分析超时，请重试。如果问题持续，请重新开始对话。',
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn({ err: msg, sessionId: session.id }, '注入超时通知消息失败');
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '卡住会话检测失败 — degraded');
    }

    if (stuck.length > 0) {
      log.info({ count: stuck.length }, `发现 ${stuck.length} 个卡住会话`);
    }
    return stuck;
  }
}
