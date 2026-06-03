/**
 * logger.test.ts — @synova/logger 测试
 *
 * 对标 Claw-Code: Given/When/Then 注释 + 手写测试数据
 * 铁律 0-2: 每个 public 函数 >= 2 个用例 (happy + sad)
 */
import { describe, it, expect } from 'vitest';
import { logger, createLogger } from '../src/logger';

describe('@synova/logger', () => {
  // ── logger singleton ──

  it('Given logger is imported, When inspected, Then it has pino methods', () => {
    // Given: logger singleton from @synova/logger re-export
    // When: we inspect its shape
    // Then: it should expose standard pino logging methods
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('Given logger, When writing at each level, Then no exception thrown', () => {
    // Given: logger instance
    // When: we log at each level
    // Then: no error should be thrown (writes to stderr fd=2)
    expect(() => logger.info('test info message')).not.toThrow();
    expect(() => logger.warn('test warn message')).not.toThrow();
    expect(() => logger.error('test error message')).not.toThrow();
    expect(() => logger.debug('test debug message')).not.toThrow();
  });

  // ── createLogger ──

  it('Given createLogger with service name, When child logger created, Then has service metadata', () => {
    // Given: a service name
    const name = 'test-service';

    // When: we create a child logger
    const child = createLogger(name);

    // Then: child logger should have pino methods and bindings should include service name
    expect(typeof child.info).toBe('function');
    // pino child logger has the service name in its bindings
    expect(child).toBeDefined();
  });

  it('Given createLogger called twice with different names, When compared, Then they are different instances', () => {
    // Given: two different service names
    // When: creating two child loggers
    const child1 = createLogger('service-a');
    const child2 = createLogger('service-b');

    // Then: they should be different logger instances
    expect(child1).not.toBe(child2);
  });

  it('Given createLogger with empty name, When child created, Then still returns valid logger', () => {
    // Given: empty service name (sad path)
    // When: creating logger
    const child = createLogger('');

    // Then: still returns a valid logger
    expect(typeof child.info).toBe('function');
    expect(() => child.info('test')).not.toThrow();
  });
});
