/**
 * tui/status-bar.ts — 底部状态栏 (对标 CodeWhale Footer)
 *
 * 三芯片: 模式 | 模型 | 费用
 * 快捷键栏在单独一行。
 */
import blessed from 'neo-blessed';
import { getCostTracker, formatCost } from '../services/llm-cost';
import { DIM, CYAN, YELLOW, BOLD, CLOSE } from './color-tags';
const WHITE = BOLD;
const RESET = CLOSE;

export interface StatusBar {
  box: blessed.Widgets.BoxElement;
  /** 更新模式标签 */
  setMode(mode: string): void;
  /** 刷新费用显示 */
  refreshCost(): void;
  /** 设置快捷键提示 */
  setHints(text: string): void;
}

export function createStatusBar(opts: { bottom?: number; height?: number } = {}): StatusBar {
  const box = blessed.box({
    bottom: opts.bottom ?? 0,
    left: 0,
    width: '100%',
    height: opts.height ?? 1,
    style: { bg: 'black', fg: 'white' },
  });

  let currentMode = '增长导航';
  let currentHints = 'Ctrl+C 退出  /setup 配置  /model 切换  /help 帮助';

  function render() {
    const cost = getCostTracker();
    const model = cost.currentModel;
    const session = formatCost(cost.sessionCost);
    const monthly = formatCost(cost.monthlyCost);

    const left = ` ${CYAN}${currentMode}${RESET} ${DIM}│${RESET} ${model} ${DIM}│${RESET} ${YELLOW}本次${RESET} ${session} ${DIM}│${RESET} ${YELLOW}本月${RESET} ${monthly}`;
    const right = `${DIM}${currentHints}${RESET}`;
    // 用空格填充中间
    const totalWidth = (box.width as number) || 80;
    const padLen = Math.max(0, totalWidth - left.replace(/\x1b\[[0-9;]*m/g, '').length - right.replace(/\x1b\[[0-9;]*m/g, '').length);
    box.setContent(left + ' '.repeat(padLen) + right);
  }

  const bar: StatusBar = {
    box,
    setMode(mode) { currentMode = mode; render(); },
    refreshCost() { render(); },
    setHints(text) { currentHints = text; render(); },
  };

  return bar;
}
