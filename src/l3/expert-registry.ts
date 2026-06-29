/**
 * l3/expert-registry.ts — 动态 Expert Agent 注册 (Task 3)
 *
 * 替代硬编码 EXPERT_PROMPTS Record。支持运行时注册新专家类型。
 * ExtensionRegistry 中的 expert 类型扩展通过此注册表注入。
 *
 * Slice 0-1: 每位专家拥有独立的系统提示词，不再共享模板。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l3/expert-registry');


// v3.3 F3: DEFAULT_EXPERT_PROMPTS 已删除 (280行硬编码)。文件优先——加载失败应拒绝启动。

export class ExpertRegistry {
  private prompts = new Map<string, string>(); // v3.3: 从空Map启动——专家由ExpertFileLoader注册

  /** Register a new expert type */
  register(type: string, prompt: string): void {
    this.prompts.set(type, prompt);
    log.info({ type }, '专家类型已注册');
  }

  /** Get expert prompt by type */
  getPrompt(type: string): string | undefined {
    return this.prompts.get(type);
  }

  /** List all registered expert types */
  listTypes(): string[] {
    return [...this.prompts.keys()];
  }

  /** Remove an expert type — v3.3: 允许运行时增删 */
  unregister(type: string): void {
    this.prompts.delete(type);
  }

  /** Get all prompts as a Record (backward compat) */
  toRecord(): Record<string, string> {
    return Object.fromEntries(this.prompts);
  }
}

// Singleton
let _instance: ExpertRegistry | null = null;
export function getExpertRegistry(inject?: ExpertRegistry): ExpertRegistry {
  if (inject) { _instance = inject; return inject; }
  if (!_instance) _instance = new ExpertRegistry();
  return _instance;
}
