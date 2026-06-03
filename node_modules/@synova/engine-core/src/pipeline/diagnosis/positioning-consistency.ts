/**
 * diagnosis/positioning-consistency.ts — 定位三方一致性
 *
 * 核心问题：对外声称、内部共识、客户感知——三方说的是同一个定位吗？
 *
 * 纯代码模块，零 LLM 调用。基于文本相似度计算三方对齐度。
 *   - 三方高度一致 → "定位健康——对外说的、内部信的、客户感知的是同一件事"
 *   - 两方对齐一方偏离 → "部分断裂——{偏离方}的认知与其余两方不一致"
 *   - 三方各说各话 → "定位断裂——公司在市场上没有一致的认知"
 *
 * 理论支撑：定位理论——定位是公司在潜在客户心智中的地位。
 * 如果对外声称≠内部共识≠客户感知，营销投入全是浪费。
 *
 * 关联: ARCH-19 §3.1、category-clarity.ts、differentiation-validation.ts
 */

import { getEngineContext } from '../../engine-context';

// ====================================================================
// Types
// ====================================================================

export interface PositioningConsistencyResult {
  /** 三方对齐度判定 */
  alignment: 'strong' | 'partial' | 'broken';
  /** 对外↔内部 对齐度 0-1 */
  externalInternalAlignment: number;
  /** 对外↔客户 对齐度 0-1 */
  externalCustomerAlignment: number;
  /** 内部↔客户 对齐度 0-1 */
  internalCustomerAlignment: number;
  /** 从各方提取的核心定位词 */
  externalKeywords: string[];
  internalKeywords: string[];
  customerKeywords: string[];
  /** 断裂点描述 */
  gaps: ConsistencyGap[];
  /** 解读 */
  interpretation: string;
}

export interface ConsistencyGap {
  /** 哪一对之间的断裂 */
  pair: 'external-internal' | 'external-customer' | 'internal-customer';
  /** 断裂程度 */
  severity: 'critical' | 'moderate' | 'minor';
  /** 描述 */
  description: string;
}

// ====================================================================
// Config
// ====================================================================

const STRONG_THRESHOLD = 0.25;   // all pairs ≥ 0.25 → strong
const BROKEN_THRESHOLD = 0.08;  // any pair < 0.08 → broken

// ====================================================================
// Public API
// ====================================================================

/**
 * Compute positioning consistency across three audiences.
 *
 * @param externalClaims - What the company says about itself publicly (website, pitch deck, etc.)
 * @param internalDescriptions - How team members describe the company internally
 * @param customerDescriptions - How customers describe the company when asked
 * @returns Consistency result or null if insufficient data
 */
export function computePositioningConsistency(params: {
  externalClaims: string[];
  internalDescriptions: string[];
  customerDescriptions: string[];
}): PositioningConsistencyResult | null {
  const { externalClaims, internalDescriptions, customerDescriptions } = params;
  const log = getEngineContext().logger;

  if (externalClaims.length === 0 && internalDescriptions.length === 0) {
    log.info('[positioning-consistency] 无对外声称或内部描述数据，跳过');
    return null;
  }

  if (externalClaims.length === 0 || internalDescriptions.length === 0 || customerDescriptions.length === 0) {
    log.info('[positioning-consistency] 三方数据不完整（对外%d/内部%d/客户%d），跳过',
      externalClaims.length, internalDescriptions.length, customerDescriptions.length);
    return null;
  }

  // ── 1. Extract positioning keywords from each group ──
  const externalKeywords = extractPositioningTerms(externalClaims);
  const internalKeywords = extractPositioningTerms(internalDescriptions);
  const customerKeywords = extractPositioningTerms(customerDescriptions);

  // ── 2. Compute pairwise alignment using raw texts (character bigram Jaccard) ──
  const extRaw = externalClaims.join(' ');
  const intRaw = internalDescriptions.join(' ');
  const custRaw = customerDescriptions.join(' ');

  const externalInternalAlignment = computeAlignment(extRaw, intRaw);
  const externalCustomerAlignment = computeAlignment(extRaw, custRaw);
  const internalCustomerAlignment = computeAlignment(intRaw, custRaw);

  // ── 3. Classify alignment ──
  const minAlignment = Math.min(externalInternalAlignment, externalCustomerAlignment, internalCustomerAlignment);
  let alignment: PositioningConsistencyResult['alignment'];
  if (minAlignment >= STRONG_THRESHOLD) {
    alignment = 'strong';
  } else if (minAlignment >= BROKEN_THRESHOLD) {
    alignment = 'partial';
  } else {
    alignment = 'broken';
  }

  // ── 4. Identify gaps ──
  const gaps = identifyGaps(
    externalInternalAlignment,
    externalCustomerAlignment,
    internalCustomerAlignment,
    { externalKeywords, internalKeywords, customerKeywords },
  );

  // ── 5. Interpretation ──
  const interpretation = buildInterpretation(alignment, gaps, {
    externalKeywords,
    internalKeywords,
    customerKeywords,
  });

  return {
    alignment,
    externalInternalAlignment: round(externalInternalAlignment),
    externalCustomerAlignment: round(externalCustomerAlignment),
    internalCustomerAlignment: round(internalCustomerAlignment),
    externalKeywords,
    internalKeywords,
    customerKeywords,
    gaps,
    interpretation,
  };
}

// ====================================================================
// Helpers
// ====================================================================

/** Extract positioning-relevant terms from a group of text responses. */
function extractPositioningTerms(responses: string[]): string[] {
  const freq = new Map<string, number>();
  // Bigram → set of token strings it appeared in, accumulated across ALL responses.
  // A bigram is promoted only if it appears in ≥2 different token strings globally.
  const globalBigramTokens = new Map<string, Set<string>>();

  for (const resp of responses) {
    const cleaned = resp
      .replace(/[，。！？、；：""''（）…—–\-\s]+/g, ' ')
      .replace(/[a-zA-Z]+/g, m => ` ${m} `)
      .trim();

    if (!cleaned) continue;

    const tokens = cleaned.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (token.length < 2) continue;
      if (STOP_POSITIONING_WORDS.has(token)) continue;

      // Extract intra-token CJK bigrams from ALL tokens (regardless of
      // length) — long tokens still contain valid positioning bigrams.
      const cjkChars = token.replace(/[a-zA-Z0-9]+/g, '').split('');
      for (let i = 0; i < cjkChars.length - 1; i++) {
        const bigram = cjkChars[i] + cjkChars[i + 1];
        if (STOP_POSITIONING_WORDS.has(bigram) ||
            STOP_POSITIONING_WORDS.has(cjkChars[i]) ||
            STOP_POSITIONING_WORDS.has(cjkChars[i + 1])) {
          continue;
        }
        let tokenSet = globalBigramTokens.get(bigram);
        if (!tokenSet) {
          tokenSet = new Set();
          globalBigramTokens.set(bigram, tokenSet);
        }
        tokenSet.add(token);
      }

      // Only promote the token itself as a keyword if it's reasonably short.
      // Long unsegmented tokens are often full sentences, not positioning terms.
      if (token.length > 8) continue;

      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }

  // Promote bigrams that appear in ≥2 different tokens globally
  for (const [bigram, tokenSet] of globalBigramTokens) {
    if (tokenSet.size >= 2) {
      freq.set(bigram, (freq.get(bigram) ?? 0) + tokenSet.size);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) => term);
}

/**
 * Compute alignment between two text blobs using character 1-gram + 2-gram Jaccard average.
 *
 * CJK issue: pure 2-gram creates cross-word artifacts — "企业级" produces
 * "企业" (real) + "业级" (noise). Averaging with 1-gram compensates:
 *   - 1-gram captures character-level recall (数↔数据 share "数")
 *   - 2-gram captures phrase-level precision ("协同" = exact match)
 *
 * Operates on raw input text, not extracted keywords — avoids top-N selection noise.
 */
function computeAlignment(textA: string, textB: string): number {
  const unigramsA = extractCharUnigrams(textA);
  const unigramsB = extractCharUnigrams(textB);
  const bigramsA = extractCharBigrams(textA);
  const bigramsB = extractCharBigrams(textB);

  const unigramScore = jaccard(unigramsA, unigramsB);
  const bigramScore = jaccard(bigramsA, bigramsB);

  // Average: recall (1-gram) + precision (2-gram)
  return (unigramScore + bigramScore) / 2;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/** Extract character unigrams (individual chars, lowercased). */
function extractCharUnigrams(text: string): string[] {
  const clean = text
    .replace(/[，。！？、；：""''（）…【】《》\s]+/g, '')
    .trim();
  if (clean.length === 0) return [];
  return [...clean].map(c => c.toLowerCase());
}

/** Extract all character bigrams from a string (preserves ASCII for English support). */
function extractCharBigrams(text: string): string[] {
  // Normalize: strip CJK punctuation + collapse whitespace
  const clean = text
    .replace(/[，。！？、；：""''（）…【】《》\s]+/g, '')
    .trim();
  if (clean.length < 2) return [];

  const bigrams: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.push(clean[i].toLowerCase() + clean[i + 1].toLowerCase());
  }
  return bigrams;
}

function identifyGaps(
  ei: number,
  ec: number,
  ic: number,
  keywords: { externalKeywords: string[]; internalKeywords: string[]; customerKeywords: string[] },
): ConsistencyGap[] {
  const gaps: ConsistencyGap[] = [];
  const { externalKeywords, internalKeywords, customerKeywords } = keywords;

  const pairs: Array<{ pair: ConsistencyGap['pair']; score: number; ours: string[]; theirs: string[]; ourLabel: string; theirLabel: string }> = [
    { pair: 'external-internal', score: ei, ours: externalKeywords, theirs: internalKeywords, ourLabel: '对外声称', theirLabel: '内部共识' },
    { pair: 'external-customer', score: ec, ours: externalKeywords, theirs: customerKeywords, ourLabel: '对外声称', theirLabel: '客户感知' },
    { pair: 'internal-customer', score: ic, ours: internalKeywords, theirs: customerKeywords, ourLabel: '内部共识', theirLabel: '客户感知' },
  ];

  for (const { pair, score, ours, theirs, ourLabel, theirLabel } of pairs) {
    if (score >= STRONG_THRESHOLD) continue;

    const severity: ConsistencyGap['severity'] =
      score < BROKEN_THRESHOLD ? 'critical' : score < STRONG_THRESHOLD ? 'moderate' : 'minor';

    const ourSet = new Set(ours);
    const theirSet = new Set(theirs);
    const onlyOurs = ours.filter(t => !theirSet.has(t)).slice(0, 3);
    const onlyTheirs = theirs.filter(t => !ourSet.has(t)).slice(0, 3);

    const desc = onlyOurs.length > 0 && onlyTheirs.length > 0
      ? `${ourLabel}强调"${onlyOurs.join('、')}"，` +
        `但${theirLabel}说的是"${onlyTheirs.join('、')}"——双方用词不同，定位信号断裂。`
      : `${ourLabel}和${theirLabel}之间缺乏共同的核心定位词。`;

    gaps.push({ pair, severity, description: desc });
  }

  return gaps;
}

function buildInterpretation(
  alignment: PositioningConsistencyResult['alignment'],
  gaps: ConsistencyGap[],
  ctx: { externalKeywords: string[]; internalKeywords: string[]; customerKeywords: string[] },
): string {
  const { externalKeywords, internalKeywords, customerKeywords } = ctx;

  const extTop = externalKeywords.slice(0, 3).join('、') || '（无）';
  const intTop = internalKeywords.slice(0, 3).join('、') || '（无）';
  const custTop = customerKeywords.slice(0, 3).join('、') || '（无）';

  switch (alignment) {
    case 'strong':
      return `定位健康：对外声称（${extTop}）、内部共识（${intTop}）、客户感知（${custTop}）三方高度一致。` +
        `市场定位清晰，营销信息没有在传递过程中失真。`;

    case 'partial': {
      const criticalGaps = gaps.filter(g => g.severity === 'critical' || g.severity === 'moderate');
      const gapDesc = criticalGaps.length > 0
        ? `问题：${criticalGaps.map(g => g.description).join('；')}`
        : '';
      return `定位部分一致。对外（${extTop}）、内部（${intTop}）、客户（${custTop}）之间存在偏差。${gapDesc}` +
        `建议：统一对外信息、对内培训和客户沟通中的核心定位词。`;
    }

    case 'broken':
      return `⚠️ 定位断裂：三方各说各话——对外声称"${extTop}"，内部认为"${intTop}"，客户感知"${custTop}"。` +
        `公司在市场上没有一致的认知。这是最高优先级的定位问题——在解决之前，所有营销投入都在制造混乱而非建立品牌。`;
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ====================================================================
// Stop words for positioning term extraction
// ====================================================================

const STOP_POSITIONING_WORDS = new Set([
  // Chinese stop words
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
  '什么', '怎么', '如何', '为什么', '因为', '所以', '但是', '而且', '或者',
  '可以', '应该', '可能', '已经', '还是', '只是', '这个', '那个', '哪个',
  '一下', '一些', '一种', '有点', '比较', '非常', '真的', '特别',
  '觉得', '认为', '感觉', '知道', '想', '让', '把', '被', '对', '从',
  '与', '以', '及', '或', '等', '之', '其', '所', '而', '于', '则',
  '公司', '他们', '我们', '你们', '产品', '服务', '做', '搞', '弄',
  '方面', '还是', '需要', '可以', '通过', '能够', '进行', '提供',
  // English stop words
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'must', 'need',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'this', 'that', 'these', 'those', 'for', 'with', 'from', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'then', 'than', 'too', 'very', 'just',
  'also', 'now', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'both', 'each', 'every', 'more', 'most', 'other', 'some',
  'such', 'only', 'own', 'same', 'so', 'no', 'not', 'up', 'out',
  'if', 'as', 'at', 'by', 'to', 'of', 'in', 'on', 'and', 'but', 'or',
  'its', 'well', 'much', 'any', 'what', 'which',
]);
