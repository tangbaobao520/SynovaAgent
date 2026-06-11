/**
 * __tests__/risk-aggregator.test.ts — 组织风险聚合分析测试
 *
 * 被测系统: src/pipeline/diagnosis/risk-aggregator.ts -> computeRiskAggregation()
 * Mock 边界: 不 mock — 纯函数，零外部依赖
 * 时间处理: 不涉及
 *
 * Test cases:
 *   1. Multiple Risk nodes with different severities — verify grouping + top risks
 *   2. Verify statistics and heatmap
 *   3. Empty graph (no risks)
 *   4. Risk with affected entities (AFFECTS edges)
 *   5. Risk without affected entities
 *   6. Mixed severity with edges from non-relevant edge types (filtered out)
 *   7. Multiple risk types in same category — heatmap grouping
 *   8. Module metadata compliance
 */

import { describe, it, expect } from 'vitest';
import {
  computeRiskAggregation,
  riskAggregatorModule,
} from '../risk-aggregator';
import type { RiskNode, RiskEdge } from '../risk-aggregator';
import { SOGEdgeType, SOGNodeType } from '@synova/sog-core';

// ====================================================================
// Shared test data builders
// ====================================================================

function makeRisk(
  id: string,
  riskType: string,
  severity: string,
  status = 'active',
): RiskNode {
  return { id, riskType, severity, status };
}

function makeEdge(from: string, to: string, type: SOGEdgeType): RiskEdge {
  return { from, to, type };
}

function makeAffectsEdge(from: string, to: string): RiskEdge {
  return makeEdge(from, to, SOGEdgeType.AFFECTS);
}

// ====================================================================
// Tests: computeRiskAggregation (pure function)
// ====================================================================

describe('computeRiskAggregation', () => {
  // ── Test 1: Multiple Risk nodes with different severities ──
  it('多个不同严重级别的风险节点按severity正确分组', () => {
    // Given: 5 risks across all severity levels
    const risks: RiskNode[] = [
      makeRisk('risk-1', 'key_person', 'critical'),
      makeRisk('risk-2', 'technical_debt', 'high'),
      makeRisk('risk-3', 'market', 'high'),
      makeRisk('risk-4', 'compliance', 'medium'),
      makeRisk('risk-5', 'process', 'low'),
    ];
    const edges: RiskEdge[] = [];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then
    expect(result.totalRisks).toBe(5);
    expect(result.bySeverity).toEqual({
      low: 1,
      medium: 1,
      high: 2,
      critical: 1,
    });
    expect(result.byStatus.active).toBe(5);
    expect(result.byStatus.mitigated).toBe(0);
    expect(result.byStatus.resolved).toBe(0);

    // Top risks sorted by impact (score descending when no edges)
    expect(result.topRisks).toHaveLength(5);
    expect(result.topRisks[0].riskId).toBe('risk-1'); // critical = 1.0
    expect(result.topRisks[0].severity).toBe('critical');
    expect(result.topRisks[0].score).toBe(1.0);
    expect(result.topRisks[0].impact).toBe(1.0); // 1.0 * (1 + 0*0.2) = 1.0

    expect(result.topRisks[1].severity).toBe('high');
    expect(result.topRisks[1].score).toBe(0.75);

    // Interpretation contains Chinese text
    expect(result.interpretation).toContain('5 个风险');
    expect(result.interpretation).toContain('1 个 critical');
    expect(result.interpretation).toContain('2 个 high');
  });

  // ── Test 2: Verify statistics and heatmap ──
  it('验证统计数据和热力图结构', () => {
    // Given: 6 risks — 2 key_person (1 critical, 1 high), 2 technical_debt (1 high, 1 medium), 2 market (1 medium, 1 low)
    const risks: RiskNode[] = [
      makeRisk('r1', 'key_person', 'critical'),
      makeRisk('r2', 'key_person', 'high'),
      makeRisk('r3', 'technical_debt', 'high'),
      makeRisk('r4', 'technical_debt', 'medium'),
      makeRisk('r5', 'market', 'medium'),
      makeRisk('r6', 'market', 'low'),
    ];
    const edges: RiskEdge[] = [];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then — byType
    expect(result.byType).toEqual({
      key_person: 2,
      technical_debt: 2,
      market: 2,
    });

    // Heatmap: 3 categories
    expect(result.riskHeatmap).toHaveLength(3);

    // key_person: 1 critical (1.0) + 1 high (0.75) -> weightedSum = 1.75, mean = 0.875
    const kp = result.riskHeatmap.find(h => h.riskType === 'key_person')!;
    expect(kp.total).toBe(2);
    expect(kp.severityCounts.critical).toBe(1);
    expect(kp.severityCounts.high).toBe(1);
    expect(kp.severityCounts.medium).toBe(0);
    expect(kp.severityCounts.low).toBe(0);
    expect(kp.weightedSum).toBe(1.75);
    expect(kp.meanSeverity).toBe(0.875);

    // technical_debt: 1 high (0.75) + 1 medium (0.5) -> weightedSum = 1.25, mean = 0.625
    const td = result.riskHeatmap.find(h => h.riskType === 'technical_debt')!;
    expect(td.total).toBe(2);
    expect(td.severityCounts.high).toBe(1);
    expect(td.severityCounts.medium).toBe(1);
    expect(td.weightedSum).toBe(1.25);
    expect(td.meanSeverity).toBe(0.625);

    // market: 1 medium (0.5) + 1 low (0.25) -> weightedSum = 0.75, mean = 0.375
    const mk = result.riskHeatmap.find(h => h.riskType === 'market')!;
    expect(mk.total).toBe(2);
    expect(mk.severityCounts.medium).toBe(1);
    expect(mk.severityCounts.low).toBe(1);
    expect(mk.weightedSum).toBe(0.75);
    expect(mk.meanSeverity).toBe(0.375);

    // Heatmap sorted by meanSeverity descending: key_person (0.875) > technical_debt (0.625) > market (0.375)
    expect(result.riskHeatmap[0].riskType).toBe('key_person');
    expect(result.riskHeatmap[1].riskType).toBe('technical_debt');
    expect(result.riskHeatmap[2].riskType).toBe('market');
  });

  // ── Test 3: Empty graph ──
  it('空图（无Risk节点）返回零统计和引导信息', () => {
    // Given: no risks, no edges
    const risks: RiskNode[] = [];
    const edges: RiskEdge[] = [];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then
    expect(result.totalRisks).toBe(0);
    expect(result.bySeverity).toEqual({
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    });
    expect(result.byType).toEqual({});
    expect(result.byStatus).toEqual({
      active: 0,
      mitigated: 0,
      resolved: 0,
    });
    expect(result.topRisks).toHaveLength(0);
    expect(result.riskHeatmap).toHaveLength(0);
    expect(result.interpretation).toContain('无 Risk 节点');
  });

  // ── Test 4: Risk with affected entities (AFFECTS edges) ──
  it('带AFFECTS边的风险节点影响评分高于无影响边的风险', () => {
    // Given: 2 risks, both 'high' severity
    //   risk-1 -> affects team-x, person-a (2 affected entities)
    //   risk-2 -> no outgoing edges
    const risks: RiskNode[] = [
      makeRisk('risk-1', 'key_person', 'high'),
      makeRisk('risk-2', 'compliance', 'high'),
    ];
    const edges: RiskEdge[] = [
      makeAffectsEdge('risk-1', 'team-x'),
      makeAffectsEdge('risk-1', 'person-a'),
    ];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then
    expect(result.totalRisks).toBe(2);
    expect(result.topRisks).toHaveLength(2);

    // risk-1: impact = 0.75 * (1 + 2 * 0.2) = 0.75 * 1.4 = 1.05 -> capped at 1.0
    const r1 = result.topRisks.find(r => r.riskId === 'risk-1')!;
    expect(r1.score).toBe(0.75);
    expect(r1.affectedCount).toBe(2);
    expect(r1.affectedEntities).toContain('team-x');
    expect(r1.affectedEntities).toContain('person-a');
    expect(r1.impact).toBeCloseTo(1.0, 3); // 0.75 * 1.4 = 1.05 capped to 1.0

    // risk-2: impact = 0.75 * (1 + 0 * 0.2) = 0.75
    const r2 = result.topRisks.find(r => r.riskId === 'risk-2')!;
    expect(r2.score).toBe(0.75);
    expect(r2.affectedCount).toBe(0);
    expect(r2.affectedEntities).toEqual([]);
    expect(r2.impact).toBe(0.75);

    // risk-1 sorted first (higher impact)
    expect(result.topRisks[0].riskId).toBe('risk-1');
    expect(result.topRisks[1].riskId).toBe('risk-2');

    // Interpretation mentions affected entities
    expect(result.interpretation).toContain('共影响 2 个实体');
  });

  // ── Test 5: Risk without affected entities — correct default ──
  it('无AFFECTS边的风险impact等于基础score', () => {
    // Given: single risk, no edges at all
    const risks: RiskNode[] = [
      makeRisk('risk-solo', 'technical_debt', 'medium'),
    ];
    const edges: RiskEdge[] = [];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then
    expect(result.totalRisks).toBe(1);
    const r = result.topRisks[0];
    expect(r.riskId).toBe('risk-solo');
    expect(r.score).toBe(0.5);
    expect(r.affectedCount).toBe(0);
    expect(r.affectedEntities).toEqual([]);
    expect(r.impact).toBe(0.5); // score * (1 + 0*0.2) = 0.5
    expect(result.byType).toEqual({ technical_debt: 1 });
  });

  // ── Test 6: Non-relevant edge types are filtered out ──
  it('非风险相关边类型(DEPENDS_ON等)被正确过滤不影响affectedCount', () => {
    // Given: 1 risk with a mix of AFFECTS and non-relevant edges (DEPENDS_ON, INTERACTS_WITH)
    const risks: RiskNode[] = [
      makeRisk('risk-1', 'key_person', 'high'),
    ];
    const edges: RiskEdge[] = [
      makeAffectsEdge('risk-1', 'team-x'),                     // relevant
      makeEdge('risk-1', 'tool-y', SOGEdgeType.DEPENDS_ON),    // NOT relevant
      makeEdge('risk-1', 'person-z', SOGEdgeType.INTERACTS_WITH), // NOT relevant
      makeEdge('risk-1', 'process-p', SOGEdgeType.TRIGGERS),   // relevant
    ];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then: only AFFECTS and TRIGGERS edges counted (2 relevant out of 4)
    expect(result.topRisks[0].affectedCount).toBe(2);
    expect(result.topRisks[0].affectedEntities).toContain('team-x');
    expect(result.topRisks[0].affectedEntities).toContain('process-p');
    expect(result.topRisks[0].affectedEntities).not.toContain('tool-y');
    expect(result.topRisks[0].affectedEntities).not.toContain('person-z');
  });

  // ── Test 7: Multiple risk types in same category — heatmap grouping ──
  it('相同riskType的风险在热力图中合并为一组', () => {
    // Given: 4 risks, all same type "key_person", different severities
    const risks: RiskNode[] = [
      makeRisk('r1', 'key_person', 'critical'),
      makeRisk('r2', 'key_person', 'high'),
      makeRisk('r3', 'key_person', 'medium'),
      makeRisk('r4', 'key_person', 'low'),
    ];
    const edges: RiskEdge[] = [];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then: single heatmap entry
    expect(result.riskHeatmap).toHaveLength(1);
    const entry = result.riskHeatmap[0];
    expect(entry.riskType).toBe('key_person');
    expect(entry.total).toBe(4);
    expect(entry.severityCounts).toEqual({
      low: 1,
      medium: 1,
      high: 1,
      critical: 1,
    });
    // weightedSum = 1*0.25 + 1*0.5 + 1*0.75 + 1*1.0 = 2.5
    expect(entry.weightedSum).toBe(2.5);
    // meanSeverity = 2.5 / 4 = 0.625
    expect(entry.meanSeverity).toBe(0.625);
  });

  // ── Test 8: Mixed statuses ──
  it('不同状态的风险在byStatus中正确分组', () => {
    // Given: risks with different statuses
    const risks: RiskNode[] = [
      makeRisk('r1', 'key_person', 'high', 'active'),
      makeRisk('r2', 'technical_debt', 'medium', 'mitigated'),
      makeRisk('r3', 'market', 'low', 'resolved'),
      makeRisk('r4', 'compliance', 'critical', 'active'),
    ];
    const edges: RiskEdge[] = [];

    // When
    const result = computeRiskAggregation(risks, edges);

    // Then
    expect(result.byStatus).toEqual({
      active: 2,
      mitigated: 1,
      resolved: 1,
    });
    expect(result.interpretation).toContain('活跃风险 2 个');
  });
});

// ====================================================================
// Tests: riskAggregatorModule metadata
// ====================================================================

describe('riskAggregatorModule', () => {
  it('模块声明符合DiagnosticModule接口', () => {
    expect(riskAggregatorModule.id).toBe('risk-aggregator');
    expect(riskAggregatorModule.version).toBe('1.0.0');
    expect(riskAggregatorModule.priority).toBe('P1');
    expect(riskAggregatorModule.confidenceModel).toBe('deterministic');
    expect(riskAggregatorModule.ontologyRole).toBe('analyzer');
    expect(typeof riskAggregatorModule.compute).toBe('function');
    expect(riskAggregatorModule.requiredDataSources).toEqual({});
  });

  it('compute函数接受string参数并返回Promise', () => {
    const result = riskAggregatorModule.compute('test-team');
    expect(result).toBeInstanceOf(Promise);
  });
});
