/**
 * tui/side-panel.ts — 洞察面板
 *
 * 诊断进度 + 组织图谱 + 告警区。
 * 人类语言：X人 · Y团队 · Z工具 · N条关联
 */
import blessed from 'neo-blessed';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const PHASE_LABELS = ['组织访谈', '数据采集', '假设生成', '根因分析', '报告生成', '交付'];

export interface Alert {
  level: 'critical' | 'warning';
  title: string;
  data: string;
  suggestion: string;
}

export interface SidePanel {
  box: blessed.Widgets.BoxElement;
  setPhase(phase: number): void;
  /** Slice 3.2: 显示诊断进度和模块发现 */
  setDiagnosisProgress(phase: number, label: string, findings: Array<{ moduleId: string; text: string }>): void;
  setOntologySummary(summary: { persons: number; teams: number; tools: number; edges: number } | null): void;
  pushAlert(alert: Alert): void;
  clearAlerts(): void;
}

export function createSidePanel(opts: { top?: number; left?: number; width?: string; height?: string } = {}): SidePanel {
  const box = blessed.box({
    top: opts.top ?? 0,
    left: opts.left ?? '75%',
    width: opts.width ?? '25%',
    height: opts.height ?? '100%-3',
    border: { type: 'line' },
    style: { border: { fg: 'gray' } },
    tags: true,
  });

  const phaseBox = blessed.box({
    top: 1, left: 1, right: 1, height: 4,
    label: ' 诊断进度 ',
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
  });
  box.append(phaseBox);

  const ontologyBox = blessed.box({
    top: 6, left: 1, right: 1, height: 4,
    label: ' 组织图谱 ',
    border: { type: 'line' },
    style: { border: { fg: 'yellow' } },
  });
  box.append(ontologyBox);

  const alertBox = blessed.box({
    top: 11, left: 1, right: 1, height: 6,
    label: ' 告警 ',
    border: { type: 'line' },
    style: { border: { fg: 'gray' } },
    hidden: true,
  });
  box.append(alertBox);

  const alerts: Alert[] = [];

  const panel: SidePanel = {
    box,

    setPhase(phase) {
      const label = PHASE_LABELS[phase] || `Phase ${phase}`;
      const pct = Math.round((phase / 5) * 100);
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      phaseBox.setContent(
        `${BOLD}Phase ${phase}/5${RESET} · ${label}\n` +
        `[${CYAN}${bar}${RESET}] ${pct}%`
      );
    },

    setDiagnosisProgress(phase, label, findings) {
      const phaseLabel = label || PHASE_LABELS[phase] || `Phase ${phase}`;
      const pct = Math.round((phase / 5) * 100);
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

      let content = `${BOLD}Phase ${phase}/5${RESET} · ${phaseLabel}\n`;
      content += `[${CYAN}${bar}${RESET}] ${pct}%\n`;

      if (findings.length > 0) {
        content += '\n' + DIM + '─'.repeat(20) + RESET + '\n';
        for (const f of findings.slice(0, 5)) {
          content += `${YELLOW}▸${RESET} ${f.text.slice(0, 60)}\n`;
        }
        if (findings.length > 5) {
          content += `${DIM}... 还有 ${findings.length - 5} 条发现${RESET}`;
        }
      }
      phaseBox.setContent(content);
    },

    setOntologySummary(summary) {
      if (!summary || (summary.persons === 0 && summary.teams === 0 && summary.tools === 0)) {
        ontologyBox.setContent(`${DIM}等待数据加载...${RESET}`);
      } else {
        ontologyBox.setContent(
          `已识别:\n` +
          `  ${summary.persons}人 · ${summary.teams}团队\n` +
          `  ${summary.tools}工具 · ${summary.edges}条关联`
        );
      }
    },

    pushAlert(alert) {
      alerts.unshift(alert);
      if (alerts.length > 3) alerts.pop();
      const icon = alert.level === 'critical' ? '🔴' : '🟡';
      const content = alerts.map(a =>
        `${icon} ${a.title}\n${DIM}${a.data}${RESET}\n${DIM}${a.suggestion}${RESET}`
      ).join('\n' + '─'.repeat(20) + '\n');
      alertBox.setContent(content);
      alertBox.show();
      alertBox.style.border = { fg: alert.level === 'critical' ? 'red' : 'yellow' };
    },

    clearAlerts() {
      alerts.length = 0;
      alertBox.setContent('');
      alertBox.hide();
      alertBox.style.border = { fg: 'gray' };
    },
  };

  return panel;
}
