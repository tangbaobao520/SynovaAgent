const DEFAULT_CATEGORY = "uncategorized";
/**
 * compute-problem-action-cycle.ts — O8 哨兵 compute 函数
 *
 * 组织修复能力 — 基于双环学习理论 (Argyris & Schön, 1978)
 * 计算修复周期中位数 + 同类问题复发率
 *
 * 来源: Tucker & Edmondson (2003) — 组织修复行为
 * 本体映射: Event::eventType(problem_detected, corrective_action), timestamp, problemCategory
 *           TRIGGERS 边 (problem → corrective_action)
 *
 * 判定:
 *   repairScore < 0.3 → weak
 *   repairScore 0.3-0.7 → moderate
 *   repairScore > 0.7 → strong
 */
export interface ProblemActionCycleResult {
  repairCycleDays: number;
  recurrenceRate: number;
  repairScore: number;
  totalProblems: number;
  totalResolved: number;
  signal: 'strong' | 'moderate' | 'weak' | 'insufficient';
  degraded: boolean;
  warnings: string[];
}

export function computeProblemActionCycle(
  events: Array<{
    eventType: string;
    timestamp: string;
    problemCategory?: string;
    resolved?: boolean;
    resolvedAt?: string;
  }>,
): ProblemActionCycleResult {
  const warnings: string[] = [];

  if (events.length === 0) {
    return {
      repairCycleDays: 0,
      recurrenceRate: 0,
      repairScore: 0,
      totalProblems: 0,
      totalResolved: 0,
      signal: 'insufficient',
      degraded: true,
      warnings: ['No event data available'],
    };
  }

  // 1. 分类事件
  const problems = events.filter(e => {
    const type = (e.eventType || '').toLowerCase();
    return type === 'problem_detected' || type === 'problem' || type === 'incident' ||
           type === 'failure' || type === 'bug' || type === 'complaint';
  });

  const correctiveActions = events.filter(e => {
    const type = (e.eventType || '').toLowerCase();
    return type === 'corrective_action' || type === 'fix' || type === 'resolution' ||
           type === 'action';
  });

  if (problems.length === 0) {
    return {
      repairCycleDays: 0,
      recurrenceRate: 0,
      repairScore: 1,
      totalProblems: 0,
      totalResolved: 0,
      signal: 'strong',
      degraded: true,
      warnings: ['No problem events detected — unable to assess repair capacity'],
    };
  }

  // 2. 计算修复周期 (配对 problem → corrective_action)
  //    通过 problemCategory 或者按时间顺序配对
  const repairCycles: number[] = [];

  for (const problem of problems) {
    if (problem.resolved && problem.resolvedAt) {
      const detected = new Date(problem.timestamp).getTime();
      const resolved = new Date(problem.resolvedAt).getTime();
      if (!isNaN(detected) && !isNaN(resolved) && resolved > detected) {
        const days = (resolved - detected) / (1000 * 60 * 60 * 24);
        repairCycles.push(days);
      }
    } else {
      // 尝试通过 corrective_action 配对 (按 problemCategory)
      const cat = problem.problemCategory;
      if (cat) {
        const matchingAction = correctiveActions.find(a => {
          return a.problemCategory === cat &&
            new Date(a.timestamp).getTime() > new Date(problem.timestamp).getTime();
        });
        if (matchingAction) {
          const detected = new Date(problem.timestamp).getTime();
          const actionTime = new Date(matchingAction.timestamp).getTime();
          if (!isNaN(detected) && !isNaN(actionTime) && actionTime > detected) {
            const days = (actionTime - detected) / (1000 * 60 * 60 * 24);
            repairCycles.push(days);
          }
        }
      }
    }
  }

  // 修复周期中位数
  const sortedCycles = [...repairCycles].sort((a, b) => a - b);
  const mid = Math.floor(sortedCycles.length / 2);
  const medianCycleDays = sortedCycles.length > 0
    ? (sortedCycles.length % 2 === 0 ? (sortedCycles[mid - 1] + sortedCycles[mid]) / 2 : sortedCycles[mid])
    : 0;

  // 3. 计算复发率
  const categoryCount = new Map<string, number>();
  for (const problem of problems) {
    const cat = problem.problemCategory  || DEFAULT_CATEGORY;
    categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
  }
  const recurrentCategories = Array.from(categoryCount.values()).filter(c => c > 1).length;
  const totalCategories = categoryCount.size || 1;

  // 高复发 = 单环学习 (只修表面，不修根因)
  const recurrenceRate = recurrentCategories / totalCategories;

  // 4. 综合修复得分
  // maxCycleTime = 180天作为上限
  const maxCycleTime = 180;
  const cycleScore = medianCycleDays > 0 ? 1 - Math.min(medianCycleDays / maxCycleTime, 1) : 0.5;
  const recurrenceScore = 1 - recurrenceRate;

  const repairScore = cycleScore * 0.5 + recurrenceScore * 0.5;

  // 5. 判定
  let signal: 'strong' | 'moderate' | 'weak' | 'insufficient';
  if (medianCycleDays > 180 || recurrenceRate > 0.8) {
    signal = 'weak';
  } else if (repairScore < 0.3) {
    signal = 'weak';
  } else if (repairScore < 0.6) {
    signal = 'moderate';
  } else {
    signal = 'strong';
  }

  const resolved = problems.filter(p => p.resolved).length;
  if (resolved === 0 && correctiveActions.length === 0) {
    signal = 'weak';
    warnings.push('No problems have been resolved — repair capability is absent');
  }

  return {
    repairCycleDays: Math.round(medianCycleDays * 10) / 10,
    recurrenceRate: Math.round(recurrenceRate * 100) / 100,
    repairScore: Math.round(repairScore * 100) / 100,
    totalProblems: problems.length,
    totalResolved: resolved,
    signal,
    degraded: problems.length === 0,
    warnings,
  };
}
