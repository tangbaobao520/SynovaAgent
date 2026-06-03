/**
 * logger.ts — SynovaAgent 最小日志 (pino, 写 stderr)
 *
 * 日志写 stderr (Unix 惯例)。TUI 模式下 stdout 被 blessed 独占，
 * 写 stdout 会污染 TUI 渲染。HTTP 服务模式下 stderr 同样兼容 Docker/云平台。
 *
 * sync: true 确保日志立即写出，避免和 TUI blessed 渲染交叉闪烁。
 */
import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

// fd=2 = stderr。sync 模式避免缓冲导致的 TUI 交叉输出
const destination = pino.destination({ dest: 2, sync: true });

export const logger = pino({ name: 'synova-agent', level }, destination);

export function createLogger(name: string) {
  return logger.child({ service: name });
}
