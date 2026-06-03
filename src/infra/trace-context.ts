/**
 * infra/trace-context.ts — 链路追踪上下文 (Phase 1.3a)
 *
 * 参考: OpenClaw diagnostic-trace-context.ts
 *   W3C traceparent format + AsyncLocalStorage + randomTraceId/randomSpanId
 *
 * 每个诊断/对话生成 traceId (32 hex), 贯穿全链路:
 *   LLM调用 → 工具执行 → 诊断结论 → 日志
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

// ═══ Types ═══

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  orgId?: string;
  sessionId?: string;
}

// ═══ AsyncLocalStorage ═══

const traceStorage = new AsyncLocalStorage<TraceContext>();

/** Run a function within a trace context */
export function runWithTrace<T>(ctx: TraceContext, fn: () => T): T {
  return traceStorage.run(ctx, fn);
}

/** Run an async function within a trace context */
export async function runWithTraceAsync<T>(ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
  return traceStorage.run(ctx, fn);
}

/** Get the current trace context (if any) */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

// ═══ ID Generation ═══

/** Generate a W3C-compatible trace ID (32 hex chars) */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** Generate a W3C-compatible span ID (16 hex chars) */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

// ═══ Logger Integration ═══

/** Get trace bindings for pino logger */
export function getTraceBindings(): Record<string, string> {
  const ctx = traceStorage.getStore();
  if (!ctx) return {};
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    ...(ctx.orgId ? { orgId: ctx.orgId } : {}),
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  };
}
