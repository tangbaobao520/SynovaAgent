/**
 * l2/proposal-manager.ts — GNS v2.0 变更提议管理器 (M2 核心)
 *
 * 铁律 39: L2 编排层组件。管理右边栏变更的整个生命周期。
 *
 * 核心原则: Agent 对右边栏的任何变更都必须通过"提议→确认"流程。
 * 对话框提供三选项: ✅确认 ❌拒绝 💬提出看法
 *
 * 提议生命周期:
 *   proposed → confirmed (用户确认, 执行变更)
 *   proposed → rejected  (用户拒绝, 记录原因)
 *   proposed → opinion   (用户提出看法, 调整后重提)
 *   proposed → expired   (7 天未响应, 自动取消)
 */
import { createLogger } from '../logger';

const log = createLogger('l2/proposal-manager');

// ═══ Types ═══

export interface Proposal {
  id: string;
  type: 'goal_create' | 'goal_update' | 'alert_create' | 'alert_resolve' | 'obstacle_add' | 'obstacle_close';
  title: string;
  description: string;
  confidence: number;
  source: string;         // 触发来源: 'metric.updated' | 'expert_analysis' | 'user_request'
  status: 'proposed' | 'confirmed' | 'rejected' | 'opinion' | 'expired';
  createdAt: string;
  expiresAt: string;      // 7 天超时
  resolvedAt?: string;
  userFeedback?: string;
  suppressedUntil?: string; // 拒绝后抑制同类提议
}

// ═══ ProposalManager ═══

export class ProposalManager {
  private proposals = new Map<string, Proposal>();
  private suppressedTypes = new Map<string, number>(); // type → suppressed until timestamp

  /** Create a new proposal */
  propose(opts: {
    type: Proposal['type'];
    title: string;
    description: string;
    confidence: number;
    source: string;
  }): Proposal {
    // Check if this type is suppressed
    const suppressedUntil = this.suppressedTypes.get(opts.type);
    if (suppressedUntil && Date.now() < suppressedUntil) {
      log.debug({ type: opts.type, suppressedUntil: new Date(suppressedUntil).toISOString() },
        '提议类型被抑制, 跳过');
      return {
        id: '', type: opts.type, title: opts.title, description: opts.description,
        confidence: opts.confidence, source: opts.source,
        status: 'rejected', createdAt: new Date().toISOString(),
        expiresAt: '', userFeedback: 'auto-suppressed',
      };
    }

    const proposal: Proposal = {
      id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: opts.type, title: opts.title, description: opts.description,
      confidence: opts.confidence, source: opts.source,
      status: 'proposed',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(), // 7 days
    };

    this.proposals.set(proposal.id, proposal);
    log.info({ id: proposal.id, type: opts.type, title: opts.title }, '提议已创建');
    return proposal;
  }

  /** Resolve a proposal: confirm / reject / provide opinion */
  resolve(
    id: string,
    action: 'confirm' | 'reject' | 'opinion',
    feedback?: string,
  ): { ok: boolean; proposal?: Proposal; error?: string } {
    const proposal = this.proposals.get(id);
    if (!proposal) return { ok: false, error: `提议 ${id} 不存在` };
    if (proposal.status !== 'proposed') return { ok: false, error: `提议 ${id} 已处理 (${proposal.status})` };

    proposal.resolvedAt = new Date().toISOString();
    proposal.userFeedback = feedback;

    switch (action) {
      case 'confirm':
        proposal.status = 'confirmed';
        break;
      case 'reject':
        proposal.status = 'rejected';
        // Suppress same type for 24h
        this.suppressedTypes.set(proposal.type, Date.now() + 24 * 3600_000);
        break;
      case 'opinion':
        proposal.status = 'opinion';
        break;
    }

    log.info({ id, action, feedback }, '提议已处理');
    return { ok: true, proposal };
  }

  /** Get all pending proposals */
  getPending(): Proposal[] {
    const now = Date.now();
    // Auto-expire overdue proposals
    for (const [id, p] of this.proposals) {
      if (p.status === 'proposed' && new Date(p.expiresAt).getTime() < now) {
        p.status = 'expired';
        log.info({ id, type: p.type }, '提议已过期');
      }
    }
    return [...this.proposals.values()].filter(p => p.status === 'proposed');
  }

  /** Get proposal history for audit */
  getHistory(limit = 20): Proposal[] {
    return [...this.proposals.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /** Get confirmation rate for analytics */
  getConfirmationRate(): { total: number; confirmed: number; rejected: number; opinion: number; rate: number } {
    const resolved = [...this.proposals.values()].filter(p => p.status !== 'proposed' && p.status !== 'expired');
    const confirmed = resolved.filter(p => p.status === 'confirmed').length;
    const rejected = resolved.filter(p => p.status === 'rejected').length;
    const opinion = resolved.filter(p => p.status === 'opinion').length;
    return {
      total: resolved.length,
      confirmed, rejected, opinion,
      rate: resolved.length > 0 ? Math.round((confirmed / resolved.length) * 100) : 0,
    };
  }

  /** Clear suppression for a type (e.g. user explicitly requests) */
  clearSuppression(type: Proposal['type']): void {
    this.suppressedTypes.delete(type);
  }
}

// ═══ Singleton ═══

let _instance: ProposalManager | null = null;
export function getProposalManager(): ProposalManager {
  if (!_instance) _instance = new ProposalManager();
  return _instance;
}
