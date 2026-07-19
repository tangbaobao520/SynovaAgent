/**
 * src/agent/main-agent.ts — L2 Main Agent 决策中心 (D8a)
 *
 * Auth Doc #4 Agent Engineering Benchmark — Gap #1.
 * 升级 L2 编排层从被动诊断调度器为主 Agent 决策中心。
 *
 * 职责:
 *   - 注册循环 (registerLoop)
 *   - 执行循环 (executeLoop / executeLoopScale)
 *   - 追踪执行状态
 *   - 写入执行记录到审计日志
 *
 * 契约:
 *   @input  — LoopTriggerConfig[] + AuditStore 实例
 *   @output — LoopExecutionRecord
 *   @degraded — 单循环失败不崩溃 MainAgent, catch + log.warn + degraded:true
 */
import { createLogger } from '@synova/logger';
import type { LoopTriggerConfig, ScaleName } from '../loops/loop-trigger-config';
import { defaultDiagnosisHandler, defaultNavigationHandler, defaultEvolutionHandler, defaultOverflowHandler } from './loop-handlers';

const log = createLogger('agent/main-agent');

// ═══ 类型定义 ═══

/** 循环执行状态 */
export type LoopStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 循环执行记录 */
export interface LoopExecutionRecord {
  loopId: string;
  scale?: ScaleName;
  status: LoopStatus;
  durationMs: number;
  output?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  degraded: boolean;
}

/** 已注册循环 */
export interface RegisteredLoop {
  config: LoopTriggerConfig;
  lastExecution?: LoopExecutionRecord;
  executionCount: number;
}

/** 审计存储最小接口 */
export interface AuditStoreLike {
  log(entry: {
    orgId: string;
    actorId: string;
    actorRole: string;
    action: string;
    targetType?: string;
    targetId?: string;
    oldValue?: string;
    newValue?: string;
  }): void;
}

// ═══ MainAgent ═══

/**
 * L2 Main Agent — 循环调度与执行决策中心。
 *
 * 管理 6 个循环的注册、执行和状态追踪。
 * 使用依赖注入接收 AuditStore 实例。
 */
export class MainAgent {
  private loops = new Map<string, RegisteredLoop>();
  private auditStore: AuditStoreLike | null;

  /**
   * @param auditStore — 审计存储实例（可选，null 时降级）
   */
  constructor(auditStore?: AuditStoreLike | null) {
    this.auditStore = auditStore ?? null;
  }

  /**
   * 注册一个循环。
   * 将 LoopTriggerConfig 注册到 MainAgent，供 executeLoop 调度。
   */
  registerLoop(config: LoopTriggerConfig): void {
    try {
      this.loops.set(config.loopId, {
        config,
        executionCount: 0,
      });
      log.info({ loopId: config.loopId, scales: config.scales.length }, '循环已注册到 MainAgent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, loopId: config.loopId }, '循环注册失败 — 降级');
    }
  }

  /**
   * 执行指定循环的默认尺度（fast）。
   * 默认使用 fast 尺度，可通过 executeLoopScale 指定。
   */
  async executeLoop(loopId: string): Promise<LoopExecutionRecord> {
    const loop = this.loops.get(loopId);
    if (!loop) {
      return {
        loopId,
        status: 'failed',
        durationMs: 0,
        error: `循环 ${loopId} 未注册`,
        startedAt: new Date().toISOString(),
        degraded: true,
      };
    }

    // 默认执行 fast 尺度
    return this.executeLoopScale(loopId, 'fast');
  }

  /**
   * 执行指定循环的指定尺度。
   *
   * @param loopId — 循环 ID
   * @param scale — 尺度名称 (fast/medium/slow)
   * @returns LoopExecutionRecord
   */
  async executeLoopScale(loopId: string, scale: ScaleName): Promise<LoopExecutionRecord> {
    const loop = this.loops.get(loopId);
    if (!loop) {
      return {
        loopId,
        scale,
        status: 'failed',
        durationMs: 0,
        error: `循环 ${loopId} 未注册`,
        startedAt: new Date().toISOString(),
        degraded: true,
      };
    }

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      // 选择对应处理器
      const handler = this.selectHandler(loopId);
      const result = await handler(scale);

      const durationMs = Date.now() - startTime;
      const record: LoopExecutionRecord = {
        loopId,
        scale,
        status: result.success ? 'completed' : 'failed',
        durationMs,
        output: result.output,
        error: result.error,
        startedAt,
        completedAt: new Date().toISOString(),
        degraded: result.degraded,
      };

      // 更新注册状态
      loop.lastExecution = record;
      loop.executionCount++;

      // 写入审计日志
      this.writeAuditLog(loopId, scale, record);

      if (!result.success) {
        log.warn({ loopId, scale, error: result.error }, '循环执行失败 — 降级');
      } else {
        log.info({ loopId, scale, durationMs }, '循环执行完成');
      }

      return record;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;
      const record: LoopExecutionRecord = {
        loopId,
        scale,
        status: 'failed',
        durationMs,
        error: msg,
        startedAt,
        completedAt: new Date().toISOString(),
        degraded: true,
      };

      loop.lastExecution = record;
      loop.executionCount++;
      this.writeAuditLog(loopId, scale, record);
      log.warn({ err: msg, loopId, scale }, '循环执行异常 — 降级');

      return record;
    }
  }

  /**
   * 列出所有已注册循环。
   */
  listLoops(): RegisteredLoop[] {
    return [...this.loops.values()];
  }

  /**
   * 获取指定循环的当前状态。
   */
  getLoopStatus(loopId: string): LoopStatus | null {
    const loop = this.loops.get(loopId);
    if (!loop) return null;
    return loop.lastExecution?.status ?? 'pending';
  }

  // ─── 内部方法 ───

  /**
   * 选择循环处理器。
   * MVP: 基于 loopId 前缀分发到默认处理器。
   */
  private selectHandler(loopId: string): (scale: ScaleName) => Promise<{ success: boolean; output?: string; error?: string; degraded: boolean }> {
    if (loopId.includes('diagnosis') || loopId === 'loop-1') {
      return defaultDiagnosisHandler;
    }
    if (loopId.includes('navigation') || loopId === 'loop-2') {
      return defaultNavigationHandler;
    }
    if (loopId.includes('evolution') || loopId === 'loop-3' || loopId === 'loop-5') {
      return defaultEvolutionHandler;
    }
    if (loopId.includes('overflow') || loopId === 'loop-6') {
      return defaultOverflowHandler;
    }
    // 默认: 诊断处理器
    return defaultDiagnosisHandler;
  }

  /**
   * 写入审计日志。
   * 降级: AuditStore 不可用时仅 log.warn，不抛出。
   */
  private writeAuditLog(loopId: string, scale: ScaleName, record: LoopExecutionRecord): void {
    if (!this.auditStore) {
      log.warn({ loopId, scale }, 'AuditStore 不可用 — 跳过审计日志');
      return;
    }
    try {
      this.auditStore.log({
        orgId: 'synova',
        actorId: 'main-agent',
        actorRole: 'system',
        action: `loop.${record.status === 'completed' ? 'completed' : 'failed'}`,
        targetType: 'loop',
        targetId: `${loopId}:${scale}`,
        newValue: JSON.stringify({ durationMs: record.durationMs, degraded: record.degraded }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, loopId }, '审计日志写入失败 — 降级');
    }
  }
}
