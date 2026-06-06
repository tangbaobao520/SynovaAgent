/**
 * l2/expert-router.ts — ExpertRouter 协调者
 *
 * L2 编排层。ConvEngine 和 SubAgentCoordinator 之间的唯一路由决策点。
 * 4 层路由: Phase 硬约束 → 关键词快路径 → LLM 分类 → 知识兜底
 *
 * 依赖:
 *   - domain-keywords.ts (Layer 2 关键词表)
 *   - providers/ (Layer 3 LLM 分类)
 *   - orchestrator/subagent-coordinator.ts (接收 ExpertSelection)
 */

import { createLogger } from '../logger';
import { DEFAULT_DOMAIN_KEYWORDS, DOMAIN_EXPERT_MAP } from './domain-keywords';

const log = createLogger('l2/expert-router');

// ═══ Types ═══

/** 专家 ID */
export type ExpertId = 'strategy' | 'org' | 'finance' | 'tech' | 'marketing' | 'action' | 'knowledge';

/** 路由模式 */
export type RouteMode = 'none' | 'selective' | 'all' | 'knowledge';

/** 路由上下文 */
export interface RouteContext {
  phase: number;
  orgSize?: string;
  industry?: string;
  /** 最近 3 轮对话摘要（Layer 3 用） */
  conversationSummary?: string;
}

/** 路由决策结果 */
export interface ExpertSelection {
  mode: RouteMode;
  experts: ExpertId[];
  confidence?: number;
  matchedBy?: 'phase' | 'keyword' | 'llm';
  knowledgeAgent?: boolean;
}

/** Layer 3 LLM 分类器接口（注入依赖） */
export interface LLMClassifier {
  classify(input: string, context: RouteContext): Promise<{ domains: string[]; confidence: number }>;
}

// ═══ Constants ═══

const ALL_EXPERTS: ExpertId[] = ['strategy', 'org', 'finance', 'tech', 'marketing', 'action'];

// ═══ ExpertRouter ═══

export class ExpertRouter {
  private keywords: Record<string, { strong: string[]; weak: string[] }>;
  private llmClassifier?: LLMClassifier;

  constructor(opts?: { keywords?: Record<string, { strong: string[]; weak: string[] }>; llmClassifier?: LLMClassifier }) {
    this.keywords = opts?.keywords || DEFAULT_DOMAIN_KEYWORDS;
    this.llmClassifier = opts?.llmClassifier;
  }

  /**
   * 路由决策入口。
   * 同步返回 Layer 1/2/4 的结果；仅在 Layer 3 异步调用 LLM。
   */
  async route(input: string, context: RouteContext): Promise<ExpertSelection> {
    // ═══ Layer 1: Phase 硬约束 ═══
    if (context.phase === 0) {
      log.debug('Phase 0 — 不调专家');
      return { mode: 'none', experts: [], matchedBy: 'phase' };
    }
    if (context.phase >= 2) {
      log.debug('Phase ≥2 — 全调专家');
      return { mode: 'all', experts: ALL_EXPERTS, knowledgeAgent: true, matchedBy: 'phase' };
    }

    // ═══ Layer 2: 关键词快路径 ═══
    const kwResult = this.keywordMatch(input);
    if (kwResult) {
      log.info({ experts: kwResult.experts, confidence: kwResult.confidence }, '关键词命中');
      return kwResult;
    }

    // ═══ Layer 3: LLM 分类 ═══
    if (this.llmClassifier) {
      try {
        const llmResult = await this.llmClassifier.classify(input, context);
        const expertIds = llmResult.domains
          .map(d => DOMAIN_EXPERT_MAP[d])
          .filter(Boolean) as ExpertId[];
        if (expertIds.length > 0) {
          log.info({ experts: expertIds, confidence: llmResult.confidence }, 'LLM 分类命中');
          return {
            mode: 'selective',
            experts: expertIds,
            confidence: llmResult.confidence,
            matchedBy: 'llm',
          };
        }
      } catch (err: any) {
        log.warn({ err: err.message }, 'LLM 分类失败 — 降级到知识兜底');
      }
    }

    // ═══ Layer 4: 知识检索兜底 ═══
    log.debug('无匹配 — 知识兜底');
    return { mode: 'knowledge', experts: ['knowledge'] };
  }

  /**
   * Layer 2: token 匹配打分。
   * 借鉴 claw-code PortRuntime.route_prompt()：tokenize → 匹配 name/hint → 排序。
   */
  private keywordMatch(input: string): ExpertSelection | null {
    const tokens = input.toLowerCase().split(/[\s,，。！？、]+/).filter(t => t.length > 0);
    const scores = new Map<string, { strong: number; weak: number }>();

    for (const [domain, kw] of Object.entries(this.keywords)) {
      let strong = 0, weak = 0;
      for (const token of tokens) {
        for (const s of kw.strong) { if (token.includes(s)) { strong++; break; } }
        for (const w of kw.weak)   { if (token.includes(w)) { weak++; break; } }
      }
      if (strong + weak > 0) scores.set(domain, { strong, weak });
    }

    if (scores.size === 0) return null;

    // 排序: strong * 2 + weak
    const ranked = [...scores.entries()]
      .sort((a, b) => (b[1].strong * 2 + b[1].weak) - (a[1].strong * 2 + a[1].weak));

    // 置信度: 强匹配越多越确定
    const topScore = ranked[0][1];
    const confidence = Math.min(0.95, topScore.strong * 0.3 + topScore.weak * 0.1);

    // 取前 2 个领域（强匹配 ≥1 或 弱匹配 ≥2）
    const experts = ranked
      .slice(0, 2)
      .filter(([, s]) => s.strong >= 1 || s.weak >= 2)
      .map(([d]) => DOMAIN_EXPERT_MAP[d])
      .filter(Boolean) as ExpertId[];

    if (experts.length === 0) return null;

    return {
      mode: 'selective',
      experts,
      confidence,
      matchedBy: 'keyword',
    };
  }

  /** 更新关键词表（运行时） */
  updateKeywords(domain: string, kw: { strong: string[]; weak: string[] }): void {
    this.keywords[domain] = kw;
  }
}

// ═══ Singleton ═══

let _instance: ExpertRouter | null = null;
export function getExpertRouter(opts?: { keywords?: Record<string, { strong: string[]; weak: string[] }>; llmClassifier?: LLMClassifier }): ExpertRouter {
  if (!_instance) _instance = new ExpertRouter(opts);
  return _instance;
}
