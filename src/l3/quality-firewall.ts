/**
 * l3/quality-firewall.ts — 洞察质量防火墙 (Gear 4)
 *
 * 四道检验:
 *   1. 证据引用真实存在? → GraphStore 反向查询 → 不存在→拒绝
 *   2. 置信度 ≥ 0.5? → 低置信→标记但不拒绝
 *   3. 无其他专家反驳? → 矛盾→标记人工审核
 *   4. 证据未过时? → valid_to > 30天→标记"可能过时", 置信度-0.2
 */
import { createLogger } from '../logger';

const log = createLogger('l3/quality-firewall');

// ═══ Types ═══

interface GraphStoreRO {
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string}>;
}

export interface FirewallInput {
  hypothesis: string;
  evidenceRefs: string[];
  confidence: number;
  expertType: string;
  contradictingExperts?: string[];
  evidenceTimestamps?: Record<string, string>;
}

export interface FirewallResult {
  passed: boolean;
  rejections: string[];
  warnings: string[];
  adjustedConfidence: number;
}

// ═══ QualityFirewall ═══

export class QualityFirewall {
  private store: GraphStoreRO;
  private graph: string;

  constructor(store: GraphStoreRO, graph: string) {
    this.store = store;
    this.graph = graph;
  }

  async validate(input: FirewallInput): Promise<FirewallResult> {
    const rejections: string[] = [];
    const warnings: string[] = [];
    let adjustedConfidence = input.confidence;

    // ═══ Check 1: Evidence exists in GraphStore ═══
    for (const ref of input.evidenceRefs) {
      const found = this.store.queryNodes('Evidence', { id: ref }, this.graph);
      if (found.length === 0) {
        rejections.push(`evidence_not_found: ${ref}`);
        log.warn({ ref }, '防火墙: 证据引用不存在');
      }
    }
    if (rejections.length > 0) {
      return { passed: false, rejections, warnings, adjustedConfidence };
    }

    // ═══ Check 2: Confidence threshold ═══
    if (input.confidence < 0.5) {
      warnings.push('low_confidence');
      log.debug({ confidence: input.confidence }, '防火墙: 低置信度标记');
    }

    // ═══ Check 3: Cross-expert contradiction ═══
    if (input.contradictingExperts && input.contradictingExperts.length > 0) {
      warnings.push(`contradicted_by_expert: ${input.contradictingExperts.join(',')}`);
      log.warn({ experts: input.contradictingExperts }, '防火墙: 专家结论矛盾');
    }

    // ═══ Check 4: Evidence staleness ═══
    if (input.evidenceTimestamps) {
      const cutoff = Date.now() - 30 * 24 * 3600_000; // 30 days
      for (const [ref, ts] of Object.entries(input.evidenceTimestamps)) {
        if (new Date(ts).getTime() < cutoff) {
          warnings.push(`possibly_stale: ${ref}`);
          adjustedConfidence = Math.max(0, adjustedConfidence - 0.2);
          log.debug({ ref, age: Math.round((Date.now() - new Date(ts).getTime()) / 86400000) }, '防火墙: 证据可能过时');
        }
      }
    }

    return {
      passed: true,
      rejections,
      warnings,
      adjustedConfidence: Math.round(adjustedConfidence * 100) / 100,
    };
  }
}
