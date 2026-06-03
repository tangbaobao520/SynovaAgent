/**
 * evidence/index.ts — 证据池统一入口 (Phase 2.1)
 *
 * EvidenceCollector → EvidenceStore → CorroborationEngine → ConfidenceScorer
 * 诊断报告: 每个结论附带证据链 + 可溯源
 */
export { EvidenceStore } from './evidence-store';
export type { Evidence, EvidenceFilter, EvidenceSource, ContradictionSignal, CorroborationResult } from './types';

import type { Evidence, EvidenceFilter, ContradictionSignal, CorroborationResult } from './types';
import { EvidenceStore } from './evidence-store';
import { createLogger } from '../logger';

const log = createLogger('evidence');

// ═══ EvidenceCollector ═══

export class EvidenceCollector {
  constructor(private store: EvidenceStore) {}

  /** Collect a single evidence item */
  collect(evidence: Evidence): void {
    this.store.add(evidence);
  }

  /** Query evidence by filter */
  query(filter: EvidenceFilter): Evidence[] {
    return this.store.query(filter);
  }

  /** Batch collect from interview text */
  collectFromInterview(orgId: string, sessionId: string, userMessages: string[]): void {
    for (const msg of userMessages) {
      const evidence: Evidence = {
        id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        source: 'interviewee',
        sourceId: orgId,
        type: 'interview_response',
        content: msg.slice(0, 2000),
        confidence: 0.8, // Human response — high confidence
        collectedAt: new Date().toISOString(),
        orgId,
        sessionId,
      };
      this.store.add(evidence);
    }
    log.info({ orgId, count: userMessages.length }, '访谈证据已采集');
  }
}

// ═══ CorroborationEngine ═══

export class CorroborationEngine {
  constructor(private store: EvidenceStore) {}

  /** Detect contradictions between evidence items (same type, different content) */
  detectContradictions(filter: EvidenceFilter): ContradictionSignal[] {
    const evidence = this.store.query({ ...filter, limit: 100 });
    const contradictions: ContradictionSignal[] = [];

    // P2-06: 按 type 分组 — O(n²) → O(k * (n/k)²), k = 类型数
    const byType = new Map<string, typeof evidence>();
    for (const e of evidence) {
      const group = byType.get(e.type) || [];
      group.push(e);
      byType.set(e.type, group);
    }

    for (const [, group] of byType) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const diff = Math.abs(group[i].confidence - group[j].confidence);
          if (diff > 0.3) {
            contradictions.push({
              evidenceA: group[i],
              evidenceB: group[j],
              scoreDifference: diff,
              description: `${group[i].type}: 证据 "${group[i].content.slice(0, 60)}..." (置信度 ${group[i].confidence}) 与 "${group[j].content.slice(0, 60)}..." (置信度 ${group[j].confidence}) 存在矛盾`,
            });
          }
        }
      }
    }
    return contradictions;
  }

  /** Calculate corroboration stats for a specific evidence item */
  corroborate(evidenceId: string, filter: EvidenceFilter): CorroborationResult | null {
    const all = this.store.query(filter);
    const target = all.find(e => e.id === evidenceId);
    if (!target) return null;

    let supporting = 0;
    let contradicting = 0;

    for (const e of all) {
      if (e.id === evidenceId) continue;
      if (e.type !== target.type) continue;
      if (e.confidence >= target.confidence - 0.2) supporting++;
      else contradicting++;
    }

    const total = supporting + contradicting;
    const adjustedConfidence = total > 0
      ? target.confidence * (0.5 + 0.5 * (supporting / total))
      : target.confidence;

    return {
      evidenceId,
      corroboratingCount: supporting,
      contradictingCount: contradicting,
      adjustedConfidence: Math.round(adjustedConfidence * 1000) / 1000,
    };
  }
}

// ═══ ConfidenceScorer ═══

export class ConfidenceScorer {
  /**
   * Calculate base confidence from evidence source.
   * Human > Document > Connector > Diagnosis > LLM
   */
  static sourceConfidence(source: Evidence['source']): number {
    switch (source) {
      case 'interviewee': return 0.8;
      case 'document': return 0.7;
      case 'connector': return 0.6;
      case 'diagnosis': return 0.5;
      case 'llm': return 0.3;
      default: return 0.5;
    }
  }

  /** Apply time decay to confidence */
  static applyTimeDecay(confidence: number, collectedAt: string, halfLifeMs = 30 * 24 * 3600_000): number {
    const age = Date.now() - new Date(collectedAt).getTime();
    const decay = Math.pow(0.5, age / halfLifeMs);
    return Math.round(confidence * decay * 1000) / 1000;
  }
}
