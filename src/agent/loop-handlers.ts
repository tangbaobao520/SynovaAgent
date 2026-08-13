/**
 * src/agent/loop-handlers.ts — 默认循环处理器 (D8a MVP)
 *
 * MVP 阶段为 placeholder 实现：记录日志 + 返回成功。
 * D9 5 Built-in Loops 将替换为真实逻辑。
 *
 * 契约:
 *   @input  — ScaleName
 *   @output — LoopExecutionResult
 *   @degraded — handler 失败返回 { success: false, error }
 */
import { createLogger } from '@synova/logger';
import type { ScaleName } from '../loops/loop-trigger-config';

const log = createLogger('agent/loop-handlers');

/** 循环执行结果 */
export interface LoopExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  degraded: boolean;
}

/**
 * 默认诊断循环处理器。
 * 执行企业诊断的快/中/慢三个尺度。
 */
export async function defaultDiagnosisHandler(scale: ScaleName): Promise<LoopExecutionResult> {
  try {
    log.info({ scale }, '默认诊断循环处理');
    return {
      success: true,
      output: `诊断循环 [${scale}] 执行完成`,
      degraded: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, scale }, '诊断循环处理失败 — 降级');
    return { success: false, error: msg, degraded: true };
  }
}

/**
 * 默认部门导航循环处理器。
 */
export async function defaultNavigationHandler(scale: ScaleName): Promise<LoopExecutionResult> {
  try {
    log.info({ scale }, '默认部门导航循环处理');
    return {
      success: true,
      output: `部门导航循环 [${scale}] 执行完成`,
      degraded: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, scale }, '部门导航循环处理失败 — 降级');
    return { success: false, error: msg, degraded: true };
  }
}

/**
 * 默认进化循环处理器。
 */
export async function defaultEvolutionHandler(scale: ScaleName): Promise<LoopExecutionResult> {
  try {
    log.info({ scale }, '默认进化循环处理');
    return {
      success: true,
      output: `进化循环 [${scale}] 执行完成`,
      degraded: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, scale }, '进化循环处理失败 — 降级');
    return { success: false, error: msg, degraded: true };
  }
}

/**
 * 默认溢出监控循环处理器。
 */
export async function defaultOverflowHandler(scale: ScaleName): Promise<LoopExecutionResult> {
  try {
    log.info({ scale }, '默认溢出监控循环处理');
    return {
      success: true,
      output: `溢出监控循环 [${scale}] 执行完成`,
      degraded: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, scale }, '溢出监控循环处理失败 — 降级');
    return { success: false, error: msg, degraded: true };
  }
}
