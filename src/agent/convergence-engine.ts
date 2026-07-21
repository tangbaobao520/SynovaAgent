/**
 * src/agent/convergence-engine.ts — 收敛机制 (D8f)
 *
 * Auth Doc #4 Agent Engineering Benchmark — Gap #6.
 * 从仲裁历史中学习，相同 pattern 重复出现时自动收敛。
 *
 * 两阶段:
 *   1. Synthesizer Phase: 合并所有专家响应+交叉验证+仲裁 → ConvergedSynthesis
 *   2. Learning Phase: 分析仲裁先例 ≥3 次一致胜者 → 收敛规则
 *
 * 契约:
 *   @input  — ExpertResponse[] + CrossValidationResult + ArbitrationResult[]
 *   @output — ConvergedSynthesis / ConvergenceRule[]
 *   @degraded — audit-store 不可用 → 空规则 + log.warn
 */
import { createLogger } from '@synova/logger';
import type { ExpertResponse } from './expert-router';

const log = createLogger('agent/convergence-engine');

// ═══ 类型定义 ═══

/** 收敛的综合报告 */
export interface ConvergedSynthesis {
  crossExpertContradictions: { resolved: number; escalated: number };
  crossDimensionLinks: Array<{ from: string; to: string; strength: number }>;
  convergentFindings: Array<{ edgeId: string; consensus: boolean; expertCount: number }>;
  expertContributions: Array<{ expertType: string; weight: number; keyInsight: string }>;
}

/** 收敛规则 */
export interface ConvergenceRule {
  id: string;
  experts: [string, string];
  edgeId: string;
  winner: string;
  confidence: number;
  matchCount: number;
  lastMatchedAt: string;
}

/** CrossValidationResult 最小接口 */
export interface CrossValidationResultLike {
  conflicts: Array<{ id: string; experts: [string, string]; type: string; edgeId?: string }>;
  tieBreakers: Array<{ conflictId: string; hasConsensus: boolean }>;
  consensus: string;
}

/** ArbitrationResult 最小接口 */
export interface ArbitrationResultLike {
  conflictId: string;
  resolution: string;
  winner?: string;
  reason: string;
  timestamp: string;
}

// ═══ ConvergenceEngine ═══

/**
 * ConvergenceEngine — 收敛引擎。
 * 合成专家输出 + 从仲裁历史学习自动收敛规则。
 */
export class ConvergenceEngine {
  private auditStore: { log: (entry: { orgId: string; actorId: string; actorRole: string; action: string; targetType?: string; targetId?: string; newValue?: string }) => void } | null;
  private rules: Map<string, ConvergenceRule> = new Map();

  constructor(auditStore?: { log: (entry: { orgId: string; actorId: string; actorRole: string; action: string; targetType?: string; targetId?: string; newValue?: string }) => void } | null) {
    this.auditStore = auditStore ?? null;
  }

  // ═══ Synthesizer Phase ═══

  /**
   * 合成阶段: 将所有专家响应 + 交叉验证 + 仲裁合并为综合报告。
   */
  synthesize(
    expertReports: ExpertResponse[],
    cvResult: CrossValidationResultLike,
    _arbitrations: ArbitrationResultLike[],
  ): ConvergedSynthesis {
    // 统计交叉专家矛盾
    const resolved = cvResult.tieBreakers.filter((t) => t.hasConsensus).length;
    const escalated = cvResult.conflicts.length - resolved;

    // 跨维度关联
    const crossDimensionLinks = this.buildCrossDimensionLinks(expertReports);

    // 发现收敛性
    const convergentFindings = this.buildConvergentFindings(expertReports, cvResult);

    // 专家贡献权重
    const expertContributions = this.buildExpertContributions(expertReports, cvResult);

    log.info({
      expertCount: expertReports.length,
      conflicts: cvResult.conflicts.length,
      resolved,
      escalated,
    }, '合成完成');

    return {
      crossExpertContradictions: { resolved, escalated },
      crossDimensionLinks,
      convergentFindings,
      expertContributions,
    };
  }

  // ═══ Learning Phase ═══

  /**
   * 分析仲裁先例，生成收敛规则。
   * 按 (expertPair, edgeId) 分组，≥3 次一致胜者 → 收敛规则。
   */
  async analyzePrecedents(_enterpriseId: string): Promise<ConvergenceRule[]> {
    try {
      // MVP: 使用内存中的规则（生产环境从 audit-store 查询）
      const newRules: ConvergenceRule[] = [];

      // 更新已有规则
      for (const [, rule] of this.rules) {
        newRules.push(rule);
      }

      log.info({ rules: newRules.length }, '收敛规则分析完成');
      return newRules;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '收敛规则分析失败 — 降级');
      return [];
    }
  }

  /**
   * 根据边 ID 和专家对查询收敛规则。
   * 用于 ConflictArbitrator 跳过仲裁。
   */
  getConvergence(edgeId: string | undefined, experts: [string, string]): ConvergenceRule | null {
    if (!edgeId) return null;
    const key = this.ruleKey(edgeId, experts);
    return this.rules.get(key) ?? null;
  }

  /**
   * 添加一条收敛规则（由外部调用，基于仲裁历史）。
   */
  addRule(experts: [string, string], edgeId: string, winner: string, matchCount: number): ConvergenceRule {
    const key = this.ruleKey(edgeId, experts);
    const rule: ConvergenceRule = {
      id: `cv-${key}-${Date.now().toString(36)}`,
      experts,
      edgeId,
      winner,
      confidence: Math.min(0.5 + matchCount * 0.1, 0.9),
      matchCount,
      lastMatchedAt: new Date().toISOString(),
    };
    this.rules.set(key, rule);

    // 写入审计
    if (this.auditStore) {
      try {
        this.auditStore.log({
          orgId: 'synova',
          actorId: 'convergence-engine',
          actorRole: 'system',
          action: 'convergence.rule_created',
          targetType: 'convergence_rule',
          targetId: rule.id,
          newValue: JSON.stringify({ experts, edgeId, winner, matchCount }),
        });
      } catch (err: unknown) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, '收敛规则审计日志写入失败');
      }
    }

    log.info({ ruleId: rule.id, winner, matchCount }, '收敛规则已创建');
    return rule;
  }

  // ─── 内部方法 ───

  private ruleKey(edgeId: string, experts: [string, string]): string {
    // 标准化: 专家对排序保证 (A,B)==(B,A)
    const sorted = [...experts].sort();
    return `${edgeId}:${sorted.join(':')}`;
  }

  private buildCrossDimensionLinks(reports: ExpertResponse[]): ConvergedSynthesis['crossDimensionLinks'] {
    const links: ConvergedSynthesis['crossDimensionLinks'] = [];
    // MVP: 找出共享 edge 的专家对，构建关联
    const edgeExpertMap = new Map<string, Set<string>>();
    for (const r of reports) {
      for (const e of r.edgeIds || []) {
        if (!edgeExpertMap.has(e)) edgeExpertMap.set(e, new Set());
        edgeExpertMap.get(e)!.add(r.expertType);
      }
    }
    for (const [edgeId, experts] of edgeExpertMap) {
      const arr = [...experts];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          links.push({ from: arr[i], to: arr[j], strength: 0.5 });
        }
      }
    }
    return links;
  }

  private buildConvergentFindings(
    reports: ExpertResponse[],
    cvResult: CrossValidationResultLike,
  ): ConvergedSynthesis['convergentFindings'] {
    const findings = new Map<string, { expertCount: number; hasConflict: boolean }>();
    for (const r of reports) {
      for (const e of r.edgeIds || []) {
        const existing = findings.get(e) || { expertCount: 0, hasConflict: false };
        existing.expertCount++;
        findings.set(e, existing);
      }
    }
    for (const c of cvResult.conflicts) {
      if (c.edgeId) {
        const existing = findings.get(c.edgeId) || { expertCount: 2, hasConflict: false };
        existing.hasConflict = true;
        findings.set(c.edgeId, existing);
      }
    }
    return [...findings.entries()].map(([edgeId, data]) => ({
      edgeId,
      consensus: !data.hasConflict,
      expertCount: data.expertCount,
    }));
  }

  private buildExpertContributions(
    reports: ExpertResponse[],
    _cvResult: CrossValidationResultLike,
  ): ConvergedSynthesis['expertContributions'] {
    return reports.map((r) => ({
      expertType: r.expertType,
      weight: r.confidence,
      keyInsight: r.analysis ? r.analysis.slice(0, 80) + '...' : '',
    }));
  }
}
