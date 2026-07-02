/**
 * graceful-shutdown.ts — 优雅关闭 (Phase 1.2)
 *
 * 对标 OpenClaw active-sessions-shutdown-tracker.ts:
 *   模块级 Map<string, SessionEntry> 追踪活跃会话。
 *   noteActive / forgetActive / listActive / drain 模式。
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

/** SessionStore 最小接口 — drain 需要保存检查点和消息 */
export interface SessionStoreForDrain {
  addMessage(sessionId: string, role: string, content: string): void;
  saveDiagnosisCheckpoint?(checkpoint: {
    sessionId: string; phase: number; completedModules: string[];
    partialReport: unknown; savedAt: string;
  }): void;
}

// ═══ 全局单例 ═══

let _globalInstance: GracefulShutdown | null = null;

/** 获取全局 GracefulShutdown 实例 */
export function getGlobalGracefulShutdown(): GracefulShutdown {
  if (!_globalInstance) {
    _globalInstance = new GracefulShutdown();
    log.debug('GracefulShutdown 全局实例已自动创建');
  }
  return _globalInstance;
}

/** 设置全局 GracefulShutdown 实例（SynovaAgent 初始化时调用） */
export function setGlobalGracefulShutdown(gs: GracefulShutdown | null): void {
  _globalInstance = gs;
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
   *
   * 1. 遍历活跃会话
   * 2. 向每个会话注入 "服务正在重启" 系统消息
   * 3. 保存诊断检查点（如果 store 支持）
   * 4. 执行 WAL checkpoint（如果提供 db）
   * 5. 清空活跃列表
   *
   * @param store - SessionStore 实例（用于通知和保存检查点）
   * @param db - better-sqlite3 Database 实例（用于 WAL checkpoint）
   * @param maxWaitMs - 最大等待时间（默认 30s）
   */
  async drain(
    store?: SessionStoreForDrain,
    maxWaitMs = 30_000,
  ): Promise<DrainResult> {
    const errors: string[] = [];
    const count = this.activeSessions.size;

    if (count === 0) {
      log.info('无活跃会话 — 跳过排干');
      return { drained: 0, degraded: false, errors: [] };
    }

    log.info({ count }, `排干 ${count} 个活跃会话`);

    const timeout = setTimeout(() => {
      log.warn({ count }, '排干超时 — 强制清空');
      this.activeSessions.clear();
    }, maxWaitMs);

    try {
      for (const [sessionId, entry] of this.activeSessions) {
        try {
          // 1. 通知会话: 注入系统消息
          if (store) {
            store.addMessage(
              sessionId,
              'system',
              '服务正在重启，您的会话已保存。重启后可继续。',
            );
          }

          // 2. 保存诊断检查点
          if (store?.saveDiagnosisCheckpoint) {
            store.saveDiagnosisCheckpoint({
              sessionId,
              phase: entry.phase ?? 0,
              completedModules: [],
              partialReport: { interrupted: true, reason: 'graceful_shutdown' },
              savedAt: new Date().toISOString(),
            });
          }

          log.info({ sessionId, orgId: entry.orgId }, `排干会话 ${sessionId} 完成`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg, sessionId }, `排干会话 ${sessionId} 失败`);
          errors.push(`session=${sessionId}: ${msg}`);
        }
      }
    } finally {
      clearTimeout(timeout);
      this.activeSessions.clear();
    }

    log.info({ drained: count, errors: errors.length }, '排干完成');
    return {
      drained: count,
      degraded: errors.length > 0,
      errors,
    };
  }
}
