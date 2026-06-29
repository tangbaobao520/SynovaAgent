/**
 * l4/entity-resolver.ts — 中文实体解析 (Fix 1+2: 拼音 + 语义)
 *
 * Fix 1: 拼音编码替代 Jaccard
 *   - "张翠山" vs "张翠珊" → Jaccard=0, 拼音="zhang cuishan"=100%
 *   - 铁律 29: Jaccard 对中文语义一致性判断接近随机, 必须替换
 *
 * Fix 2: 语义匹配 (Python Bridge → sentence-transformers)
 *   - 拼音无法判定时 (0.65-0.85) → Python Bridge 语义匹配
 *
 * 融合: 0.4*Jaccard + 0.4*Phonetic + 0.2*Semantic(可选)
 * 阈值: auto_merge >= 0.85, review [0.65, 0.85), ignore < 0.65
 */
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import { pinyin } from 'pinyin-pro';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/entity-resolver');

// ═══ Types ═══

interface GraphStoreRO {
  queryNodes(type: string): Array<{id:string, type:string, props:Record<string,unknown>}>;
  queryEdges(type?: string, from?: string, to?: string): Array<{from:string, to:string, type:string}>;
}

export interface EntityMatch {
  entityA: { id:string; type:string };
  entityB: { id:string; type:string };
  textSimilarity: number;
  structuralSimilarity: number;
  fusedScore: number;
  confidence: 'auto_merge' | 'review' | 'ignore';
}

export interface L3ResolutionResult {
  matches: EntityMatch[];
  autoMerged: number;
  queuedForReview: number;
  ignored: number;
}

// ═══ Core ═══

/** Fix 2: L3 resolution with semantic matching for borderline cases */
export async function resolveEntitiesL3(store: GraphStoreRO, graph: string): Promise<L3ResolutionResult> {
  const matches: EntityMatch[] = [];
  const nodeTypes = Object.values(SOGNodeType);

  for (const type of nodeTypes) {
    const nodes = store.queryNodes(type).filter(n => n.props);
    if (nodes.length < 2) continue;

    // Pairwise comparison within same type (blocking)
    for (let i = 0; i < Math.min(nodes.length, 100); i++) {
      for (let j = i + 1; j < Math.min(nodes.length, 100); j++) {
        const textSim = computeTextSimilarity(nodes[i].props, nodes[j].props);
        const structSim = computeStructuralSimilarity(nodes[i].id, nodes[j].id, store);
        const fusedScore = 0.6 * textSim + 0.4 * structSim;

        // Fix 2: Semantic matching for borderline cases [0.65, 0.85)
        let finalScore = fusedScore;
        if (fusedScore >= 0.65 && fusedScore < 0.85) {
          try {
            const semSim = await semanticSimilarity(
              String(nodes[i].props.name || ''),
              String(nodes[j].props.name || ''),
            );
            if (semSim >= 0) {
              finalScore = 0.35 * fusedScore + 0.65 * semSim; // Trust semantic more
            }
          } catch (err) { log.debug({ err }, '语义匹配不可用 — 使用拼音匹配'); }
        }

        let confidence: EntityMatch['confidence'] = 'ignore';
        if (finalScore >= 0.85) confidence = 'auto_merge';
        else if (finalScore >= 0.65) confidence = 'review';

        matches.push({
          entityA: { id: nodes[i].id, type },
          entityB: { id: nodes[j].id, type },
          textSimilarity: Math.round(textSim * 1000) / 1000,
          structuralSimilarity: Math.round(structSim * 1000) / 1000,
          fusedScore: Math.round(fusedScore * 1000) / 1000,
          confidence,
        });
      }
    }
  }

  const autoMerged = matches.filter(m => m.confidence === 'auto_merge').length;
  const queuedForReview = matches.filter(m => m.confidence === 'review').length;
  const ignored = matches.filter(m => m.confidence === 'ignore').length;

  log.info({ autoMerged, queuedForReview, ignored }, 'L3 实体解析完成');
  return { matches, autoMerged, queuedForReview, ignored };
}

// ═══ Fix 1: Phonetic Similarity — pinyin encoding ═══

/** Levenshtein distance for pinyin strings */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Compute phonetic similarity using pinyin */
function phoneticSimilarity(nameA: string, nameB: string): number {
  if (!nameA || !nameB) return 0;
  try {
    // "张翠山" → "zhang cui shan", "张翠珊" → "zhang cui shan" → 100%
    const pyA = pinyin(nameA, { toneType: 'none', type: 'array' }).join(' ');
    const pyB = pinyin(nameB, { toneType: 'none', type: 'array' }).join(' ');
    const dist = levenshteinDistance(pyA, pyB);
    return Math.max(0, 1 - dist / Math.max(pyA.length, pyB.length, 1));
  } catch (err) {
    log.warn({ err }, '实体解析失败 — degraded');
    return 0;
  }
}

// ═══ Text Similarity — Jaccard token overlap (保留作为辅助) ═══

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9一-鿿@._-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0),
  );
}

function jaccardSimilarity(propsA: Record<string,unknown>, propsB: Record<string,unknown>): number {
  const fields = ['name', 'email', 'description', 'role'];
  const tokensA = new Set<string>();
  const tokensB = new Set<string>();

  for (const field of fields) {
    const valA = String(propsA[field] || '');
    const valB = String(propsB[field] || '');
    for (const t of tokenize(valA)) tokensA.add(t);
    for (const t of tokenize(valB)) tokensB.add(t);
  }

  if (tokensA.size === 0 && tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

/** Fix 1+2: Fused text similarity — Jaccard(0.4) + Phonetic(0.4) + Semantic(0.2) */
function computeTextSimilarity(propsA: Record<string,unknown>, propsB: Record<string,unknown>): number {
  const jacSim = jaccardSimilarity(propsA, propsB);
  const nameA = String(propsA.name || '');
  const nameB = String(propsB.name || '');
  const phonSim = phoneticSimilarity(nameA, nameB);

  // If names are identical by pinyin, trust phonetic more
  // If names are very different in pinyin, trust Jaccard more (could be non-name fields)
  const fusedScore = phonSim > 0.8
    ? 0.3 * jacSim + 0.7 * phonSim   // 拼音高匹配 → 很可能是同一个人
    : 0.5 * jacSim + 0.5 * phonSim;  // 拼音低匹配 → 取平均

  return fusedScore;
}

// ═══ Fix 2: Semantic Similarity via Python Bridge ═══

/**
 * Semantic similarity through Python sentence-transformers.
 * Used when phonetic+Jaccard can't decide (score in [0.65, 0.85]).
 * Returns similarity in [0, 1] or -1 if Python Bridge unavailable.
 */
async function semanticSimilarity(textA: string, textB: string): Promise<number> {
  try {
    const { getPythonBridge } = await import('../providers/python-bridge');
    const bridge = getPythonBridge();
    const result = await bridge.run<{ similarity: number }>('nlp.semantic', 'similarity', {
      texts: [textA, textB],
    });
    return result.similarity;
  } catch (err) {
    log.warn({ err }, '语义匹配不可用 — degraded');
    return -1; // Python Bridge unavailable — caller should fall back
  }
}

// ═══ Structural Similarity — neighbor type distribution ═══

function computeStructuralSimilarity(nodeIdA: string, nodeIdB: string, store: GraphStoreRO): number {
  const getNeighborTypes = (nodeId: string): number[] => {
    const edges = [
      ...store.queryEdges(undefined, nodeId, undefined),
      ...store.queryEdges(undefined, undefined, nodeId),
    ];
    // Count neighbor types (14-dim vector)
    const typeCounts = new Map<string, number>();
    for (const e of edges.slice(0, 50)) {
      const neighborId = e.from === nodeId ? e.to : e.from;
      // Simplified: just count edges as proxy
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
    }
    return Object.values(SOGEdgeType).map(et => typeCounts.get(et) || 0);
  };

  const vecA = getNeighborTypes(nodeIdA);
  const vecB = getNeighborTypes(nodeIdB);

  // Cosine similarity
  const dotProduct = vecA.reduce((s, v, i) => s + v * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(vecB.reduce((s, v) => s + v * v, 0));

  if (magA === 0 && magB === 0) return 1; // Both isolated → structurally similar
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}
