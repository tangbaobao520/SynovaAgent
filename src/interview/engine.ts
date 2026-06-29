/**
 * interview/engine.ts — 多角色访谈引擎 (Phase 2.2b/c/d)
 *
 * RoleDimensionStrategy + ContradictionDetector + AggregationEngine
 * MASTER-REPORT 裁决"必须实现"
 */
import type { InterviewRole } from './roles';
import { createLogger } from '@synova/logger';

const log = createLogger('interview/engine');

// ═══ Types ═══

export interface RoleResponse {
  roleId: string;
  questionIndex: number;
  answer: string;
  confidence: number;
}

export interface Contradiction {
  dimension: string;
  responses: [RoleResponse, RoleResponse];
  differenceScore: number;
  description: string;
}

export interface RoleQuestionMatrix {
  roleId: string;
  dimensions: string[];
  questions: string[];
}

// ═══ RoleDimensionStrategy ═══

/** Question dimensions per role — 每个角色 5 个核心维度 */
export const ROLE_DIMENSIONS: Record<string, string[]> = {
  ceo: ['目标对齐度', '战略清晰度', '资源分配', '风险评估', '组织架构'],
  cto: ['技术债', '工具链效率', '团队技能', '架构可扩展性', '自动化程度'],
  cfo: ['成本结构', '投资回报', '预算透明度', '现金流健康度', '财务风险'],
  manager: ['流程效率', '团队协作', '沟通质量', '绩效评估', '资源瓶颈'],
  engineer: ['工具痛点', '技术障碍', '部署流程', '代码质量', '学习机会'],
  designer: ['需求流转', '设计评审', '用户反馈', '产品迭代速度', '跨职能协作'],
  hr: ['人员流失', '文化氛围', '薪酬竞争力', '成长路径', '招聘效率'],
};

/** Get question dimensions for a specific role */
export function getRoleDimensions(roleId: string): string[] {
  return ROLE_DIMENSIONS[roleId] || ['组织概况', '当前挑战', '改进建议'];
}

/** Get all unique dimensions across roles */
export function getAllDimensions(): string[] {
  const all = new Set<string>();
  for (const dims of Object.values(ROLE_DIMENSIONS)) {
    for (const d of dims) all.add(d);
  }
  return [...all];
}

// ═══ ContradictionDetector ═══

/**
 * Detect contradictions between different roles' responses to the same question.
 * Contradiction = same questionIndex, different roleId, confidence difference > 0.3
 */
export function detectContradictions(responses: RoleResponse[]): Contradiction[] {
  const contradictions: Contradiction[] = [];

  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const a = responses[i];
      const b = responses[j];

      // Must be same question, different roles
      if (a.questionIndex !== b.questionIndex) continue;
      if (a.roleId === b.roleId) continue;

      const diff = Math.abs(a.confidence - b.confidence);

      // Significant confidence gap → contradiction signal
      if (diff >= 0.3) {
        const signal: Contradiction = {
          dimension: `q_${a.questionIndex}`,
          responses: [a, b],
          differenceScore: Math.round(diff * 100) / 100,
          description: `角色 ${a.roleId} vs ${b.roleId}: 问题${a.questionIndex + 1} 评分差 ${(diff * 100).toFixed(0)}% — 需重点关注`,
        };
        contradictions.push(signal);
        log.debug({ roles: [a.roleId, b.roleId], diff }, '检测到矛盾信号');
      }
    }
  }

  // Sort by most contradictory first
  contradictions.sort((a, b) => b.differenceScore - a.differenceScore);
  return contradictions;
}

// ═══ AggregationEngine ═══

/**
 * Weighted aggregation of multi-role responses.
 * C-Suite has higher per-person weight but typically fewer samples.
 * Frontline has lower per-person weight but more samples.
 */
export function aggregateResults(
  responses: RoleResponse[],
  roleWeights: Record<string, number>,
): Record<string, { score: number; sampleCount: number; topContradiction?: Contradiction }> {
  const scores: Record<string, { weightedSum: number; totalWeight: number; samples: number }> = {};

  for (const r of responses) {
    const dim = `q_${r.questionIndex}`;
    if (!scores[dim]) scores[dim] = { weightedSum: 0, totalWeight: 0, samples: 0 };
    const w = roleWeights[r.roleId] || 0.5;
    scores[dim].weightedSum += r.confidence * w;
    scores[dim].totalWeight += w;
    scores[dim].samples++;
  }

  const contradictions = detectContradictions(responses);

  const result: Record<string, { score: number; sampleCount: number; topContradiction?: Contradiction }> = {};
  for (const [dim, s] of Object.entries(scores)) {
    const score = s.totalWeight > 0
      ? Math.round((s.weightedSum / s.totalWeight) * 100) / 100
      : 0;
    const topContradiction = contradictions.find(c => c.dimension === dim);

    result[dim] = { score, sampleCount: s.samples, topContradiction };
  }
  return result;
}

/** Default role weights for aggregation */
export const DEFAULT_ROLE_WEIGHTS: Record<string, number> = {
  ceo: 1.0, cto: 0.9, cfo: 0.85,
  manager: 0.6,
  engineer: 0.4, designer: 0.4,
  hr: 0.7,
};
