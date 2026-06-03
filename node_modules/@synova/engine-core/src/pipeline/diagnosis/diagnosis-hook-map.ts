/**
 * diagnosis-hook-map.ts — 诊断钩子系统
 *
 * 对标 Claw-Code hook 模式，提供 3 类拦截点：
 *   before_phase  — Phase 进入前，返回 null 中断该 Phase
 *   after_module  — 诊断模块执行后，可修改/丢弃结果
 *   before_report — 报告生成前，可注入/修改报告内容
 *
 * Hook 签名: (ctx) => Promise<ctx | null>，null = 中断
 */

import type { DiagnosisScope, DiagnosisEvidence, ConsultationResult } from './types';

// ====================================================================
// Hook 上下文类型
// ====================================================================

export interface BeforePhaseContext {
  phase: number;
  teamId: string;
  scope?: DiagnosisScope;
  iterationState?: Record<string, unknown>;
}

export interface AfterModuleContext {
  moduleId: string;
  moduleResult: ModuleHookResult;
  teamId: string;
  phase: number;
}

export interface ModuleHookResult {
  evidence?: DiagnosisEvidence[];
  score?: number;
  degraded?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface BeforeReportContext {
  teamId: string;
  draftReport: ConsultationResult;
  phase: number;
}

export interface BeforeToolCallContext {
  toolName: string;
  toolInput: Record<string, unknown>;
  teamId: string;
  phase: number;
  permission: string;
}

export type HookContext = BeforePhaseContext | AfterModuleContext | BeforeReportContext | BeforeToolCallContext;

/** Hook 函数签名：接收上下文，返回修改后的上下文或 null 以中断 */
export type HookFn<C extends HookContext = HookContext> = (ctx: C) => Promise<C | null>;

export type HookKind = 'before_phase' | 'after_module' | 'before_report' | 'before_tool_call';

// ====================================================================
// HookMap
// ====================================================================

export class DiagnosisHookMap {
  private hooks: Map<HookKind, HookFn[]> = new Map([
    ['before_phase', []],
    ['after_module', []],
    ['before_report', []],
    ['before_tool_call', []],
  ]);

  /** 注册一个 hook */
  register(kind: HookKind, fn: HookFn): this {
    this.hooks.get(kind)!.push(fn);
    return this;
  }

  /** 批量注册 */
  registerAll(kind: HookKind, fns: HookFn[]): this {
    for (const fn of fns) {
      this.hooks.get(kind)!.push(fn);
    }
    return this;
  }

  /** 移除指定 hook */
  unregister(kind: HookKind, fn: HookFn): boolean {
    const list = this.hooks.get(kind)!;
    const idx = list.indexOf(fn);
    if (idx >= 0) {
      list.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** 清空某类全部 hook */
  clear(kind: HookKind): void {
    this.hooks.set(kind, []);
  }

  /** 清空全部 hook */
  clearAll(): void {
    for (const kind of this.hooks.keys()) {
      this.hooks.set(kind, []);
    }
  }

  /** 获取某类 hook 数量 */
  count(kind: HookKind): number {
    return this.hooks.get(kind)!.length;
  }

  /** 获取所有 hook 总数 */
  totalCount(): number {
    let n = 0;
    for (const list of this.hooks.values()) n += list.length;
    return n;
  }

  /**
   * 运行指定类型的所有 hook。
   * 按注册顺序串行执行。任一 hook 返回 null 则立即中断，返回 null。
   * 每个 hook 的输出作为下一个 hook 的输入（管道模式）。
   * 返回最终上下文，或 null 表示中断。
   */
  async run<C extends HookContext>(kind: HookKind, ctx: C): Promise<C | null> {
    let current: C | null = ctx;
    for (const fn of this.hooks.get(kind)!) {
      current = await fn(current) as C | null;
      if (current === null) return null; // 中断信号
    }
    return current;
  }

  /** 是否存在某类 hook（用于快速跳过） */
  has(kind: HookKind): boolean {
    return this.hooks.get(kind)!.length > 0;
  }
}
