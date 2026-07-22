/**
 * src/agent/convergence-engine.ts — 收敛机制 (D8f v2)
 *
 * Auth Doc #4 §2.7 — 四步收敛算法:
 *   1. 共识发现: 3+ 专家在同一维度语义相似度 > 0.7 → 高共识
 *   2. 差异量化: 置信度方差 > 0.3 → 高分歧维度
 *   3. 权重合成: 基于 GA 历史准确率动态调整专家权重
 *   4. LLM 合成: 结构化对比矩阵 → 综合叙述
 *
 * 契约:
 *   @input  — ExpertResponse[] + CrossValidationResult + ArbitrationResult[]
 *   @output — ConvergedSynthesis { narrative, crossExpertContradictions, ... }
 *   @degraded — 空输入 → 空结果 + degraded:false
 */
import { createLogger } from '@synova/logger';
import type { ExpertResponse } from './expert-router';

const log = createLogger('agent/convergence-engine');

// ═══ 类型定义 ═══

/** 收敛的综合报告（含 narrative 输出） */
export interface ConvergedSynthesis {
  /** 最终综合叙述（LLM 合成阶段输出） */
  narrative: string;
  crossExpertContradictions: { resolved: number; escalated: number };
  crossDimensionLinks: Array<{ from: string; to: string; strength: number }>;
  convergentFindings: Array<{ edgeId: string; consensus: boolean; expertCount: number; confidenceVariance: number }>;
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

/** D92 GA 历史准确率数据接口 */
export interface GAAccuracyData {
  expertType: string;
  historicalAccuracy: number;
  reviewCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ConvergenceEngine — 四步收敛算法
// ═══════════════════════════════════════════════════════════════════════════════

export class ConvergenceEngine {
  private auditStore: { log: (entry: { orgId: string; actorId: string; actorRole: string; action: string; targetType?: string; targetId?: string; newValue?: string }) => void } | null;
  private rules: Map<string, ConvergenceRule> = new Map();
  /** D92 GA 历史准确率数据（可选，无数据时等权） */
  private gaAccuracyData: Map<string, number> = new Map();

  constructor(
    auditStore?: { log: (entry: { orgId: string; actorId: string; actorRole: string; action: string; targetType?: string; targetId?: string; newValue?: string }) => void } | null,
    gaData?: GAAccuracyData[],
  ) {
    this.auditStore = auditStore ?? null;
    if (gaData) {
      for (const d of gaData) {
        this.gaAccuracyData.set(d.expertType, d.historicalAccuracy);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  主入口: synthesize — 四步收敛算法
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 执行完整四步收敛算法。
   *
   * @param expertReports  — 专家响应列表（来自 ExpertRouter）
   * @param cvResult       — 交叉验证结果（来自 CrossValidationTrigger）
   * @param _arbitrations  — 仲裁结果（来自 ConflictArbitrator）
   * @returns ConvergedSynthesis — 含 narrative 的综合报告
   */
  synthesize(
    expertReports: ExpertResponse[],
    cvResult: CrossValidationResultLike,
    _arbitrations: ArbitrationResultLike[],
  ): ConvergedSynthesis {
    if (expertReports.length === 0) {
      return {
        narrative: '',
        crossExpertContradictions: { resolved: 0, escalated: 0 },
        crossDimensionLinks: [],
        convergentFindings: [],
        expertContributions: [],
      };
    }

    // Step 1: 共识发现
    const consensusResults = this.findConsensus(expertReports);
    // Step 2: 差异量化
    const divergenceResults = this.quantifyDivergence(expertReports);
    // Step 3: 权重合成
    const weightedContributions = this.weightContributions(expertReports);
    // Step 4: LLM 合成 → 生成综合叙述
    const matrix = this.buildSynthesisMatrix(expertReports, consensusResults, divergenceResults, weightedContributions);
    const narrative = this.buildNarrative(matrix, cvResult);

    // 统计交叉专家矛盾
    const resolved = cvResult.tieBreakers.filter((t) => t.hasConsensus).length;
    const escalated = cvResult.conflicts.length - resolved;

    // 跨维度关联
    const crossDimensionLinks = this.buildCrossDimensionLinks(expertReports);

    // 收敛性发现（合并共识 + 差异信息）
    const convergentFindings = this.buildConvergentFindings(expertReports, cvResult, divergenceResults);

    log.info({
      expertCount: expertReports.length,
      conflicts: cvResult.conflicts.length,
      highConsensus: consensusResults.filter((c) => c.isHighConsensus).length,
      highDivergence: divergenceResults.filter((d) => d.isHighDivergence).length,
      resolved,
      escalated,
    }, '四步收敛算法完成');

    return {
      narrative,
      crossExpertContradictions: { resolved, escalated },
      crossDimensionLinks,
      convergentFindings,
      expertContributions: weightedContributions,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 1: 共识发现
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 共识发现：3+ 专家在同一维度上 finding 语义相似度 > 0.7 → 标记为高共识。
   *
   * @param reports — 专家响应
   * @returns ConsensusResult[] — 每项发现的共识判定
   */
  findConsensus(reports: ExpertResponse[]): ConsensusResult[] {
    if (reports.length < 2) return [];

    const results: ConsensusResult[] = [];
    // 按 edgeId 分组
    const edgeMap = new Map<string, ExpertResponse[]>();

    for (const r of reports) {
      for (const e of r.edgeIds || []) {
        if (!edgeMap.has(e)) edgeMap.set(e, []);
        edgeMap.get(e)!.push(r);
      }
    }

    for (const [edgeId, experts] of edgeMap) {
      if (experts.length < 2) continue;

      // 计算语义相似度（MVP：基于文本关键词重叠率的简化计算）
      // 生产环境应使用 embedding 或 LLM 判断
      const similarity = this.computeSemanticSimilarity(experts);

      const isHighConsensus = similarity > 0.7 && experts.length >= 3;
      // 置信度取中位数
      const confidences = experts.map((e) => e.confidence).sort((a, b) => a - b);
      const medianConfidence = confidences[Math.floor(confidences.length / 2)];

      results.push({
        edgeId,
        expertCount: experts.length,
        averageSimilarity: Math.round(similarity * 100) / 100,
        isHighConsensus,
        medianConfidence,
        expertTypes: experts.map((e) => e.expertType),
      });
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 2: 差异量化
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 差异量化：每个维度的 finding 置信度方差 > 0.3 → 标记为高分歧维度。
   *
   * @param reports — 专家响应
   * @returns DivergenceResult[] — 每项的差异量化
   */
  quantifyDivergence(reports: ExpertResponse[]): DivergenceResult[] {
    if (reports.length < 2) return [];

    const results: DivergenceResult[] = [];

    // 按 dimension/expertType 分组计算置信度方差
    const dimensionConfs = new Map<string, number[]>();

    for (const r of reports) {
      const dim = r.expertType;
      if (!dimensionConfs.has(dim)) dimensionConfs.set(dim, []);
      dimensionConfs.get(dim)!.push(r.confidence);
    }

    for (const [dimension, confidences] of dimensionConfs) {
      if (confidences.length < 2) continue;

      const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      const variance = confidences.reduce((sum, c) => sum + (c - mean) ** 2, 0) / confidences.length;
      const roundedVariance = Math.round(variance * 1000) / 1000;

      results.push({
        dimension,
        confidenceVariance: roundedVariance,
        isHighDivergence: roundedVariance > 0.3,
        meanConfidence: Math.round(mean * 100) / 100,
        sampleCount: confidences.length,
      });
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 3: 权重合成
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 权重合成：基于 GA 历史审查准确率和冲突状态调整每位专家的贡献权重。
   *
   * @param reports — 专家响应
   * @returns 加权后的专家贡献列表
   */
  weightContributions(reports: ExpertResponse[]): ConvergedSynthesis['expertContributions'] {
    if (reports.length === 0) return [];

    // 基准权重：ExpertResponse.confidence（0-1）
    // 调整因子：GA 历史准确率（有数据时）
    const hasGaData = this.gaAccuracyData.size > 0;

    const contributions = reports.map((r) => {
      let weight = r.confidence;

      // GA 历史准确率调整
      if (hasGaData) {
        const gaAccuracy = this.gaAccuracyData.get(r.expertType) ?? -1;
        if (gaAccuracy >= 0) {
          // 加权: 新权重 = 原始置信度 × (0.5 + 0.5 × GA 准确率)
          weight = r.confidence * (0.5 + 0.5 * gaAccuracy);
          weight = Math.round(weight * 100) / 100;
        }
      }

      return {
        expertType: r.expertType,
        weight: Math.min(weight, 1.0),
        keyInsight: r.analysis ? r.analysis.slice(0, 80) + '...' : '',
      };
    });

    // 归一化所有权重
    const totalWeight = contributions.reduce((s, c) => s + c.weight, 0);
    if (totalWeight > 1) {
      for (const c of contributions) {
        c.weight = Math.round((c.weight / totalWeight) * 100) / 100;
      }
    }

    return contributions;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 4: 构建合成矩阵 + LLM 叙述
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 构建结构化对比矩阵（供 LLM 合成使用）。
   * 包含每位专家的维度/置信度/关键发现/收敛状态。
   */
  buildSynthesisMatrix(
    reports: ExpertResponse[],
    _consensusResults: ConsensusResult[],
    _divergenceResults: DivergenceResult[],
    contributed: ConvergedSynthesis['expertContributions'],
  ): SynthesisMatrix {
    return {
      experts: reports.map((r) => ({
        type: r.expertType,
        confidence: r.confidence,
        weight: contributed.find((c) => c.expertType === r.expertType)?.weight ?? r.confidence,
        keyInsight: r.analysis ? r.analysis.slice(0, 120) : '',
        evidenceCount: r.evidence.length,
        edgeIds: r.edgeIds,
      })),
      totalExperts: reports.length,
      totalEdges: [...new Set(reports.flatMap((r) => r.edgeIds || []))].length,
    };
  }

  /**
   * 从合成矩阵生成综合叙述。
   * MVP 实现：基于矩阵数据拼接叙述（生产环境使用 LLM）。
   */
  private buildNarrative(matrix: SynthesisMatrix, cvResult: CrossValidationResultLike): string {
    const lines: string[] = [];
    lines.push('# 收敛分析报告');
    lines.push('');
    lines.push(`## 概要`);
    lines.push(`- 参与专家数: ${matrix.totalExperts}`);
    lines.push(`- 引用边数: ${matrix.totalEdges}`);
    lines.push(`- 冲突数: ${cvResult.conflicts.length}`);
    lines.push(`- 总体共识: ${cvResult.consensus}`);
    lines.push('');

    lines.push(`## 专家权重与贡献`);
    for (const exp of matrix.experts) {
      lines.push(`- ${exp.type}: 置信度=${exp.confidence}, 权重=${exp.weight}, 证据=${exp.evidenceCount}条`);
    }
    lines.push('');

    const highWeightExperts = matrix.experts.filter((e) => e.weight >= 0.7);
    if (highWeightExperts.length > 0) {
      lines.push(`## 高置信度发现`);
      for (const exp of highWeightExperts) {
        lines.push(`- ${exp.type}: ${exp.keyInsight}`);
      }
      lines.push('');
    }

    if (cvResult.conflicts.length > 0) {
      lines.push(`## 未解决分歧`);
      lines.push(`存在 ${cvResult.conflicts.length} 项未解决的专家分歧，建议关注。`);
      lines.push('');
    }

    return lines.join('\n');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Learning Phase
  // ══════════════════════════════════════════════════════════════════════════

  async analyzePrecedents(_enterpriseId: string): Promise<ConvergenceRule[]> {
    try {
      const newRules: ConvergenceRule[] = [];
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

  getConvergence(edgeId: string | undefined, experts: [string, string]): ConvergenceRule | null {
    if (!edgeId) return null;
    return this.rules.get(this.ruleKey(edgeId, experts)) ?? null;
  }

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

  // ══════════════════════════════════════════════════════════════════════════
  //  Helper
  // ══════════════════════════════════════════════════════════════════════════

  private ruleKey(edgeId: string, experts: [string, string]): string {
    return `${edgeId}:${[...experts].sort().join(':')}`;
  }

  /**
   * 计算语义相似度（MVP 简化版）。
   * 基于文本关键词重叠率，不是真正的 embedding。
   */
  private computeSemanticSimilarity(experts: ExpertResponse[]): number {
    if (experts.length < 2) return 0;

    // 提取每个专家的关键词（从 analysis 字段中提取有意义的词汇）
    const keywordsSets = experts.map((e) => {
      const text = e.analysis || '';
      const words = text
        .toLowerCase()
        .split(/[\s,;.。，；、!！?？()（）、\n]+/)
        .filter((w) => w.length > 1);
      return new Set(words);
    });

    // 计算平均 Jaccard 相似度
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < keywordsSets.length; i++) {
      for (let j = i + 1; j < keywordsSets.length; j++) {
        const intersection = new Set([...keywordsSets[i]].filter((x) => keywordsSets[j].has(x)));
        const union = new Set([...keywordsSets[i], ...keywordsSets[j]]);
        const jaccard = union.size > 0 ? intersection.size / union.size : 0;
        totalSimilarity += jaccard;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  private buildCrossDimensionLinks(reports: ExpertResponse[]): ConvergedSynthesis['crossDimensionLinks'] {
    const links: Array<{ from: string; to: string; strength: number }> = [];
    const edgeExpertMap = new Map<string, Set<string>>();
    for (const r of reports) {
      for (const e of r.edgeIds || []) {
        if (!edgeExpertMap.has(e)) edgeExpertMap.set(e, new Set());
        edgeExpertMap.get(e)!.add(r.expertType);
      }
    }
    for (const [, experts] of edgeExpertMap) {
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
    divergenceResults: DivergenceResult[],
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

    // 关联差异量化结果
    const varianceMap = new Map(divergenceResults.map((d) => [d.dimension, d.confidenceVariance]));

    return [...findings.entries()].map(([edgeId, data]) => ({
      edgeId,
      consensus: !data.hasConflict,
      expertCount: data.expertCount,
      confidenceVariance: varianceMap.get(edgeId) ?? 0,
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  类型导出
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConsensusResult {
  edgeId: string;
  expertCount: number;
  averageSimilarity: number;
  isHighConsensus: boolean;
  medianConfidence: number;
  expertTypes: string[];
}

export interface DivergenceResult {
  dimension: string;
  confidenceVariance: number;
  isHighDivergence: boolean;
  meanConfidence: number;
  sampleCount: number;
}

export interface SynthesisMatrix {
  experts: Array<{
    type: string;
    confidence: number;
    weight: number;
    keyInsight: string;
    evidenceCount: number;
    edgeIds: string[];
  }>;
  totalExperts: number;
  totalEdges: number;
}

/** ArbitrationResult 最小接口 */
export interface ArbitrationResultLike {
  conflictId: string;
  resolution: string;
  winner?: string;
  reason: string;
  timestamp: string;
}
