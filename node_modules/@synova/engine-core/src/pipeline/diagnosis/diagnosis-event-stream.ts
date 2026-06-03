/**
 * diagnosis-event-stream.ts — 诊断事件流封装
 *
 * 对标 OpenClaw EventStream：将类型化 DiagnosisEvent 序列化为 SSE 格式，
 * 封装 res.write 细节，提供统一的 write/close/error API。
 *
 * 使用方式：
 *   const stream = new DiagnosisEventStream(res);
 *   stream.write({ type: 'phase_started', phase: 0, timestamp: ... });
 *   stream.close(result);
 */
import type { Response } from 'express';
import type { DiagnosisEvent, ConsultationResult } from './types';

/** SSE 事件流写入器 */
export interface DiagnosisEventWriter {
  /** 写入单个诊断事件 */
  write(event: DiagnosisEvent): void;
  /** 检查流是否已关闭 */
  readonly closed: boolean;
}

/**
 * 诊断事件流 — SSE 序列化封装。
 *
 * 不持有 tracer 轮询逻辑——只负责将事件写入 HTTP 响应。
 * 调用方（diagnosis.ts 路由）负责轮询 tracer 并调用 write()。
 */
export class DiagnosisEventStream implements DiagnosisEventWriter {
  private res: Response;
  private _closed = false;

  constructor(res: Response) {
    this.res = res;
  }

  get closed(): boolean {
    return this._closed || this.res.writableEnded;
  }

  /** 写入单个事件到 SSE 流（JSON 一行一事件） */
  write(event: DiagnosisEvent): void {
    if (this.closed) return;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /** 写入完成事件并关闭流 */
  close(result: ConsultationResult): void {
    if (this.closed) return;
    this._closed = true;
    this.res.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
    this.res.end();
  }

  /** 写入错误事件并关闭流 */
  error(code: string, message: string): void {
    if (this.closed) return;
    this._closed = true;
    this.res.write(`data: ${JSON.stringify({ type: 'error', code, message })}\n\n`);
    this.res.end();
  }

  /** 写入中断事件并关闭流 */
  interrupt(consultId: string): void {
    if (this.closed) return;
    this._closed = true;
    this.res.write(`data: ${JSON.stringify({ type: 'interrupted', consultId })}\n\n`);
    this.res.end();
  }
}
