/**
 * tui/chat-panel.ts — 对话面板
 *
 * 消息列表 + 输入框 + 斜杠命令菜单 + Markdown 渲染。
 * Agent 紫色 / 用户 绿色 / 系统 灰色 / 告警 红色。
 */
import blessed from 'neo-blessed';
import type { CommandMenu } from './command-menu';
import { renderMarkdown } from './markdown';
import { renderThoughtToggle, resetThought, toggleExpanded, isExpanded, finalizeThought, hasThought, renderThoughtExpanded } from './thinking';
import { DripBuffer } from './streaming';

const PURPLE = '\x1b[35m';
const GREEN = '\x1b[32m';
const GRAY = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

export interface ChatPanel {
  box: blessed.Widgets.BoxElement;
  /** 绑定外部创建的 input（调用方负责将 input append 到 screen） */
  bindInput(input: blessed.Widgets.TextboxElement): void;
  /** 添加消息到对话区 */
  addMessage(role: 'user' | 'agent' | 'system' | 'alert', text: string): void;
  /** 添加原始内容 (不换行，用于 Logo/ASCII art) */
  addRawContent(text: string): void;
  /** 设置初始内容并滚动到顶部 (用于 welcome) */
  setInitialContent(text: string): void;
  /** 流式追加 token */
  appendToken(token: string): void;
  /** 流式结束，渲染 Markdown */
  finishStreaming(): void;
  /** 切换最后一条 Thinking 折叠/展开 */
  toggleThinking(): void;
  /** 聚焦输入框 */
  focus(): void;
  /** 注册输入提交回调: app.chat.onSubmit((text) => { ... }) */
  onSubmit(cb: (text: string) => void): void;
  /** 绑定命令菜单 (输入 / 时弹出) */
  bindCommandMenu(menu: CommandMenu): void;
  /** 输入框引用 (blessed Textbox) */
  readonly input: blessed.Widgets.TextboxElement;
  /** 清空并读取输入框内容 */
  readInput: () => string;
}

export function createChatPanel(opts: { top?: number; left?: number; width?: string; height?: string } = {}): ChatPanel {
  const box = blessed.box({
    top: opts.top ?? 0,
    left: opts.left ?? 0,
    width: opts.width ?? '75%',
    height: opts.height ?? '100%-6',  // 底部 6 行 = input(5) + status(1)
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
  let commandMenu: CommandMenu | null = null;
  let onSubmitCb: ((text: string) => void) | null = null;
  // 流式渲染状态
  let _fullText = '';          // 完整响应文本（finishStreaming 用）
  let _currentLine = '';       // 当前未完成行（appendToken 显示用）
  let _dripBuffer: DripBuffer | null = null;

  function lastIndexOfAgent(): number {
    for (let i = contentLines.length - 1; i >= 0; i--) {
      if (contentLines[i].startsWith(`${PURPLE}Agent:${RESET}`)) return i;
    }
    return -1;
  }

  function readInput(): string {
    if (!input) return '';
    const val = input.getValue() || '';
    input.clearValue();
    input.setValue('');
    // 强制重置 neo-blessed 内部 _reading 标志位
    // 否则第二轮输入时 readInput() 因 _reading===true 而直接 return
    try { (input as { _reading?: boolean })._reading = false; } catch {}
    return val.trim();
  }

  const panel: ChatPanel = {
    box,

    bindInput(extInput: blessed.Widgets.TextboxElement) {
      input = extInput;
      const MIN_HEIGHT = 5;  // CodeWhale Comfortable: 2(border) + 3(input)
      const MAX_HEIGHT = 12; // CodeWhale max: 2(border) + 10(input)

      // 动态调整输入框高度
      const adjustHeight = () => {
        if (!input) return;
        const val = (input as unknown as { getValue?: () => string }).getValue?.() || '';
        const screenWidth = ((input as unknown as { screen: { width: number } }).screen?.width) || 80;
        // 估算需要的行数：字符数 / 可用宽度
        const lines = val.split('\n');
        let needed = lines.length;
        for (const line of lines) {
          needed += Math.floor(line.length / Math.max(screenWidth - 4, 40));
        }
        const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, needed));
        if (((input as unknown as { height: number }).height) !== newH) {
          (input as unknown as { height: number }).height = newH;
          // 调整聊天面板高度：留出 input + status 的空间
          const totalReserved = newH + 1; // input + status bar
          if (typeof box.height === 'string' && box.height.includes('%-')) {
            // 百分比高度无法动态调整，保持原样
          } else {
            box.height = `100%-${totalReserved}`;
          }
          (input as unknown as { screen: { render: () => void } }).screen?.render();
        }
      };

      // 每次按键后检查高度
      const emitter = input as unknown as {
        on: (ev: string, cb: (...args: unknown[]) => void) => void;
        key: (name: string, fn: () => void) => void;
      };
      emitter.on('keypress', () => setImmediate(adjustHeight));

      // CodeWhale 风格: Esc 清空输入 (命令菜单可见时先关闭菜单)
      emitter.key('escape', () => {
        if (commandMenu?.visible) { commandMenu.hide(); }
        input!.clearValue();
        input!.setValue('');
        (input as unknown as { screen: { render: () => void } }).screen.render();
      });

      // neo-blessed Textbox._listener 拦截 Enter → 调 _done → emit 'submit'
      emitter.on('submit', (value: unknown) => {
        const text = typeof value === 'string' ? value.trim() : '';
        // 命令菜单可见 → 选中命令，不走正常提交
        if (commandMenu?.visible) {
          const selected = commandMenu.getSelected();
          if (selected && onSubmitCb) {
            onSubmitCb(selected.cmd);
          }
          commandMenu.hide();
          input!.clearValue();
          input!.setValue('');
          (input as unknown as { height: number }).height = MIN_HEIGHT;
          (input as unknown as { screen: { render: () => void } }).screen.render();
          // readInput() 由外部 app.chat.focus() 统一管理
          return;
        }
        // 正常提交
        if (text && onSubmitCb) {
          onSubmitCb(text);
        }
        input!.clearValue();
        input!.setValue('');
        // 重置高度
        (input as unknown as { height: number }).height = MIN_HEIGHT;
        setImmediate(() => {
          try {
            /* readInput() 已移除 — 由 focus() 统一管理 */
          } catch { /* 静默 */ }
        });
      });
    },

    bindCommandMenu(menu) {
      commandMenu = menu;
      if (!input) return;

      const screen = (input as unknown as { screen: { render: () => void } }).screen;
      const checkSlash = () => {
        const val = (input as unknown as { getValue?: () => string }).getValue?.() || '';
        if (val.startsWith('/') && !commandMenu!.visible) {
          commandMenu!.filter(val);
          screen.render();
        } else if (!val.startsWith('/') && commandMenu!.visible) {
          commandMenu!.hide();
          screen.render();
        } else if (val.startsWith('/') && commandMenu!.visible) {
          commandMenu!.filter(val);
          screen.render();
        }
      };

      // keypress 监听
      const emitter = input as unknown as { on: (ev: string, cb: () => void) => void; key: (name: string, fn: () => void) => void };
      emitter.on('keypress', () => setImmediate(checkSlash));

      // 方向键导航
      emitter.key('up', () => { if (commandMenu!.visible) { commandMenu!.moveUp(); screen.render(); } });
      emitter.key('down', () => { if (commandMenu!.visible) { commandMenu!.moveDown(); screen.render(); } });
      // Escape 清空输入已统一在 bindInput() 处理 — 命令菜单关闭逻辑也移过去
      // Ctrl+O 切换思考块折叠
      const screenEmitter = screen as unknown as { key: (name: string[], fn: () => void) => void };
      screenEmitter.key(['C-o'], () => {
        panel.toggleThinking();
        screen.render();
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
      const now = new Date();
      const ts = `${GRAY}${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}${RESET}`;

      if (role === 'agent') {
        // Thinking 块 + Markdown 回复一体化
        const thought = renderThoughtToggle();
        const formatted = renderMarkdown(text);
        if (thought) {
          for (const line of thought.split('\n')) contentLines.push(line);
        }
        const boxW = (typeof box.width === 'number' && box.width > 10) ? box.width - 4
          : (typeof box.width === 'string') ? Math.floor((box.screen?.width || 80) * parseFloat(box.width) / 100) - 4 : 70;
        // 前缀 + 右对齐时间戳
        const pad = Math.max(0, boxW - `${prefix}${formatted}`.replace(/\x1b\[[0-9;]*m/g, '').length - 6);
        const wrapped = wrapText(`${prefix}${formatted}${' '.repeat(pad)}${ts}`, boxW);
        for (const line of wrapped) contentLines.push(line);
        contentLines.push('');
        box.setContent(contentLines.join('\n'));
        box.setScrollPerc(100);
        lastLine = '';
        finalizeThought();
        resetThought();
      } else if (role === 'user') {
        const boxW2 = (typeof box.width === 'number' && box.width > 10) ? box.width - 4
          : (typeof box.width === 'string') ? Math.floor((box.screen?.width || 80) * parseFloat(box.width) / 100) - 4 : 70;
        const pad = Math.max(0, boxW2 - `${prefix}${text}`.replace(/\x1b\[[0-9;]*m/g, '').length - 6);
        const uLines = wrapText(`${prefix}${text}${' '.repeat(pad)}${ts}`, boxW2);
        for (const line of uLines) contentLines.push(line);
        contentLines.push('');
        box.setContent(contentLines.join('\n'));
        box.setScrollPerc(100);
        lastLine = '';
      } else {
        // system/alert: no markdown
        const boxW = (typeof box.width === 'number' && box.width > 10) ? box.width - 4
          : (typeof box.width === 'string') ? Math.floor((box.screen?.width || 80) * parseFloat(box.width) / 100) - 4 : 70;
        const wrapped = wrapText(`${prefix}${text}`, boxW);
        for (const line of wrapped) contentLines.push(line);
        contentLines.push('');
        box.setContent(contentLines.join('\n'));
        box.setScrollPerc(100);
        lastLine = '';
      }
    },

    addRawContent(text) {
      const lines = text.split('\n');
      for (const line of lines) contentLines.push(line);
      contentLines.push('');
      box.setContent(contentLines.join('\n'));
      box.setScrollPerc(100);
      lastLine = '';
    },

    setInitialContent(text) {
      // 纯文本模式 — 不含 ANSI，避免 Windows 终端渲染垃圾字符
      const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
      const lines = plain.split('\n');
      for (const line of lines) contentLines.push(line);
      contentLines.push('');
      box.setContent(contentLines.join('\n'));
      box.setScrollPerc(0);
      lastLine = '';
    },

    appendToken(token) {
      if (!_dripBuffer) { _dripBuffer = new DripBuffer(70); _fullText = ''; _currentLine = ''; contentLines.push(`${PURPLE}Agent:${RESET} `); }
      _dripBuffer.push(token);
      _fullText += token;
      _currentLine += token;
      // 完整行提交到 contentLines，从 _currentLine 中移除
      const committed = _dripBuffer.commitLines();
      if (committed.length > 0) {
        for (const line of committed) contentLines.push(`${GRAY}${line}${RESET}`);
        _currentLine = _currentLine.slice(_currentLine.lastIndexOf('\n') + 1);
      }
      // 显示: contentLines + 当前未完成行
      box.setContent(contentLines.join('\n') + '\n' + _currentLine);
      box.setScrollPerc(100);
    },

    finishStreaming() {
      if (!_dripBuffer) return;
      _dripBuffer.flush();
      if (_fullText) {
        const agentIdx = lastIndexOfAgent();
        if (agentIdx >= 0) {
          contentLines.splice(agentIdx + 1);
          for (const line of renderMarkdown(_fullText).split('\n')) contentLines.push(line);
        }
      }
      contentLines.push('');
      box.setContent(contentLines.join('\n'));
      box.setScrollPerc(100);
      _fullText = '';
      _currentLine = '';
      _dripBuffer = null;
    },

    toggleThinking() {
      toggleExpanded();
      const agentIdx = lastIndexOfAgent();
      if (agentIdx >= 0 && hasThought()) {
        // 移除旧 thinking 行
        const keep: string[] = [];
        let inThinking = false;
        for (const l of contentLines) {
          if (l.includes('Thought for') || l.includes('Thinking…')) { inThinking = true; continue; }
          if (inThinking && (l.includes('│') || l.includes('┌') || l.includes('└'))) continue;
          inThinking = false;
          keep.push(l);
        }
        // 在 agent 行之前插入新 thinking 行
        let newAgentIdx = -1;
        for (let i = keep.length - 1; i >= 0; i--) { if (keep[i].startsWith(`${PURPLE}Agent:${RESET}`)) { newAgentIdx = i; break; } }
        const newLines = renderThoughtToggle().split('\n');
        for (let i = newLines.length - 1; i >= 0; i--) keep.splice(newAgentIdx, 0, newLines[i]);
        // 更新 contentLines
        contentLines.length = 0;
        for (const l of keep) contentLines.push(l);
        box.setContent(contentLines.join('\n'));
        box.setScrollPerc(100);
      }
    },

    focus() {
      if (!input) return;
      try { process.stdin.setRawMode(true); } catch {}
      // 强制重置 _reading 防止 neo-blessed 内部状态残留
      try { (input as unknown as { _reading?: boolean })._reading = false; } catch {}
      input.focus();
      // inputOnFocus: true 会自动调用 readInput()，此处不再显式调用
    },

    // 保留接口兼容性（TuiApp 需要）
    get input() { return input!; },
    get readInput() { return readInput; },
    get onSubmit() {
      return (cb: (text: string) => void) => { onSubmitCb = cb; };
    },
  };

  return panel;
}

function stripAnsi(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function visibleLen(s: string): number { return stripAnsi(s).length; }

function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(width, 20);
  // 短文本直接返回
  if (visibleLen(text) <= safeWidth) return [text];
  const lines: string[] = [];
  let remaining = text;
  let iter = 0;
  while (visibleLen(remaining) > safeWidth && iter++ < 500) {
    // 在 safeWidth 可见字符处尝试断行（优先空格）
    const plain = stripAnsi(remaining);
    let cutPlain = safeWidth;
    const spaceAt = plain.lastIndexOf(' ', safeWidth);
    if (spaceAt > safeWidth / 2) cutPlain = spaceAt;
    // 映射回 ANSI 字符串的偏移
    let cutAnsi = 0, visibleCount = 0, inEscape = false;
    for (let i = 0; i < remaining.length && visibleCount < cutPlain; i++) {
      if (remaining[i] === '\x1b' && remaining[i + 1] === '[') {
        inEscape = true;
      } else if (inEscape && remaining[i] === 'm') {
        inEscape = false;
      } else if (!inEscape) {
        visibleCount++;
      }
      cutAnsi = i + 1;
    }
    lines.push(remaining.slice(0, cutAnsi));
    remaining = remaining.slice(cutAnsi).trimStart();
  }
  if (remaining.trim()) lines.push(remaining);
  return lines;
}