/**
 * __tests__/capability-gap.test.ts — 能力缺口检测测试
 *
 * 被测系统: src/pipeline/diagnosis/capability-gap.ts → analyzeCapabilityGaps()
 * Mock 边界: 不 mock — 纯函数，零外部依赖
 * 时间处理: 不涉及
 *
 * Test cases:
 *   1. Build graph with capabilities + PROVIDES → correctly identified as covered
 *   2. Build graph with DEPENDS_ON gaps → gaps correctly identified
 *   3. Verify coverage calculation (0-1 score)
 *   4. Empty graph → coverage 1, zero gaps
 *   5. Boundary: single capability, no edges → unprovided gap detected
 *   6. Unprovided capability nodes → detected as gaps
 *   7. Mixed graph (coverage + gaps) → correct counts
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeCapabilityGaps,
  capabilityGapModule,
} from '../capability-gap';
import type { CapNode, CapEdge } from '../capability-gap';
import { SOGEdgeType } from '@synova/sog-core';

// ====================================================================
// Shared test data builders
// ====================================================================

function makeCapNode(
  id: string,
  name: string,
  category: CapNode['category'] = 'technical',
  proficiency?: number,
): CapNode {
  return { id, name, category, proficiencyLevel: proficiency };
}

function makeProvidesEdge(from: string, to: string): CapEdge {
  return { from, to, type: SOGEdgeType.PROVIDES };
}

function makeDependsOnEdge(from: string, to: string): CapEdge {
  return { from, to, type: SOGEdgeType.DEPENDS_ON };
}

// ====================================================================
// Tests
// ====================================================================

describe('analyzeCapabilityGaps', () => {
  // ── Test 1: Graph with capabilities and PROVIDES → fully covered ──
  it('有能力和提供者的完整图应产生零缺口', () => {
    // Given: 2 capability nodes, each with PROVIDES edges
    const capabilities: CapNode[] = [
      makeCapNode('cap-1', '前端开发', 'technical', 0.8),
      makeCapNode('cap-2', '产品设计', 'domain', 0.6),
    ];
    const edges: CapEdge[] = [
      makeProvidesEdge('person-1', 'cap-1'),
      makeProvidesEdge('person-2', 'cap-2'),
    ];
    const allNodeIds = ['cap-1', 'cap-2', 'person-1', 'person-2'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.totalCapabilities).toBe(2);
    expect(result.gaps).toHaveLength(0);
    expect(result.coverageScore).toBe(1);
    expect(result.coveredCategories).toContain('technical');
    expect(result.coveredCategories).toContain('domain');
    expect(result.ontologyPatches).toHaveLength(0);
  });

  // ── Test 2: DEPENDS_ON without capability → gaps identified ──
  it('有DEPENDS_ON但无对应Capability节点时识别缺口', () => {
    // Given: 1 capability (engineering), but a DEPENDS_ON edge to
    //        'qa-team' which has no CAPABILITY node and no PROVIDES edges
    const capabilities: CapNode[] = [
      makeCapNode('cap-eng', '工程能力', 'technical', 0.9),
    ];
    const edges: CapEdge[] = [
      makeProvidesEdge('person-eng', 'cap-eng'),
      // person-qa DEPENDS_ON something not declared as a capability
      makeDependsOnEdge('process-build', 'qa-team'),
    ];
    const allNodeIds = ['cap-eng', 'person-eng', 'process-build', 'qa-team'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].name).toBe('qa-team');
    expect(result.gaps[0].requiredBy).toContain('process-build');
    expect(result.gaps[0].severity).toBeGreaterThan(0);
    // Coverage: 1 provided / (1 cap + 1 gap) = 0.5
    expect(result.coverageScore).toBe(0.5);
  });

  // ── Test 3: Coverage calculation verification ──
  it('覆盖度计算公式正确', () => {
    // Given: 3 caps (2 provided, 1 unprovided) + 1 DEPENDS_ON gap
    const capabilities: CapNode[] = [
      makeCapNode('c1', '前端', 'technical', 0.8),
      makeCapNode('c2', '后端', 'technical', 0.7),
      makeCapNode('c3', '设计', 'domain', 0.5), // unprovided
    ];
    const edges: CapEdge[] = [
      makeProvidesEdge('p1', 'c1'),
      makeProvidesEdge('p2', 'c2'),
      // c3 has no PROVIDES → unprovided gap
      // DEPENDS_ON to 'compliance-officer' → gap
      makeDependsOnEdge('process-audit', 'compliance-officer'),
    ];
    const allNodeIds = ['c1', 'c2', 'c3', 'p1', 'p2', 'process-audit', 'compliance-officer'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    // 2 provided + 1 unprovided (c3) + 1 DEPENDS_ON gap (compliance-officer) = 2 gaps total
    // Provided: 2 (c1, c2 have PROVIDES)
    // Total needs: 3 caps + 1 non-unprovided gap = 4
    // Coverage: 2 / 4 = 0.5
    expect(result.coverageScore).toBe(0.5);
    expect(result.gaps).toHaveLength(2);

    // Verify unprovided gap
    const unprovidedGap = result.gaps.find(g => g.name === '设计');
    expect(unprovidedGap).toBeDefined();
    expect(unprovidedGap!.suggestion).toContain('无提供者');

    // Verify DEPENDS_ON gap
    const dependsGap = result.gaps.find(g => g.name === 'compliance-officer');
    expect(dependsGap).toBeDefined();
    expect(dependsGap!.requiredBy).toContain('process-audit');
  });

  // ── Test 4: Empty graph → coverage 1, zero gaps ──
  it('空图返回覆盖度1且零缺口', () => {
    // Given: no capabilities, no edges
    const capabilities: CapNode[] = [];
    const edges: CapEdge[] = [];
    const allNodeIds: string[] = [];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.totalCapabilities).toBe(0);
    expect(result.gaps).toHaveLength(0);
    expect(result.coverageScore).toBe(1);
    expect(result.coveredCategories).toHaveLength(0);
    expect(result.ontologyPatches).toHaveLength(0);
  });

  // ── Test 5: Single capability, no edges → unprovided gap ──
  it('单能力无边的边界情况——检测到无提供者缺口', () => {
    // Given: 1 capability node, zero edges
    const capabilities: CapNode[] = [
      makeCapNode('cap-only', '孤岛能力', 'leadership', 0.3),
    ];
    const edges: CapEdge[] = [];
    const allNodeIds: string[] = ['cap-only'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.totalCapabilities).toBe(1);
    expect(result.gaps).toHaveLength(1);
    // Unprovided gap: capability exists but no PROVIDES edge
    const gap = result.gaps[0];
    expect(gap.name).toBe('孤岛能力');
    expect(gap.category).toBe('leadership');
    // Coverage: 0 provided / (1 cap + 0 non-unprovided gaps) = 0
    expect(result.coverageScore).toBe(0);
    // Unprovided gaps don't produce ontology patches (they need providers, not new nodes)
    expect(result.ontologyPatches).toHaveLength(0);
  });

  // ── Test 6: Multiple DEPENDS_ON to same target → aggregated gap ──
  it('多个DEPENDS_ON指向同一缺失目标时聚合为一个缺口', () => {
    // Given: 2 capabilities, multiple DEPENDS_ON to same missing target
    const capabilities: CapNode[] = [
      makeCapNode('c-eng', '工程', 'technical', 0.8),
    ];
    const edges: CapEdge[] = [
      makeProvidesEdge('team-eng', 'c-eng'),
      makeDependsOnEdge('process-ci', 'devops-engineer'),
      makeDependsOnEdge('tool-deploy', 'devops-engineer'),
      makeDependsOnEdge('process-monitor', 'devops-engineer'),
    ];
    const allNodeIds = ['c-eng', 'team-eng', 'process-ci', 'tool-deploy', 'process-monitor', 'devops-engineer'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.gaps).toHaveLength(1);
    const gap = result.gaps[0];
    expect(gap.name).toBe('devops-engineer');
    // severity = min(1, 3 * 0.3) = 0.9
    expect(gap.severity).toBeCloseTo(0.9, 1);
    expect(gap.requiredBy).toHaveLength(3);
    expect(gap.requiredBy).toContain('process-ci');
    expect(gap.requiredBy).toContain('tool-deploy');
    expect(gap.requiredBy).toContain('process-monitor');
  });

  // ── Test 7: Category inference from gap names ──
  it('缺口名称推断类别正确', () => {
    // Given: gaps with different names that imply different categories
    const capabilities: CapNode[] = [];
    const edges: CapEdge[] = [
      makeDependsOnEdge('process-a', 'compliance-auditor'),
      makeDependsOnEdge('process-b', 'cto-office'),
      makeDependsOnEdge('process-c', 'devops-team'),
      makeDependsOnEdge('process-d', 'product-manager'),
    ];
    const allNodeIds = ['process-a', 'process-b', 'process-c', 'process-d',
                         'compliance-auditor', 'cto-office', 'devops-team', 'product-manager'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.gaps).toHaveLength(4);
    const byName = new Map(result.gaps.map(g => [g.name, g.category]));
    expect(byName.get('compliance-auditor')).toBe('compliance');
    expect(byName.get('cto-office')).toBe('leadership');
    expect(byName.get('devops-team')).toBe('technical');
    expect(byName.get('product-manager')).toBe('domain');
  });

  // ── Test 8: DEPENDS_ON to a node with PROVIDES → not a gap ──
  it('DEPENDS_ON指向已有能力提供者的节点时不算缺口', () => {
    // Given: person-qa provides cap-qa, process-build DEPENDS_ON person-qa
    //        → person-qa IS providing a capability, so no gap
    const capabilities: CapNode[] = [
      makeCapNode('cap-qa', '质量保证', 'technical', 0.7),
    ];
    const edges: CapEdge[] = [
      makeProvidesEdge('person-qa', 'cap-qa'),
      makeDependsOnEdge('process-build', 'person-qa'),
    ];
    const allNodeIds = ['cap-qa', 'person-qa', 'process-build'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    // person-qa has PROVIDES → cap-qa, so DEPENDS_ON to person-qa is covered
    expect(result.gaps).toHaveLength(0);
    expect(result.coverageScore).toBe(1);
  });

  // ── Test 9: Ontology patches generated for DEPENDS_ON gaps ──
  it('为DEPENDS_ON缺口生成本体补丁', () => {
    // Given: gap in 'security-engineer'
    const capabilities: CapNode[] = [
      makeCapNode('cap-fe', '前端', 'technical', 0.8),
    ];
    const edges: CapEdge[] = [
      makeProvidesEdge('person-fe', 'cap-fe'),
      makeDependsOnEdge('process-deploy', 'security-engineer'),
    ];
    const allNodeIds = ['cap-fe', 'person-fe', 'process-deploy', 'security-engineer'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.ontologyPatches).toHaveLength(1);
    const patch = result.ontologyPatches[0];
    expect(patch.action).toBe('create');
    expect(patch.nodeType).toBe('Capability');
    expect(patch.props.name).toBe('security-engineer');
    expect(patch.props.status).toBe('required');
    expect(patch.connectTo).toHaveLength(1);
    expect(patch.connectTo[0].targetId).toBe('process-deploy');
    expect(patch.connectTo[0].edgeType).toBe('DEPENDS_ON');
  });

  // ── Test 10: All categories in empty graph → no crash ──
  it('覆盖所有能力类别且无缺口时返回正确统计', () => {
    // Given: 4 capabilities, one per category, all provided
    const capabilities: CapNode[] = [
      makeCapNode('c-tech', '技术能力', 'technical', 0.9),
      makeCapNode('c-domain', '业务能力', 'domain', 0.7),
      makeCapNode('c-compliance', '合规能力', 'compliance', 0.5),
      makeCapNode('c-leadership', '领导力', 'leadership', 0.8),
    ];
    const edges: CapEdge[] = [
      makeProvidesEdge('p1', 'c-tech'),
      makeProvidesEdge('p2', 'c-domain'),
      makeProvidesEdge('p3', 'c-compliance'),
      makeProvidesEdge('p4', 'c-leadership'),
    ];
    const allNodeIds = ['c-tech', 'c-domain', 'c-compliance', 'c-leadership',
                         'p1', 'p2', 'p3', 'p4'];

    // When
    const result = analyzeCapabilityGaps(capabilities, edges, allNodeIds);

    // Then
    expect(result.totalCapabilities).toBe(4);
    expect(result.coveredCategories).toHaveLength(4);
    expect(result.gaps).toHaveLength(0);
    expect(result.coverageScore).toBe(1);
  });
});

// ── Module metadata tests ──

describe('capabilityGapModule', () => {
  it('模块声明符合DiagnosticModule接口', () => {
    expect(capabilityGapModule.id).toBe('capability-gap');
    expect(capabilityGapModule.version).toBe('1.0.0');
    expect(capabilityGapModule.priority).toBe('P1');
    expect(capabilityGapModule.confidenceModel).toBe('deterministic');
    expect(capabilityGapModule.ontologyRole).toBe('observer');
    expect(typeof capabilityGapModule.compute).toBe('function');
  });
});
