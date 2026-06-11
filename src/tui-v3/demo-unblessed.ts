/**
 * tui-v3/demo-unblessed.ts — @unblessed/node 最小验证
 *
 * 验证: 独立区域 / 鼠标滚轮 / 流式不闪 / 中文输入
 * 用法: npx tsx src/tui-v3/demo-unblessed.ts
 */
import { initNode, Screen, Box, ScrollableBox, Textbox } from '@unblessed/node';

initNode();

const screen = new Screen({
  smartCSR: true,
  title: 'Synova unblessed 验证',
  fullUnicode: true,
});

// 启用鼠标
(screen as unknown as Record<string, unknown>).program?.enableMouse?.();

// ── Header ──
const header = new Box({
  parent: screen,
  top: 0, left: 0, width: '100%', height: 1,
  style: { bg: '#6c5ce7', fg: 'white' },
  content: ' Synova 验证 — {bold}鼠标滚轮/流式/中文输入{/bold}',
  tags: true,
});

// ── Chat (ScrollableBox = 独立滚动区域) ──
const chat = new ScrollableBox({
  parent: screen,
  top: 1, left: 0, width: '70%', height: '100%-5',
  border: { type: 'line' },
  style: { border: { fg: 'gray' }, fg: 'white' },
  scrollable: true,
  mouse: true,
  keys: true,
  vi: true,
  alwaysScroll: true,
  scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { inverse: true } },
  tags: true,
  content: '{cyan-fg}你好！这是 unblessed 验证 demo。{/cyan-fg}\n\n'
    + '验证项:\n'
    + '1. 鼠标滚轮 → 应能上下滚动此区域 (右边栏不动)\n'
    + '2. 输入框 → 输入中文测试 IME\n\n'
    + Array.from({ length: 25 }, (_, i) => `第 ${i + 1} 行 — 测试滚动 Lorem ipsum dolor sit amet`).join('\n')
    + '\n\n{green-fg}━━━━━━ 底部 ━━━━━━{/green-fg}',
});

// ── Sidebar ──
const sidebar = new Box({
  parent: screen,
  top: 1, left: '70%', width: '30%', height: '100%-5',
  border: { type: 'line' },
  style: { border: { fg: 'gray' }, fg: 'white' },
  tags: true,
  content: '{bold}◆ 增长目标{/bold}\n  营收增长 30%\n\n{bold}▼ 专家分析{/bold}\n  ◆ 战略专家 完成\n  ▶ 组织专家 进行中',
});

// ── Composer ──
const composer = new Textbox({
  parent: screen,
  bottom: 1, left: 0, width: '100%', height: 3,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' }, fg: 'white' },
  inputOnFocus: true,
  keys: true,
  vi: true,
  mouse: true,
});

composer.setContent('输入中文测试 IME ...');

composer.on('submit', (value: string) => {
  const text = value.trim();
  if (!text) return;
  chat.insertBottom(`{green-fg}> {/green-fg}${text}`);
  composer.clearValue();
  // 模拟流式
  simulateStream(chat, `收到: "${text}" — 流式输出测试。观察是否闪烁。`);
});

function simulateStream(box: ScrollableBox, text: string) {
  let idx = 0;
  const chars = text.split('');
  // 插入空行作为流式占位
  const streamLine = box.getLines().length;
  const timer = setInterval(() => {
    if (idx >= chars.length) {
      clearInterval(timer);
      box.insertBottom('');
      screen.render();
      return;
    }
    const current = chars.slice(0, idx + 1).join('');
    // 使用 setContent 更新最后一行
    box.setContent(box.getContent().replace(/█$/, '') + chars[idx]);
    idx++;
    screen.render();
  }, 30);
}

// ── StatusBar ──
const statusbar = new Box({
  parent: screen,
  bottom: 0, left: 0, width: '100%', height: 1,
  style: { bg: '#333', fg: 'white' },
  tags: true,
  content: ' {cyan-fg}增长导航{/cyan-fg} │ deepseek-v4-pro │ Ctrl+C 退出',
});

// ── 键盘 ──
screen.key(['C-c', 'escape', 'q'], () => {
  screen.destroy();
  process.exit(0);
});

// 渲染
chat.focus();
screen.render();
