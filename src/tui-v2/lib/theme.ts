/**
 * tui-v2/lib/theme.ts — 主题系统
 *
 * 对标 CodeWhale ui_theme。
 * 定义完整的颜色调色板，支持深色/浅色/高对比度模式。
 */

export interface Theme {
  name: string;
  // 基础颜色
  surfaceBg: string;
  surfaceFg: string;
  border: string;
  borderFocus: string;
  // 消息颜色
  agent: string;
  user: string;
  system: string;
  alert: string;
  error: string;
  // 状态栏
  statusBar: {
    bg: string;
    fg: string;
    accent: string;
  };
  // 右侧面板
  sidePanel: {
    bg: string;
    header: string;
    running: string;
    done: string;
    failed: string;
    queued: string;
  };
  // 思考过程
  thinking: {
    bg: string;
    fg: string;
    spinner: string;
  };
  // 代码块
  codeBlock: {
    bg: string;
    fg: string;
    border: string;
  };
}

/** Synova 默认深色主题 */
export const DEFAULT_THEME: Theme = {
  name: 'synova-dark',
  surfaceBg: '#0f0f14',
  surfaceFg: '#e0e0e0',
  border: '#2a2a3a',
  borderFocus: '#6c5ce7',
  agent: '#a29bfe',
  user: '#2ecc71',
  system: '#888888',
  alert: '#f39c12',
  error: '#e74c3c',
  statusBar: {
    bg: '#1a1a24',
    fg: '#e0e0e0',
    accent: '#6c5ce7',
  },
  sidePanel: {
    bg: '#12121c',
    header: '#a29bfe',
    running: '#f39c12',
    done: '#2ecc71',
    failed: '#e74c3c',
    queued: '#888888',
  },
  thinking: {
    bg: '#1a1a24',
    fg: '#888888',
    spinner: '#4ecdc4',
  },
  codeBlock: {
    bg: '#12121c',
    fg: '#4ecdc4',
    border: '#2a2a3a',
  },
};

/** 高对比度主题（ accessibility ） */
export const HIGH_CONTRAST_THEME: Theme = {
  name: 'synova-high-contrast',
  surfaceBg: '#000000',
  surfaceFg: '#ffffff',
  border: '#ffffff',
  borderFocus: '#ffff00',
  agent: '#00ffff',
  user: '#00ff00',
  system: '#c0c0c0',
  alert: '#ffff00',
  error: '#ff0000',
  statusBar: {
    bg: '#000000',
    fg: '#ffffff',
    accent: '#ffff00',
  },
  sidePanel: {
    bg: '#000000',
    header: '#00ffff',
    running: '#ffff00',
    done: '#00ff00',
    failed: '#ff0000',
    queued: '#c0c0c0',
  },
  thinking: {
    bg: '#000000',
    fg: '#c0c0c0',
    spinner: '#00ffff',
  },
  codeBlock: {
    bg: '#000000',
    fg: '#00ffff',
    border: '#ffffff',
  },
};

let currentTheme = DEFAULT_THEME;

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  currentTheme = theme;
}

/** 检查终端是否支持真彩色 */
export function supportsTrueColor(): boolean {
  return process.env.COLORTERM === 'truecolor' || process.env.TERM === 'xterm-256color';
}

/** 检查终端是否支持颜色 */
export function supportsColor(): boolean {
  return !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR !== undefined);
}
