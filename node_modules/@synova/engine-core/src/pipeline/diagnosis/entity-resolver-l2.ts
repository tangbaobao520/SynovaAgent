/**
 * entity-resolver-l2.ts — L2 模糊实体解析 (Phase B7)
 *
 * 对标 ARCH-20 决策3: L2高置信度模糊匹配 → 候选关联 → 人工审核队列。
 * 不确定的关联不自动写入本体图——这是硬边界。
 *
 * 算法: 字符级编辑距离 + 前缀匹配 (Phase B 用纯文本, Phase C 升级为 all-MiniLM-L6-v2 嵌入)
 */
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/entity-resolver-l2');

// ═══ Types ═══

export interface L2Candidate {
  nodeA: string;
  nodeB: string;
  confidence: number;
  reason: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
}

interface L2Node {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

// ═══ Name Similarity (Jaccard on n-grams, lightweight) ═══

export function computeNameSimilarity(nameA: string, nameB: string): number {
  if (nameA === nameB) return 1.0;
  const a = nameA.toLowerCase().replace(/\s+/g, '');
  const b = nameB.toLowerCase().replace(/\s+/g, '');

  // Bigrams for Chinese, character-level for short strings
  const bigrams = (s: string) => {
    const grams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
    for (let i = 0; i < s.length; i++) grams.add(s[i]); // unigrams too
    return grams;
  };

  const ga = bigrams(a);
  const gb = bigrams(b);
  const intersection = [...ga].filter(g => gb.has(g)).length;
  const union = ga.size + gb.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ═══ L2 Candidate Generation ═══

export function generateL2Candidates(
  nodes: L2Node[], threshold: number,
): L2Candidate[] {
  const candidates: L2Candidate[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.type !== b.type) continue;

      const nameA = String(a.props.name || '');
      const nameB = String(b.props.name || '');
      if (!nameA || !nameB) continue;

      const sim = computeNameSimilarity(nameA, nameB);
      if (sim < threshold) continue;

      // Same org, same name, different email → candidate (most common L2 scenario)
      const sameOrg = a.props.orgId && b.props.orgId && a.props.orgId === b.props.orgId;
      const differentEmail = a.props.email && b.props.email && a.props.email !== b.props.email;

      let reason = '';
      if (sameOrg && differentEmail) reason = `同组织 "${nameA}", 不同邮箱 (${a.props.email} vs ${b.props.email})`;
      else if (sameOrg) reason = `同组织 "${nameA}", 相似度 ${sim.toFixed(2)}`;
      else reason = `同名 "${nameA}", 相似度 ${sim.toFixed(2)}`;

      candidates.push({ nodeA: a.id, nodeB: b.id, confidence: sim, reason, status: 'pending', createdAt: now });
    }
  }

  log.info({ candidateCount: candidates.length, threshold }, '[entity-resolver-l2] Scan complete');
  return candidates;
}

// ═══ Human Review Queue ═══

const reviewQueue: L2Candidate[] = [];

export function addToReviewQueue(nodeA: string, nodeB: string, confidence: number, reason: string): void {
  reviewQueue.push({ nodeA, nodeB, confidence, reason, status: 'pending', createdAt: new Date().toISOString() });
}

export function getReviewQueue(status?: L2Candidate['status']): L2Candidate[] {
  if (!status) return [...reviewQueue];
  return reviewQueue.filter(c => c.status === status);
}

export function confirmCandidate(index: number): void {
  if (index >= 0 && index < reviewQueue.length) {
    reviewQueue[index].status = 'confirmed';
    reviewQueue[index].reviewedAt = new Date().toISOString();
  }
}

export function rejectCandidate(index: number): void {
  if (index >= 0 && index < reviewQueue.length) {
    reviewQueue[index].status = 'rejected';
    reviewQueue[index].reviewedAt = new Date().toISOString();
  }
}

export function clearReviewQueue(): void {
  reviewQueue.length = 0;
}
