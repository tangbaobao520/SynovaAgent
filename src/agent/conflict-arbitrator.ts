/**
 * src/agent/conflict-arbitrator.ts — 冲突仲裁器 (D8e)
 *
 * Auth Doc #4 Agent Engineering Benchmark — Gap #5.
 * 当 D8d 交叉验证无法达成共识时，自动裁决或升级 GA。
 *
 * 仲裁逻辑:
 *   1. 对每位专家评分（数据一致性 + 历史准确率）
 *   2. 分差 > 0.3 → 自动裁决给高分方
 *   3. 分差 <= 0.3 → 升级 GA
 *
 * 契约:
 *   @input  — CrossValidationResult (D8d)
 *   @output — ArbitrationResult[]
 *   @degraded — GA 升级需要 → degraded:true
 */
import { createLogger } from '@synova/logger';
import { randomUUID } from 'crypto';
import type { Conflict, TieBreakerResult } from './cross-validator';

const log = createLogger('agent/conflict-arbitrator');

// ═══ 类型定义 ═══

/** 裁决结果 */
export interface ArbitrationResult {
  conflictId: string;
  resolution: 'auto' | 'ga_escalated';
  winner?: string;
  gaTicketId?: string;
  reason: string;
  precedentRecorded: boolean;
  timestamp: string;
}

/** 自动裁决详情 */
export interface AutoResolution {
  conflictId: string;
  winner: string;
  loser: string;
  scoreWinner: number;
  scoreLoser: number;
  gap: number;
}

/** GA 升级工单 */
export interface GATicket {
  ticketId: string;
  conflicts: Conflict[];
  tieBreakers: TieBreakerResult[];
  context: {
    enterpriseId: string;
    diagnosisId: string;
  };
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

/** 仲裁总结果 */
export interface ArbitrationSummary {
  results: ArbitrationResult[];
  totalAutoResolved: number;
  totalEscalated: number;
  gaTickets: GATicket[];
  degraded: boolean;
}

/** CrossValidationResult 最小接口（避免直接依赖 D8d 类型） */
export interface CrossValidationResultLike {
  conflicts: Conflict[];
  tieBreakers: TieBreakerResult[];
  hasUnresolved: boolean;
  consensus: string;
}

/** AuditStore 最小接口 */
export interface AuditStoreLike {
  log(entry: {
    orgId: string;
    actorId: string;
    actorRole: string;
    action: string;
    targetType?: string;
    targetId?: string;
    oldValue?: string;
    newValue?: string;
  }): void;
}

// ═══ 默认评分配置 ═══

const DEFAULT_SCORES: Record<string, number> = {
  finance: 0.85,
  strategy: 0.82,
  org: 0.78,
  tech: 0.80,
  marketing: 0.75,
  action: 0.70,
  business_model: 0.72,
  knowledge: 0.68,
  host: 0.65,
};

// ═══ ConflictArbitrator ═══

/**
 * ConflictArbitrator — 冲突仲裁器。
 * 对未解决的专家冲突进行自动裁决或 GA 升级。
 */
export class ConflictArbitrator {
  private auditStore: AuditStoreLike | null;
  private expertScores: Record<string, number>;

  constructor(auditStore?: AuditStoreLike | null, expertScores?: Record<string, number>) {
    this.auditStore = auditStore ?? null;
    this.expertScores = { ...DEFAULT_SCORES, ...expertScores };
  }

  /**
   * 对交叉验证结果执行仲裁。
   * 遍历每个未解决的冲突，自动裁决或升级 GA。
   */
  async arbitrate(cvResult: CrossValidationResultLike): Promise<ArbitrationSummary> {
    const results: ArbitrationResult[] = [];
    const gaTickets: GATicket[] = [];
    let totalAutoResolved = 0;
    let totalEscalated = 0;

    // 处理每个冲突
    for (const conflict of cvResult.conflicts) {
      const tieBreaker = cvResult.tieBreakers.find((t) => t.conflictId === conflict.id);

      if (!tieBreaker || !tieBreaker.hasConsensus) {
        // 无裁决或裁决未达成 → 尝试自动裁决或升级
        const result = await this.arbitrateConflict(conflict, tieBreaker);
        results.push(result);

        if (result.resolution === 'auto') {
          totalAutoResolved++;
          this.recordPrecedent(result, conflict);
        } else {
          totalEscalated++;
          const ticket = this.escalateToGA([conflict], cvResult.tieBreakers);
          gaTickets.push(ticket);
          // 关联工单 ID
          result.gaTicketId = ticket.ticketId;
        }
      }
    }

    log.info({
      total: cvResult.conflicts.length,
      autoResolved: totalAutoResolved,
      escalated: totalEscalated,
    }, '仲裁完成');

    return {
      results,
      totalAutoResolved,
      totalEscalated,
      gaTickets,
      degraded: totalEscalated > 0,
    };
  }

  /**
   * 对单个冲突执行自动裁决。
   * 比较两位专家的评分，分差 > 0.3 自动裁决。
   */
  async autoResolve(conflict: Conflict, _tieBreaker?: TieBreakerResult): Promise<AutoResolution> {
    const expertA = conflict.experts[0];
    const expertB = conflict.experts[1];

    const scoreA = this.expertScores[expertA] || 0.5;
    const scoreB = this.expertScores[expertB] || 0.5;
    const gap = Math.abs(scoreA - scoreB);

    if (scoreA >= scoreB) {
      return { conflictId: conflict.id, winner: expertA, loser: expertB, scoreWinner: scoreA, scoreLoser: scoreB, gap };
    }
    return { conflictId: conflict.id, winner: expertB, loser: expertA, scoreWinner: scoreB, scoreLoser: scoreA, gap };
  }

  /**
   * 创建 GA 升级工单。
   */
  escalateToGA(conflicts: Conflict[], tieBreakers: TieBreakerResult[]): GATicket {
    const ticket: GATicket = {
      ticketId: `GA-${randomUUID().slice(0, 8).toUpperCase()}`,
      conflicts,
      tieBreakers,
      context: { enterpriseId: 'default', diagnosisId: 'cross-validation' },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    log.info({ ticketId: ticket.ticketId, conflicts: conflicts.length }, 'GA 升级工单已创建');

    // 写入审计日志
    if (this.auditStore) {
      try {
        this.auditStore.log({
          orgId: 'synova',
          actorId: 'conflict-arbitrator',
          actorRole: 'system',
          action: 'arbitration.ga_escalated',
          targetType: 'ga_ticket',
          targetId: ticket.ticketId,
          newValue: JSON.stringify({ conflicts: conflicts.length, tieBreakers: tieBreakers.length }),
        });
      } catch (err: unknown) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, 'GA 工单审计日志写入失败 — 降级');
      }
    }

    return ticket;
  }

  /**
   * 记录裁决先例到审计日志。
   */
  recordPrecedent(result: ArbitrationResult, conflict: Conflict): void {
    if (!this.auditStore) {
      log.warn({ conflictId: conflict.id }, 'AuditStore 不可用 — 跳过先例记录');
      return;
    }

    try {
      this.auditStore.log({
        orgId: 'synova',
        actorId: 'conflict-arbitrator',
        actorRole: 'system',
        action: `arbitration.${result.resolution}`,
        targetType: 'arbitration_precedent',
        targetId: result.conflictId,
        oldValue: JSON.stringify({ experts: conflict.experts, type: conflict.type }),
        newValue: JSON.stringify({ resolution: result.resolution, winner: result.winner, reason: result.reason }),
      });
      log.info({ conflictId: conflict.id, resolution: result.resolution }, '仲裁先例已记录');
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, '仲裁先例记录失败 — 降级');
    }
  }

  // ─── 内部方法 ───

  private async arbitrateConflict(conflict: Conflict, tieBreaker?: TieBreakerResult): Promise<ArbitrationResult> {
    const auto = await this.autoResolve(conflict, tieBreaker);

    if (auto.gap > 0.3) {
      log.info({
        conflictId: conflict.id,
        winner: auto.winner,
        gap: auto.gap.toFixed(2),
      }, '自动裁决完成');
      return {
        conflictId: conflict.id,
        resolution: 'auto',
        winner: auto.winner,
        reason: `专家 ${auto.winner} (${(auto.scoreWinner * 100).toFixed(0)}分) 优于 ${auto.loser} (${(auto.scoreLoser * 100).toFixed(0)}分)，分差 ${(auto.gap * 100).toFixed(0)}% > 30% 阈值`,
        precedentRecorded: true,
        timestamp: new Date().toISOString(),
      };
    }

    // 分差 <= 0.3 → GA 升级
    log.info({
      conflictId: conflict.id,
      gap: auto.gap.toFixed(2),
    }, '分差不足，升级 GA');
    return {
      conflictId: conflict.id,
      resolution: 'ga_escalated',
      reason: `专家 ${auto.winner} (${(auto.scoreWinner * 100).toFixed(0)}分) 与 ${auto.loser} (${(auto.scoreLoser * 100).toFixed(0)}分) 分差仅 ${(auto.gap * 100).toFixed(0)}%，需 GA 人工判定`,
      precedentRecorded: false,
      timestamp: new Date().toISOString(),
    };
  }
}
