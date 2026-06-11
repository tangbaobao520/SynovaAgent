/**
 * diagnosis/differentiation-validation.ts — 差异化实质性验证
 *
 * 核心问题：公司声称的差异化是否被客户感知到？组织能力是否支撑？
 *
 * 混合模块：
 *   纯代码 — 文本相似度计算、组织能力交叉验证
 *   LLM — 语义等价判定（"品质最好" ≈ "他们产品挺靠谱的"）
 *
 * 判定矩阵：
 *   A=B 且 组织支撑  → "差异化可靠"
 *   A=B 但 组织不支撑 → "虚假差异化——组织能力不足以兑现定位"
 *   A≠B            → "定位崩坏——市场感知与公司声称严重偏离"
 *
 * 理论支撑：定位理论——在成熟市场中，"更好"是主观的，"不同"是客观的。
 * 差异化必须有组织能力支撑才不是空话。
 *
 * 关联: ARCH-19 §3.1、category-clarity.ts、positioning-consistency.ts
 */

import type { GapSnapshot } from './types';
import { getEngineContext } from '../../engine-context';

// ====================================================================
// Types
// ====================================================================

export interface DifferentiationValidationResult {
  /** 公司声称的差异化主张 */
  claimedDifferentiation: string;
  /** 从客户感知中提取的关键词/短语 */
  perceivedKeywords: string[];
  /** 文本层面的重叠度 0-1 */
  textOverlap: number;
  /** 语义层面的等价判定（来自 LLM 或降级为 null） */
  semanticEquivalence: boolean | null;
  /** LLM 判定的置信度（仅当 semanticEquivalence 由 LLM 判定时有效） */
  semanticConfidence: number;
  /** 组织能力支撑评估 */
  orgCapabilitySupport: OrgCapabilityCheck;
  /** 最终判定 */
  verdict: 'reliable' | 'fake' | 'collapsed';
  /** 解读 */
  interpretation: string;
  /** 判定方法 */
  method: 'rule' | 'llm_assisted';
  /** 降级标记 */
  degraded: boolean;
}

export interface OrgCapabilityCheck {
  /** 六缝隙维度中与差异化关联的维度是否健康 */
  relevantDimensions: string[];
  /** 关联维度的平均得分 0-10 */
  avgScore: number;
  /** 是否支撑差异化 */
  supports: boolean;
  /** 不支撑的具体原因 */
  gaps: string[];
}

// ====================================================================
// Config
// ====================================================================

const OVERLAP_ALIGNED_THRESHOLD = 0.15; // text overlap >= 0.15 → aligned at text level (CJK-adapted)
const ORG_SCORE_SUPPORT_THRESHOLD = 5;  // avg gap score >= 5 → org supports

// Mapping: differentiation claim types → relevant gap dimensions
// Keys are Chinese keywords found in differentiation claims; values are GapDimension identifiers
const CLAIM_TO_GAPS: Record<string, string[]> = {
  '品质': ['information_flow', 'knowledge_sharing', 'external_interface'],
  '质量': ['information_flow', 'knowledge_sharing', 'external_interface'],
  '速度': ['information_flow', 'division_of_labor', 'authority_governance'],
  '快': ['information_flow', 'division_of_labor', 'authority_governance'],
  '创新': ['knowledge_sharing', 'trust_incentive', 'information_flow'],
  '服务': ['external_interface', 'information_flow', 'trust_incentive'],
  '客户': ['external_interface', 'information_flow', 'trust_incentive'],
  '技术': ['knowledge_sharing', 'information_flow', 'division_of_labor'],
  '效率': ['division_of_labor', 'information_flow', 'authority_governance'],
  '安全': ['authority_governance', 'information_flow', 'trust_incentive'],
  '合规': ['authority_governance', 'information_flow', 'trust_incentive'],
  '定制': ['external_interface', 'knowledge_sharing', 'information_flow'],
  '灵活': ['division_of_labor', 'authority_governance', 'information_flow'],
  '低价': ['division_of_labor', 'information_flow'],
  '性价比': ['division_of_labor', 'information_flow'],
};

// ====================================================================
// Public API
// ====================================================================

/**
 * Validate differentiation substance.
 *
 * @param claimed - The company's claimed differentiation (e.g. "品质最好的协同软件")
 * @param customerPerceptions - Customer descriptions of what makes the company different
 * @param snapshot - Latest gap snapshot for org capability cross-validation
 * @param llmJudge - Optional LLM-based semantic equivalence judge
 * @returns Validation result or null if insufficient data
 */
export function validateDifferentiation(params: {
  claimed: string;
  customerPerceptions: string[];
  snapshot?: GapSnapshot;
  llmJudge?: (a: string, b: string) => Promise<{ equivalent: boolean; confidence: number }>;
}): DifferentiationValidationResult | null {
  const { claimed, customerPerceptions, snapshot, llmJudge } = params;
  const log = getEngineContext().logger;

  if (!claimed || claimed.trim().length === 0) {
    log.info('[differentiation-validation] 未提供差异化主张，跳过');
    return null;
  }

  if (!customerPerceptions || customerPerceptions.length < 2) {
    log.info('[differentiation-validation] 客户感知数据不足（需 ≥2 条），跳过');
    return null;
  }

  const claimedLower = claimed.toLowerCase();

  // ── 1. Extract perceived keywords from customer responses ──
  const perceivedKeywords = extractPerceivedKeywords(customerPerceptions);
  const perceivedText = perceivedKeywords.join(' ');

  // ── 2. Text overlap (cosine-like: Jaccard on character bigrams) ──
  const textOverlap = computeCJKMOverlap(claimed, perceivedText);
  const textAligned = textOverlap >= OVERLAP_ALIGNED_THRESHOLD;

  // ── 3. Semantic equivalence (deferred — computed when LLM available) ──
  // We'll set initial value based on text overlap; caller can refine with LLM
  let semanticEquivalence: boolean | null = null;
  let semanticConfidence = 0;
  let method: 'rule' | 'llm_assisted' = 'rule';

  if (textAligned) {
    // Text overlap suggests alignment; but for CJK this is unreliable
    // We mark it as "rule-based guess" with low confidence
    semanticEquivalence = textAligned;
    semanticConfidence = 0.4; // low confidence — pure rule is weak for CJK semantics
  } else {
    // Low text overlap doesn't rule out semantic equivalence
    // "品质最好" and "东西挺靠谱" have zero character overlap but are semantically close
    semanticEquivalence = null;
    semanticConfidence = 0;
  }

  // ── 4. Organizational capability check ──
  const orgCapabilitySupport = checkOrgCapability(claimedLower, snapshot);

  // ── 5. Verdict ──
  let verdict: DifferentiationValidationResult['verdict'];
  if (semanticEquivalence === true && orgCapabilitySupport.supports) {
    verdict = 'reliable';
  } else if (semanticEquivalence === true && !orgCapabilitySupport.supports) {
    verdict = 'fake';
  } else {
    verdict = 'collapsed';
  }

  // ── 6. Interpretation ──
  const interpretation = buildInterpretation(verdict, {
    claimed,
    perceivedKeywords,
    textOverlap,
    orgCapabilitySupport,
  });

  return {
    claimedDifferentiation: claimed,
    perceivedKeywords,
    textOverlap: Math.round(textOverlap * 1000) / 1000,
    semanticEquivalence,
    semanticConfidence,
    orgCapabilitySupport,
    verdict,
    interpretation,
    method,
    degraded: semanticEquivalence === null,
  };
}

/**
 * Refine differentiation validation with LLM semantic judgment.
 * Call this after initial validation if LLM is available.
 */
export async function refineWithLLM(
  result: DifferentiationValidationResult,
  llmJudge: (a: string, b: string) => Promise<{ equivalent: boolean; confidence: number }>,
): Promise<DifferentiationValidationResult> {
  const perceivedText = result.perceivedKeywords.join('；');
  const judgeResult = await llmJudge(result.claimedDifferentiation, perceivedText);

  result.semanticEquivalence = judgeResult.equivalent;
  result.semanticConfidence = judgeResult.confidence;
  result.method = 'llm_assisted';
  result.degraded = false;

  // Re-evaluate verdict
  if (result.semanticEquivalence && result.orgCapabilitySupport.supports) {
    result.verdict = 'reliable';
  } else if (result.semanticEquivalence && !result.orgCapabilitySupport.supports) {
    result.verdict = 'fake';
  } else {
    result.verdict = 'collapsed';
  }

  result.interpretation = buildInterpretation(result.verdict, {
    claimed: result.claimedDifferentiation,
    perceivedKeywords: result.perceivedKeywords,
    textOverlap: result.textOverlap,
    orgCapabilitySupport: result.orgCapabilitySupport,
  });

  return result;
}

// ====================================================================
// Helpers
// ====================================================================

function extractPerceivedKeywords(responses: string[]): string[] {
  const freq = new Map<string, number>();

  for (const resp of responses) {
    const words = resp
      .replace(/[，。！？、；：""''（）…\s]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

/**
 * Compute character bigram Jaccard similarity between two CJK strings.
 * This is simple but gives reasonable overlap estimates without NLP libraries.
 */
function computeCJKMOverlap(a: string, b: string): number {
  const bigramsA = extractBigrams(a);
  const bigramsB = extractBigrams(b);

  if (bigramsA.length === 0 && bigramsB.length === 0) return 0;

  const setA = new Set(bigramsA);
  const setB = new Set(bigramsB);

  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function extractBigrams(text: string): string[] {
  const clean = text.replace(/[a-zA-Z0-9\s]+/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.push(clean[i] + clean[i + 1]);
  }
  // Also include individual significant chars
  for (const ch of clean) {
    if (ch.charCodeAt(0) > 127) {
      bigrams.push(ch);
    }
  }
  return bigrams;
}

function checkOrgCapability(claimed: string, snapshot?: GapSnapshot): OrgCapabilityCheck {
  if (!snapshot) {
    return {
      relevantDimensions: [],
      avgScore: 0,
      supports: false,
      gaps: ['无组织能力快照数据——无法交叉验证差异化是否有组织支撑'],
    };
  }

  // Determine which dimensions are relevant based on the claimed differentiation
  const relevantDimensions: string[] = [];
  for (const [keyword, dims] of Object.entries(CLAIM_TO_GAPS)) {
    if (claimed.includes(keyword)) {
      for (const d of dims) {
        if (!relevantDimensions.includes(d)) relevantDimensions.push(d);
      }
    }
  }

  // Default: check all gaps if no keyword matched
  if (relevantDimensions.length === 0) {
    relevantDimensions.push(...Object.keys(snapshot.gaps));
  }

  const scores: number[] = [];
  const gaps: string[] = [];

  for (const dim of relevantDimensions) {
    const gap = snapshot.gaps[dim as keyof typeof snapshot.gaps];
    if (gap && typeof gap.engineScore === 'number') {
      scores.push(gap.engineScore);
      if (gap.engineScore < ORG_SCORE_SUPPORT_THRESHOLD) {
        gaps.push(`${dim}得分 ${gap.engineScore}/10，低于支撑阈值 ${ORG_SCORE_SUPPORT_THRESHOLD}`);
      }
    }
  }

  const avgScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  const supports = gaps.length === 0 && scores.length > 0 && avgScore >= ORG_SCORE_SUPPORT_THRESHOLD;

  return { relevantDimensions, avgScore: Math.round(avgScore * 10) / 10, supports, gaps };
}

function buildInterpretation(
  verdict: DifferentiationValidationResult['verdict'],
  ctx: {
    claimed: string;
    perceivedKeywords: string[];
    textOverlap: number;
    orgCapabilitySupport: OrgCapabilityCheck;
  },
): string {
  const { claimed, perceivedKeywords, textOverlap, orgCapabilitySupport } = ctx;

  switch (verdict) {
    case 'reliable':
      return `差异化可靠："${claimed}" 被客户感知到（关键词：${perceivedKeywords.slice(0, 3).join('、')}），` +
        `且组织能力支撑（${orgCapabilitySupport.relevantDimensions.join('、')} 平均得分 ${orgCapabilitySupport.avgScore}/10）。`;

    case 'fake':
      return `⚠️ 虚假差异化：客户感知到了"${claimed}"（文本重叠度 ${(textOverlap * 100).toFixed(0)}%），` +
        `但组织能力不足以支撑这一主张。${orgCapabilitySupport.gaps.join('；')}。` +
        `建议：要么收缩定位承诺，要么投资强化组织能力。`;

    case 'collapsed':
      return `❌ 定位崩坏："${claimed}" 未被客户感知（客户说的是：${perceivedKeywords.slice(0, 4).join('、')}）。` +
        `公司对外声称的和市场实际认知的完全不是一回事。` +
        `这是最高优先级的营销问题——在解决之前，任何获客投入都在浪费预算。`;
  }
}
