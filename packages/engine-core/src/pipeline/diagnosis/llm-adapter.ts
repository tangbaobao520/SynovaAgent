/**
 * llm-adapter.ts — 真实 LLM 适配器
 *
 * 把 engine-core/src/llm-client.ts 的 chat() 适配为
 * DiagnosisOrchestrator 需要的 DiagnosisLLMClient 接口。
 *
 * 对标 Claw-Code ProviderRuntimeClient: 封装实际 API 调用 + 回退链。
 */
import type { DiagnosisLLMClient, LLMResponse } from './diagnosis-orchestrator';

let chatFn: any = null;

/** 注入真实的 chat 函数 (server 启动时调用) */
export function injectLLMClient(chat: (params: any) => Promise<any>): void {
  chatFn = chat;
}

/** 实现 DiagnosisLLMClient 接口的适配器 */
export class RealLLMClient implements DiagnosisLLMClient {
  async consult(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    if (!chatFn) throw new Error('LLM client not injected. Call injectLLMClient() at server startup.');

    const result = await chatFn({
      systemPrompt,
      userMessage,
      temperature: 0.3,
      maxTokens: 4096,
    });

    return {
      content: result.content || result.text || '',
      model: result.model || 'unknown',
    };
  }
}

/** 创建已注入的真实 LLM 客户端 */
export function createRealLLMClient(): DiagnosisLLMClient {
  return new RealLLMClient();
}
