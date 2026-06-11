/**
 * __tests__/goal-alignment.test.ts — 目标对齐度分析测试
 *
 * 被测系统: src/pipeline/diagnosis/goal-alignment.ts → computeGoalAlignment()
 * Mock 边界: 不 mock — 纯函数，零外部依赖
 * 时间处理: 不涉及
 *
 * Test cases:
 *   1. Multiple goals with aligned/conflicting cases
 *   2. Verify alignment index calculation
 *   3. Empty graph (no goals)
 *   4. Single goal with no edges
 *   5. Mixed: partial alignment, entity type grouping verified
 *   6. All conflicting edges
 *   7. Inter-goal edges are correctly skipped
 */

import { describe, it, expect } from 'vitest';
import {
  computeGoalAlignment,
  goalAlignmentModule,
} from '../goal-alignment';
import type { GoalNode, AlignEdge } from '../goal-alignment';
import { SOGEdgeType, SOGNodeType } from '@synova/sog-core';

// ====================================================================
// Shared test data builders
// ====================================================================

function makeGoal(
  id: string,
  description: string,
  goalType: GoalNode['goalType'] = 'okr',
  progress?: number,
): GoalNode {
  return { id, description, goalType, progress };
}

function makeAlignEdge(
  from: string,
  to: string,
  strength = 0.8,
  alignmentType = 'direct',
): AlignEdge {
  return {
    from,
    to,
    type: SOGEdgeType.ALIGNS_WITH,
    strength,
    alignmentType,
  };
}

function makeConflictingEdge(
  from: string,
  to: string,
  strength = 0.3,
): AlignEdge {
  return makeAlignEdge(from, to, strength, 'conflicting');
}

// ====================================================================
// Tests: computeGoalAlignment (pure function)
// ====================================================================

describe('computeGoalAlignment', () => {
  // ── Test 1: Multiple goals with aligned/conflicting cases ──
  it('多目标含对齐与冲突实体时正确分类', () => {
    // Given: 2 goals, 2 teams, 3 persons
    //   goal-1 (增速) → team-sales (aligned, 0.9), person-alice (aligned, 0.85), person-bob (conflicting, 0.2)
    //   goal-2 (质量) → team-eng (aligned, 0.7), person-charlie (aligned, 0.6)
    const goals: GoalNode[] = [
      makeGoal('goal-1', '季度营收增长 30%', 'okr'),
      makeGoal('goal-2', '产品故障率降低 50%', 'okr'),
    ];
    const edges: AlignEdge[] = [
      makeAlignEdge('goal-1', 'team-sales', 0.9),
      makeAlignEdge('goal-1', 'person-alice', 0.85),
      makeConflictingEdge('goal-1', 'person-bob', 0.2),
      makeAlignEdge('goal-2', 'team-eng', 0.7),
      makeAlignEdge('goal-2', 'person-charlie', 0.6),
    ];
    const entityTypes: Record<string, string> = {
      'team-sales': SOGNodeType.TEAM,
      'team-eng': SOGNodeType.TEAM,
      'person-alice': SOGNodeType.PERSON,
      'person-bob': SOGNodeType.PERSON,
      'person-charlie': SOGNodeType.PERSON,
    };

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    expect(result.goals).toHaveLength(2);

    // goal-1: 2 aligned + 1 conflicting
    const g1 = result.goals.find(g => g.goalId === 'goal-1')!;
    expect(g1.alignedEntities).toHaveLength(2);
    expect(g1.misalignedEntities).toHaveLength(1);
    expect(g1.misalignedEntities[0].entityId).toBe('person-bob');
    expect(g1.misalignedEntities[0].entityType).toBe(SOGNodeType.PERSON);
    // overallStrength = (0.9 + 0.85 + 0) / 3 = 0.583...
    expect(g1.overallStrength).toBeCloseTo(0.583, 2);

    // goal-2: 2 aligned + 0 conflicting
    const g2 = result.goals.find(g => g.goalId === 'goal-2')!;
    expect(g2.alignedEntities).toHaveLength(2);
    expect(g2.misalignedEntities).toHaveLength(0);
    // overallStrength = (0.7 + 0.6) / 2 = 0.65
    expect(g2.overallStrength).toBe(0.65);

    // Organization alignment index = (0.583 + 0.65) / 2 = 0.617
    expect(result.organizationAlignmentIndex).toBeCloseTo(0.617, 2);
  });

  // ── Test 2: Verify alignment index calculation ──
  it('组织对齐指数为所有目标overallStrength的均值', () => {
    // Given: 3 goals with known overallStrength values
    //   goal-A: (0.8 + 0.6) / 2 = 0.7
    //   goal-B: (0.5) / 1 = 0.5
    //   goal-C: (0.9 + 0.9 + 0.9) / 3 = 0.9
    //   orgIndex = (0.7 + 0.5 + 0.9) / 3 = 0.7
    const goals: GoalNode[] = [
      makeGoal('goal-A', '目标A', 'okr'),
      makeGoal('goal-B', '目标B', 'north_star'),
      makeGoal('goal-C', '目标C', 'mission'),
    ];
    const edges: AlignEdge[] = [
      makeAlignEdge('goal-A', 'person-1', 0.8),
      makeAlignEdge('goal-A', 'person-2', 0.6),
      makeAlignEdge('goal-B', 'team-1', 0.5),
      makeAlignEdge('goal-C', 'person-3', 0.9),
      makeAlignEdge('goal-C', 'person-4', 0.9),
      makeAlignEdge('goal-C', 'person-5', 0.9),
    ];
    const entityTypes: Record<string, string> = {
      'person-1': SOGNodeType.PERSON,
      'person-2': SOGNodeType.PERSON,
      'team-1': SOGNodeType.TEAM,
      'person-3': SOGNodeType.PERSON,
      'person-4': SOGNodeType.PERSON,
      'person-5': SOGNodeType.PERSON,
    };

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    expect(result.goals).toHaveLength(3);
    expect(result.goals.find(g => g.goalId === 'goal-A')!.overallStrength).toBe(0.7);
    expect(result.goals.find(g => g.goalId === 'goal-B')!.overallStrength).toBe(0.5);
    expect(result.goals.find(g => g.goalId === 'goal-C')!.overallStrength).toBe(0.9);
    expect(result.organizationAlignmentIndex).toBeCloseTo(0.7, 5);
  });

  // ── Test 3: Empty graph (no goals) ──
  it('空图（无Goal节点）返回零对齐指数和引导信息', () => {
    // Given: no goals, no edges, no entities
    const goals: GoalNode[] = [];
    const edges: AlignEdge[] = [];
    const entityTypes: Record<string, string> = {};

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    expect(result.goals).toHaveLength(0);
    expect(result.organizationAlignmentIndex).toBe(0);
    expect(result.interpretation).toContain('无 Goal 节点');
  });

  // ── Test 4: Single goal with no edges ──
  it('单目标无边时overallStrength为0且提示缺少连接', () => {
    // Given: 1 goal, zero ALIGNS_WITH edges
    const goals: GoalNode[] = [
      makeGoal('goal-lonely', '成为行业第一名', 'vision'),
    ];
    const edges: AlignEdge[] = [];
    const entityTypes: Record<string, string> = {};

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    expect(result.goals).toHaveLength(1);
    const g = result.goals[0];
    expect(g.goalId).toBe('goal-lonely');
    expect(g.alignedEntities).toHaveLength(0);
    expect(g.misalignedEntities).toHaveLength(0);
    expect(g.alignmentByType).toHaveLength(0);
    expect(g.overallStrength).toBe(0);
    expect(result.organizationAlignmentIndex).toBe(0);
    expect(result.interpretation).toContain('缺少 ALIGNS_WITH 连接');
  });

  // ── Test 5: Entity type grouping verification ──
  it('实体按类型分组合并计算均值强度', () => {
    // Given: 1 goal with Persons, Teams, and Processes
    //   Persons: 0.8, 0.6 → mean 0.7
    //   Teams: 0.9, 0.7 → mean 0.8
    //   Processes: 0.5 → mean 0.5
    const goals: GoalNode[] = [
      makeGoal('goal-multi', '全组织对齐目标', 'mission'),
    ];
    const edges: AlignEdge[] = [
      makeAlignEdge('goal-multi', 'person-a', 0.8),
      makeAlignEdge('goal-multi', 'person-b', 0.6),
      makeAlignEdge('goal-multi', 'team-x', 0.9),
      makeAlignEdge('goal-multi', 'team-y', 0.7),
      makeAlignEdge('goal-multi', 'process-deploy', 0.5),
    ];
    const entityTypes: Record<string, string> = {
      'person-a': SOGNodeType.PERSON,
      'person-b': SOGNodeType.PERSON,
      'team-x': SOGNodeType.TEAM,
      'team-y': SOGNodeType.TEAM,
      'process-deploy': SOGNodeType.PROCESS,
    };

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    expect(result.goals).toHaveLength(1);
    const g = result.goals[0];
    expect(g.alignmentByType).toHaveLength(3);

    const byType = new Map(g.alignmentByType.map(t => [t.entityType, t]));

    const personGroup = byType.get(SOGNodeType.PERSON)!;
    expect(personGroup.count).toBe(2);
    expect(personGroup.meanStrength).toBeCloseTo(0.7, 5);

    const teamGroup = byType.get(SOGNodeType.TEAM)!;
    expect(teamGroup.count).toBe(2);
    expect(teamGroup.meanStrength).toBeCloseTo(0.8, 5);

    const processGroup = byType.get(SOGNodeType.PROCESS)!;
    expect(processGroup.count).toBe(1);
    expect(processGroup.meanStrength).toBeCloseTo(0.5, 5);

    // overallStrength = (0.8 + 0.6 + 0.9 + 0.7 + 0.5) / 5 = 0.7
    expect(g.overallStrength).toBeCloseTo(0.7, 5);
    expect(result.organizationAlignmentIndex).toBeCloseTo(0.7, 5);
  });

  // ── Test 6: All conflicting edges ──
  it('全部为冲突边时overallStrength和orgIndex均为0', () => {
    // Given: 1 goal, 3 conflicting edges
    const goals: GoalNode[] = [
      makeGoal('goal-doomed', '不可能完成的目标', 'okr'),
    ];
    const edges: AlignEdge[] = [
      makeConflictingEdge('goal-doomed', 'person-x', 0.1),
      makeConflictingEdge('goal-doomed', 'team-a', 0.2),
      makeConflictingEdge('goal-doomed', 'team-b', 0.3),
    ];
    const entityTypes: Record<string, string> = {
      'person-x': SOGNodeType.PERSON,
      'team-a': SOGNodeType.TEAM,
      'team-b': SOGNodeType.TEAM,
    };

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    expect(result.goals).toHaveLength(1);
    const g = result.goals[0];
    expect(g.alignedEntities).toHaveLength(0);
    expect(g.misalignedEntities).toHaveLength(3);
    expect(g.overallStrength).toBe(0);
    expect(result.organizationAlignmentIndex).toBe(0);
    expect(result.interpretation).toContain('3 个实体与目标明确冲突');

    // alignmentByType still populated (conflicting = 0 contribution)
    const personGroup = g.alignmentByType.find(t => t.entityType === SOGNodeType.PERSON)!;
    expect(personGroup.count).toBe(1);
    expect(personGroup.meanStrength).toBe(0);
  });

  // ── Test 7: Inter-goal edges are skipped ──
  it('Goal之间的ALIGNS_WITH边被正确跳过', () => {
    // Given: 2 goals connected to each other + to entities
    //   goal-A ↔ goal-B edge should be skipped
    //   goal-A → person-1 (0.9)
    //   goal-B → team-1 (0.8)
    const goals: GoalNode[] = [
      makeGoal('goal-A', '目标A', 'okr'),
      makeGoal('goal-B', '目标B', 'okr'),
    ];
    const edges: AlignEdge[] = [
      makeAlignEdge('goal-A', 'goal-B', 0.95), // inter-goal — skip
      makeAlignEdge('goal-A', 'person-1', 0.9),
      makeAlignEdge('goal-B', 'team-1', 0.8),
    ];
    const entityTypes: Record<string, string> = {
      'person-1': SOGNodeType.PERSON,
      'team-1': SOGNodeType.TEAM,
    };

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    // goal-A: only person-1 counts (not goal-B)
    const gA = result.goals.find(g => g.goalId === 'goal-A')!;
    expect(gA.alignedEntities).toHaveLength(1);
    expect(gA.alignedEntities[0].entityId).toBe('person-1');
    expect(gA.overallStrength).toBe(0.9);

    // goal-B: only team-1 counts (not goal-A)
    const gB = result.goals.find(g => g.goalId === 'goal-B')!;
    expect(gB.alignedEntities).toHaveLength(1);
    expect(gB.alignedEntities[0].entityId).toBe('team-1');
    expect(gB.overallStrength).toBe(0.8);

    // orgIndex = (0.9 + 0.8) / 2 = 0.85
    expect(result.organizationAlignmentIndex).toBeCloseTo(0.85, 5);
  });

  // ── Test 8: Entity type "indirect" alignment ──
  it('indirect对齐类型的实体被归入aligned组', () => {
    // Given: 1 goal, edges with 'indirect' alignment (not conflicting)
    const goals: GoalNode[] = [
      makeGoal('goal-indirect', '长期愿景目标', 'vision'),
    ];
    const edges: AlignEdge[] = [
      makeAlignEdge('goal-indirect', 'team-support', 0.4, 'indirect'),
      makeAlignEdge('goal-indirect', 'person-junior', 0.35, 'indirect'),
    ];
    const entityTypes: Record<string, string> = {
      'team-support': SOGNodeType.TEAM,
      'person-junior': SOGNodeType.PERSON,
    };

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    expect(result.goals).toHaveLength(1);
    const g = result.goals[0];
    expect(g.alignedEntities).toHaveLength(2);
    expect(g.misalignedEntities).toHaveLength(0);
    expect(g.overallStrength).toBeCloseTo((0.4 + 0.35) / 2, 5);
  });

  // ── Test 9: Entity type defaults to 'Unknown' when not in map ──
  it('entityTypes中未注册的实体使用Unknown类型', () => {
    // Given: 1 goal, edge to entity not in entityTypes map
    const goals: GoalNode[] = [
      makeGoal('goal-unknown', '未分类目标', 'okr'),
    ];
    const edges: AlignEdge[] = [
      makeAlignEdge('goal-unknown', 'mystery-entity', 0.75),
    ];
    const entityTypes: Record<string, string> = {}; // empty

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then
    const g = result.goals[0];
    expect(g.alignedEntities[0].entityType).toBe('Unknown');
    const unknownGroup = g.alignmentByType.find(t => t.entityType === 'Unknown')!;
    expect(unknownGroup.count).toBe(1);
    expect(unknownGroup.meanStrength).toBe(0.75);
  });

  // ── Test 10: Edge without explicit strength defaults to 0.5 ──
  it('缺少strength的边默认使用0.5', () => {
    // Given: 1 goal, 1 edge without explicit strength
    const goals: GoalNode[] = [
      makeGoal('goal-default', '默认值测试', 'okr'),
    ];
    const edges: AlignEdge[] = [
      { from: 'goal-default', to: 'person-d', type: SOGEdgeType.ALIGNS_WITH },
    ];
    const entityTypes: Record<string, string> = {
      'person-d': SOGNodeType.PERSON,
    };

    // When
    const result = computeGoalAlignment(goals, edges, entityTypes);

    // Then: default strength = 0.5
    expect(result.goals[0].alignedEntities[0].strength).toBe(0.5);
    expect(result.goals[0].overallStrength).toBe(0.5);
    expect(result.organizationAlignmentIndex).toBe(0.5);
  });
});

// ====================================================================
// Tests: goalAlignmentModule metadata
// ====================================================================

describe('goalAlignmentModule', () => {
  it('模块声明符合DiagnosticModule接口', () => {
    expect(goalAlignmentModule.id).toBe('goal-alignment');
    expect(goalAlignmentModule.version).toBe('1.0.0');
    expect(goalAlignmentModule.priority).toBe('P1');
    expect(goalAlignmentModule.confidenceModel).toBe('deterministic');
    expect(goalAlignmentModule.ontologyRole).toBe('analyzer');
    expect(typeof goalAlignmentModule.compute).toBe('function');
    expect(goalAlignmentModule.requiredDataSources).toEqual({});
  });

  it('compute函数接受string参数并返回Promise', () => {
    const result = goalAlignmentModule.compute('test-team');
    expect(result).toBeInstanceOf(Promise);
  });
});
