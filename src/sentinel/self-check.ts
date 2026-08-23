/**
 * sentinel/self-check.ts — D505 哨兵自诊断可信度（S3-5，L22-5）
 *
 * 哨兵体系自身的健康评估——"监控的监控"（可观测性行业通识，C线 S3-5）：
 * 哨兵挂了（loader 失败/适配器崩溃/调度停摆）必须显式 degraded 信号，
 * 不允许静默吞掉后 dashboard 继续假装健康。
 *
 * 架构: L3（洞察层）— 纯函数，与 runner/registry/loader 同层，无跨层依赖。
 *
 * @state: real — D505 交付，由 runner.runSelfCheck() 每小时调用
 */

import type { SentinelFinding } from './types';

// ═══ 阈值常量（防噪音化 — 宁缺毋滥，派单已知风险） ═══

/** H1: 哨兵注册率低于此值 → warning（0 → critical） */
export const HEALTH_REGISTRY_RATIO_WARNING = 0.8;
/** H2: 单哨兵 cron 连续失败达到此值 → warning（k8s failureThreshold 同款：偶发给 60s 重试机会） */
export const HEALTH_FAILURES_WARNING = 3;
/** H2: 单哨兵 cron 连续失败达到此值 → critical */
export const HEALTH_FAILURES_CRITICAL = 5;
/** H3: 进程存活超过此时长且哨兵从未运行 → critical（空转） */
export const HEALTH_UPTIME_IDLE_MS = 60 * 60 * 1000; // 1h
/** H3: lastRunAt 陈旧度超过 maxScheduleMs × 此倍数 → warning */
export const HEALTH_STALENESS_MULTIPLIER = 3;
/** cron 间隔估算兜底（未识别形态） */
export const CRON_INTERVAL_FALLBACK_MS = 24 * 60 * 60 * 1000;

/** 自诊断哨兵 ID — findings 以此 ID 流入 records（GET /api/sentinel/findings 可见，零 routes 改动） */
export const SELF_CHECK_SENTINEL_ID = 'sentinel-self-check';
export const SELF_CHECK_SENTINEL_NAME = '哨兵自诊断';

// ═══ 契约（铁律 47 — 先于实现） ═══

/** 哨兵体系健康指标快照（由 runner.runSelfCheck 收集） */
export interface SentinelHealthState {
  /** registry.count() — 已注册哨兵数 */
  registryCount: number;
  /** loadSentinels().sentinels.length — manifest 预期数 */
  expectedCount: number;
  /** scheduler.listJobs() 子集 — 各 cron 作业连续失败计数 */
  cronJobs: Array<{ id: string; failures: number; lastRunAt: string | null; lastError: string | null }>;
  /** runner.getStats().lastRunAt — 最近一次哨兵 run（null = 从未跑） */
  lastRunAt: string | null;
  /** 最稀 cron 间隔（ms）— 陈旧度基准 */
  maxScheduleMs: number;
  /** 进程存活时长（ms）— 从未跑时判空转用 */
  uptimeMs: number;
}

export interface SentinelHealthResult {
  /** findings 为空即 healthy（健康零噪音） */
  healthy: boolean;
  findings: SentinelFinding[];
}

/**
 * 评估哨兵体系自身健康（H1/H2/H3 三指标，纯函数）。
 *
 * 契约:
 *   @input  state — 哨兵体系健康指标快照（见 SentinelHealthState）
 *   @output { healthy, findings } — healthy=true → findings 恒为空（宁缺毋滥）；
 *           healthy=false → findings 1~N 条（severity: warning/critical）
 *   @degraded — 无（纯函数不收集数据；收集层失败由调用方 runSelfCheck fail-closed 处理）
 *   @error    — 无（不抛；NaN/异常输入保守视为健康侧默认值）
 * 阈值:
 *   H1 注册率 = 0 → critical；< 0.8 → warning；≥ 0.8 → 健康
 *   H2 failures ≥ 5 → critical；≥ 3 → warning；< 3 → 偶发不算
 *   H3 从未跑 + uptime > 1h → critical；lastRunAt 陈旧 > maxScheduleMs × 3 → warning
 * finding id 稳定（self-check-H#-seq，D354 去时间戳精神 — 同输入同 id，跨轮通知/工单去重键稳定）。
 */
export function evaluateSentinelHealth(state: SentinelHealthState): SentinelHealthResult {
  const findings: SentinelFinding[] = [];
  const now = new Date();
  const seq: Record<string, number> = { H1: 0, H2: 0, H3: 0 };

  const makeFinding = (h: 'H1' | 'H2' | 'H3', severity: 'critical' | 'warning', title: string, description: string, evidence: string[], suggestion: string): SentinelFinding => {
    seq[h] += 1;
    return {
      id: `self-check-${h}-${seq[h]}`,
      severity,
      title,
      description,
      evidence,
      suggestion,
      detectedAt: now.toISOString(),
      status: 'open',
    };
  };

  // H1 loader 健康 — 运行期注册数 vs manifest 预期数对比（断点 1/4）
  if (state.expectedCount > 0) {
    const ratio = state.registryCount / state.expectedCount;
    if (ratio === 0) {
      findings.push(makeFinding(
        'H1', 'critical',
        `哨兵全未注册（0/${state.expectedCount}）— loader 全挂`,
        `哨兵 manifest ${state.expectedCount} 个但 registry 为空 — 文件驱动 loader 在运行期全部失败，哨兵体系已停止巡检`,
        [`registry.count()=0`, `manifests=${state.expectedCount}`],
        '检查 extensions/sentinels/ 目录可读性与 sentinel-loader 日志；loader 恢复后下轮自检自动转健康',
      ));
    } else if (ratio < HEALTH_REGISTRY_RATIO_WARNING) {
      findings.push(makeFinding(
        'H1', 'warning',
        `部分哨兵未注册（${state.registryCount}/${state.expectedCount}）`,
        `哨兵注册率 ${(ratio * 100).toFixed(0)}% 低于阈值 ${HEALTH_REGISTRY_RATIO_WARNING * 100}% — 部分哨兵静默失效，巡检覆盖不全`,
        [`registry.count()=${state.registryCount}`, `manifests=${state.expectedCount}`],
        '核对 sentinel-loader 注册错误日志，补齐失败哨兵的注册',
      ));
    }
  }

  // H2 适配器健康 — cron 连续失败阈值（断点 2；scheduler 60s 重试已滤瞬时故障）
  for (const job of state.cronJobs) {
    if (job.failures >= HEALTH_FAILURES_CRITICAL) {
      findings.push(makeFinding(
        'H2', 'critical',
        `哨兵 cron '${job.id}' 连续失败 ${job.failures} 次`,
        job.lastError ?? '连续失败达 critical 阈值 — 适配器疑似崩溃',
        [`failures=${job.failures}`, `lastError=${job.lastError ?? 'n/a'}`],
        '检查该哨兵适配器日志与数据源连通性；连续失败会自动重试（60s），恢复后计数归零',
      ));
    } else if (job.failures >= HEALTH_FAILURES_WARNING) {
      findings.push(makeFinding(
        'H2', 'warning',
        `哨兵 cron '${job.id}' 连续失败 ${job.failures} 次`,
        job.lastError ?? '连续失败达 warning 阈值',
        [`failures=${job.failures}`, `lastError=${job.lastError ?? 'n/a'}`],
        '关注该哨兵下一次调度是否恢复；连续 5 次将升级 critical',
      ));
    }
  }

  // H3 调度健康 — 空转/陈旧检测（断点 3/4）
  if (!state.lastRunAt) {
    if (state.uptimeMs > HEALTH_UPTIME_IDLE_MS) {
      findings.push(makeFinding(
        'H3', 'critical',
        '哨兵从未运行（空转）— 调度停摆',
        `进程存活 ${Math.floor(state.uptimeMs / 60000)} 分钟但哨兵从未执行 — CronScheduler 空转或 registry 未注册任何 cron 哨兵`,
        [`uptimeMs=${Math.floor(state.uptimeMs / 60000)}min`, 'lastRunAt=null'],
        '检查 runner.start() 是否被调用、CronScheduler 是否启动；恢复后 lastRunAt 刷新即自动转健康',
      ));
    }
  } else {
    const lastRunMs = new Date(state.lastRunAt).getTime();
    if (!Number.isNaN(lastRunMs)) {
      const staleMs = now.getTime() - lastRunMs;
      const staleThreshold = state.maxScheduleMs * HEALTH_STALENESS_MULTIPLIER;
      if (staleMs > staleThreshold) {
        findings.push(makeFinding(
          'H3', 'warning',
          `哨兵最近运行 ${Math.floor(staleMs / 60000)} 分钟前 — 超过调度间隔 ×${HEALTH_STALENESS_MULTIPLIER}`,
          `最稀调度间隔 ${Math.floor(state.maxScheduleMs / 60000)} 分钟，但已 ${Math.floor(staleMs / 60000)} 分钟无任何哨兵运行 — 调度疑似停摆`,
          [`lastRunAt=${state.lastRunAt}`, `maxScheduleMs=${Math.floor(state.maxScheduleMs / 60000)}min`],
          '检查 CronScheduler 进程与 cron 注册表；哨兵恢复运行后本告警自动消除',
        ));
      }
    }
  }

  return { healthy: findings.length === 0, findings };
}

/**
 * 估算五段 cron 表达式的调度间隔（最稀间隔近似，陈旧度基准用）。
 *
 * 契约:
 *   @input  cron — 标准五段 crontab 表达式（分 时 日 月 周）
 *   @output 间隔毫秒数（近似上界：小时级 1h/6h、日级 24h、月级 30d）
 *   @degraded — 未识别形态 → 兜底 24h（CRON_INTERVAL_FALLBACK_MS，宁可保守不误报）
 *   @error    — 无（不抛；任意输入返回正数）
 */
export function estimateCronIntervalMs(cron: string): number {
  const HOUR_MS = 60 * 60 * 1000;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return CRON_INTERVAL_FALLBACK_MS;
  const [, hour, dom, month, dow] = parts;

  // 月级: 日或月指定 → 每月一次 → 30d 近似
  if (month !== '*' || dom !== '*') return 30 * 24 * HOUR_MS;
  // 周级: 周指定 → 每周一次
  if (dow !== '*') return 7 * 24 * HOUR_MS;

  // 小时级: hour='*' → 每小时；'*/N' → N 小时
  if (hour === '*') return HOUR_MS;
  const stepMatch = /^\*\/(\d+)$/.exec(hour);
  if (stepMatch) {
    const n = Number(stepMatch[1]);
    return n > 0 ? n * HOUR_MS : HOUR_MS;
  }
  // 指定固定小时列表（每天 N 次）→ 至少 1h，按 24/N 近似
  const hours = hour.split(',');
  if (hours.length > 1 && hours.length < 24) return Math.max(1, Math.floor(24 / hours.length)) * HOUR_MS;
  return 24 * HOUR_MS;
}
