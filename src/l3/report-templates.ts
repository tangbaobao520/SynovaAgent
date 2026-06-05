/**
 * l3/report-templates.ts — 报告模板引擎 (Task 12)
 *
 * 简报/诊断报告的不同排版模板。可运行时注册新模板。
 * 当前提供: daily_briefing, weekly_summary, diagnosis_report, executive_summary
 */
import { createLogger } from '../logger';

const log = createLogger('l3/report-templates');

// ═══ Types ═══

export interface ReportTemplate {
  name: string;
  description: string;
  /** 模板渲染函数 */
  render(data: ReportData): string;
}

export interface ReportData {
  orgId: string;
  date: string;
  goals: Array<{ name: string; progress: number; status: string; trend?: string }>;
  alerts: Array<{ description: string; priority: string; confidence: number }>;
  obstacles: Array<{ description: string; status: string }>;
  recommendations: string[];
  extra?: Record<string, unknown>;
}

// ═══ Built-in Templates ═══

const DAILY_BRIEFING: ReportTemplate = {
  name: 'daily_briefing',
  description: '每日简报 — 目标+告警+问题+建议 (Markdown)',
  render(data: ReportData): string {
    const lines: string[] = [];
    lines.push(`## 📊 Synova 每日简报 — ${data.date}`);
    lines.push('');
    lines.push(`**${data.orgId}** · ${data.goals.length} 目标 · ${data.alerts.length} 告警 · ${data.obstacles.length} 问题`);
    lines.push('');

    if (data.goals.length > 0) {
      lines.push('### 📌 目标进度');
      for (const g of data.goals.slice(0, 5)) {
        const bar = '█'.repeat(Math.round(g.progress / 10)) + '░'.repeat(10 - Math.round(g.progress / 10));
        const icon = g.trend === 'up' ? '📈' : g.trend === 'down' ? '📉' : '➡️';
        lines.push(`- ${icon} ${g.name}: ${bar} ${g.progress}% [${g.status}]`);
      }
      lines.push('');
    }

    if (data.alerts.length > 0) {
      lines.push('### 🚨 活跃告警');
      for (const a of data.alerts.slice(0, 5)) {
        lines.push(`- ${a.priority === 'high' ? '🔴' : '🟡'} ${a.description} (置信度 ${Math.round(a.confidence * 100)}%)`);
      }
      lines.push('');
    }

    if (data.obstacles.length > 0) {
      lines.push('### 🔄 遗留问题');
      for (const o of data.obstacles.slice(0, 3)) {
        lines.push(`- ${o.description} [${o.status}]`);
      }
      lines.push('');
    }

    if (data.recommendations.length > 0) {
      lines.push('### 💡 建议');
      data.recommendations.forEach(r => lines.push(`- ${r}`));
    }

    return lines.join('\n');
  },
};

const WEEKLY_SUMMARY: ReportTemplate = {
  name: 'weekly_summary',
  description: '周报 — 本周变化+趋势+对比上周',
  render(data: ReportData): string {
    const lines: string[] = [];
    lines.push(`## 📈 Synova 周报 — ${data.date}`);
    lines.push('');
    lines.push(`**${data.orgId}** · 本周对比上周`);
    lines.push('');

    const goalsUp = data.goals.filter(g => g.trend === 'up').length;
    const goalsDown = data.goals.filter(g => g.trend === 'down').length;
    lines.push(`### 目标趋势`);
    lines.push(`- 📈 改善: ${goalsUp} 项`);
    lines.push(`- 📉 下降: ${goalsDown} 项`);
    lines.push(`- ➡️ 持平: ${data.goals.length - goalsUp - goalsDown} 项`);
    lines.push('');

    if (data.alerts.length > 0) {
      lines.push('### 🚨 本周新增告警');
      data.alerts.slice(0, 5).forEach(a =>
        lines.push(`- ${a.description}`));
      lines.push('');
    }

    const resolved = data.obstacles.filter(o => o.status === 'resolved').length;
    const tracking = data.obstacles.filter(o => o.status === 'tracking').length;
    lines.push(`### 🔄 问题处理`);
    lines.push(`- 已解决: ${resolved}`);
    lines.push(`- 跟踪中: ${tracking}`);
    lines.push('');

    lines.push('### 💡 下周建议');
    data.recommendations.slice(0, 3).forEach(r => lines.push(`- ${r}`));

    return lines.join('\n');
  },
};

const EXECUTIVE_SUMMARY: ReportTemplate = {
  name: 'executive_summary',
  description: '高管摘要 — 一句话结论+Top3+行动',
  render(data: ReportData): string {
    const criticalAlerts = data.alerts.filter(a => a.priority === 'high');
    const summaryLine = criticalAlerts.length > 0
      ? `⚠️ ${data.orgId}: ${criticalAlerts.length} 个高风险项需立即关注`
      : `✅ ${data.orgId}: 运行平稳`;

    const lines: string[] = [];
    lines.push(`## ${summaryLine}`);
    lines.push('');
    lines.push(`**Top 3:**`);
    const topItems = [
      ...data.alerts.slice(0, 2).map(a => `- 🔴 ${a.description}`),
      ...data.goals.filter(g => g.trend === 'down').slice(0, 1).map(g => `- 📉 ${g.name} (${g.progress}%)`),
      ...data.recommendations.slice(0, 1).map(r => `- 💡 ${r}`),
    ];
    topItems.slice(0, 3).forEach(l => lines.push(l));
    lines.push('');
    lines.push(`📎 完整报告: ${data.goals.length} 目标 · ${data.alerts.length} 告警`);
    return lines.join('\n');
  },
};

// ═══ ReportTemplateRegistry ═══

export class ReportTemplateRegistry {
  private templates = new Map<string, ReportTemplate>();

  constructor() {
    for (const t of [DAILY_BRIEFING, WEEKLY_SUMMARY, EXECUTIVE_SUMMARY]) {
      this.templates.set(t.name, t);
    }
  }

  register(template: ReportTemplate): void {
    this.templates.set(template.name, template);
    log.info({ name: template.name }, '报告模板已注册');
  }

  get(name: string): ReportTemplate | undefined {
    return this.templates.get(name);
  }

  list(): ReportTemplate[] {
    return [...this.templates.values()];
  }

  /** Render a report using the named template */
  render(templateName: string, data: ReportData): string {
    const template = this.templates.get(templateName);
    if (!template) return `未找到模板: ${templateName}`;
    try {
      return template.render(data);
    } catch (err: any) {
      log.warn({ err, template: templateName }, '模板渲染失败');
      return `模板渲染失败: ${err.message}`;
    }
  }
}

// ═══ Singleton ═══

let _instance: ReportTemplateRegistry | null = null;
export function getReportTemplateRegistry(inject?: ReportTemplateRegistry): ReportTemplateRegistry {
  if (inject) { _instance = inject; return inject; }
  if (!_instance) _instance = new ReportTemplateRegistry();
  return _instance;
}
