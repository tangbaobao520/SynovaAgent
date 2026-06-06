/**
 * tui/side-panel.ts — 右边栏 (对标 CodeWhale Sidebar)
 *
 * 四面板堆叠: 增长目标 / 增长障碍 / 专家分析 / 遗留问题
 * 空面板自动折叠，不占空间。
 */
import blessed from 'neo-blessed';

import { BOLD, DIM, GREEN, YELLOW, CYAN, RED, WHITE, CLOSE } from './color-tags';
const B = BOLD; const D = DIM; const G = GREEN; const Y = YELLOW;
/* eslint-disable */ const C = CYAN; const R = RED; const W = WHITE; const X = CLOSE;

// ═══ 数据模型 ═══

export interface GoalData {
  text: string;
  progressPct: number;
  elapsedDays: number;
  totalDays: number;
  phase: number;
}

export interface ObstacleItem {
  name: string;
  status: 'pending' | 'active' | 'resolved';
  confidence?: number;
}

export interface ExpertStatus {
  name: string;
  status: 'done' | 'running' | 'queued' | 'failed';
  elapsed?: string;
}

export interface LegacyIssue {
  title: string;
  foundDate: string;
  status: 'unresolved' | 'in_progress';
}

// ═══ Widget ═══

export interface SidePanel {
  box: blessed.Widgets.BoxElement;
  setGoal(data: GoalData | null): void;
  setObstacles(items: ObstacleItem[]): void;
  setExperts(experts: ExpertStatus[]): void;
  setLegacyIssues(issues: LegacyIssue[]): void;
  refresh(): void;
}

export function createSidePanel(opts: { left?: string; width?: string; height?: string } = {}): SidePanel {
  const box = blessed.box({
    top: 0,
    left: opts.left ?? '75%',
    width: opts.width ?? '25%',
    height: opts.height ?? '100%-6',  // input(5) + status(1)
    style: { fg: 'white' },
    tags: false,
    scrollable: true,
  });

  let goal: GoalData | null = null;
  let obstacles: ObstacleItem[] = [];
  let experts: ExpertStatus[] = [];
  let legacy: LegacyIssue[] = [];

  function buildContent(): string {
    const lines: string[] = [];

    // ── 增长目标 ──
    if (goal) {
      lines.push(`${B}${W}◆ 增长目标${X}`);
      lines.push(`  ${goal.text}`);
      const bar = '█'.repeat(Math.round(goal.progressPct / 10)) + '░'.repeat(10 - Math.round(goal.progressPct / 10));
      lines.push(`  ${C}${bar}${X} ${goal.progressPct}%`);
      lines.push(`  ${D}第 ${goal.elapsedDays} 天 / 共 ${goal.totalDays} 天${X}`);
      lines.push(`  ${D}Phase ${goal.phase}/5${X}`);
      lines.push('');
    }

    // ── 增长障碍 ──
    if (obstacles.length > 0) {
      const actives = obstacles.filter(o => o.status !== 'resolved');
      lines.push(`${B}${W}▼ 增长障碍${X} ${D}(${actives.length}项)${X}`);
      for (const o of obstacles.slice(0, 8)) {
        const icon = o.status === 'resolved' ? `${G}✓${X}` : o.status === 'active' ? `${C}▶${X}` : `${D}○${X}`;
        const conf = o.confidence ? ` ${D}${Math.round(o.confidence * 100)}%${X}` : '';
        lines.push(`  ${icon} ${o.name}${conf}`);
      }
      if (obstacles.length > 8) lines.push(`  ${D}... 还有 ${obstacles.length - 8} 项${X}`);
      lines.push('');
    }

    // ── 专家分析 ──
    if (experts.length > 0) {
      lines.push(`${B}${W}▼ 专家分析${X}`);
      for (const e of experts) {
        let icon: string;
        switch (e.status) {
          case 'done': icon = `${G}◆${X}`; break;
          case 'running': icon = `${C}▶${X}`; break;
          case 'failed': icon = `${R}✕${X}`; break;
          default: icon = `${D}○${X}`;
        }
        const label = e.status === 'done' ? '完成' : e.status === 'running' ? '进行中' : e.status === 'failed' ? '失败' : '排队';
        const elapsed = e.elapsed ? ` ${D}${e.elapsed}${X}` : '';
        lines.push(`  ${icon} ${e.name}  ${D}${label}${X}${elapsed}`);
      }
      lines.push('');
    }

    // ── 遗留问题 ──
    if (legacy.length > 0) {
      lines.push(`${B}${W}▼ 遗留问题${X} ${D}(${legacy.length}项)${X}`);
      for (const l of legacy.slice(0, 5)) {
        const icon = l.status === 'in_progress' ? `${Y}⚡${X}` : `${R}⚡${X}`;
        lines.push(`  ${icon} ${l.title}`);
        lines.push(`    ${D}${l.foundDate} · ${l.status === 'in_progress' ? '进行中' : '未解决'}${X}`);
      }
      if (legacy.length > 5) lines.push(`  ${D}... 还有 ${legacy.length - 5} 项${X}`);
      lines.push('');
    }

    // 空状态
    if (lines.length === 0) {
      lines.push(` ${D}发送消息后开始导航${X}`);
    }

    return lines.join('\n');
  }

  const panel: SidePanel = {
    box,
    setGoal(data) { goal = data; },
    setObstacles(items) { obstacles = items; },
    setExperts(list) { experts = list; },
    setLegacyIssues(issues) { legacy = issues; },
    refresh() { box.setContent(buildContent()); },
  };

  panel.refresh();
  return panel;
}
