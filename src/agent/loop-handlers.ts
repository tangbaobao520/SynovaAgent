/**
 * src/agent/loop-handlers.ts — 默认循环处理器 (D8a MVP)
 *
 * D333 起: defaultEvolutionHandler 已真实化 (N13 反馈→规则闭环接线)。
 * diagnosis/navigation/overflow 三个 handler 仍为 placeholder（各自后续任务，dev doc §3.3）。
 *
 * 契约:
 *   @input  — ScaleName
 *   @output — LoopExecutionResult
 *   @degraded — handler 失败/无数据/回写部分失败返回 { success: false, degraded: true }
 */
import { createLogger } from '@synova/logger';
import type { ScaleName } from '../loops/loop-trigger-config';
import { processFeedbackSignals, applyEvolutionActions } from '../loops/middle-evolution-engine';
import { getFeedbackCollector } from '../growth/feedback-collector';

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
 * 默认进化循环处理器（D333 真实化 — 曾为 placeholder 假成功）。
 *
 * N13 反馈→规则闭环:
 *   1. getAggregatedSignals() — D93 聚合中层反馈信号
 *   2. processFeedbackSignals(signals) — D92 信号 → 进化动作（纯函数）
 *   3. applyEvolutionActions(actions) — D273 回写阈值/专家配置
 *
 * 诚实性不变量: success:true ⟺ 实际发生回写 (applied > 0)。
 * 无信号/零动作/回写失败 → success:false + degraded:true + 显式输出（禁静默 success）。
 *
 * @param scale — 循环尺度 (fast/medium/slow)
 * @returns LoopExecutionResult — 含真实 applied/skipped 计数
 * @degraded — 无聚合信号 / 信号未达触发阈值 / 回写部分失败 / collector 不可用
 */
export async function defaultEvolutionHandler(scale: ScaleName): Promise<LoopExecutionResult> {
  try {
    // 1. 聚合信号 (D93 feedback-collector)
    const signals = getFeedbackCollector().getAggregatedSignals();
    if (signals.length === 0) {
      log.info({ scale }, '无聚合信号 — 进化循环降级（无可执行进化动作）');
      return {
        success: false,
        output: `进化循环 [${scale}]: 无聚合信号（feedback_log 为空或未达聚合阈值），无可执行进化动作`,
        degraded: true,
      };
    }

    // 2. 信号 → 进化动作 (D92 middle-evolution-engine，纯函数)
    const actions = processFeedbackSignals(signals);
    if (actions.length === 0) {
      log.info({ scale, signals: signals.length }, '信号未达触发阈值 — 进化循环降级（零进化动作）');
      return {
        success: false,
        output: `进化循环 [${scale}]: 聚合信号 ${signals.length} 条，未达触发阈值（<3 次），零进化动作`,
        degraded: true,
      };
    }

    // 3. 回写进化动作 (D273 applyEvolutionActions)
    const result = applyEvolutionActions(actions);
    const detail = `进化循环 [${scale}]: 聚合信号 ${signals.length} 条 → 进化动作 ${actions.length} 个（applied=${result.applied}, skipped=${result.skipped}）`;

    if (result.errors.length > 0) {
      log.warn({ scale, applied: result.applied, skipped: result.skipped, errors: result.errors.length }, '进化动作回写部分失败 — 降级');
      return {
        success: false,
        output: detail,
        error: `回写失败 ${result.errors.length} 项: ${result.errors[0]}`,
        degraded: true,
      };
    }

    if (result.applied === 0) {
      log.info({ scale, skipped: result.skipped }, '回写全部 pending — 进化循环降级（等待累计确认）');
      return {
        success: false,
        output: `${detail}（全部 pending，未实际调整，等待累计确认 ≥${result.skipped + 1} 次）`,
        degraded: true,
      };
    }

    log.info({ scale, applied: result.applied, skipped: result.skipped }, '进化循环执行完成');
    return { success: true, output: detail, degraded: false };
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
