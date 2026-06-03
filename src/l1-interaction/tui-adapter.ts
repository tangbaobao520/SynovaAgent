/**
 * l1-interaction/tui-adapter.ts — TUI ViewAdapter 实现 (Slice C)
 *
 * 包装 neo-blessed TUI 组件，实现 ViewAdapter 接口。
 * ConversationEngine 通过此 adapter 与 TUI 通信，
 * 不直接 import neo-blessed 或操作 TUI 组件。
 *
 * @since 0.2.0
 */
import type { ViewAdapter } from './types';
import type { TuiApp } from '../tui/app';

export class TuiViewAdapter implements ViewAdapter {
  private app: TuiApp;

  constructor(app: TuiApp) {
    this.app = app;
  }

  showAgentMessage(text: string): void {
    this.app.chat.addMessage('agent', text);
  }

  showUserMessage(text: string): void {
    this.app.chat.addMessage('user', text);
  }

  appendToken(token: string): void {
    this.app.chat.appendToken(token);
  }

  showSystemMessage(text: string): void {
    this.app.chat.addMessage('system', text);
  }

  showError(text: string): void {
    this.app.chat.addMessage('alert', text);
  }

  setStatus(text: string): void {
    this.app.setTitleStatus(text);
  }

  render(): void {
    this.app.screen.render();
  }
}
