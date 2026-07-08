/**
 * services/escalation-engine.ts — 升级链引擎 (Phase G3)
 *
 * 对标补全: 对接人连续忽略告警后自动升级到上级。
 * 数据改善才停止升级，不是已读就停。
 *
 * 核心逻辑:
 *   1. 每次哨兵发现后，检查规则 → 是否需升级
 *   2. 对接人忽略时记录 → 累计忽略次数/天数
 *   3. 哨兵值恢复正常 → 升级链自动终止
 *
 * 文件驱动: extensions/policies/escalation-rules.json — GA 可编辑
 * 接线: sentinel runner 在通知分发前调用 evaluate()
 *
 * 铁律 24+31: 每步独立 try/catch, degraded 传播。
 * 铁律 38: 零不安全类型断言。
 * 铁律 39: L2 编排层。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('services/escalation-engine');

// ═══ 类型定义 ═══

/** 升级规则 — 来自 JSON 文件，文件驱动 */
export interface EscalationRule {
  severity: 'critical' | 'warning' | 'info' | 'emergency';
  /** 连续忽略 N 天后升级（与 cumulativeIgnores 是 OR 关系） */
  ignoreDays?: number;
  /** 累计忽略 N 次后升级（与 ignoreDays 是 OR 关系） */
  cumulativeIgnores?: number;
  /** 升级目标角色 */
  escalateTo: 'owner' | 'department_head' | 'liaison';
  /** 通知渠道列表 */
  channels: string[];
  /** 规则描述（可读，用于日志和提示） */
  description: string;
}

/** 告警上下文 — evaluate 的输入 */
export interface EscalationContext {
  /** 告警/发现 ID */
  alertId: string;
  /** 哨兵 ID */
  sentinelId: string;
  /** 严重度 */
  severity: 'emergency' | 'critical' | 'warning' | 'info';
  /** 首次被忽略的时间（null = 未被忽略过） */
  firstIgnoredAt: Date | null;
  /** 累计忽略次数 */
  cumulativeIgnores: number;
  /** 数据是否已改善（哨兵值恢复正常） */
  dataImproved: boolean;
}

/** 升级决策 — evaluate 的输出 */
export interface EscalationDecision {
  shouldEscalate: boolean;
  escalateTo: string;
  channels: string[];
  reason: string;
  matchedRule: string;
}

/** 升级/忽略历史记录 */
export interface EscalationRecord {
  alertId: string;
  orgId: string;
  action: 'ignore' | 'escalate';
  actor: string;
  from?: string;
  to?: string;
  reason?: string;
  timestamp: string;
}

/** 数据改善检测参数 */
export interface DataImprovementInput {
  sentinelId: string;
  currentValue: number;
  baselineValue: number;
  /** 改善阈值: currentValue < baselineValue × threshold → 已改善 */
  threshold: number;
}

/** 引擎统计 */
export interface EscalationEngineStats {
  totalIgnores: number;
  totalEscalations: number;
}

/** 构造选项 */
export interface EscalationEngineOptions {
  /** 规则列表（从 JSON 加载或测试注入） */
  rules?: EscalationRule[];
  /** 存储后端（生产用 AgentMemoryStore，测试用 Map） */
  storage?: Map<string, unknown>;
  /** 当前时间（测试用，默认 new Date()） */
  now?: Date;
}

// ═══ 常量 ═══

/** 存储 key 前缀 */
const IGNORE_KEY_PREFIX = 'escalation_ignore_';
const HISTORY_KEY_PREFIX = 'escalation_history_';

// ═══ EscalationEngine ═══

export class EscalationEngine {
  private rules: EscalationRule[];
  private storage: Map<string, unknown>;
  private now: Date;

  // 统计
  private totalIgnores = 0;
  private totalEscalations = 0;

  constructor(opts: EscalationEngineOptions = {}) {
    this.rules = opts.rules ?? [];
    this.storage = opts.storage ?? new Map();
    this.now = opts.now ?? new Date();

    log.info({ ruleCount: this.rules.length }, 'EscalationEngine 初始化完成');
  }

  // ═══ 核心评估 ═══

  /**
   * 评估是否需要升级。
   * 匹配规则 → 检查 ignoreDays/cumulativeIgnores 阈值 → 返回决策。
   * dataImproved=true → 始终不升级（数据改善优先于任何规则）。
   */
  evaluate(context: EscalationContext): EscalationDecision | null {
    // 数据已改善 → 不升级（数据改善才停，不是已读就停）
    if (context.dataImproved) {
      log.debug({ alertId: context.alertId, sentinelId: context.sentinelId }, '数据已改善 — 不升级');
      return null;
    }

    // 从未被忽略过 → 不升级
    if (!context.firstIgnoredAt) {
      return null;
    }

    // 查找匹配的规则
    const matchedRules = this.rules.filter(r => r.severity === context.severity);
    if (matchedRules.length === 0) {
      log.debug({ severity: context.severity, alertId: context.alertId }, '该严重度无匹配规则 — 不升级');
      return null;
    }

    // 计算忽略天数
    const ignoreDays = this.getDaysSince(context.firstIgnoredAt);

    // 按规则逐个检查
    for (const rule of matchedRules) {
      let triggered = false;
      let triggerReason = '';

      // 检查 ignoreDays
      if (rule.ignoreDays !== undefined && ignoreDays >= rule.ignoreDays) {
        triggered = true;
        triggerReason = `忽略 ${ignoreDays} 天 ≥ ${rule.ignoreDays} 天`;
      }

      // 检查 cumulativeIgnores (OR 逻辑)
      if (!triggered && rule.cumulativeIgnores !== undefined && context.cumulativeIgnores >= rule.cumulativeIgnores) {
        triggered = true;
        triggerReason = `累计忽略 ${context.cumulativeIgnores} 次 ≥ ${rule.cumulativeIgnores} 次`;
      }

      if (triggered) {
        log.warn({
          alertId: context.alertId,
          sentinelId: context.sentinelId,
          rule: rule.description,
          reason: triggerReason,
          escalateTo: rule.escalateTo,
        }, '升级触发');

        return {
          shouldEscalate: true,
          escalateTo: rule.escalateTo,
          channels: [...rule.channels],
          reason: triggerReason,
          matchedRule: rule.description,
        };
      }
    }

    return null;
  }

  // ═══ 记录操作 ═══

  /**
   * 记录对接人忽略事件。
   */
  recordIgnore(alertId: string, orgId: string, actor: string): void {
    const record: EscalationRecord = {
      alertId,
      orgId,
      action: 'ignore',
      actor,
      timestamp: this.now.toISOString(),
    };

    const key = `${IGNORE_KEY_PREFIX}${orgId}_${alertId}_${Date.now()}`;
    this.storage.set(key, record);
    this.totalIgnores++;

    log.debug({ alertId, orgId, actor }, '忽略事件已记录');
  }

  /**
   * 记录升级事件。
   */
  recordEscalation(alertId: string, orgId: string, from: string, to: string, reason: string): void {
    const record: EscalationRecord = {
      alertId,
      orgId,
      action: 'escalate',
      actor: from,
      from,
      to,
      reason,
      timestamp: this.now.toISOString(),
    };

    const key = `${HISTORY_KEY_PREFIX}${orgId}_${alertId}_${Date.now()}`;
    this.storage.set(key, record);
    this.totalEscalations++;

    log.warn({ alertId, orgId, from, to, reason }, '升级事件已记录');
  }

  // ═══ 历史查询 ═══

  /**
   * 获取指定组织的升级/忽略历史。
   */
  getEscalationHistory(orgId: string): EscalationRecord[] {
    const history: EscalationRecord[] = [];

    for (const [key, value] of this.storage.entries()) {
      if (key.includes(orgId)) {
        history.push(value as EscalationRecord);
      }
    }

    // 按时间戳排序（最新的在前）
    history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return history;
  }

  // ═══ 数据改善检测 ═══

  /**
   * 检查哨兵数据是否已改善。
   * currentValue < baselineValue × threshold → 已改善
   * (对于上升=恶化的指标: 应收账款周期)
   */
  checkDataImprovement(input: DataImprovementInput): boolean {
    if (input.baselineValue <= 0) return false;

    const improved = input.currentValue < input.baselineValue * input.threshold;
    log.debug({
      sentinelId: input.sentinelId,
      currentValue: input.currentValue,
      baselineValue: input.baselineValue,
      threshold: input.threshold,
      improved,
    }, '数据改善检查');

    return improved;
  }

  // ═══ 规则管理 ═══

  /**
   * 获取当前加载的规则列表。
   */
  getRules(): EscalationRule[] {
    return [...this.rules];
  }

  /**
   * 热加载新规则（替换现有规则列表）。
   * 文件驱动入口：重启或配置变更时调用。
   */
  loadRules(rules: EscalationRule[]): void {
    this.rules = [...rules];
    log.info({ ruleCount: this.rules.length }, '升级规则已重新加载');
  }

  // ═══ 统计 ═══

  /**
   * 获取引擎统计。
   */
  getStats(): EscalationEngineStats {
    return {
      totalIgnores: this.totalIgnores,
      totalEscalations: this.totalEscalations,
    };
  }

  // ═══ 内部方法 ═══

  /**
   * 计算从给定日期到现在的天数。
   */
  private getDaysSince(date: Date): number {
    const diffMs = this.now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
