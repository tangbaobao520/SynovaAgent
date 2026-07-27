/**
 * src/loops/loop-scheduler.ts — 多尺度循环调度器 (D91 + D223)
 *
 * D91: 消费 LoopTriggerConfig[] + CronScheduler，管理 6 循环 x 3 尺度的触发调度。
 * D223: 追加心跳追踪 + 停滞检测 (Gate 13)。每个循环执行后记录心跳，
 *       24h 周期性检查 → 超 3 周期无产出 → SYSTEM_SILENCE 告警。
 *
 * 契约:
 *   @input  — LoopTriggerConfig[] + CronScheduler 实例
 *   @output — 注册结果 / 触发响应 / 查询时间 / StagnationReport
 *   @degraded — 心跳文件不可用 → 标记 unknown + degraded
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import type { LoopTriggerConfig, TriggerScale, ScaleName, TriggerType } from './loop-trigger-config';
import { validateLoopConfig, LOOP_TRIGGER_MATRIX } from './loop-trigger-config';
import { emitSignal } from '../control-tower/signal-emitter';

const log = createLogger('loops/loop-scheduler');

// ═══ 类型定义 ═══

export interface CronSchedulerLike {
  schedule(name: string, cron: string, handler: () => Promise<void>): string;
}

interface RegisteredLoop {
  config: LoopTriggerConfig;
  scales: Map<ScaleName, RegisteredScale>;
}

interface RegisteredScale {
  config: TriggerScale;
  jobId?: string;
  lastEventAt?: Date;
  nextScheduledAt?: Date;
}

export interface TriggerEvent {
  type: string;
  payload?: unknown;
}

export interface NextTriggerInfo {
  loopId: string;
  scale: ScaleName;
  triggerType: TriggerType;
  nextAt: string | null;
  remainingMs: number;
}

// ═══ D223: 心跳 & 停滞 ═══

export interface HeartbeatRecord {
  loopId: string;
  loopName: string;
  lastOutputAt: string;
  cycleCount: number;
}

export interface StagnationReport {
  stalled: string[];
  healthy: string[];
  unknown: string[];
  degraded: boolean;
  checkedAt: string;
}

const STALL_THRESHOLD_CYCLES = 3;
const HEARTBEAT_DIR = join(process.cwd(), '.codex');
const HEARTBEAT_FILE = join(HEARTBEAT_DIR, 'heartbeat.json');

// ═══ LoopScheduler ═══

export class LoopScheduler {
  private loops = new Map<string, RegisteredLoop>();
  private scheduler: CronSchedulerLike | null = null;
  private enabled = true;
  private mainAgent: { executeLoop(loopId: string, scale: string): Promise<{ status: string }> } | null = null;

  constructor(scheduler?: CronSchedulerLike) {
    this.scheduler = scheduler ?? null;
    this.initHeartbeatDir();
    this.registerHeartbeatCheck();
    this.registerBuiltinLoops();
  }

  /** 注入 MainAgent 实例（D8a），供内置循环执行调用 */
  setMainAgent(agent: { executeLoop(loopId: string, scale: string): Promise<{ status: string }> }): void {
    this.mainAgent = agent;
    log.info('[wiring] MainAgent 已注入 LoopScheduler');
  }

  /** 确保心跳目录存在 */
  private initHeartbeatDir(): void {
    try { mkdirSync(HEARTBEAT_DIR, { recursive: true }); } catch { log.warn({}, '心跳目录创建失败 — 降级'); }
  }

  /**
   * D223: 注册 24h 停滞检测任务。
   */
  private registerHeartbeatCheck(): void {
    if (!this.scheduler) return;
    try {
      this.scheduler.schedule('system-heartbeat-check', '0 0 * * *', async () => {
        const report = await this.checkStagnation();
        if (report.stalled.length > 0) {
          log.warn({ stalled: report.stalled, report }, 'SYSTEM_SILENCE — 检测到停滞循环');
          emitSignal('loop-scheduler', 'red', `${report.stalled.length} loops stalled`);
        } else if (report.unknown.length > 0) {
          emitSignal('loop-scheduler', 'yellow', `${report.unknown.length} loops unknown`);
        } else {
          log.info({ healthy: report.healthy.length }, '心跳检查 — 全部循环正常');
          emitSignal('loop-scheduler', 'green', 'all_loops_healthy');
        }
      });
    } catch (err: unknown) {
      log.warn({ err }, '停滞检测任务注册失败 — 降级');
    }
  }

  /**
   * D9: 注册 2 个内置业务循环到 CronScheduler。
   *
   * loop-4 (system_self_check): 系统自检，每日 0 点 (0 0 * * *)
   *   检查哨兵状态/专家状态/数据新鲜度。
   * loop-5 (knowledge_accumulation): 知识积累，每周日 0 点 (0 0 * * 0)
   *   从 PKB 提取 enterprise_facts、更新知识图谱。
   *
   * 降级: MainAgent 不可用 → log.warn + 跳过执行。
   */
  private registerBuiltinLoops(): void {
    if (!this.scheduler) {
      log.warn('[D9] CronScheduler 不可用 — 内置循环跳过');
      return;
    }

    try {
      // loop-4: 系统自检（每日 0 点）
      this.scheduler.schedule('loop-4-self-check', '0 0 * * *', async () => {
        if (!this.mainAgent) {
          log.warn('[D9] MainAgent 未注入 — 跳过 loop-4 执行 (degraded)');
          return;
        }
        try {
          const result = await this.mainAgent.executeLoop('loop-4', 'fast');
          this.recordHeartbeat('loop-4');
          log.info({ status: result.status }, 'loop-4 系统自检完成');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg }, 'loop-4 执行失败 — degraded');
        }
      });
      log.info('[D9] loop-4-self-check 已注册 (0 0 * * *)');

      // loop-5: 知识积累（每周日 0 点）
      this.scheduler.schedule('loop-5-knowledge', '0 0 * * 0', async () => {
        if (!this.mainAgent) {
          log.warn('[D9] MainAgent 未注入 — 跳过 loop-5 执行 (degraded)');
          return;
        }
        try {
          const result = await this.mainAgent.executeLoop('loop-5', 'medium');
          this.recordHeartbeat('loop-5');
          log.info({ status: result.status }, 'loop-5 知识积累完成');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg }, 'loop-5 执行失败 — degraded');
        }
      });
      log.info('[D9] loop-5-knowledge 已注册 (0 0 * * 0)');

      // loop-1: 企业诊断（季度 cron，slow 尺度—完整诊断管线）
      this.scheduler.schedule('loop-1-diagnosis', '0 9 1 */3 *', async () => {
        if (!this.mainAgent) {
          log.warn('[D9] MainAgent 未注入 — 跳过 loop-1 (degraded)');
          return;
        }
        try {
          const result = await this.mainAgent.executeLoop('loop-1', 'slow');
          this.recordHeartbeat('loop-1');
          log.info({ status: result.status }, 'loop-1 企业诊断完成');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg }, 'loop-1 执行失败 — degraded');
        }
      });
      log.info('[D9] loop-1-diagnosis 已注册 (0 9 1 */3 *)');

      // loop-2: 部门导航（周度 cron，medium 尺度）
      this.scheduler.schedule('loop-2-navigation', '0 9 * * 1', async () => {
        if (!this.mainAgent) {
          log.warn('[D9] MainAgent 未注入 — 跳过 loop-2 (degraded)');
          return;
        }
        try {
          const result = await this.mainAgent.executeLoop('loop-2', 'medium');
          this.recordHeartbeat('loop-2');
          log.info({ status: result.status }, 'loop-2 部门导航完成');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg }, 'loop-2 执行失败 — degraded');
        }
      });
      log.info('[D9] loop-2-navigation 已注册 (0 9 * * 1)');

      // loop-3: GA进化（季度 cron，slow 尺度—Phase 3）
      this.scheduler.schedule('loop-3-ga-evolution', '0 9 1 */3 *', async () => {
        if (!this.mainAgent) {
          log.warn('[D237] MainAgent 未注入 — 跳过 loop-3 (degraded)');
          return;
        }
        try {
          const result = await this.mainAgent.executeLoop('loop-3', 'slow');
          this.recordHeartbeat('loop-3');
          log.info({ status: result.status }, 'loop-3 GA进化完成');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg }, 'loop-3 执行失败 — degraded');
        }
      });
      log.info('[D237] loop-3-ga-evolution 已注册 (0 9 1 */3 *)');

	      // D238: loop-6: 溢出监控（月级 cron，medium 尺度）
	      this.scheduler.schedule('loop-6-overflow', '0 9 1 * *', async () => {
	        if (!this.mainAgent) {
	          log.warn('[D238] MainAgent 未注入 — 跳过 loop-6');
	          return;
	        }
	        try {
	          const result = await this.mainAgent.executeLoop('loop-6', 'medium');
	          this.recordHeartbeat('loop-6');
	          log.info({ status: result.status }, 'loop-6 溢出监控完成');
	        } catch (err: unknown) {
	          const msg = err instanceof Error ? err.message : String(err);
	          log.warn({ err: msg }, 'loop-6 执行失败 — degraded');
	        }
	      });
	      log.info('[D238] loop-6-overflow 已注册 (0 9 1 * *)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '[D9] 内置循环注册失败 — 降级');
    }
  }

  /**
   * D223: 记录循环心跳。
   * 每次循环执行完成后调用。
   */
  recordHeartbeat(loopId: string): void {
    try {
      const records = this.loadHeartbeats();
      const existing = records.find(r => r.loopId === loopId);
      if (existing) {
        existing.lastOutputAt = new Date().toISOString();
        existing.cycleCount++;
      } else {
        records.push({
          loopId,
          loopName: this.loops.get(loopId)?.config.loopName || loopId,
          lastOutputAt: new Date().toISOString(),
          cycleCount: 1,
        });
      }
      writeFileSync(HEARTBEAT_FILE, JSON.stringify(records, null, 2), 'utf-8');
    } catch (err: unknown) {
      log.warn({ err, loopId }, '心跳记录失败 — 降级');
    }
  }

  /**
   * D223: 检测停滞循环。
   * 对比每循环最后心跳时间 vs 当前时间。
   * 超 3 周期未产出 → 标记 stalled。
   */
  async checkStagnation(): Promise<StagnationReport> {
    const records = this.loadHeartbeats();
    const allLoopIds = [...this.loops.keys()];

    const stalled: string[] = [];
    const healthy: string[] = [];
    const unknown: string[] = [];

    for (const loopId of allLoopIds) {
      const hb = records.find(r => r.loopId === loopId);
      if (!hb) {
        unknown.push(loopId);
        continue;
      }
      const lastOutput = new Date(hb.lastOutputAt).getTime();
      const elapsedHours = (Date.now() - lastOutput) / (1000 * 60 * 60);
      // 3 周期 ≈ 72h 无产出（假设 24h/周期）
      if (elapsedHours > STALL_THRESHOLD_CYCLES * 24) {
        stalled.push(loopId);
      } else {
        healthy.push(loopId);
      }
    }

    const report: StagnationReport = {
      stalled, healthy, unknown,
      degraded: records.length === 0,
      checkedAt: new Date().toISOString(),
    };

    if (stalled.length > 0) {
      log.warn({ stalled, report }, '检测到循环停滞 — SYSTEM_SILENCE');
    }

    return report;
  }

  /** 加载心跳记录 */
  private loadHeartbeats(): HeartbeatRecord[] {
    try {
      if (!existsSync(HEARTBEAT_FILE)) return [];
      const raw = readFileSync(HEARTBEAT_FILE, 'utf-8');
      return JSON.parse(raw) as HeartbeatRecord[];
    } catch {
      return [];
    }
  }

  /** 以下为 D91 原有方法（不变） */

  registerDefaultLoops(): number {
    let count = 0;
    for (const config of LOOP_TRIGGER_MATRIX) {
      const result = this.registerLoop(config);
      if (result) count++;
    }
    log.info({ count, total: LOOP_TRIGGER_MATRIX.length }, '默认循环已注册');
    return count;
  }

  registerLoop(config: LoopTriggerConfig): boolean {
    try {
      const errors = validateLoopConfig([config]);
      if (errors.length > 0) {
        log.warn({ loopId: config.loopId, errors }, '循环配置验证失败 — 跳过');
        return false;
      }

      const scales = new Map<ScaleName, RegisteredScale>();

      for (const scale of config.scales) {
        const registered: RegisteredScale = { config: scale };

        if (scale.triggerType === 'cron' || scale.triggerType === 'hybrid') {
          if (this.scheduler) {
            try {
              const jobId = this.scheduler.schedule(
                `loop-${config.loopId}-${scale.name}`,
                scale.period,
                async () => {
                  log.info({ loopId: config.loopId, scale: scale.name }, '循环定时触发');
                  // D223: 循环执行后记录心跳
                  this.recordHeartbeat(config.loopId);
                },
              );
              registered.jobId = jobId;
              registered.nextScheduledAt = new Date(Date.now() + 60000);
            } catch (jobErr: unknown) {
              const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
              log.warn({ err: msg, loopId: config.loopId, scale: scale.name }, '循环定时任务注册失败 — 降级');
            }
          } else {
            log.warn({ loopId: config.loopId, scale: scale.name }, 'CronScheduler 不可用 — 降级为仅事件触发');
          }
        }

        scales.set(scale.name, registered);
      }

      this.loops.set(config.loopId, { config, scales });
      log.info({ loopId: config.loopId, loopName: config.loopName }, '循环已注册');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, loopId: config.loopId }, '循环注册失败 — 降级');
      return false;
    }
  }

  onEvent(event: TriggerEvent): { loopId: string; scale: ScaleName }[] {
    if (!this.enabled) {
      log.debug({ eventType: event.type }, '调度器已禁用，忽略事件');
      return [];
    }

    const triggered: { loopId: string; scale: ScaleName }[] = [];

    for (const [loopId, loop] of this.loops) {
      for (const [scaleName, scale] of loop.scales) {
        if (scale.config.triggerType === 'cron') continue;

        if (scale.config.eventSource && event.type === scale.config.eventSource) {
          scale.lastEventAt = new Date();
          triggered.push({ loopId, scale: scaleName });
          log.info({ loopId, scale: scaleName, eventType: event.type }, '事件触发循环');
        }
      }
    }

    if (triggered.length === 0) {
      log.debug({ eventType: event.type }, '无匹配循环触发');
    }

    return triggered;
  }

  getNextTrigger(loopId: string, scale: ScaleName): NextTriggerInfo | null {
    const loop = this.loops.get(loopId);
    if (!loop) return null;

    const registered = loop.scales.get(scale);
    if (!registered) return null;

    const cfg = registered.config;

    if (cfg.triggerType === 'event') {
      return { loopId, scale, triggerType: cfg.triggerType, nextAt: null, remainingMs: -1 };
    }

    const now = Date.now();
    const nextAt = registered.nextScheduledAt?.getTime() ?? (now + 3600000);
    const remainingMs = Math.max(0, nextAt - now);

    return { loopId, scale, triggerType: cfg.triggerType, nextAt: new Date(nextAt).toISOString(), remainingMs };
  }

  listLoops(): { loopId: string; loopName: string; scales: ScaleName[] }[] {
    return [...this.loops.values()].map((l) => ({
      loopId: l.config.loopId,
      loopName: l.config.loopName,
      scales: [...l.scales.keys()],
    }));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.info({ enabled }, '循环调度器状态已更新');
  }
}
