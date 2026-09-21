/**
 * l1-interaction/web-adapter.ts — Web ViewAdapter 实现 (Slice C / D590 复活接线)
 *
 * 通过 SSE 响应流与浏览器/桌面端通信。每个 ViewAdapter 方法对应一个 SSE 帧；
 * 帧载荷为自描述对象 `{type, ...}`（桌面端 sse-contract.applySSEEvent 直接可解，
 * 命名对齐 D527 SSEEventType）。帧语义借鉴 dsh-api-gateway open/item/end/error
 * + 心跳范式（零 import，G1 零依赖红线）。
 *
 * 契约（铁律 47）:
 *   @input    — express Response（SSE 目标流）；本类持有具体连接，路由每请求 new 一个
 *   @output   — SSE 帧 `event: <type>\ndata: {json}\n\n` + `: ping` 心跳注释帧（15s，
 *               close/end 后清除）
 *   @degraded — 客户端断开（res close）→ 置 closed 停写 + 停心跳 + 触发 onClosed 钩子
 *               （路由据此感知断线，settle 后仍完整落库——DSH 中断锚语义）；
 *               写入异常仅 log 不抛（引擎流式管线不应因下游断开而崩溃，铁律 24 显式留痕）
 *
 * @since 0.2.0
 */
import type { ViewAdapter } from './types';
import type { Response } from 'express';
import type { DiagnosisEvent } from '../l2-interfaces/diagnosis-engine';
import { createLogger } from '@synova/logger';

const log = createLogger('l1/web-adapter');

/** 心跳注释帧间隔——本机单机无代理场景取 15s（dsh-api-gateway 用 2s 是多跳代理场景） */
const HEARTBEAT_INTERVAL_MS = 15_000;

/** SSE 协议帧载荷（type 自描述；sendFrame 按 payload.type 写 event 行） */
export type SseFramePayload = { type: string } & Record<string, unknown>;

/** 构造选项（D865 P0-1）: deferHeaders = 推迟写 SSE 响应头到首个真实输出——
 * 首轮 LLM 调用违约（InvariantError）时响应头未发出，路由可改写 5xx（fail-closed） */
export interface WebViewAdapterOptions {
  /** true = 建构造时不 flush 头、不启心跳；帧缓冲，ensureActive() 时统一写出 */
  deferHeaders?: boolean;
}

export class WebViewAdapter implements ViewAdapter {
  private res: Response;
  /** 断线/关闭后置 true——停写停心跳（写前检查，防止向已销毁 socket 写入） */
  private closed = false;
  private onClosedCallback: (() => void) | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** D865: 延迟建流模式——activate 前帧缓冲于此，保持发出顺序 */
  private pendingFrames: string[] = [];
  /** D865: 延迟建流模式标记（constructor 设 true，ensureActive 后恒 false） */
  private deferred = false;

  constructor(res: Response, options: WebViewAdapterOptions = {}) {
    this.res = res;
    if (options.deferHeaders === true) {
      this.deferred = true;
      // D865 P0-1: 首轮 LLM 违约前不写头（res.headersSent=false）→ 路由可 5xx fail-closed。
      // 头写出推迟到 ensureActive()（首个 token / 首轮成功后的首帧）。
      res.on('close', () => {
        const wasClosed = this.closed;
        this.closed = true;
        this.clearHeartbeat();
        this.pendingFrames.length = 0;
        if (!wasClosed) {
          log.debug('SSE 连接关闭（延迟建流模式）— 停写停心跳');
          this.onClosedCallback?.();
        }
      });
      res.on('error', (err: Error) => {
        log.debug({ err }, 'SSE 流错误 — 客户端侧连接异常');
      });
      return;
    }
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 心跳注释帧——防代理/负载均衡空闲断连（": " 开头为 SSE 注释，客户端忽略）
    this.heartbeat = setInterval(() => this.writeRaw(': ping\n\n'), HEARTBEAT_INTERVAL_MS);

    // 断线感知——路由经 setOnClosed 注册后续动作（在途轮次 settle 后仍完整落库）
    res.on('close', () => {
      const wasClosed = this.closed;
      this.closed = true;
      this.clearHeartbeat();
      if (!wasClosed) {
        log.debug('SSE 连接关闭 — 停写停心跳');
        this.onClosedCallback?.();
      }
    });
    // 流错误不冒泡为 uncaughtException（半截写入等瞬态，铁律 24：显式记录不空吞）
    res.on('error', (err: Error) => {
      log.debug({ err }, 'SSE 流错误 — 客户端侧连接异常');
    });
  }

  /** 注册断线回调（路由用于感知客户端断开；close 后不再触发） */
  setOnClosed(fn: () => void): void {
    this.onClosedCallback = fn;
  }

  /**
   * D865 P0-1: 延迟建流模式的激活点——写出 SSE 头 + 启心跳 + 按序 flush 缓冲帧。
   * 幂等（非延迟模式或已激活时为 no-op）。路由在首个 token / 首轮成功后的首个帧前调用，
   * 保证首轮 LLM 违约（InvariantError）发生时 res.headersSent===false，可改写 5xx。
   */
  ensureActive(): void {
    if (!this.deferred) return;
    if (this.closed) {
      this.pendingFrames.length = 0;
      return;
    }
    this.deferred = false;
    this.writeSseHeaders();
    this.heartbeat = setInterval(() => this.writeRaw(': ping\n\n'), HEARTBEAT_INTERVAL_MS);
    const buffered = [...this.pendingFrames];
    this.pendingFrames.length = 0;
    for (const frame of buffered) this.writeRaw(frame);
  }

  /** SSE 响应头（延迟建流激活 / close 兜底共用——单源防形态漂移） */
  private writeSseHeaders(): void {
    this.res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.flushHeaders();
  }

  private clearHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private writeRaw(chunk: string): void {
    if (this.closed) return; // 断线停写（中断锚语义：在途轮次由路由继续 settle 落库）
    if (this.deferred) {
      // D865: 延迟建流——头未写出，帧按序缓冲（ensureActive 时统一 flush）
      this.pendingFrames.push(chunk);
      return;
    }
    try {
      this.res.write(chunk);
    } catch (err) {
      log.debug({ err }, 'Web 适配器 SSE 写入失败 — 客户端断开');
    }
  }

  /** 通用协议帧写出（路由侧使用：open/complete/error/end 等；按 payload.type 写 event 行） */
  sendFrame(payload: SseFramePayload): void {
    this.writeRaw(`event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  /** 诊断事件 flat 透传（引擎 DiagnosisEvent 原样入流——桌面 sse-contract 既有类型零改动可解） */
  emitDiagnosisEvent(evt: DiagnosisEvent): void {
    // spread 出新字面量（interface 无隐式索引签名，直接传参会卡 Record<string, unknown>——零 as 断言写法）
    this.sendFrame({ ...evt, type: evt.type });
  }

  // ── ViewAdapter 七方法（帧载荷一律对象帧）──

  showAgentMessage(text: string): void {
    this.sendFrame({ type: 'agent_message', content: text });
  }

  showUserMessage(text: string): void {
    this.sendFrame({ type: 'user_message', content: text });
  }

  appendToken(token: string): void {
    this.sendFrame({ type: 'token', text: token });
  }

  showSystemMessage(text: string): void {
    this.sendFrame({ type: 'system_message', message: text });
  }

  showError(text: string): void {
    this.sendFrame({ type: 'error', code: 'ENGINE_ERROR', message: text });
  }

  setStatus(text: string): void {
    this.sendFrame({ type: 'status', message: text });
  }

  render(): void {
    // Web SSE — no explicit render needed, each event is flushed immediately
  }

  /** Close the SSE connection（终帧由路由发送；本方法只负责 end + 停心跳） */
  close(): void {
    this.clearHeartbeat();
    if (this.closed) return;
    // D865 F1 兜底: 延迟建流且从未激活、且**无人写过响应头**（非不变量错误在首个 token 前抛出时，
    // 路由若只 sendFrame 则帧进缓冲、无人写头、原实现又不 end → 客户端无限等待）。
    // 此处补建流 + 按序 flush 缓冲帧，随后照常 end 收束；路由已接管响应（InvariantError → 5xx
    // JSON 已发头）或已激活建流的情形不进本分支。
    if (this.deferred && !this.res.headersSent) {
      this.deferred = false; // writeRaw 转为直写
      try {
        this.writeSseHeaders();
      } catch (err) {
        log.warn({ err }, 'SSE 延迟建流兜底写头失败 — 继续 end 收束（禁挂死）');
      }
      const buffered = [...this.pendingFrames];
      this.pendingFrames.length = 0;
      for (const frame of buffered) this.writeRaw(frame);
    }
    this.closed = true;
    // D865: 延迟建流且从未激活（如首轮违约路由直接 5xx JSON）——响应由路由终结束，
    // 此处不得再 end（json 已结束响应；重复 end 属协议错误）
    if (this.deferred) {
      this.pendingFrames.length = 0;
      return;
    }
    try {
      this.res.end();
    } catch (err) {
      log.warn({ err }, 'SSE 连接关闭失败 — already closed');
    }
  }
}
