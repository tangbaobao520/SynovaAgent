/**
 * graceful-shutdown.ts — 优雅关闭 (Phase 1.2)
 *
 * 对标 OpenClaw active-sessions-shutdown-tracker.ts:
 *   模块级 Map<string, SessionEntry> 追踪活跃会话。
 *   noteActive / forgetActive / listActive 模式。
 *
 * 铁律 24: 降级路径有 log.warn
 * 铁律 31: 错误不阻止关闭 — 降级后继续
 * 铁律 38: 纯类型安全
 */
import { createLogger } from '@synova/logger';

const log = createLogger('services/graceful-shutdown');

// ═══ 类型 ═══

export interface SessionEntry {
  sessionId: string;
  orgId: string;
  phase?: number;
  startedAt?: string;
}

export interface DrainResult {
  drained: number;
  degraded: boolean;
  errors: string[];
}

// ═══ GracefulShutdown ═══

export class GracefulShutdown {
  /** 活跃会话追踪表 — OpenClaw 模式 */
  private activeSessions = new Map<string, SessionEntry>();

  /**
   * 注册一个活跃会话。
   * 同一 sessionId 重复调用更新元数据，不重复计数。
   */
  noteActive(sessionId: string, metadata: Omit<SessionEntry, 'sessionId'>): void {
    this.activeSessions.set(sessionId, { sessionId, ...metadata });
    log.debug({ sessionId }, '会话已注册为活跃');
  }

  /**
   * 移除一个活跃会话（正常结束时调用）。
   * 不存在的会话静默忽略。
   */
  forgetActive(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    log.debug({ sessionId }, '会话已从活跃列表移除');
  }

  /** 当前活跃会话数 */
  activeCount(): number {
    return this.activeSessions.size;
  }

  /** 列出所有活跃会话（供排干使用） */
  listActive(): SessionEntry[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * 排干所有活跃会话。
   * 1. 记录排干开始
   * 2. 遍历活跃会话 → 通知 / 保存状态
   * 3. 清空活跃列表
   * 4. 超时兜底
   *
   * @param maxWaitMs - 最大等待时间（默认 30s）
   */
  async drain(maxWaitMs = 30_000): Promise<DrainResult> {
    const errors: string[] = [];
    const count = this.activeSessions.size;

    if (count === 0) {
      log.info('无活跃会话 — 跳过排干');
      return { drained: 0, degraded: false, errors: [] };
    }

    log.info({ count }, `排干 ${count} 个活跃会话`);

    // 遍历活跃会话，尝试保存状态
    for (const [sessionId, entry] of this.activeSessions) {
      try {
        log.debug({ sessionId, orgId: entry.orgId, phase: entry.phase }, `排干会话 ${sessionId}`);
        // Future: 发送 "服务正在重启" 通知
        // Future: 保存诊断检查点到 SessionStore
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err: msg, sessionId }, `排干会话 ${sessionId} 失败`);
        errors.push(msg);
      }
    }

    // 清空活跃列表
    this.activeSessions.clear();

    // 排干完成
    log.info({ drained: count, errors: errors.length }, '排干完成');

    return {
      drained: count,
      degraded: errors.length > 0,
      errors,
    };
  }
}
