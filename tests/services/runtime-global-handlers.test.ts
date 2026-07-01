/**
 * tests/services/runtime-global-handlers.test.ts — Phase 0.1 全局错误处理器测试
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge
 * 铁律 33: *.test.ts 单元测试
 *
 * 通过 registerGlobalErrorHandlers + process event 测试 handler 决策逻辑。
 * 每个 describe 独立注册/注销，避免 test isolation 问题。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── mock logger ──
vi.mock('@synova/logger', () => ({
  logger: {
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { registerGlobalErrorHandlers, unregisterGlobalErrorHandlers } from '../../src/services/runtime-global-handlers';
import { DiagnosticAgentError, LLMRateLimitError } from '@synova/error-types';
import { logger } from '@synova/logger';
import type { Server } from 'http';

function createMockServer(): Server {
  return {
    close: vi.fn((cb?: (err?: Error) => void) => { if (cb) cb(); }),
    listen: vi.fn(),
    address: vi.fn(),
    listening: false,
  } as unknown as Server;
}

describe('registerGlobalErrorHandlers', () => {
  let server: Server;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    server = createMockServer();
  });

  afterEach(() => {
    unregisterGlobalErrorHandlers();
  });

  it('应该注册处理器并记录 info 日志', () => {
    registerGlobalErrorHandlers(server);

    expect(logger.info).toHaveBeenCalledWith(
      '全局错误处理器已注册 (uncaughtException + unhandledRejection)',
    );
  });

  it('重复调用应该幂等（只注册一次）', () => {
    registerGlobalErrorHandlers(server);
    vi.clearAllMocks();

    registerGlobalErrorHandlers(server);

    expect(logger.debug).toHaveBeenCalledWith(
      '全局错误处理器已注册 — 跳过重复注册',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('uncaughtException handler 行为', () => {
  let server: Server;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    server = createMockServer();
    registerGlobalErrorHandlers(server);
  });

  afterEach(() => {
    unregisterGlobalErrorHandlers();
  });

  it('uncaughtException 应该调用 logger.fatal 并尝试关闭 server', () => {
    const err = new Error('测试未捕获异常');

    process.emit('uncaughtException', err);

    expect(logger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ err, stack: err.stack }),
      expect.stringContaining('uncaughtException'),
    );
    expect(server.close).toHaveBeenCalled();
  });
});

describe('unhandledRejection handler 决策逻辑', () => {
  let server: Server;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    server = createMockServer();
    registerGlobalErrorHandlers(server);
  });

  afterEach(() => {
    unregisterGlobalErrorHandlers();
  });

  it('RATE_LIMITED DiagnosticAgentError 应该 warn + 不关闭 server', () => {
    const err = new DiagnosticAgentError('RATE_LIMITED', '请求过于频繁', 0, true);

    process.emit('unhandledRejection', err);

    expect(logger.warn).toHaveBeenCalled();
    expect(server.close).not.toHaveBeenCalled();
  });

  it('LLM_RATE_LIMIT (LLMRateLimitError) 应该 warn + 不关闭 server', () => {
    const err = new LLMRateLimitError('LLM 速率限制', 60000, 0);

    process.emit('unhandledRejection', err);

    expect(logger.warn).toHaveBeenCalled();
    expect(server.close).not.toHaveBeenCalled();
  });

  it('非 RATE_LIMITED DiagnosticAgentError 应该 error + 关闭 server', () => {
    const err = new DiagnosticAgentError('AUTH_FAILED', '认证失败', 0, false);

    process.emit('unhandledRejection', err);

    expect(logger.error).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it('普通 Error 应该 error + 关闭 server', () => {
    process.emit('unhandledRejection', new Error('普通未捕获 rejection'));

    expect(logger.error).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it('非 Error 类型 (string) 应该 error + 关闭 server', () => {
    process.emit('unhandledRejection', 'string reason');

    expect(logger.error).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it('null/undefined 应该 error + 关闭 server', () => {
    process.emit('unhandledRejection', null);

    expect(logger.error).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it('对象类型应该 error + 关闭 server', () => {
    process.emit('unhandledRejection', { custom: 'error' });

    expect(logger.error).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });
});
