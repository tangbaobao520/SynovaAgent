/**
 * restart-recovery.ts — 启动恢复 (Phase 1.1)
 *
 * 崩溃重启后恢复未完成的诊断会话。
 * 查询 SessionStore 中有 state_json 的会话，判断可恢复性，
 * 可恢复 → 注入 "服务已恢复" 系统消息，
 * 不可恢复 → 标记为 failed。
 *
 * 铁律 24: 降级路径有 log.warn
 * 铁律 31: 错误不阻止启动 — 降级后继续
 * 铁律 38: 纯类型安全
 */
import { createLogger } from '@synova/logger';

const log = createLogger('services/restart-recovery');

// ═══ 类型 ═══

export interface RecoveryResult {
  recovered: number;
  failed: number;
  degraded: boolean;
  errors: string[];
}

/**
 * SessionStore 的最小接口——RestartRecovery 需要的全部操作。
 * 便于测试 mock。
 */
export interface SessionStoreLike {
  listSessions(limit?: number): Array<{
    id: string;
    orgId: string;
    phase: number;
    stateJson: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  getMessages(sessionId: string): Array<{ role: string; content: string; id?: number }>;
  saveState(sessionId: string, state: Record<string, unknown>): void;
  addMessage(sessionId: string, role: string, content: string): void;
}

// ═══ RestartRecovery ═══

export class RestartRecovery {
  private store: SessionStoreLike;
  private maxRetries = 3;

  constructor(store: SessionStoreLike) {
    this.store = store;
  }

  /**
   * 恢复中断的会话。
   * 遍历 SessionStore 中有 state_json 的会话，判断其可恢复性。
   * 可恢复 → 注入系统恢复消息；不可恢复 → 标记 failed。
   */
  async recoverInterruptedSessions(): Promise<RecoveryResult> {
    const errors: string[] = [];
    let recovered = 0;
    let failed = 0;
    let degraded = false;

    try {
      const sessions = this.store.listSessions(50);
      const activeSessions = sessions.filter(s => s.stateJson !== null);

      if (activeSessions.length === 0) {
        log.info('无可恢复的中断会话');
        return { recovered: 0, failed: 0, degraded: false, errors: [] };
      }

      log.info({ count: activeSessions.length }, `发现 ${activeSessions.length} 个中断会话`);

      for (const session of activeSessions) {
        try {
          const result = this.tryRecoverSession(session.id, session.orgId);
          if (result.recovered) {
            recovered++;
          } else {
            failed++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg, sessionId: session.id }, `恢复会话 ${session.id} 失败`);
          errors.push(msg);
          degraded = true;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '查询中断会话失败 — 跳过恢复');
      return { recovered: 0, failed: 0, degraded: true, errors: [msg] };
    }

    if (recovered > 0) {
      log.info({ recovered }, `恢复 ${recovered} 个中断会话`);
    }
    if (failed > 0) {
      log.info({ failed }, `${failed} 个会话无法恢复 — 已标记失败`);
    }

    return { recovered, failed, degraded, errors };
  }

  /**
   * 尝试恢复单个会话。
   * 读取最近 20 条消息，判断是否有用户输入。
   */
  private tryRecoverSession(sessionId: string, orgId: string): { recovered: boolean } {
    const messages = this.store.getMessages(sessionId);
    const lastMessages = messages.slice(-20);

    // 判断可恢复性：最近 20 条中有 user 消息
    const hasUserInput = lastMessages.some(m => m.role === 'user');

    if (hasUserInput) {
      // 可恢复 → 注入系统消息
      this.store.addMessage(
        sessionId,
        'system',
        '服务已恢复，请继续之前的对话。如果您的问题已经变化，请重新描述。',
      );
      log.debug({ sessionId }, `会话 ${sessionId} 已恢复 — 注入系统消息`);
      return { recovered: true };
    }

    // 不可恢复 → 标记失败
    try {
      this.store.saveState(sessionId, {
        status: 'failed',
        reason: 'interrupted_no_user_input',
        failedAt: new Date().toISOString(),
      });
      log.debug({ sessionId }, `会话 ${sessionId} 不可恢复 — 标记为 failed`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, sessionId }, `标记会话 ${sessionId} 失败时出错`);
    }
    return { recovered: false };
  }
}
