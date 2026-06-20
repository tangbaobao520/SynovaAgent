/**
 * narrative-generator.ts — 叙事生成器 (PRD §9.3, v3.5)
 * 将哨兵信号翻译为人类可理解的判断文本
 */
import { createLogger } from '../logger';

const log = createLogger('pipeline/narrative-generator');

export interface SignalInput {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  dimension: string;
  value?: string;
  trend?: 'improving' | 'stable' | 'worsening';
}

export function generateNarrative(signals: SignalInput[]): string {
  if (signals.length === 0) return '本周无关键信号。';

  const criticals = signals.filter(s => s.severity === 'critical');
  const warnings = signals.filter(s => s.severity === 'warning');
  const worsens = signals.filter(s => s.trend === 'worsening');

  const lines: string[] = ['## 本周关键发现\n'];

  if (criticals.length > 0) {
    lines.push(`### 🔴 需立即关注 (${criticals.length} 项)`);
    for (const s of criticals) {
      lines.push(`- **${s.title}**: ${s.value || '无额外信息'}。趋势: ${s.trend || '未知'}。`);
    }
  }

  if (warnings.length > 0) {
    lines.push(`\n### 🟡 需关注 (${warnings.length} 项)`);
    for (const s of warnings) {
      lines.push(`- **${s.title}**: ${s.value || '无额外信息'}。`);
    }
  }

  if (worsens.length > 0) {
    lines.push(`\n### 📉 恶化趋势 (${worsens.length} 项)`);
    for (const s of worsens) {
      lines.push(`- ${s.dimension}: ${s.title} 持续恶化。`);
    }
  }

  if (criticals.length === 0 && warnings.length === 0) {
    lines.push('所有监测指标在正常范围内。');
  }

  log.info({ signals: signals.length, criticals: criticals.length }, '叙事已生成');
  return lines.join('\n');
}
