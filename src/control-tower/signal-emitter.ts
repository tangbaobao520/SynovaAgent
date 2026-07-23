/**
 * src/control-tower/signal-emitter.ts — 共享信号发射器 (D214)
 *
 * 权威文档 #17 Ch2 §4.3 + Ch3 §2.1 + Ch4 §3.2 + Ch5 §2.1.
 * 各控制塔组件调用 emitSignal() 写入 JSON 信号到 .codex/signals/ 目录。
 * D213 仪表盘通过静态文件服务读取这些文件渲染健康卡片。
 *
 * 契约:
 *   @input  — component, status, reason, counts?
 *   @output — .codex/signals/{component}.json
 *   @degraded — 目录不可写 -> log.warn + 不阻断调用方
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('control-tower/signal-emitter');

/** 信号文件根目录 */
const SIGNALS_DIR = join(process.cwd(), '.codex', 'signals');

/** 信号载荷 */
export interface SignalPayload {
  component: string;
  status: 'green' | 'yellow' | 'red';
  timestamp: string;
  reason: string;
  p0_count: number;
  p1_count: number;
  p2_count: number;
}

/**
 * 发射信号：将组件状态写入 .codex/signals/{component}.json。
 *
 * @param component — 组件名称（如 write-lock, dev-doc-gatekeeper）
 * @param status    — 状态: green / yellow / red
 * @param reason    — 状态原因描述
 * @param counts    — 可选计数
 */
export function emitSignal(
  component: string,
  status: 'green' | 'yellow' | 'red',
  reason: string,
  counts?: { p0?: number; p1?: number; p2?: number },
): void {
  const signal: SignalPayload = {
    component,
    status,
    timestamp: new Date().toISOString(),
    reason,
    p0_count: counts?.p0 ?? 0,
    p1_count: counts?.p1 ?? 0,
    p2_count: counts?.p2 ?? 0,
  };

  try {
    mkdirSync(SIGNALS_DIR, { recursive: true });
    const filePath = join(SIGNALS_DIR, `${component}.json`);
    writeFileSync(filePath, JSON.stringify(signal, null, 2), 'utf-8');
    log.info({ component, status, filePath }, '信号已发射');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, component }, '信号写入失败 — 降级（不阻断调用方）');
  }
}
