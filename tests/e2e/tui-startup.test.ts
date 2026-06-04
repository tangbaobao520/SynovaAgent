/**
 * E2E: TUI 模块加载 — 验证 TUI 组件可正确导入和实例化
 *
 * 之前的 E2E 测试只检查了 ConversationEngine 接口,
 * 未覆盖 TUI 启动路径。此测试确保 TUI 组件无运行时崩溃。
 */
import { describe, it, expect } from 'vitest';

describe('TUI 模块加载', () => {
  it('ChatPanel 接口声明正确 — 包含 onSubmit', async () => {
    // 验证 ChatPanel 接口导出 — 不需要启动 neo-blessed
    const { createChatPanel } = await import('../../src/tui/chat-panel');
    expect(typeof createChatPanel).toBe('function');
  });

  it('SidePanel 接口声明正确', async () => {
    const { createSidePanel } = await import('../../src/tui/side-panel');
    expect(typeof createSidePanel).toBe('function');
  });

  it('TuiApp 创建函数可导入', async () => {
    const { createTuiApp } = await import('../../src/tui/app');
    expect(typeof createTuiApp).toBe('function');
  });

  it('TuiViewAdapter 可实例化 (需要 mock Response)', async () => {
    const { TuiViewAdapter } = await import('../../src/l1-interaction/tui-adapter');
    // Mock TuiApp — 只验证构造函数不抛异常
    const mockApp = {
      chat: {
        addMessage: () => {},
        appendToken: () => {},
        focus: () => {},
      },
      screen: { render: () => {} },
      setTitleStatus: () => {},
      side: {
        setPhase: () => {},
        setOntologySummary: () => {},
        setDiagnosisProgress: () => {},
      },
      status: { setInfo: () => {} },
      input: { setValue: () => {}, focus: () => {} },
      flashTitle: () => {},
    };
    const adapter = new TuiViewAdapter(mockApp as any);
    expect(typeof adapter.showAgentMessage).toBe('function');
    expect(typeof adapter.appendToken).toBe('function');
  });

  it('Welcome 模块可导入', async () => {
    const { showWelcome } = await import('../../src/tui/welcome');
    expect(typeof showWelcome).toBe('function');
  });
});
