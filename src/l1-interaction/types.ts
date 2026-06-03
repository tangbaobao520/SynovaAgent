/**
 * l1-interaction/types.ts — L1 交互层 ViewAdapter 接口 (Slice C)
 *
 * 统一视图适配器接口。TUI/Web/CLI 各自实现此接口。
 * ConversationEngine 通过此接口与视图通信，不直接耦合具体 UI 框架。
 *
 * 对标 MASTER-REPORT L1 交互层: "TUI/Web/CLI/IM 均为 L1 视图适配器，引擎零感知"
 *
 * @since 0.2.0
 */
export interface ViewAdapter {
  /** 显示 Agent 消息（完整消息，非流式） */
  showAgentMessage(text: string): void;

  /** 显示用户消息 */
  showUserMessage(text: string): void;

  /** 流式追加 token 到当前 Agent 消息 */
  appendToken(token: string): void;

  /** 显示系统消息（状态、提示、进度） */
  showSystemMessage(text: string): void;

  /** 显示错误/告警 */
  showError(text: string): void;

  /** 设置状态栏文本 */
  setStatus(text: string): void;

  /** 触发屏幕渲染 */
  render(): void;
}
