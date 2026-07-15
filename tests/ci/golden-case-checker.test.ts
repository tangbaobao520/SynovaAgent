/**
 * tests/ci/golden-case-checker.test.ts — D51 黄金案例 F1 评分器单元测试
 */
import { describe, it, expect } from 'vitest';

describe('computeF1Score — 3维F1评分', () => {
  it('完美匹配 → edgeHitRate=1.0, nodeMatchRate=1.0, severityMatch=true', async () => {
    const { computeF1Score } = await import('../../scripts/ci/golden-case-checker');
    const result = computeF1Score(
      { rootCauseEdgeIds: ['E-05'], severity: 'critical', matchedEdgeIds: ['E-05', 'E-12'] },
      { rootCauseEdgeIds: ['E-05'], rootCauseNodeTypes: ['CAPITAL_ACQUISITION'], severity: 'critical', matchedEdgeIds: ['E-05', 'E-12'], explanation: '' },
    );
    expect(result.edgeHitRate).toBe(1.0);
    expect(result.nodeMatchRate).toBe(1.0);
    expect(result.severityMatch).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('边缘不匹配 → edgeHitRate < 1.0', async () => {
    const { computeF1Score } = await import('../../scripts/ci/golden-case-checker');
    const result = computeF1Score(
      { rootCauseEdgeIds: ['E-05'], severity: 'critical', matchedEdgeIds: ['E-05'] },
      { rootCauseEdgeIds: ['E-05'], rootCauseNodeTypes: ['CAPITAL_ACQUISITION'], severity: 'critical', matchedEdgeIds: ['E-05', 'E-12'], explanation: '' },
    );
    expect(result.edgeHitRate).toBeLessThan(1.0);
    expect(result.details.missingEdges).toContain('E-12');
    expect(result.passed).toBe(false);
  });

  it('严重度不匹配 → severityMatch=false', async () => {
    const { computeF1Score } = await import('../../scripts/ci/golden-case-checker');
    const result = computeF1Score(
      { rootCauseEdgeIds: ['E-05'], severity: 'warning', matchedEdgeIds: ['E-05'] },
      { rootCauseEdgeIds: ['E-05'], rootCauseNodeTypes: ['CAPITAL_ACQUISITION'], severity: 'critical', matchedEdgeIds: ['E-05'], explanation: '' },
    );
    expect(result.severityMatch).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('节点类型不匹配 → nodeMatchRate < 1.0', async () => {
    const { computeF1Score } = await import('../../scripts/ci/golden-case-checker');
    const result = computeF1Score(
      { rootCauseEdgeIds: ['E-99'], severity: 'critical', matchedEdgeIds: ['E-99'] },
      { rootCauseEdgeIds: ['E-05'], rootCauseNodeTypes: ['CAPITAL_ACQUISITION'], severity: 'critical', matchedEdgeIds: ['E-05'], explanation: '' },
    );
    expect(result.nodeMatchRate).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe('deriveActual — 从fixture推导实际结果', () => {
  it('正确聚合所有边ID', async () => {
    const { deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const result = deriveActual({
      id: 'test-1', title: '测试', description: '', frozenAt: '',
      input: {
        sentinelFindings: [
          { id: 'F1', sentinel: 's1', severity: 'critical', title: '', matchedEdgeIds: ['E-05'], detectedAt: '' },
          { id: 'F2', sentinel: 's2', severity: 'warning', title: '', matchedEdgeIds: ['E-12'], detectedAt: '' },
        ],
        graphEdges: ['E-05', 'E-12'],
      },
      expected: { rootCauseEdgeIds: ['E-05'], rootCauseNodeTypes: [], severity: 'critical', matchedEdgeIds: ['E-05', 'E-12'], explanation: '' },
    });
    expect(result.matchedEdgeIds).toContain('E-05');
    expect(result.matchedEdgeIds).toContain('E-12');
    expect(result.severity).toBe('critical');
    expect(result.rootCauseEdgeIds).toContain('E-05');
  });

  it('无 critical 发现时使用第一个匹配边作为根因', async () => {
    const { deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const result = deriveActual({
      id: 'test-2', title: '测试', description: '', frozenAt: '',
      input: {
        sentinelFindings: [
          { id: 'F1', sentinel: 's1', severity: 'info', title: '', matchedEdgeIds: ['E-07'], detectedAt: '' },
        ],
        graphEdges: ['E-07'],
      },
      expected: { rootCauseEdgeIds: ['E-07'], rootCauseNodeTypes: [], severity: 'info', matchedEdgeIds: ['E-07'], explanation: '' },
    });
    expect(result.rootCauseEdgeIds).toHaveLength(1);
    expect(result.rootCauseEdgeIds[0]).toBe('E-07');
    expect(result.severity).toBe('low'); // info 不在 severityOrder 中，默认降为 low
  });
});

describe('金数据校验 — 5黄金案例全通过', () => {
  it('golden-case-01 现金流危机', async () => {
    const { computeF1Score, deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const fs = await import('fs');
    const data = JSON.parse(fs.readFileSync('tests/fixtures/golden-cases/golden-case-01-cashflow-crisis.json', 'utf-8'));
    const actual = deriveActual(data);
    const f1 = computeF1Score(actual, data.expected);
    expect(f1.passed).toBe(true);
  });

  it('golden-case-02 利润侵蚀', async () => {
    const { computeF1Score, deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const fs = await import('fs');
    const data = JSON.parse(fs.readFileSync('tests/fixtures/golden-cases/golden-case-02-margin-erosion.json', 'utf-8'));
    const actual = deriveActual(data);
    const f1 = computeF1Score(actual, data.expected);
    expect(f1.passed).toBe(true);
  });

  it('golden-case-03 客户流失潮', async () => {
    const { computeF1Score, deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const fs = await import('fs');
    const data = JSON.parse(fs.readFileSync('tests/fixtures/golden-cases/golden-case-03-churn-surge.json', 'utf-8'));
    const actual = deriveActual(data);
    const f1 = computeF1Score(actual, data.expected);
    expect(f1.passed).toBe(true);
  });

  it('golden-case-04 人才流失', async () => {
    const { computeF1Score, deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const fs = await import('fs');
    const data = JSON.parse(fs.readFileSync('tests/fixtures/golden-cases/golden-case-04-talent-drain.json', 'utf-8'));
    const actual = deriveActual(data);
    const f1 = computeF1Score(actual, data.expected);
    expect(f1.passed).toBe(true);
  });

  it('golden-case-05 竞争冲击', async () => {
    const { computeF1Score, deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const fs = await import('fs');
    const data = JSON.parse(fs.readFileSync('tests/fixtures/golden-cases/golden-case-05-competition-attack.json', 'utf-8'));
    const actual = deriveActual(data);
    const f1 = computeF1Score(actual, data.expected);
    expect(f1.passed).toBe(true);
  });
});
