/**
 * tui/app.ts — SynovaAgent TUI 主入口 (Era 2.1a)
 *
 * 三区布局: 对话(75%) | 洞察(25%) | 状态栏(1行)
 * 键盘路由, 窗口 resize 自适应。
 *
 * 用法: npx tsx src/tui/app.ts
 */
import blessed from 'neo-blessed';
import { createChatPanel } from './chat-panel';
import { createSidePanel } from './side-panel';
import { createStatusBar } from './status-bar';

const BOLD = '\x1b[1m';
const PURPLE = '\x1b[35m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const TITLE_BASE = 'Synova 组织诊断';

export interface TuiApp {
  screen: blessed.Widgets.Screen;
  chat: ReturnType<typeof createChatPanel>;
  side: ReturnType<typeof createSidePanel>;
  status: ReturnType<typeof createStatusBar>;
  input: blessed.Widgets.TextboxElement;
  /** 设置标题状态 */
  setTitleStatus(status: string): void;
  /** 标题栏闪烁（告警时触发） */
  flashTitle(enabled: boolean): void;
}

export function createTuiApp(existingScreen?: blessed.Widgets.Screen): TuiApp {
  const screen = existingScreen || blessed.screen({
    title: `${TITLE_BASE} · 准备就绪`,
    smartCSR: true,
    fullUnicode: true,
    useBCE: true,
  });

  // ── 布局（Claude Code 风格：全宽输入框贯穿底部）──
  // 消息区 + 侧边栏：上方，高度 = 100% - 4（留 4 行给 input + status）
  const chat = createChatPanel({ width: '75%', height: '100%-4' });
  screen.append(chat.box);

  const side = createSidePanel({ left: '75%', width: '25%', height: '100%-4' });
  screen.append(side.box);

  // 分隔线：对话区 ↔ 侧边栏
  const divider = blessed.box({
    left: '75%',
    top: 0,
    width: 1,
    height: '100%-4',
    style: { fg: 'gray', bg: 'gray' },
    content: '',
  });
  screen.append(divider);

  // 全宽输入框：screen 级元素，贯穿整个终端宽度
  const input = blessed.textbox({
    bottom: 1,
    left: 0,
    width: '100%',
    height: 3,
    inputOnFocus: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' }, focus: { border: { fg: 'magenta' } } },
  });
  screen.append(input);

  // ❯ 提示符 — Claude Code 风格
  const prompt = blessed.text({
    bottom: 2,
    left: 2,
    content: '❯',
    style: { fg: 'green', bold: true },
  });
  screen.append(prompt);
  // prompt 不需要交互，但需要跟随 input 渲染
  input.on('focus', () => { screen.render(); });

  // 修复 Windows 下鼠标点击后无法直接输入的问题
  input.on('click', () => {
    input.readInput();
  });

  chat.bindInput(input);  // 绑定输入事件到 chat panel

  // 状态栏：最底部
  const status = createStatusBar({ bottom: 0, height: 1 });
  screen.append(status.box);

  // ── 初始状态 ──
  side.setPhase(0);
  side.setOntologySummary(null);

  // ── 键盘 ──
  let flashInterval: ReturnType<typeof setInterval> | null = null;
  let flashOn = false;

  screen.key(['C-c'], () => {
    if (flashInterval) clearInterval(flashInterval);
    screen.destroy();
    process.exit(0);
  });

  screen.key(['tab'], () => {
    chat.focus();
  });

  // ── resize ──
  screen.on('resize', () => {
    screen.render();
  });

  const app: TuiApp = {
    screen, chat, side, status, input,

    setTitleStatus(status) {
      screen.title = `${TITLE_BASE} · ${status}`;
    },

    flashTitle(enabled) {
      if (enabled && !flashInterval) {
        flashInterval = setInterval(() => {
          flashOn = !flashOn;
          screen.title = flashOn
            ? `⚠ ${TITLE_BASE} · 告警`
            : `${TITLE_BASE} · ⚠ 告警`;
          screen.render();
        }, 800);
      } else if (!enabled && flashInterval) {
        clearInterval(flashInterval);
        flashInterval = null;
        screen.title = `${TITLE_BASE} · 准备就绪`;
      }
    },
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
  app.status.setInfo('Enter 发送  Ctrl+C 退出  /help 帮助');
}
