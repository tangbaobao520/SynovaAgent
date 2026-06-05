/**
 * l3/expert-registry.ts — 动态 Expert Agent 注册 (Task 3)
 *
 * 替代硬编码 EXPERT_PROMPTS Record。支持运行时注册新专家类型。
 * ExtensionRegistry 中的 expert 类型扩展通过此注册表注入。
 */
import { createLogger } from '../logger';

const log = createLogger('l3/expert-registry');

const DEFAULT_EXPERT_PROMPTS: Record<string, string> = {
  strategy: '你是企业战略专家。分析组织的战略清晰度、目标对齐度和资源配置有效性。',
  org: '你是组织架构专家。分析团队结构、协作模式和信息流动效率。',
  finance: '你是财务分析专家。分析成本结构、资源利用率和投资回报。',
  tech: '你是技术架构专家。分析工具链效率、技术债务和自动化水平。',
  marketing: '你是市场营销专家。分析市场定位、竞争差异化和增长策略。',
  action: '你是执行力专家。分析行动项的优先级、可行性和预期效果。',
};

export class ExpertRegistry {
  private prompts = new Map<string, string>(Object.entries(DEFAULT_EXPERT_PROMPTS));

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

  /** Remove an expert type */
  unregister(type: string): void {
    // Never remove the 6 defaults
    if (Object.keys(DEFAULT_EXPERT_PROMPTS).includes(type)) return;
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
