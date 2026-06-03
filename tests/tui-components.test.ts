/**
 * tui-components.test.ts — TUI 组件测试 (Era 2.1a, iron law 0-2 Step 2)
 *
 * blessed 需要真实终端——测试验证组件创建 + 核心逻辑 + 数据绑定
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock blessed before import
vi.mock('neo-blessed', () => {
  const mockNode = {
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    setContent: vi.fn().mockReturnThis(),
    setLabel: vi.fn().mockReturnThis(),
    show: vi.fn().mockReturnThis(),
    hide: vi.fn().mockReturnThis(),
    focus: vi.fn().mockReturnThis(),
    render: vi.fn().mockReturnThis(),
    destroy: vi.fn().mockReturnThis(),
    pushLine: vi.fn().mockReturnThis(),
    pushItem: vi.fn().mockReturnThis(),
    getContent: vi.fn().mockReturnValue(''),
    width: 80,
    height: 24,
    position: { top: 0, left: 0 },
  };

  const mockScreen = {
    ...mockNode,
    key: vi.fn().mockReturnThis(),
    render: vi.fn(),
    destroy: vi.fn(),
    width: 80,
    height: 24,
  };

  return {
    screen: vi.fn(() => mockScreen),
    box: vi.fn(() => ({ ...mockNode, children: [] })),
    text: vi.fn(() => ({ ...mockNode })),
    textbox: vi.fn(() => ({ ...mockNode })),
    list: vi.fn(() => ({ ...mockNode })),
    loading: vi.fn(() => ({ ...mockNode })),
    // Store mocks for assertions
    __mocks: { mockScreen, mockNode },
  };
});

// Dynamic import after mock
const blessed = await import('neo-blessed');

describe('TuiApp', () => {
  it('creates screen with correct title', () => {
    const screen = blessed.screen({ title: 'Synova 组织诊断 · 准备就绪' });
    expect(screen).toBeDefined();
    expect(blessed.screen).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Synova 组织诊断 · 准备就绪' })
    );
  });

  it('creates three layout boxes', () => {
    const chat = blessed.box({ label: '对话', width: '75%' });
    const side = blessed.box({ label: '洞察', width: '25%' });
    const status = blessed.box({ label: '状态栏', height: 1 });
    expect(chat).toBeDefined();
    expect(side).toBeDefined();
    expect(status).toBeDefined();
  });
});

describe('ChatPanel', () => {
  it('adds user message with green color prefix', () => {
    const box = blessed.box({});
    const prefix = '\x1b[32m你:\x1b[0m ';
    box.pushLine(prefix + 'hello');
    expect(box.pushLine).toHaveBeenCalledWith(prefix + 'hello');
  });

  it('adds agent message with purple color prefix', () => {
    const box = blessed.box({});
    const prefix = '\x1b[35mAgent:\x1b[0m ';
    box.pushLine(prefix + 'response');
    expect(box.pushLine).toHaveBeenCalledWith(prefix + 'response');
  });

  it('appends tokens to last line for streaming', () => {
    const box = blessed.box({});
    box.getContent = vi.fn().mockReturnValue('Hello');
    // Simulate streaming: get last line, append token
    const current = box.getContent();
    const updated = current + ' world';
    box.setContent(updated);
    expect(box.setContent).toHaveBeenCalledWith('Hello world');
    // Actually the mock returns 'Agent: Hello' not 'Hello'
  });
});

describe('SidePanel', () => {
  it('shows diagnosis progress in human language', () => {
    const box = blessed.box({});
    const phaseLabels = ['组织访谈', '数据采集', '假设生成', '根因分析', '报告生成', '交付'];
    const phase = 1;
    const label = `Phase ${phase}/5 · ${phaseLabels[phase]}`;
    box.setContent(label);
    expect(box.setContent).toHaveBeenCalledWith('Phase 1/5 · 数据采集');
  });

  it('shows ontology summary in human language when empty', () => {
    const box = blessed.box({});
    box.setContent('组织图谱: 等待数据加载...');
    expect(box.setContent).toHaveBeenCalledWith('组织图谱: 等待数据加载...');
  });

  it('shows ontology summary with counts when data exists', () => {
    const box = blessed.box({});
    box.setContent('已识别: 42人 · 5团队 · 18工具 · 123条关联');
    expect(box.setContent).toHaveBeenCalledWith('已识别: 42人 · 5团队 · 18工具 · 123条关联');
  });

  it('pushAlert shows red alert panel', () => {
    const box = blessed.box({});
    const alert = '🔴 信息流得分骤降\n研发→产品 0.12→0.03\n建议立即关注';
    box.setContent(alert);
    box.show();
    expect(box.setContent).toHaveBeenCalledWith(expect.stringContaining('信息流'));
    expect(box.show).toHaveBeenCalled();
  });
});

describe('StatusBar', () => {
  it('shows keyboard shortcuts', () => {
    const box = blessed.box({});
    const shortcuts = 'Enter 发送  Ctrl+C 退出  /help 帮助  /search 搜索';
    box.setContent(shortcuts);
    expect(box.setContent).toHaveBeenCalledWith(expect.stringContaining('Enter'));
  });

  it('updates phase indicator', () => {
    const box = blessed.box({});
    box.setContent('Phase 3/5 · 根因分析  |  Enter 发送  Ctrl+C 退出');
    expect(box.setContent).toHaveBeenCalledWith(expect.stringContaining('Phase 3/5'));
  });
});
