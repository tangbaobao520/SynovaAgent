/**
 * l5/alert-rules.ts — 告警规则引擎 (Task 10)
 *
 * GNS v2.0 Growth Cockpit: 定义阈值条件，触发告警生成。
 * 规则可运行时注册——不需要改核心代码。
 *
 * 规则类型:
 *   - threshold: 指标超阈值
 *   - change: 指标变化率超阈值
 *   - pattern: 模式匹配 (如: 连续3次下降)
 */
import Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('l5/alert-rules');

// ═══ Types ═══

export interface AlertRule {
  name: string;
  description: string;
  type: 'threshold' | 'change' | 'pattern';
  /** 监控的 SOG 节点类型 */
  targetNodeType: string;
  /** 监控的属性名 */
  property: string;
  /** 阈值条件 */
  condition: {
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
    value: number;
  };
  priority: 'high' | 'medium' | 'low';
  /** 冷却期 (ms) — 同一规则两次触发的最小间隔 */
  cooldownMs: number;
  /** 是否启用 */
  enabled: boolean;
}

export interface AlertTrigger {
  rule: AlertRule;
  currentValue: number;
  threshold: number;
  triggeredAt: string;
  message: string;
}

// ═══ Default Rules ═══

const DEFAULT_RULES: AlertRule[] = [
  {
    name: 'key_person_bus_factor',
    description: '关键人 Bus Factor ≤1 → 知识孤岛风险',
    type: 'threshold', targetNodeType: 'Person', property: 'busFactor',
    condition: { operator: 'lte', value: 1 },
    priority: 'high', cooldownMs: 86_400_000, enabled: true,
  },
  {
    name: 'risk_severity_critical',
    description: '出现 critical 级别风险',
    type: 'threshold', targetNodeType: 'Risk', property: 'severity',
    condition: { operator: 'eq', value: 0 }, // severity levels mapped: critical=0, high=1...
    priority: 'high', cooldownMs: 3600_000, enabled: true,
  },
  {
    name: 'goal_progress_stalled',
    description: '目标连续 7 天无进展',
    type: 'change', targetNodeType: 'Goal', property: 'progress',
    condition: { operator: 'lte', value: 0.05 }, // <5% change in 7 days
    priority: 'medium', cooldownMs: 86_400_000, enabled: true,
  },
  {
    name: 'team_size_anomaly',
    description: '团队人数月变化 >30%',
    type: 'change', targetNodeType: 'Team', property: 'memberCount',
    condition: { operator: 'gt', value: 0.3 },
    priority: 'medium', cooldownMs: 604_800_000, enabled: true,
  },
];

// ═══ AlertRuleEngine ═══

export class AlertRuleEngine {
  private rules = new Map<string, AlertRule>();
  private lastTriggered = new Map<string, number>();
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    for (const rule of DEFAULT_RULES) {
      this.rules.set(rule.name, rule);
    }
    if (db) {
      this.db = db;
      db.exec(`CREATE TABLE IF NOT EXISTS alert_cooldowns (rule_name TEXT PRIMARY KEY, last_triggered_at INTEGER NOT NULL)`);
      const rows = db.prepare('SELECT rule_name, last_triggered_at FROM alert_cooldowns').all() as Array<Record<string, unknown>>;
      for (const r of rows) {
        this.lastTriggered.set(r.rule_name as string, r.last_triggered_at as number);
      }
      log.info({ count: rows.length }, '冷却期已从 SQLite 恢复');
    }
  }

  /** Register a new rule at runtime */
  register(rule: AlertRule): void {
    this.rules.set(rule.name, rule);
    log.info({ name: rule.name }, '告警规则已注册');
  }

  /** Unregister a rule */
  unregister(name: string): void {
    this.rules.delete(name);
  }

  /** Get all registered rules */
  listRules(): AlertRule[] {
    return [...this.rules.values()];
  }

  /**
   * Check a data point against all matching rules.
   * Returns triggered alerts (respects cooldown).
   */
  check(
    nodeType: string,
    property: string,
    value: number,
    orgId: string,
  ): AlertTrigger[] {
    const triggers: AlertTrigger[] = [];
    const now = Date.now();

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.targetNodeType !== nodeType) continue;
      if (rule.property !== property) continue;

      // Cooldown check
      const lastTrigger = this.lastTriggered.get(rule.name) || 0;
      if (now - lastTrigger < rule.cooldownMs) continue;

      // Evaluate condition
      let triggered = false;
      switch (rule.condition.operator) {
        case 'gt': triggered = value > rule.condition.value; break;
        case 'lt': triggered = value < rule.condition.value; break;
        case 'gte': triggered = value >= rule.condition.value; break;
        case 'lte': triggered = value <= rule.condition.value; break;
        case 'eq': triggered = value === rule.condition.value; break;
      }

      if (triggered) {
        this.lastTriggered.set(rule.name, now);
        try { this.db?.prepare('INSERT OR REPLACE INTO alert_cooldowns (rule_name, last_triggered_at) VALUES (?,?)').run(rule.name, now); } catch {}
        triggers.push({
          rule,
          currentValue: value,
          threshold: rule.condition.value,
          triggeredAt: new Date().toISOString(),
          message: `${rule.description} (${nodeType}.${property}=${value}, 阈值: ${rule.condition.operator} ${rule.condition.value})`,
        });
      }
    }

    if (triggers.length > 0) {
      log.info({ orgId, triggers: triggers.map(t => t.rule.name) }, '告警触发');
    }

    return triggers;
  }

  /** Reset all cooldowns (for testing) */
  resetCooldowns(): void {
    this.lastTriggered.clear();
    try { this.db?.prepare('DELETE FROM alert_cooldowns').run(); } catch {}
  }
}

// ═══ Singleton ═══

let _instance: AlertRuleEngine | null = null;
export function getAlertRuleEngine(db?: Database.Database): AlertRuleEngine {
  if (!_instance) _instance = new AlertRuleEngine(db);
  return _instance;
}
