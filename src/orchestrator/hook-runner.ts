/**
 * orchestrator/hook-runner.ts — Hook 系统 (Iter 4)
 *
 * 对标 Claw-Code hooks.rs:
 *   PreToolUse — 工具执行前: 权限检查、输入修改、拒绝
 *   PostToolUse — 工具执行后: 证据采集、审计日志
 *   PostToolUseFailure — 工具失败后: 错误记录、降级通知
 *
 * 内置 Hooks: PermissionHook, AuditHook, EvidenceHook, OntologyHook
 */
import { createLogger } from '@synova/logger';

const log = createLogger('orchestrator/hook-runner');

// ═══ Types ═══

export interface ToolCall {
  name: string;
  input: string;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface PreToolUseResult {
  action: 'allow' | 'deny' | 'modify';
  modifiedInput?: string;
  reason?: string;
}

export interface PreToolUseHook {
  name: string;
  onPreToolUse(tool: ToolCall): Promise<PreToolUseResult>;
}

export interface PostToolUseHook {
  name: string;
  onPostToolUse(tool: ToolCall, result: ToolResult): Promise<void>;
}

export interface PostToolUseFailureHook {
  name: string;
  onPostToolUseFailure(tool: ToolCall, error: Error): Promise<void>;
}

// ═══ HookRunner ═══

export class HookRunner {
  private preHooks: PreToolUseHook[] = [];
  private postHooks: PostToolUseHook[] = [];
  private failureHooks: PostToolUseFailureHook[] = [];

  registerPreToolUse(hook: PreToolUseHook): void {
    this.preHooks.push(hook);
    log.debug({ name: hook.name }, 'PreToolUse hook 注册');
  }

  registerPostToolUse(hook: PostToolUseHook): void {
    this.postHooks.push(hook);
    log.debug({ name: hook.name }, 'PostToolUse hook 注册');
  }

  registerPostToolUseFailure(hook: PostToolUseFailureHook): void {
    this.failureHooks.push(hook);
    log.debug({ name: hook.name }, 'PostToolUseFailure hook 注册');
  }

  /** Run all PreToolUse hooks in order. Stops at first deny. */
  async runPreToolUse(tool: ToolCall): Promise<PreToolUseResult> {
    let effectiveInput = tool.input;

    for (const hook of this.preHooks) {
      try {
        const result = await hook.onPreToolUse({ ...tool, input: effectiveInput });
        if (result.action === 'deny') {
          log.warn({ tool: tool.name, hook: hook.name, reason: result.reason }, '工具被拒绝');
          return result;
        }
        if (result.action === 'modify' && result.modifiedInput !== undefined) {
          effectiveInput = result.modifiedInput;
        }
      } catch (err: any) {
        log.error({ err, hook: hook.name, tool: tool.name }, 'PreToolUse hook 异常');
      }
    }

    const wasModified = effectiveInput !== tool.input;
    return { action: wasModified ? 'modify' : 'allow', modifiedInput: wasModified ? effectiveInput : undefined };
  }

  /** Run all PostToolUse hooks */
  async runPostToolUse(tool: ToolCall, result: ToolResult): Promise<void> {
    for (const hook of this.postHooks) {
      try { await hook.onPostToolUse(tool, result); }
      catch (err: any) { log.error({ err, hook: hook.name }, 'PostToolUse hook 异常'); }
    }
  }

  /** Run all failure hooks */
  async runPostToolUseFailure(tool: ToolCall, error: Error): Promise<void> {
    for (const hook of this.failureHooks) {
      try { await hook.onPostToolUseFailure(tool, error); }
      catch (err: any) { log.error({ err, hook: hook.name }, 'PostToolUseFailure hook 异常'); }
    }
  }
}

// ═══ Built-in Hooks ═══

/** Permission check hook — denies dangerous tools */
export function createPermissionHook(allowedTools?: string[]): PreToolUseHook {
  return {
    name: 'permission-check',
    async onPreToolUse(tool) {
      if (allowedTools && !allowedTools.includes(tool.name)) {
        return { action: 'deny', reason: `Tool "${tool.name}" not in allowlist` };
      }
      return { action: 'allow' };
    },
  };
}

/** Evidence collection hook — records tool results as evidence */
export function createEvidenceHook(onEvidence: (toolName: string, content: string) => void): PostToolUseHook {
  return {
    name: 'evidence-collector',
    async onPostToolUse(tool, result) {
      onEvidence(tool.name, result.content);
    },
  };
}

/** Audit logging hook — records all tool executions */
export function createAuditHook(onAudit: (toolName: string, action: string, result: string) => void): PostToolUseHook {
  return {
    name: 'audit-logger',
    async onPostToolUse(tool, result) {
      onAudit(tool.name, 'executed', result.isError ? 'error' : 'success');
    },
  };
}
