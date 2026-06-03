/**
 * multi-role-interview.test.ts — Phase 2.2: 多角色访谈引擎测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 test data
 * 铁律 0-2: 每个 public 函数 >= 2 用例
 */
import { describe, it, expect } from 'vitest';

// ═══ Types (import from impl after creation) ═══
interface InterviewRole {
  id: string;
  name: string;
  level: 'c-suite' | 'middle' | 'frontline' | 'hr';
  weight: number;
}

interface RoleQuestionMatrix {
  roleId: string;
  dimensions: string[];
  questions: string[];
}

interface RoleResponse {
  roleId: string;
  questionIndex: number;
  answer: string;
  confidence: number;
}

interface Contradiction {
  dimension: string;
  responses: [RoleResponse, RoleResponse];
  differenceScore: number;
  description: string;
}

// ═══ InterviewRole ═══

describe('InterviewRole definitions', () => {
  const ROLES: InterviewRole[] = [
    { id: 'ceo', name: 'CEO/创始人', level: 'c-suite', weight: 1.0 },
    { id: 'cto', name: 'CTO/技术负责人', level: 'c-suite', weight: 0.9 },
    { id: 'manager', name: '中层管理者', level: 'middle', weight: 0.6 },
    { id: 'engineer', name: '一线工程师', level: 'frontline', weight: 0.4 },
    { id: 'hr', name: 'HR/人事', level: 'hr', weight: 0.7 },
  ];

  it('Given role definitions, When inspected, Then each has id/name/level/weight', () => {
    for (const role of ROLES) {
      expect(role.id).toBeTruthy();
      expect(role.name).toBeTruthy();
      expect(['c-suite', 'middle', 'frontline', 'hr']).toContain(role.level);
      expect(role.weight).toBeGreaterThan(0);
      expect(role.weight).toBeLessThanOrEqual(1.0);
    }
  });

  it('Given c-suite roles, When compared, Then have highest weights', () => {
    const cSuite = ROLES.filter(r => r.level === 'c-suite');
    const others = ROLES.filter(r => r.level !== 'c-suite');
    const maxCSuiteWeight = Math.max(...cSuite.map(r => r.weight));
    const maxOtherWeight = Math.max(...others.map(r => r.weight));
    expect(maxCSuiteWeight).toBeGreaterThanOrEqual(maxOtherWeight);
  });
});

// ═══ RoleDimensionStrategy ═══

describe('RoleDimensionStrategy', () => {
  const STRATEGIES: Record<string, string[]> = {
    ceo: ['目标对齐度', '战略清晰度', '资源分配', '风险评估', '组织架构'],
    cto: ['技术债', '工具链效率', '团队技能', '架构可扩展性', '自动化程度'],
    manager: ['流程效率', '团队协作', '沟通质量', '绩效评估', '资源瓶颈'],
    engineer: ['工具痛点', '技术障碍', '部署流程', '代码质量', '学习机会'],
    hr: ['人员流失', '文化氛围', '薪酬竞争力', '成长路径', '招聘效率'],
  };

  it('Given each role, When strategy queried, Then returns 5 dimensions', () => {
    for (const roleId of Object.keys(STRATEGIES)) {
      expect(STRATEGIES[roleId]).toHaveLength(5);
    }
  });

  it('Given CEO and engineer roles, When strategies compared, Then they differ', () => {
    const ceoDims = STRATEGIES['ceo'];
    const engDims = STRATEGIES['engineer'];
    const overlap = ceoDims.filter(d => engDims.includes(d));
    // C-Suite and frontline should have minimal overlap
    expect(overlap.length).toBeLessThan(3);
  });
});

// ═══ ContradictionDetector ═══

describe('ContradictionDetector', () => {
  function detectContradictions(responses: RoleResponse[]): Contradiction[] {
    const contradictions: Contradiction[] = [];
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const a = responses[i], b = responses[j];
        if (a.questionIndex === b.questionIndex && a.roleId !== b.roleId) {
          // Simple heuristic: if confidence difference > 0.3 → contradiction
          const diff = Math.abs(a.confidence - b.confidence);
          if (diff > 0.3) {
            contradictions.push({
              dimension: `q_${a.questionIndex}`,
              responses: [a, b],
              differenceScore: diff,
              description: `角色 ${a.roleId} vs ${b.roleId}: 问题${a.questionIndex} 回答可信度差 ${diff.toFixed(2)}`,
            });
          }
        }
      }
    }
    return contradictions;
  }

  it('Given CEO and engineer disagree on same question, When detectContradictions, Then returns signal', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 0, answer: '目标清晰', confidence: 0.9 },
      { roleId: 'engineer', questionIndex: 0, answer: '目标模糊', confidence: 0.3 },
    ];
    const contradictions = detectContradictions(responses);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].differenceScore).toBeGreaterThan(0.3);
  });

  it('Given CEO and engineer agree, When detectContradictions, Then returns empty', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 0, answer: '沟通良好', confidence: 0.8 },
      { roleId: 'engineer', questionIndex: 0, answer: '沟通不错', confidence: 0.75 },
    ];
    const contradictions = detectContradictions(responses);
    expect(contradictions).toHaveLength(0);
  });

  it('Given same role different questions, When detectContradictions, Then no false positives', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 0, answer: 'ok', confidence: 0.9 },
      { roleId: 'ceo', questionIndex: 1, answer: 'bad', confidence: 0.3 },
    ];
    const contradictions = detectContradictions(responses);
    expect(contradictions).toHaveLength(0); // Different questions — no contradiction
  });
});

// ═══ AggregationEngine ═══

describe('AggregationEngine', () => {
  const ROLE_WEIGHTS: Record<string, number> = {
    ceo: 1.0, cto: 0.9, manager: 0.6, engineer: 0.4, hr: 0.7,
  };

  function aggregateResults(responses: RoleResponse[]): Record<string, number> {
    const scores: Record<string, { weightedSum: number; totalWeight: number }> = {};

    for (const r of responses) {
      const dim = `q_${r.questionIndex}`;
      if (!scores[dim]) scores[dim] = { weightedSum: 0, totalWeight: 0 };
      const w = ROLE_WEIGHTS[r.roleId] || 0.5;
      scores[dim].weightedSum += r.confidence * w;
      scores[dim].totalWeight += w;
    }

    const result: Record<string, number> = {};
    for (const [dim, s] of Object.entries(scores)) {
      result[dim] = Math.round((s.weightedSum / s.totalWeight) * 100) / 100;
    }
    return result;
  }

  it('Given CEO and engineer responses, When aggregated, Then CEO weight is higher', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 0, answer: '好', confidence: 0.9 },
      { roleId: 'engineer', questionIndex: 0, answer: '差', confidence: 0.3 },
    ];
    const result = aggregateResults(responses);
    // Weighted average: (0.9*1.0 + 0.3*0.4) / (1.0+0.4) = 1.02/1.4 = 0.73
    expect(result['q_0']).toBeCloseTo(0.73, 1);
  });

  it('Given only engineers, When aggregated, Then result equals their average', () => {
    const responses: RoleResponse[] = [
      { roleId: 'engineer', questionIndex: 0, answer: 'x', confidence: 0.5 },
      { roleId: 'engineer', questionIndex: 0, answer: 'y', confidence: 0.7 },
    ];
    const result = aggregateResults(responses);
    expect(result['q_0']).toBeCloseTo(0.6, 1);
  });

  it('Given no responses, When aggregated, Then returns empty object', () => {
    const result = aggregateResults([]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});
