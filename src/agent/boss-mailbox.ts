/**
 * boss-mailbox.ts — 老板信箱 (PRD v1.6 Slice 5)
 *
 * 每周一 9:00 Cron 触发 → 从信号+方案进展生成周报 → 通过飞书/SMTP发送
 * Phase 1: 生成周报文本 (Phase 2: 飞书/SMTP 集成)
 */
import { createLogger } from '../logger';

const log = createLogger('agent/boss-mailbox');

export interface WeeklySignal {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  trend: 'improving' | 'stable' | 'worsening';
}

export interface ActionProgress {
  title: string;
  status: 'completed' | 'in_progress' | 'stalled';
  detail: string;
}

export interface WeeklyReport {
  subject: string;
  signals: WeeklySignal[];
  actions: ActionProgress[];
  needsAttention: string[];
  generatedAt: string;
}

export class BossMailbox {
  /**
   * 生成周报文本
   */
  generateReport(
    orgName: string,
    week: string,
    signals: WeeklySignal[],
    actions: ActionProgress[],
  ): WeeklyReport {
    const worseningSignals = signals.filter(s => s.trend === 'worsening');
    const needsAttention: string[] = [];

    // Auto-detect items needing attention
    for (const s of worseningSignals) {
      needsAttention.push(`${s.title}: ${s.description.slice(0, 80)}`);
    }
    for (const a of actions.filter(a => a.status === 'stalled')) {
      needsAttention.push(`搁置方案: ${a.title} — ${a.detail.slice(0, 60)}`);
    }

    return {
      subject: `Synova 周报 · ${orgName} · ${week}`,
      signals,
      actions,
      needsAttention,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 渲染为邮件文本 (Phase 2: HTML 邮件模板)
   */
  renderText(report: WeeklyReport): string {
    const criticalSignals = report.signals.filter(s => s.severity === 'critical');
    const warningSignals = report.signals.filter(s => s.severity === 'warning');

    let text = `${report.subject}\n\n`;

    text += '一、本周关键信号\n';
    for (const s of criticalSignals) {
      text += `  🔴 ${s.title} (${s.trend})\n    ${s.description}\n`;
    }
    for (const s of warningSignals) {
      text += `  🟡 ${s.title} (${s.trend})\n    ${s.description}\n`;
    }
    if (criticalSignals.length === 0 && warningSignals.length === 0) {
      text += '  ✅ 本周无关键信号\n';
    }

    text += '\n二、正在执行的方案进展\n';
    if (report.actions.length === 0) {
      text += '  （暂无进行中的方案）\n';
    }
    for (const a of report.actions) {
      const icon = a.status === 'completed' ? '✅' : a.status === 'stalled' ? '🔴' : '🟡';
      text += `  ${icon} ${a.title} — ${a.detail}\n`;
    }

    text += '\n三、需要你关注的事\n';
    if (report.needsAttention.length === 0) {
      text += '  本周无特别需要关注的事项\n';
    }
    for (const n of report.needsAttention) {
      text += `  · ${n}\n`;
    }

    text += '\n— Synova Agent 自动生成';
    return text;
  }

  /**
   * v3.5 PRD §12.4: 飞书 Webhook 推送
   * @param report 周报对象
   * @param webhookUrl 飞书机器人 webhook URL
   */
  async pushToFeishu(report: WeeklyReport, webhookUrl: string): Promise<boolean> {
    try {
      const text = this.renderText(report);
      const payload = {
        msg_type: 'text',
        content: { text },
      };
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        log.warn({ status: response.status }, '飞书推送失败');
        return false;
      }
      log.info({ subject: report.subject }, '飞书推送成功');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '飞书推送异常');
      return false;
    }
  }
}
