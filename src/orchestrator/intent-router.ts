/**
 * orchestrator/intent-router.ts — 意图路由 (Iter 3)
 *
 * 借鉴 Novis L0 Consultant Dialogue Final:
 *   用户输入 → LLM 意图分类 → 9 个分支 (5非诊断 + 4诊断)
 *
 * 分支决定后续行为, 不是简单的问答——不同意图触发不同的对话策略。
 */
import { createLogger } from '../logger';
import type { LLMClient } from './diagnosis-orchestrator';

const log = createLogger('orchestrator/intent-router');

// ═══ Types ═══

export type IntentCategory = 'non_diagnostic' | 'diagnostic';

export type NonDiagnosticIntent =
  | 'greeting'          // 问候
  | 'ask_capability'    // 询问能力
  | 'confusion'         // 困惑/质疑
  | 'show_architecture' // 展示组织架构
  | 'stalling';         // 拖堂检测

export type DiagnosticIntent =
  | 'clear_pain_point'  // 明确痛点
  | 'vague_expression'  // 模糊表达
  | 'org_description'   // 组织描述
  | 'single_issue';     // 单点问题

export type Intent = NonDiagnosticIntent | DiagnosticIntent;

export interface IntentResult {
  intent: Intent;
  category: IntentCategory;
  confidence: number;
  /** 提取的关键信号 (仅 diagnostic 类) */
  signals?: string[];
  /** 建议的维度 (仅 diagnostic 类) */
  suggestedDimensions?: string[];
}

// ═══ Intent Router ═══

const INTENT_CLASSIFICATION_PROMPT = `你是 Synova 组织诊断的意图分类器。
分析用户输入, 分类为以下意图之一。

## 非诊断类 (5种)
- greeting: 问候/打招呼 ("Hi", "你好")
- ask_capability: 询问你能做什么 ("你能做什么", "你怎么用")
- confusion: 困惑/质疑 ("你听不懂吗", "你是不是傻了")
- show_architecture: 用户贴了组织架构描述, 询问分析意见
- stalling: 拖堂/绕圈 (连续两轮相似表达, 回避核心问题)

## 诊断类 (4种)
- clear_pain_point: 明确表达了痛点/问题 ("我们营销不行", "流失率高")
- vague_expression: 表达模糊 ("感觉不太对", "好像有点问题")
- org_description: 描述组织 ("我们在上海和深圳有团队", "我是CTO")
- single_issue: 只说了一个单点问题, 可能忽略了其他维度

## 输出格式 (严格JSON)
{
  "intent": "clear_pain_point",
  "category": "diagnostic",
  "confidence": 0.9,
  "signals": ["流失率", "薪酬"],
  "suggestedDimensions": ["资源约束", "风险瓶颈"]
}`;

export class IntentRouter {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /** Classify user intent */
  async classify(userInput: string, conversationHistory?: string[]): Promise<IntentResult> {
    // Fast-path: keyword detection for obvious cases (zero LLM)
    const fastPath = this.fastPathDetect(userInput);
    if (fastPath) return fastPath;

    // LLM classification for ambiguous cases
    try {
      const context = conversationHistory?.length
        ? `\n对话上下文:\n${conversationHistory.slice(-3).join('\n')}`
        : '';

      const result = await this.llmClient.consult(
        INTENT_CLASSIFICATION_PROMPT,
        `用户输入: "${userInput}"${context}`,
        { temperature: 0.1, maxTokens: 300 },
      );

      const parsed = JSON.parse(result.content) as IntentResult;
      log.debug({ intent: parsed.intent, confidence: parsed.confidence }, '意图分类完成');
      return parsed;
    } catch (err: any) {
      log.warn({ err: err.message, userInput: userInput.slice(0, 80) }, '意图分类失败, 默认为诊断类');
      return { intent: 'vague_expression', category: 'diagnostic', confidence: 0.3 };
    }
  }

  /** Fast-path keyword detection (zero LLM cost) */
  private fastPathDetect(input: string): IntentResult | null {
    const lower = input.toLowerCase().trim();

    if (/^(你好|hi|hello|嗨|在吗|早上好|下午好|晚上好)[\s!！。.]*$/.test(lower)) {
      return { intent: 'greeting', category: 'non_diagnostic', confidence: 0.95 };
    }
    if (/你能做什么|你怎么用|有什么功能|介绍一下/.test(lower)) {
      return { intent: 'ask_capability', category: 'non_diagnostic', confidence: 0.9 };
    }
    if (/听不懂|你不懂|傻子|没用|浪费时间/.test(lower)) {
      return { intent: 'confusion', category: 'non_diagnostic', confidence: 0.85 };
    }

    return null; // Need LLM for finer classification
  }
}
