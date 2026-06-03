/**
 * logger.ts — SynovaAgent 日志 (pino, fd=2 stderr)
 *
 * synova-agent 运行时直接 import pino。
 * @synova/logger 包供 vitest 和其他包使用。
 */
import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const destination = pino.destination({ dest: 2, sync: true });

export const logger = pino({ name: 'synova-agent', level }, destination);

export function createLogger(name: string) {
  return logger.child({ service: name });
}
