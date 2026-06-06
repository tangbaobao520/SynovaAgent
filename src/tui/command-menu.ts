/**
 * tui/command-menu.ts — 斜杠命令菜单 (Claude Code 风格)
 *
 * 输入 / 时弹出在输入框下方，↑↓ 导航，Enter 选中，Esc 取消。
 */
import blessed from 'neo-blessed';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const RESET = '\x1b[0m';

export interface CommandItem {
  cmd: string;
  desc: string;
}

const COMMANDS: CommandItem[] = [
  { cmd: '/setup',   desc: '配置 DeepSeek API Key' },
  { cmd: '/model',   desc: '切换模型 <模型名>' },
  { cmd: '/effort',  desc: '推理强度 off|high|max' },
  { cmd: '/budget',  desc: '预算上限 <金额>' },
  { cmd: '/think',   desc: '展开思考过程' },
  { cmd: '/help',    desc: '查看帮助' },
  { cmd: '/status',  desc: '查看系统状态' },
  { cmd: '/history', desc: '查看对话历史' },
  { cmd: '/search',  desc: '搜索知识库 <关键词>' },
  { cmd: '/upload',  desc: '上传文档 <文件路径>' },
  { cmd: '/quit',    desc: '退出' },
  { cmd: '/update',  desc: '检查更新' },
];

export interface CommandMenu {
  list: ReturnType<typeof blessed.list>;
  /** 根据输入过滤并渲染 */
  filter(prefix: string): void;
  /** 选中的索引 */
  selectedIndex: number;
  /** 上下移动 */
  moveUp(): void;
  moveDown(): void;
  /** 获取当前选中命令 */
  getSelected(): CommandItem | null;
  show(): void;
  hide(): void;
  readonly visible: boolean;
}

export function createCommandMenu(): CommandMenu {
  const list = blessed.list({
    bottom: 2,
    left: 0,
    width: '100%',
    height: 8,
    border: { type: 'line' },
    style: {
      border: { fg: 'gray' },
      selected: { fg: 'white', bg: 'cyan' },
      item: { fg: 'white' },
    },
    keys: false,  // 我们自己控制键盘
    vi: false,
    hidden: true,
    items: [],
  });

  let _visible = false;
  let _items: CommandItem[] = [];
  let _selected = 0;

  const menu: CommandMenu = {
    list,
    selectedIndex: 0,

    filter(prefix: string) {
      const q = prefix.toLowerCase();
      _items = COMMANDS.filter(c => c.cmd.startsWith(q));
      _selected = 0;
      menu.selectedIndex = 0;
      const items = _items.map((c, i) =>
        `${i === _selected ? CYAN : WHITE}${c.cmd}${RESET}  ${DIM}${c.desc}${RESET}`
      );
      list.setItems(items);
      list.show();
      _visible = true;
    },

    moveUp() {
      if (!_visible || _items.length === 0) return;
      _selected = (_selected - 1 + _items.length) % _items.length;
      menu.selectedIndex = _selected;
      _renderItems();
    },

    moveDown() {
      if (!_visible || _items.length === 0) return;
      _selected = (_selected + 1) % _items.length;
      menu.selectedIndex = _selected;
      _renderItems();
    },

    getSelected() {
      return _items[_selected] || null;
    },

    show() {
      list.show();
      _visible = true;
    },

    hide() {
      list.hide();
      _visible = false;
      _items = [];
      _selected = 0;
      menu.selectedIndex = 0;
    },

    get visible() { return _visible; },
  };

  function _renderItems() {
    list.setItems(_items.map((c, i) =>
      `${i === _selected ? CYAN : WHITE}${c.cmd}${RESET}  ${DIM}${c.desc}${RESET}`
    ));
  }

  return menu;
}
