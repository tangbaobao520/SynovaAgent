/**
 * cron-scheduler.ts — 测量器定时调度框架 (MVP 骨架)
 * @state: skeleton — 调度逻辑正确，但仅注册了 1 个样本测量器，未接入真实数据源
 *
 * 职责：
 *  1. 注册测量器（附带巡检频率）
 *  2. 定时触发 compute()
 *  3. 对比基线 → 超阈值发信号入池
 *
 * MVP：单测量器注册 + 定时触发 + 信号记录。
 * Phase N：信号池 → 专家路由表 → 自动触发跨专家验证。
 *
 * 铁律 39: L3 模块 — 消费 L4 GraphStore 数据，产信号给 L3 专家。
 */

import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/cron-scheduler');

// ═══ Types ═══

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface MeasurerConfig {
  id: string;
  name: string;
  dimension: string;     // 所属监测维度 (D1-D7)
  frequency: ScheduleFrequency;
  /** 基线值（首次运行后自动建立） */
  baseline?: number;
  /** 告警阈值（偏离超过此值发信号） */
  warningThreshold: number;
  criticalThreshold: number;
}

export interface MeasurerResult {
  measurerId: string;
  teamId: string;
  value: number;
  baseline: number;
  deviation: number;     // 当前值与基线的偏差百分比
  exceededThreshold: boolean;
  severity: 'normal' | 'warning' | 'critical';
  computedAt: string;
}

export interface Measurer {
  config: MeasurerConfig;
  compute(teamId: string): Promise<number>;
}

// ═══ Scheduler ═══

export class CronScheduler {
  private measurers = new Map<string, Measurer>();
  private baselines = new Map<string, number>();  // measurerId:teamId → baseline
  private signalLog: MeasurerResult[] = [];
  private timers = new Map<string, NodeJS.Timeout>();

  /** 注册一个测量器 */
  register(measurer: Measurer): void {
    this.measurers.set(measurer.config.id, measurer);
    log.info({ id: measurer.config.id, freq: measurer.config.frequency }, '测量器已注册');
  }

  /** 启动所有已注册测量器的定时巡检 */
  startAll(teamId: string): void {
    for (const [id, measurer] of this.measurers) {
      this.startMeasurer(id, teamId);
    }
    log.info({ count: this.measurers.size, teamId }, '所有测量器已启动');
  }

  /** 停止所有定时器 */
  stopAll(): void {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    log.info('所有测量器已停止');
  }

  /** 手动触发一次巡检（用于调试和按需模式） */
  async runOnce(measurerId: string, teamId: string): Promise<MeasurerResult> {
    const measurer = this.measurers.get(measurerId);
    if (!measurer) {
      throw new Error(`测量器 ${measurerId} 未注册`);
    }

    const value = await measurer.compute(teamId);
    const baselineKey = `${measurerId}:${teamId}`;
    const baseline = this.baselines.get(baselineKey);

    const deviation = baseline ? Math.abs(value - baseline) / baseline : 0;
    const severity = deviation > measurer.config.criticalThreshold ? 'critical'
      : deviation > measurer.config.warningThreshold ? 'warning'
      : 'normal';

    const result: MeasurerResult = {
      measurerId,
      teamId,
      value,
      baseline: baseline || value,
      deviation,
      exceededThreshold: severity !== 'normal',
      severity,
      computedAt: new Date().toISOString(),
    };

    // 首次运行：建立基线
    if (!baseline) {
      this.baselines.set(baselineKey, value);
      log.info({ measurerId, teamId, value }, '建立基线');
    }

    if (result.exceededThreshold) {
      log.warn({ measurerId, teamId, deviation, severity }, '测量器告警');
      this.signalLog.push(result);
    }

    return result;
  }

  /** 获取信号日志 */
  getSignals(teamId: string): MeasurerResult[] {
    return this.signalLog.filter(s => s.teamId === teamId);
  }

  /** 获取所有已注册测量器的最近结果 */
  async getStatus(teamId: string): Promise<MeasurerResult[]> {
    const results: MeasurerResult[] = [];
    for (const [id] of this.measurers) {
      try {
        // 不重新计算——读取信号日志中的最新记录
        const signals = this.signalLog.filter(s => s.measurerId === id && s.teamId === teamId);
        if (signals.length > 0) results.push(signals[signals.length - 1]);
      } catch (e) {
        log.error({ measurerId: id, err: e }, '获取状态失败');
      }
    }
    return results;
  }

  // ═══ Private ═══

  private startMeasurer(id: string, teamId: string): void {
    const measurer = this.measurers.get(id);
    if (!measurer) return;

    const ms = this.frequencyToMs(measurer.config.frequency);
    const timer = setInterval(() => {
      this.runOnce(id, teamId).catch(err => {
        log.error({ measurerId: id, err }, '定时巡检失败');
      });
    }, ms);

    // 立即执行一次
    this.runOnce(id, teamId).catch(() => {});

    this.timers.set(id, timer);
  }

  private frequencyToMs(freq: ScheduleFrequency): number {
    switch (freq) {
      case 'hourly': return 60 * 60 * 1000;
      case 'daily': return 24 * 60 * 60 * 1000;
      case 'weekly': return 7 * 24 * 60 * 60 * 1000;
      case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    }
  }
}

// ═══ 样本测量器：文档新鲜度 ═══
// 检测企业上次上传诊断文档的距今时间。超过阈值发提醒。

export const DOC_FRESHNESS_MEASURER: Measurer = {
  config: {
    id: 'doc_freshness',
    name: '文档新鲜度',
    dimension: 'D2',  // 组织能力 — 信息采集及时性
    frequency: 'weekly',
    warningThreshold: 0.5,   // 50% 偏差 — 超过 45 天
    criticalThreshold: 1.0,  // 100% 偏差 — 超过 60 天
  },
  async compute(teamId: string): Promise<number> {
    // 检查 GraphStore 中最新 Document 节点的创建时间
    // MVP 简化：返回距今天数 / 30（基准为每月一次诊断）
    // Phase N：真实读取 GraphStore
    const now = Date.now();
    // 从 GraphStore 查询最近文档（简化版—通过全局变量注入）
    const latestDocCreatedAt = (globalThis as any).__mvp_doc_timestamps?.[teamId];
    if (!latestDocCreatedAt) return 0; // 首次运行

    const daysSinceLastDoc = (now - new Date(latestDocCreatedAt).getTime()) / (24 * 60 * 60 * 1000);
    return Math.round(daysSinceLastDoc * 10) / 10; // 天数
  },
};

// ═══ Singleton ═══

let _scheduler: CronScheduler | null = null;

export function getCronScheduler(): CronScheduler {
  if (!_scheduler) {
    _scheduler = new CronScheduler();
    _scheduler.register(DOC_FRESHNESS_MEASURER);
    log.info('CronScheduler 单例已创建（含 1 个样本测量器）');
  }
  return _scheduler;
}
