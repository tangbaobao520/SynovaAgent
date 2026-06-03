/**
 * 轻量 logger 桩 — 兼容 Novis AppLogger 接口
 * vendor 包使用 console 替代 pino
 */

export interface AppLogger {
  trace(...args: any[]): void;
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  fatal(...args: any[]): void;
  child(bindings: Record<string, unknown>): AppLogger;
  level: string;
}

const level = process.env.LOG_LEVEL || 'info';

function createConsoleLogger(name: string): AppLogger {
  const prefix = `[${name}]`;
  return {
    level,
    trace: (...args: any[]) => console.trace(prefix, ...args),
    debug: (...args: any[]) => console.debug(prefix, ...args),
    info: (...args: any[]) => console.log(prefix, ...args),
    warn: (...args: any[]) => console.warn(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, ...args),
    fatal: (...args: any[]) => console.error(prefix, '[FATAL]', ...args),
    child: (_bindings: Record<string, unknown>) => createConsoleLogger(name),
  };
}

export function createLogger(name: string): AppLogger {
  return createConsoleLogger(name);
}

export function setSentryCapture(_fn: (err: Error, ctx?: Record<string, unknown>) => void): void {
  // no-op in vendor package
}
