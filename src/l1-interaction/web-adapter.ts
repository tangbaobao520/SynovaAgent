/**
 * l1-interaction/web-adapter.ts — Web ViewAdapter 实现 (Slice C)
 *
 * 通过 SSE 响应流与浏览器通信。
 * 每个 ViewAdapter 方法对应一个 SSE event type。
 *
 * @since 0.2.0
 */
import type { ViewAdapter } from './types';
import type { Response } from 'express';

export class WebViewAdapter implements ViewAdapter {
  private res: Response;
  private messageBuffer: string[] = [];

  constructor(res: Response) {
    this.res = res;
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  private emit(type: string, data: string): void {
    try {
      this.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected — ignore
    }
  }

  showAgentMessage(text: string): void {
    this.emit('agent_message', text);
  }

  showUserMessage(text: string): void {
    this.emit('user_message', text);
  }

  appendToken(token: string): void {
    this.messageBuffer.push(token);
    this.emit('token', token);
  }

  showSystemMessage(text: string): void {
    this.emit('system_message', text);
  }

  showError(text: string): void {
    this.emit('error', text);
  }

  setStatus(text: string): void {
    this.emit('status', text);
  }

  render(): void {
    // Web SSE — no explicit render needed, each event is flushed immediately
  }

  /** Close the SSE connection */
  close(): void {
    try { this.res.end(); } catch { /* already closed */ }
  }
}
