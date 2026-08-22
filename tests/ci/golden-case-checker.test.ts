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

// ═══════════════════════════════════════════════════════════════
// D396: 快照层测试 — compute 全 diff / findings 全 diff / 专家报告结构断言
// 铁律 48: 覆盖正常路径 + 降级路径 + 边界条件 + 红-绿演练（非空壳）
// ═══════════════════════════════════════════════════════════════

describe('runComputeSnapshot — compute 全 diff（真跑 computeCashRunway）', () => {
  it('合法 compute fixture → passed:true（正常路径）', async () => {
    const { runComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runComputeSnapshot({
      function: 'computeCashRunway',
      input: [{ cash: 100000, operatingExpense: 30000 }],
      snapshot: { runwayMonths: 3.3, monthlyBurn: 30000, signal: 'critical', degraded: false, warnings: [] },
    });
    expect(result.passed).toBe(true);
    expect(result.diffs).toHaveLength(0);
  });

  it('红-绿演练: 快照 signal 与真实输出不一致 → passed:false + diff 点名 signal', async () => {
    const { runComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    // 真实 computeCashRunway 输出 signal=critical；这里故意把冻结快照改成 healthy（等价于改坏阈值导致的漂移）
    const result = runComputeSnapshot({
      function: 'computeCashRunway',
      input: [{ cash: 100000, operatingExpense: 30000 }],
      snapshot: { runwayMonths: 3.3, monthlyBurn: 30000, signal: 'healthy', degraded: false, warnings: [] },
    });
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.includes('signal'))).toBe(true);
  });

  it('compute.snapshot 缺失 → degraded:true + passed:false（不静默 pass，降级路径）', async () => {
    const { runComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runComputeSnapshot({ function: 'computeCashRunway', input: [{ cash: 100000, operatingExpense: 30000 }] });
    expect(result.passed).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.diffs.length).toBeGreaterThan(0);
  });

  it('未登记的 function 名 → passed:false + "未登记"（不静默 skip，边界）', async () => {
    const { runComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runComputeSnapshot({ function: 'notRegisteredFn', input: [], snapshot: {} });
    expect(result.passed).toBe(false);
    expect(result.degraded).toBe(false);
    expect(result.diffs.some((d) => d.includes('未登记') || d.includes('notRegisteredFn'))).toBe(true);
  });
});

describe('diffFindings / runFindingsSnapshot — findings 全 diff', () => {
  it('改坏哨兵 aggregate → findings 集合 diff 命中 missing/extra', async () => {
    const { diffFindings } = await import('../../scripts/ci/golden-snapshot-runner');
    const snapshot = [
      { id: 'F1', severity: 'critical', title: '现金流不足 6 个月' },
    ];
    const actual = [
      { id: 'F2', severity: 'warning', title: '融资渠道受限' },
    ];
    const diff = diffFindings(actual, snapshot);
    expect(diff.missing).toContain('F1');
    expect(diff.extra).toContain('F2');
  });

  it('findings 完全一致 → missing/extra/mismatched 均空（正常路径）', async () => {
    const { diffFindings } = await import('../../scripts/ci/golden-snapshot-runner');
    const snapshot = [{ id: 'F1', severity: 'critical', title: '现金流不足 6 个月' }];
    const actual = [{ id: 'F1', severity: 'critical', title: '现金流不足 6 个月' }];
    const diff = diffFindings(actual, snapshot);
    expect(diff.missing).toHaveLength(0);
    expect(diff.extra).toHaveLength(0);
    expect(diff.mismatched).toHaveLength(0);
  });

  it('未登记 findings function → passed:false（不静默 skip，边界）', async () => {
    const { runFindingsSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runFindingsSnapshot({ function: 'notRegisteredAggregate', input: {}, snapshot: [] });
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.includes('未登记') || d.includes('notRegisteredAggregate'))).toBe(true);
  });
});

describe('runExpertReportAssertion — 专家报告结构断言', () => {
  it('confidence 越界（>1）→ 断言失败', async () => {
    const { runExpertReportAssertion } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runExpertReportAssertion({
      snapshot: { expert: 'finance', summary: '现金流告警', confidence: 1.5, checkedAt: '2026-08-16T00:00:00Z' },
    });
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.includes('confidence'))).toBe(true);
  });

  it('合法专家报告 → passed:true（正常路径）', async () => {
    const { runExpertReportAssertion } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runExpertReportAssertion({
      snapshot: { expert: 'finance', summary: '现金流告警', confidence: 0.8, checkedAt: '2026-08-16T00:00:00Z' },
    });
    expect(result.passed).toBe(true);
    expect(result.diffs).toHaveLength(0);
  });

  it('summary 为空 → 断言失败（边界）', async () => {
    const { runExpertReportAssertion } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runExpertReportAssertion({
      snapshot: { expert: 'finance', summary: '', confidence: 0.8, checkedAt: '2026-08-16T00:00:00Z' },
    });
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.includes('summary'))).toBe(true);
  });
});

describe('golden-case-11 — 集成（真实 fixture + 真实 compute 函数）', () => {
  it('F1 门禁 + compute 快照双通过（铁律 12: 真实路由，不 mock）', async () => {
    const fs = await import('fs');
    const { computeF1Score, deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const { runComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const data = JSON.parse(fs.readFileSync('tests/fixtures/golden-cases/golden-case-11-cash-runway-threshold.json', 'utf-8'));
    const f1 = computeF1Score(deriveActual(data), data.expected);
    expect(f1.passed).toBe(true);
    const snap = runComputeSnapshot(data.compute);
    expect(snap.passed).toBe(true);
  });

  it('旧 fixture（无 compute 段）→ 只跑 F1，向后兼容', async () => {
    const fs = await import('fs');
    const { computeF1Score, deriveActual } = await import('../../scripts/ci/golden-case-checker');
    const data = JSON.parse(fs.readFileSync('tests/fixtures/golden-cases/golden-case-01-cashflow-crisis.json', 'utf-8'));
    // 旧 fixture 无快照段 → checker 应只跑 F1 门禁，不报错
    expect(data.compute).toBeUndefined();
    expect(data.findings).toBeUndefined();
    expect(data.expertReport).toBeUndefined();
    const f1 = computeF1Score(deriveActual(data), data.expected);
    expect(f1.passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// D474: 黄金数据集门禁测试 — keyless 录制 + severity 对比 + 降级
// 铁律 48: 覆盖正常路径 + 降级路径 + 边界条件 + 红-绿演练（非空壳）
// ═══════════════════════════════════════════════════════════

describe('recordComputeSnapshot — keyless 快照录制（DSH snapshot 范式）', () => {
  it('合法 compute fixture → 返回 snapshot（正常路径，真跑 computeCashRunway）', async () => {
    const { recordComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const rec = recordComputeSnapshot({
      function: 'computeCashRunway',
      input: [{ cash: 100000, operatingExpense: 30000 }],
    });
    expect(rec.error).toBeUndefined();
    expect(rec.snapshot).toBeDefined();
    expect(rec.snapshot?.signal).toBe('critical');
    expect(rec.snapshot?.runwayMonths).toBe(3.3);
  });

  it('未登记 function → 返回 error（不静默，降级路径）', async () => {
    const { recordComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const rec = recordComputeSnapshot({ function: 'notRegisteredFn', input: {} });
    expect(rec.snapshot).toBeUndefined();
    expect(rec.error).toContain('未登记');
  });

  it('录制 ≠ 判定：返回快照候选但不写 fixture（边界）', async () => {
    const { recordComputeSnapshot } = await import('../../scripts/ci/golden-snapshot-runner');
    const rec = recordComputeSnapshot({
      function: 'computeCashRunway',
      input: [{ cash: 100000, operatingExpense: 30000 }],
    });
    expect(rec.snapshot).toBeDefined();
    // 录制对象含冻结候选所需字段
    expect(typeof rec.snapshot?.monthlyBurn).toBe('number');
    expect(Array.isArray(rec.snapshot?.warnings)).toBe(true);
  });
});

describe('runGoldenDatasetCheck — 黄金数据集 severity 级对比', () => {
  it('已登记哨兵 severity 一致 → passed:true（正常路径）', async () => {
    const { runGoldenDatasetCheck } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runGoldenDatasetCheck(
      {
        datasetVersion: 'v1',
        sentinels: { 'cash-runway': { expected: 'critical', value: 0.22 } },
        expectedDiagnosis: { severity: 'critical' },
      },
      { 'cash-runway': [{ cash: 100000, operatingExpense: 30000 }] },
    );
    expect(result.passed).toBe(true);
    expect(result.diffs).toHaveLength(0);
  });

  it('红-绿演练: severity 漂移（期望 critical 实际 warning）→ passed:false + diff 点名', async () => {
    const { runGoldenDatasetCheck } = await import('../../scripts/ci/golden-snapshot-runner');
    // 等价于改坏 cash-runway 阈值: 用 6 个月以下边界外输入使输出为 warning，与 expected=critical 冲突
    const result = runGoldenDatasetCheck(
      {
        datasetVersion: 'v1',
        sentinels: { 'cash-runway': { expected: 'critical', value: 0.22 } },
        expectedDiagnosis: { severity: 'critical' },
      },
      { 'cash-runway': [{ cash: 100000, operatingExpense: 10000 }] }, // runway 10 个月 → warning
    );
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.includes('cash-runway') && d.includes('critical'))).toBe(true);
  });

  it('数据集缺 sentinels → degraded:true + passed:false（不静默 pass，降级路径）', async () => {
    const { runGoldenDatasetCheck } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runGoldenDatasetCheck(
      { datasetVersion: 'v1', sentinels: {} },
      {},
    );
    expect(result.passed).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it('未登记 compute 哨兵 → 跳过不硬判红（L2c 边界：registry 登记什么查什么）', async () => {
    const { runGoldenDatasetCheck } = await import('../../scripts/ci/golden-snapshot-runner');
    // margin-health 无对应 compute 登记 → 该哨兵跳过；cash-runway 已登记且有 input → 检查
    const result = runGoldenDatasetCheck(
      {
        datasetVersion: 'v1',
        sentinels: {
          'margin-health': { expected: 'high', value: 0.35 },
          'cash-runway': { expected: 'critical', value: 0.22 },
        },
        expectedDiagnosis: { severity: 'critical' },
      },
      { 'cash-runway': [{ cash: 100000, operatingExpense: 30000 }] },
    );
    // margin-health 跳过（未登记），cash-runway 通过 → passed（不因未登记哨兵红）
    expect(result.passed).toBe(true);
  });

  it('已登记但未提供 input → 跳过不硬判红（L2c 边界）', async () => {
    const { runGoldenDatasetCheck } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runGoldenDatasetCheck(
      {
        datasetVersion: 'v1',
        sentinels: { 'cash-runway': { expected: 'critical', value: 0.22 } },
        expectedDiagnosis: { severity: 'critical' },
      },
      {}, // 无 input
    );
    // 已登记但无 input → 跳过（无法跑真实代码不硬判红）→ checked=0 → 显式失败但非降级
    expect(result.passed).toBe(false);
    expect(result.degraded).toBe(false);
    expect(result.diffs.some((d) => d.includes('检查数为 0'))).toBe(true);
  });

  it('expectedDiagnosis.severity 与哨兵期望集合不一致 → diff（全局对比）', async () => {
    const { runGoldenDatasetCheck } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runGoldenDatasetCheck(
      {
        datasetVersion: 'v1',
        sentinels: { 'cash-runway': { expected: 'critical', value: 0.22 } },
        expectedDiagnosis: { severity: 'high' }, // 全局 vs 哨兵 critical 不一致
      },
      { 'cash-runway': [{ cash: 100000, operatingExpense: 30000 }] },
    );
    expect(result.passed).toBe(false);
    expect(result.diffs.some((d) => d.includes('expectedDiagnosis.severity'))).toBe(true);
  });

  it('空 dataset → degraded（边界）', async () => {
    const { runGoldenDatasetCheck } = await import('../../scripts/ci/golden-snapshot-runner');
    const result = runGoldenDatasetCheck(null as unknown as Parameters<typeof runGoldenDatasetCheck>[0], {});
    expect(result.passed).toBe(false);
    expect(result.degraded).toBe(true);
  });
});

describe('runGoldenDatasetPhase — 阶段 5 接线（真实 wani-baby 数据集）', () => {
  it('真实 wani-baby-v1.json → cash-runway severity 对比通过（铁律 12: 真实数据不 mock）', async () => {
    const { runGoldenDatasetPhase } = await import('../../scripts/ci/golden-case-checker');
    const result = runGoldenDatasetPhase();
    // 数据集存在 + 已登记哨兵（cash-runway）对比通过
    expect(result.passed).toBe(true);
    expect(result.degraded).toBe(false);
  });

  it('findingsFnRegistry 保持空 {} 且黄金数据集检查不依赖它（S-10 显式 descope 回归）', async () => {
    const { findingsFnRegistry } = await import('../../scripts/ci/golden-snapshot-runner');
    expect(Object.keys(findingsFnRegistry)).toHaveLength(0);
    const { runGoldenDatasetPhase } = await import('../../scripts/ci/golden-case-checker');
    const result = runGoldenDatasetPhase();
    expect(result.degraded).toBe(false); // 空 findingsFnRegistry 不阻塞黄金数据集检查
  });
});
