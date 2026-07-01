/**
 * runtime-global-handlers.ts — 全局错误处理器 (Phase 0.1)
 *
 * 将 process.on('uncaughtException') 和 process.on('unhandledRejection')
 * 的处理器逻辑提取为可测试的独立函数。
 *
 * 铁律 24: catch 必须有 log
 * 铁律 31: 降级信号传播
 * 铁律 32: 错误分类强制（code + phase + retryable）
 * 铁律 38: 零 unsafe type casts
 */
import { logger } from '@synova/logger';
import { DiagnosticAgentError } from '@synova/error-types';
import type { Server } from 'http';

// ═══ 内部状态 ═══

let handlersRegistered = false;

/** 注册的 listener 引用（供清理用） */
const registeredListeners: Array<{ event: string; listener: (...args: unknown[]) => void }> = [];

// ═══ 处理器逻辑（内部 — 不导出，通过 registerGlobalErrorHandlers 公开） ═══

/** 处理未捕获异常。始终致命 — 进程状态不可信。 */
function handleUncaughtException(err: Error): boolean {
  logger.fatal({ err, stack: err.stack }, 'uncaughtException — graceful shutdown');
  return true; // 始终致命
}

/**
 * 处理未捕获的 Promise rejection。
 * - RATE_LIMITED/LLM_RATE_LIMIT: 非致命，继续运行
 * - 其他: 致命，关闭服务器后退出
 */
function handleUnhandledRejection(reason: unknown): boolean {
  const err = reason instanceof Error ? reason : new Error(String(reason));

  if (err instanceof DiagnosticAgentError && (err.code === 'RATE_LIMITED' || err.code === 'LLM_RATE_LIMIT')) {
    logger.warn({ err }, 'unhandledRejection (non-fatal: rate limited) — continuing');
    return false; // 非致命
  }

  logger.error({ err, stack: err instanceof Error ? err.stack : undefined }, 'unhandledRejection (fatal) — graceful shutdown');
  return true; // 致命
}

// ═══ 进程级注册/注销 ═══

/**
 * 注册全局错误处理器到 process。
 * 幂等：多次调用只注册一次。
 * @param server - HTTP Server 实例，用于关闭前排干
 */
export function registerGlobalErrorHandlers(server: Server): void {
  if (handlersRegistered) {
    logger.debug('全局错误处理器已注册 — 跳过重复注册');
    return;
  }

  const onUncaught = (err: Error) => {
    const fatal = handleUncaughtException(err);
    if (fatal) {
      server.close(() => process.exit(1));
      setTimeout(() => process.exit(1), 5000);
    }
  };

  const onUnhandled = (reason: unknown) => {
    const fatal = handleUnhandledRejection(reason);
    if (fatal) {
      server.close(() => process.exit(1));
      setTimeout(() => process.exit(1), 5000);
    }
  };

  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);

  registeredListeners.push(
    { event: 'uncaughtException', listener: onUncaught as (...args: unknown[]) => void },
    { event: 'unhandledRejection', listener: onUnhandled as (...args: unknown[]) => void },
  );

  handlersRegistered = true;
  logger.info('全局错误处理器已注册 (uncaughtException + unhandledRejection)');
}

/**
 * 注销全局错误处理器。
 * 主要用于测试清理。
 */
export function unregisterGlobalErrorHandlers(): void {
  for (const { event, listener } of registeredListeners) {
    process.removeListener(event, listener);
  }
  registeredListeners.length = 0;
  handlersRegistered = false;
}
