/**
 * tui/status-bar.ts — 底部状态栏
 */
import blessed from 'neo-blessed';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export interface StatusBar {
  box: blessed.Widgets.BoxElement;
  setInfo(text: string): void;
}

export function createStatusBar(opts: { bottom?: number; height?: number } = {}): StatusBar {
  const box = blessed.box({
    bottom: opts.bottom ?? 0,
    left: 0,
    width: '100%',
    height: opts.height ?? 1,
    style: { bg: 'black', fg: 'white' },
  });

  const bar: StatusBar = {
    box,
    setInfo(text) {
      box.setContent(` ${DIM}${text}${RESET}`);
    },
  };

  bar.setInfo('Enter 发送  Ctrl+C 退出  /help 帮助  /search 搜索  /history 历史');
  return bar;
}
