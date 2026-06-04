/**
 * l3/briefing-generator.ts — GNS v2.0 每日简报生成器 (M2-3)
 *
 * 每天 19:00 触发，收集 L4 中所有活跃目标/告警/遗留问题，
 * 格式化为 Markdown，通过 IM 发送。
 *
 * 简报结构:
 *   1. 执行摘要 (一句话)
 *   2. 目标进度 (进度条 + 趋势)
 *   3. 活跃告警 (高→低优先级)
 *   4. 遗留问题
 *   5. 推荐动作
 */
import { createLogger } from '../logger';

const log = createLogger('l3/briefing-generator');

// ═══ Types ═══

export interface DailyBriefing {
  date: string;
  summary: string;
  goals: Array<{ name: string; progress: number; trend: 'up' | 'down' | 'stable' }>;
  alerts: Array<{ description: string; priority: 'high' | 'medium' | 'low'; confidence: number }>;
  obstacles: Array<{ description: string; status: string }>;
  recommendations: string[];
  generatedAt: string;
}

// ═══ BriefingGenerator ═══

export class BriefingGenerator {
  private graphStore: {
    queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; props: Record<string, unknown> }>;
    queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ from: string; to: string; type: string; props: Record<string, unknown> }>;
  } | null = null;

  constructor(store?: { queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; props: Record<string, unknown> }>; queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ from: string; to: string; type: string; props: Record<string, unknown> }> }) {
    this.graphStore = store || null;
  }

  /** Generate today's briefing from L4 graph data */
  async generate(orgId: string): Promise<DailyBriefing> {
    const briefing: DailyBriefing = {
      date: new Date().toISOString().slice(0, 10),
      summary: '',
      goals: [],
      alerts: [],
      obstacles: [],
      recommendations: [],
      generatedAt: new Date().toISOString(),
    };

    if (!this.graphStore) {
      briefing.summary = '简报数据不可用——GraphStore 未连接';
      return briefing;
    }

    try {
      // Goals
      const goals = this.graphStore.queryNodes('Goal', { status: 'active' }, orgId);
      for (const g of goals) {
        const progress = Number(g.props?.progress || 0) * 100;
        briefing.goals.push({
          name: String(g.props?.name || '未命名目标'),
          progress: Math.round(progress),
          trend: progress > 50 ? 'up' : progress > 20 ? 'stable' : 'down',
        });
      }

      // Alerts (RISK nodes with active status)
      const risks = this.graphStore.queryNodes('Risk', { status: 'active' }, orgId);
      for (const r of risks) {
        briefing.alerts.push({
          description: String(r.props?.riskType || r.props?.name || '未命名风险'),
          priority: (['high', 'critical'].includes(String(r.props?.severity || '')) ? 'high' : 'medium') as 'high' | 'medium' | 'low',
          confidence: Number(r.props?.confidence || 0.5),
        });
      }
      // Sort by priority: high first
      briefing.alerts.sort((a, b) => (b.priority === 'high' ? 3 : b.priority === 'medium' ? 2 : 1) - (a.priority === 'high' ? 3 : a.priority === 'medium' ? 2 : 1));

      // Obstacles (PROCESS nodes with tracking/resolved/stale status)
      const processes = this.graphStore.queryNodes('Process', undefined, orgId);
      for (const p of processes) {
        const status = String(p.props?.processType || 'tracking');
        if (status === 'tracking' || status === 'stale') {
          briefing.obstacles.push({
            description: String(p.props?.name || '未命名问题'),
            status,
          });
        }
      }

      // Recommendations
      if (briefing.alerts.length > 0) {
        briefing.recommendations.push(`${briefing.alerts.length} 个活跃告警需关注`);
      }
      if (briefing.goals.some(g => g.trend === 'down')) {
        briefing.recommendations.push('部分目标进度下降，建议复盘调整');
      }
      if (briefing.obstacles.length > 0) {
        briefing.recommendations.push(`${briefing.obstacles.length} 个遗留问题待解决`);
      }
      if (briefing.recommendations.length === 0) {
        briefing.recommendations.push('今日无异常——组织运行平稳 ✅');
      }

      // Summary
      briefing.summary = `${orgId} · ${briefing.goals.length} 目标 · ${briefing.alerts.length} 告警 · ${briefing.obstacles.length} 问题`;

      log.info({ orgId, goals: briefing.goals.length, alerts: briefing.alerts.length },
        '每日简报已生成');
    } catch (err: any) {
      log.warn({ err }, '简报生成失败');
      briefing.summary = '简报生成异常——请检查数据连接';
    }

    return briefing;
  }

  /** Format briefing as Markdown for IM delivery */
  formatMarkdown(briefing: DailyBriefing): string {
    const lines: string[] = [];
    lines.push(`📊 **Synova 每日简报** — ${briefing.date}`);
    lines.push('');
    lines.push(briefing.summary);
    lines.push('');

    if (briefing.goals.length > 0) {
      lines.push('### 📌 目标进度');
      for (const g of briefing.goals.slice(0, 5)) {
        const bar = '█'.repeat(Math.round(g.progress / 10)) + '░'.repeat(10 - Math.round(g.progress / 10));
        const trend = g.trend === 'up' ? '📈' : g.trend === 'down' ? '📉' : '➡️';
        lines.push(`${trend} ${g.name}: ${bar} ${g.progress}%`);
      }
      lines.push('');
    }

    if (briefing.alerts.length > 0) {
      lines.push('### 🚨 活跃告警');
      for (const a of briefing.alerts.slice(0, 5)) {
        const icon = a.priority === 'high' ? '🔴' : '🟡';
        lines.push(`${icon} ${a.description} (置信度 ${Math.round(a.confidence * 100)}%)`);
      }
      lines.push('');
    }

    if (briefing.obstacles.length > 0) {
      lines.push('### 🔄 遗留问题');
      for (const o of briefing.obstacles.slice(0, 3)) {
        lines.push(`- ${o.description} [${o.status}]`);
      }
      lines.push('');
    }

    lines.push('### 💡 建议');
    for (const r of briefing.recommendations) {
      lines.push(`- ${r}`);
    }

    return lines.join('\n');
  }
}

// ═══ Singleton ═══

let _instance: BriefingGenerator | null = null;
export function getBriefingGenerator(store?: Parameters<typeof BriefingGenerator.prototype.generate>[0] extends string ? never : any): BriefingGenerator {
  if (!_instance) _instance = new BriefingGenerator(store);
  return _instance;
}
