/**
 * decision-engine.ts — 持续决策引擎 (Phase C2)
 *
 * 事件→行动项自动创建。本体图事件绑定工作流。
 * 对标 Palantir: 事件触发→规则匹配→行动生成→状态追踪。
 */
import type { GraphStore } from './graph-store';
import { monitorEdgeWeight, detectCentralityShift, type GraphAlert } from './graph-monitor';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/decision-engine');

// ═══ Types ═══

export interface DecisionRule {
  id: string;
  name: string;
  /** 触发条件: alert type */
  triggerOn: GraphAlert['type'];
  /** 匹配的边类型 */
  edgeType?: string;
  /** 最小严重度 */
  minSeverity: GraphAlert['severity'];
  /** 生成的行动项 */
  action: {
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    assigneeRole: string;
    estimatedHours: number;
  };
  /** 冷却时间 (ms), 同规则不重复触发 */
  cooldownMs: number;
}

export interface DecisionAction {
  id: string;
  ruleId: string;
  alertId: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  assigneeRole: string;
  estimatedHours: number;
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
}

// ═══ Built-in Rules ═══

const BUILTIN_RULES: DecisionRule[] = [
  {
    id: 'rule-edge-drop-critical',
    name: '关键边权重骤降→立即行动',
    triggerOn: 'edge_weight_low',
    edgeType: 'INTERACTS_WITH',
    minSeverity: 'high',
    action: { title: '关键协作通道断裂', description: '团队成员间交互权重低于阈值,可能存在信息断裂。建议立即安排跨部门同步会议。', priority: 'critical', assigneeRole: 'Team Lead', estimatedHours: 2 },
    cooldownMs: 86400000, // 1 day
  },
  {
    id: 'rule-centrality-shift',
    name: '中心性突变→人员风险',
    triggerOn: 'centrality_shift',
    minSeverity: 'high',
    action: { title: '关键人员中心性突变', description: '某成员的中心性偏离均值超过阈值。可能是离职前兆或角色变化。建议HR关注。', priority: 'high', assigneeRole: 'HRBP', estimatedHours: 4 },
    cooldownMs: 604800000, // 1 week
  },
  {
    id: 'rule-edge-drop-medium',
    name: '协作边减弱→关注',
    triggerOn: 'edge_weight_low',
    minSeverity: 'medium',
    action: { title: '协作通道减弱', description: '团队间交互权重低于阈值,建议观察趋势并在下次诊断中重点关注。', priority: 'medium', assigneeRole: 'Team Lead', estimatedHours: 1 },
    cooldownMs: 86400000,
  },
];

// ═══ Engine ═══

const actionStore: DecisionAction[] = [];
const lastTriggered = new Map<string, number>(); // ruleId → lastTriggeredAt
let actionIdCounter = 0;

export function runDecisionEngine(
  store: GraphStore, graph: string,
): DecisionAction[] {
  const newActions: DecisionAction[] = [];
  const now = Date.now();

  // Collect alerts
  const edgeAlerts = monitorEdgeWeight(store, 'INTERACTS_WITH', 0.2, graph);
  const centralityAlerts = detectCentralityShift(store, 1.5, graph);
  const allAlerts = [...edgeAlerts, ...centralityAlerts];

  for (const alert of allAlerts) {
    const matchingRules = BUILTIN_RULES.filter(r => {
      if (r.triggerOn !== alert.type) return false;
      if (r.edgeType && r.edgeType !== alert.edgeType) return false;
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 } as const;
      return severityOrder[alert.severity] >= severityOrder[r.minSeverity];
    });

    for (const rule of matchingRules) {
      // Cooldown check
      const lastAt = lastTriggered.get(rule.id) || 0;
      if (now - lastAt < rule.cooldownMs) continue;

      const action: DecisionAction = {
        id: `dec_${Date.now().toString(36)}_${(++actionIdCounter).toString(36)}`,
        ruleId: rule.id, alertId: alert.id,
        title: rule.action.title,
        description: `${rule.action.description}\n\n触发信号: ${alert.message}`,
        priority: rule.action.priority,
        assigneeRole: rule.action.assigneeRole,
        estimatedHours: rule.action.estimatedHours,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      actionStore.push(action);
      newActions.push(action);
      lastTriggered.set(rule.id, now);
      log.info({ actionId: action.id, ruleId: rule.id, alertId: alert.id }, '[decision-engine] Action created');
    }
  }

  return newActions;
}

export function getDecisionActions(status?: DecisionAction['status']): DecisionAction[] {
  if (!status) return [...actionStore];
  return actionStore.filter(a => a.status === status);
}

export function resolveAction(actionId: string): boolean {
  const action = actionStore.find(a => a.id === actionId);
  if (!action) return false;
  action.status = 'resolved';
  action.resolvedAt = new Date().toISOString();
  return true;
}

export function dismissAction(actionId: string): boolean {
  const action = actionStore.find(a => a.id === actionId);
  if (!action) return false;
  action.status = 'dismissed';
  return true;
}

export function clearDecisionEngine(): void {
  actionStore.length = 0;
  lastTriggered.clear();
}
