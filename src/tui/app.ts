/**
 * tui/app.ts — Synova 增长导航 TUI 主布局
 *
 * 对话区(70%) | 右边栏(30%) | 输入框 | 状态栏(模式|模型|费用)
 */
import blessed from 'neo-blessed';
import { createChatPanel } from './chat-panel';
import { createSidePanel } from './side-panel';
import { createStatusBar } from './status-bar';
import { createCommandMenu, type CommandMenu } from './command-menu';

const TITLE_BASE = 'Synova 增长导航';

export interface TuiApp {
  screen: blessed.Widgets.Screen;
  chat: ReturnType<typeof createChatPanel>;
  side: ReturnType<typeof createSidePanel>;
  status: ReturnType<typeof createStatusBar>;
  input: blessed.Widgets.TextboxElement;
  commandMenu: CommandMenu;
  setTitleStatus(status: string): void;
  flashTitle(enabled: boolean): void;
  showSidebar(): void;
}

export function createTuiApp(existingScreen?: blessed.Widgets.Screen): TuiApp {
  const screen = existingScreen || blessed.screen({
    title: `${TITLE_BASE} · 准备就绪`,
    smartCSR: true,
    fullUnicode: true,
    useBCE: true,
  });

  // ── 对话区(68%) + 2%间隙 + 右边栏(30%)，留底部 6 行 ──
  const chat = createChatPanel({ width: '68%', height: '100%-6' });
  screen.append(chat.box);

  const side = createSidePanel({ left: '70%', width: '30%', height: '100%-6' });  // input(5) + status(1)
  screen.append(side.box);

  // 全宽输入框
  const input = blessed.textbox({
    bottom: 1, left: 0, width: '100%', height: 5,  // 2(border) + 3(input) = CodeWhale Comfortable
    inputOnFocus: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' }, focus: { border: { fg: 'magenta' } } },
  });
  screen.append(input);
  input.on('click', () => { (input as { readInput?: () => void }).readInput?.(); });

  chat.bindInput(input);

  // 命令菜单
  const commandMenu = createCommandMenu();
  screen.append(commandMenu.list);
  chat.bindCommandMenu(commandMenu);

  // 状态栏
  const status = createStatusBar({ bottom: 0, height: 1 });
  screen.append(status.box);
  status.setMode('增长导航');
  status.setHints('Ctrl+C 退出  /setup 配置  /model 切换  /help 帮助');

  // ── 键盘 ──
  let flashInterval: ReturnType<typeof setInterval> | null = null;
  let flashOn = false;

  screen.key(['C-c'], () => {
    if (flashInterval) clearInterval(flashInterval);
    screen.destroy();
    process.exit(0);
  });
  // 兜底：stdin 级别的 Ctrl+C（screen.key 在某些终端不触发）
  process.stdin.on('keypress', (_ch, key) => {
    if (key && key.ctrl && key.name === 'c') {
      if (flashInterval) clearInterval(flashInterval);
      screen.destroy();
      process.exit(0);
    }
  });
  screen.key(['tab'], () => { chat.focus(); });
  screen.on('resize', () => { screen.render(); });

  // 右边栏始终可见 (CodeWhale 风格)
  side.box.show();

  const app: TuiApp = {
    screen, chat, side, status, input, commandMenu,

    setTitleStatus(s) { screen.title = `${TITLE_BASE} · ${s}`; },

    flashTitle(enabled) {
      if (enabled && !flashInterval) {
        flashInterval = setInterval(() => {
          flashOn = !flashOn;
          screen.title = flashOn ? `⚠ ${TITLE_BASE} · 告警` : `${TITLE_BASE} · ⚠ 告警`;
          screen.render();
        }, 800);
      } else if (!enabled && flashInterval) {
        clearInterval(flashInterval); flashInterval = null;
        screen.title = `${TITLE_BASE} · 准备就绪`;
      }
    },

    showSidebar() { side.box.show(); screen.render(); },
  };

  screen.render();
  return app;
}

// ═══ 直接运行 ═══
if (require.main === module) {
  const app = createTuiApp();
  app.chat.focus();
  app.chat.onSubmit((text: string) => {
    app.chat.addMessage('user', text);
    setTimeout(() => {
      app.chat.addMessage('agent', `收到："${text}"。这是 TUI 基础框架，对话引擎接入中...`);
      app.screen.render();
    }, 500);
  });
}