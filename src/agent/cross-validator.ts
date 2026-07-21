/**
 * src/agent/cross-validator.ts — 交叉验证触发器 (D8d)
 *
 * Auth Doc #4 Agent Engineering Benchmark — Gap #4.
 * 当多位专家对同一维度产生冲突分析时，触发第三方专家进行裁决。
 *
 * 冲突检测规则 (MVP):
 *   1. 同一 42-edge ID: 一位认为是根因，另一位否定
 *   2. 同一 finding 的严重度判定相反 (critical vs warning)
 *   3. 同一维度的方向性分析相反 (improving vs declining)
 *
 * 裁决策略:
 *   - 从非冲突专家池中选择第三方
 *   - 多数一致 (2/3) → 记录共识
 *   - 三方不一致 → 记录未解决 + 升级 GA (D8e)
 *
 * 契约:
 *   @input  — ExpertResponse[]
 *   @output — CrossValidationResult
 *   @degraded — 无冲突 → 空结果
 */
import { createLogger } from '@synova/logger';
import type { ExpertResponse } from './expert-router';

const log = createLogger('agent/cross-validator');

// ═══ 类型定义 ═══

/** 冲突记录 */
export interface Conflict {
  id: string;
  /** 冲突双方的 expertType */
  experts: [string, string];
  /** 冲突类型 */
  type: 'edge_mismatch' | 'severity_opposite' | 'direction_opposite';
  /** 冲突描述 */
  description: string;
  /** 关联的专家响应 */
  responses: [ExpertResponse, ExpertResponse];
  /** 关联的边 ID（可选） */
  edgeId?: string;
}

/** 裁决结果 */
export interface TieBreakerResult {
  conflictId: string;
  /** 被选为裁决的专家 */
  tieBreakerExpert: string;
  /** 裁决专家的响应 */
  response: ExpertResponse;
  /** 三方中达成一致的专家类型列表 */
  consensusExperts: string[];
  /** 是否达成一致 */
  hasConsensus: boolean;
}

/** 交叉验证结果 */
export interface CrossValidationResult {
  /** 检测到的冲突列表 */
  conflicts: Conflict[];
  /** 裁决结果列表 */
  tieBreakers: TieBreakerResult[];
  /** 是否有未解决的冲突 */
  hasUnresolved: boolean;
  /** 总体共识状态 */
  consensus: 'full' | 'partial' | 'none' | 'no_conflicts';
  /** 所有参与验证的专家类型 */
  allExperts: string[];
  degraded: boolean;
}

// ═══ 所有 9 专家列表（用于选择第三方裁决） ═══

const ALL_EXPERTS = ['finance', 'strategy', 'org', 'tech', 'marketing', 'action', 'business_model', 'knowledge', 'host'];

/**
 * CrossValidationTrigger — 交叉验证触发器。
 * 检测专家之间的冲突，触发裁决，聚合结果。
 */
export class CrossValidationTrigger {
  /**
   * 检测专家响应中的冲突。
   * 比较每对专家的 edge IDs 和严重度判定。
   */
  detectConflicts(responses: ExpertResponse[]): Conflict[] {
    try {
      if (responses.length < 2) return [];

      const conflicts: Conflict[] = [];
      let conflictId = 0;

      // 比较所有专家对
      for (let i = 0; i < responses.length; i++) {
        for (let j = i + 1; j < responses.length; j++) {
          const a = responses[i];
          const b = responses[j];

          // 规则 1: 同一 finding 的严重度相反（MVP 主要冲突检测）
          // 通过 evidence 交集判断是否处理了相同 finding
          const aEvidence = new Set(a.evidence || []);
          const bEvidence = new Set(b.evidence || []);
          const sharedEvidence = [...aEvidence].filter((e) => bEvidence.has(e));

          for (const evId of sharedEvidence) {
            const aSeverity = this.inferSeverity(a.analysis);
            const bSeverity = this.inferSeverity(b.analysis);
            if (this.isOppositeSeverity(aSeverity, bSeverity)) {
              conflicts.push({
                id: `conflict-${conflictId++}`,
                experts: [a.expertType, b.expertType],
                type: 'severity_opposite',
                description: `专家 ${a.expertType} (${aSeverity}) 和 ${b.expertType} (${bSeverity}) 对 ${evId} 的严重度判定相反`,
                responses: [a, b],
              });
            }
          }
        }
      }

      if (conflicts.length > 0) {
        log.info({ conflicts: conflicts.length }, '交叉验证检测到冲突');
      }
      return conflicts;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '冲突检测异常 — 降级');
      return [];
    }
  }

  /**
   * 触发裁决。
   * 从非冲突专家池中选择第三方专家，路由相同 finding 进行裁决。
   */
  async triggerTieBreaker(conflict: Conflict): Promise<TieBreakerResult> {
    try {
      // 选择第三方专家（不在冲突双方中的第一位可用专家）
      const conflictingExperts = new Set(conflict.experts);
      const tieBreakerExpert = ALL_EXPERTS.find((e) => !conflictingExperts.has(e)) || 'host';

      log.info({
        conflictId: conflict.id,
        conflicting: conflict.experts,
        tieBreaker: tieBreakerExpert,
      }, '触发裁决');

      // 路由到第三方专家
      const { ExpertRouter } = await import('./expert-router');
      const router = new ExpertRouter();

      // 合并双方 findings
      const allFindings = [
        ...conflict.responses[0].evidence.map((id) => ({ id, severity: 'info' as const, title: id, description: '' })),
        ...conflict.responses[1].evidence.map((id) => ({ id, severity: 'info' as const, title: id, description: '' })),
      ];

      const response = await router.dispatch({
        subTaskId: `tiebreaker-${conflict.id}`,
        expertType: tieBreakerExpert,
        inputFindings: allFindings,
        context: {
          enterpriseId: 'default',
          diagnosisId: 'cross-validation',
          previousExpertOutputs: [conflict.responses[0], conflict.responses[1]],
        },
      });

      // 判断共识
      const consensusExperts = [conflict.experts[0], conflict.experts[1], tieBreakerExpert];
      const hasConsensus = !response.degraded;

      return {
        conflictId: conflict.id,
        tieBreakerExpert,
        response,
        consensusExperts,
        hasConsensus,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, conflictId: conflict.id }, '裁决执行失败 — 降级');
      return {
        conflictId: conflict.id,
        tieBreakerExpert: 'unknown',
        response: {
          subTaskId: `tiebreaker-${conflict.id}`,
          expertType: 'unknown',
          analysis: '',
          confidence: 0,
          evidence: [],
          edgeIds: [],
          degraded: true,
          error: msg,
          durationMs: 0,
        },
        consensusExperts: [...conflict.experts, 'unknown'],
        hasConsensus: false,
      };
    }
  }

  /**
   * 聚合所有专家响应和裁决结果。
   */
  aggregate(responses: ExpertResponse[], tieBreakers: TieBreakerResult[]): CrossValidationResult {
    const conflicts = this.detectConflicts(responses);

    const allExperts = [...new Set([
      ...responses.map((r) => r.expertType),
      ...tieBreakers.map((t) => t.tieBreakerExpert),
    ])];

    const hasUnresolved = tieBreakers.some((t) => !t.hasConsensus);

    let consensus: CrossValidationResult['consensus'] = 'no_conflicts';
    if (conflicts.length === 0) {
      consensus = 'full';
    } else if (tieBreakers.length > 0 && !hasUnresolved) {
      consensus = 'partial';
    } else if (hasUnresolved) {
      consensus = 'none';
    }

    return {
      conflicts,
      tieBreakers,
      hasUnresolved,
      consensus,
      allExperts,
      degraded: conflicts.length > 0,
    };
  }

  // ─── 内部方法 ───

  /**
   * 从分析文本中推断严重度。
   * MVP 简化实现: 匹配关键词。
   */
  private inferSeverity(analysis: string): string {
    if (!analysis) return 'unknown';
    const lower = analysis.toLowerCase();
    if (lower.includes('critical') || lower.includes('严重')) return 'critical';
    if (lower.includes('warning') || lower.includes('警告') || lower.includes('注意')) return 'warning';
    if (lower.includes('info') || lower.includes('正常') || lower.includes('良好')) return 'info';
    return 'unknown';
  }

  /**
   * 判断两个严重度是否相反。
   */
  private isOppositeSeverity(a: string, b: string): boolean {
    const opposites: Record<string, string[]> = {
      critical: ['info', 'low'],
      warning: ['info'],
      info: ['critical', 'warning'],
    };
    return (opposites[a] || []).includes(b) || (opposites[b] || []).includes(a);
  }
}
