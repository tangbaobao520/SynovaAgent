/**
 * tui/chat-panel.ts — 对话面板
 *
 * 消息列表 + 输入框。支持流式 token 追加。
 * Agent 紫色 / 用户 绿色 / 系统 灰色 / 告警 红色。
 */
import blessed from 'neo-blessed';

const PURPLE = '\x1b[35m';
const GREEN = '\x1b[32m';
const GRAY = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

export interface ChatPanel {
  box: blessed.Widgets.BoxElement;
  /** 绑定外部创建的 input（调用方负责将 input append 到 screen） */
  bindInput(input: blessed.Widgets.TextboxElement): void;
  /** 添加消息到对话区 */
  addMessage(role: 'user' | 'agent' | 'system' | 'alert', text: string): void;
  /** 流式追加 token 到最后一条 Agent 消息 */
  appendToken(token: string): void;
  /** 聚焦输入框 */
  focus(): void;
}

export function createChatPanel(opts: { top?: number; left?: number; width?: string; height?: string } = {}): ChatPanel {
  const box = blessed.box({
    top: opts.top ?? 0,
    left: opts.left ?? 0,
    width: opts.width ?? '75%',
    height: opts.height ?? '100%-4',  // 底部 4 行留给全宽 input + status
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    scrollbar: { ch: ' ', track: { bg: 'cyan' } },
    style: { border: { fg: 'gray' } },
  });

  let lastLine = '';
  const contentLines: string[] = [];
  let input: blessed.Widgets.TextboxElement | null = null;
  let onSubmitCb: ((text: string) => void) | null = null;

  function readInput(): string {
    if (!input) return '';
    const val = input.getValue() || '';
    input.clearValue();
    input.setValue('');
    // 强制重置 neo-blessed 内部 _reading 标志位
    // 否则第二轮输入时 readInput() 因 _reading===true 而直接 return
    try { (input as any)._reading = false; } catch {}
    return val.trim();
  }

  const panel: ChatPanel = {
    box,

    bindInput(extInput: blessed.Widgets.TextboxElement) {
      input = extInput;
      input.key('enter', () => {
        const text = readInput();
        if (text && onSubmitCb) onSubmitCb(text);
      });
    },

    addMessage(role, text) {
      let prefix: string;
      switch (role) {
        case 'user':    prefix = `${GREEN}你:${RESET} `; break;
        case 'agent':   prefix = `${PURPLE}Agent:${RESET} `; break;
        case 'alert':   prefix = `${RED}⚠ ${RESET}`; break;
        case 'system': default: prefix = `${GRAY}${RESET}`; break;
      }
      const boxW = (typeof box.width === 'number' && box.width > 10) ? box.width - 4 : 70;
      const wrapped = wrapText(prefix + text, boxW);
      for (const line of wrapped) {
        contentLines.push(line);
      }
      contentLines.push('');
      box.setContent(contentLines.join('\n'));
      box.setScrollPerc(100);
      lastLine = '';
    },

    appendToken(token) {
      lastLine += token;
      box.setContent(contentLines.join('\n') + '\n' + `${PURPLE}Agent:${RESET} ` + lastLine);
      box.setScrollPerc(100);
    },

    focus() {
      input?.focus();
    },

    // 保留接口兼容性（TuiApp 需要）
    get input() { return input; },
    get readInput() { return readInput; },
    get onSubmit() {
      return (cb: (text: string) => void) => { onSubmitCb = cb; };
    },
  };

  return panel;
}

function wrapText(text: string, width: number): string[] {
  // 防御：非 TTY 环境下 blessed 可能返回 0 或负数宽度
  const safeWidth = Math.max(width, 20);
  if (text.length <= safeWidth) return [text];
  const lines: string[] = [];
  let remaining = text;
  let iterations = 0;
  const MAX_ITER = 500; // 防止死循环
  while (remaining.length > safeWidth && iterations++ < MAX_ITER) {
    let cut = remaining.lastIndexOf(' ', safeWidth);
    if (cut < safeWidth / 2) cut = safeWidth;
    lines.push(remaining.slice(0, cut));
    remaining = '  ' + remaining.slice(cut).trim();
  }
  if (remaining.trim()) lines.push(remaining);
  return lines;
}
