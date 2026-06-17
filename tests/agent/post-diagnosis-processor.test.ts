/**
 * post-diagnosis-processor.test.ts — L2 诊断后处理服务测试 (铁律 0-2 Step 2)
 *
 * 验证: runPostDiagnosisProcessing 三步独立执行,
 *       单步失败不阻断整体 (铁律 24+31), 返回 degraded errors。
 *
 * Given/When/Then 格式, mock GraphStoreLike 可控。
 */
import { describe, it, expect, vi } from 'vitest';
import type { GraphStoreLike, CommunityReportLike, PostProcessEvents } from '../../src/agent/post-diagnosis-processor';

// ═══ Mock L4 模块 (避免静态跨层依赖) ═══
vi.mock('../../src/l4/graph-bridge', () => ({
  createGraphBridge: (store: GraphStoreLike, _teamId: string) => ({
    upsertFromKeyPersonRisk: (risks: Array<Record<string, unknown>>) => {
      if (store._failGraphBridge) throw new Error('GraphBridge failure');
      store._keyPersonRisks = risks;
      return risks.length;
    },
  }),
}));

vi.mock('../../src/l4/community-reports', () => ({
  generateCommunityReports: (store: GraphStoreLike, _teamId: string) => {
    if (store._failCommunityReports) throw new Error('CommunityReports failure');
    return store._communityReports || [];
  },
}));

vi.mock('../../src/l4/entity-resolver', () => ({
  resolveEntitiesL3: async (store: GraphStoreLike, _teamId: string) => {
    if (store._failEntityResolution) throw new Error('EntityResolution failure');
    return store._entityResolution || { autoMerged: 0, queuedForReview: 0 };
  },
}));

// ═══ Mock GraphStore ═══
function mockGraphStore(overrides: Record<string, unknown> = {}): GraphStoreLike {
  return {
    createNode: vi.fn(() => 'n1'),
    createNodes: vi.fn(() => ['n1']),
    queryNodes: vi.fn(() => []),
    queryEdges: vi.fn(() => []),
    createEdge: vi.fn(() => 'e1'),
    createEdges: vi.fn(() => ['e1']),
    getNode: vi.fn(() => null),
    updateNode: vi.fn(),
    deleteNode: vi.fn(),
    deleteEdge: vi.fn(),
    traverse: vi.fn(() => null),
    findPaths: vi.fn(() => []),
    queryTriples: vi.fn(() => []),
    getNodeAtTime: vi.fn(() => null),
    ...overrides,
  } as unknown as GraphStoreLike;
}

// ═══ Dynamic import after mocks are set up ═══
async function loadModule() {
  return await import('../../src/agent/post-diagnosis-processor');
}

// ═══ Tests ═══

describe('runPostDiagnosisProcessing — L2 诊断后处理', () => {
  it('Given 含风险 findings 的报告, When 处理后, Then keyPersonRisksSynced=true', async () => {
    const store = mockGraphStore();
    const report = {
      keyFindings: [
        { entity: 'u1', riskLevel: 'high', domains: ['tech'], busFactor: 1 },
        { entity: 'u2', riskLevel: 'medium', domains: ['sales'], busFactor: 2 },
      ],
    };
    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't1', report);

    expect(result.keyPersonRisksSynced).toBe(true);
    expect(store._keyPersonRisks).toHaveLength(2);
  });

  it('Given 无 findings 的报告, When 处理后, Then keyPersonRisksSynced=false 且无错误', async () => {
    const store = mockGraphStore();
    const report: Record<string, unknown> = {};
    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't2', report);

    expect(result.keyPersonRisksSynced).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it('Given GraphBridge 失败, When 处理后, Then degraded + 错误记录', async () => {
    const store = mockGraphStore({ _failGraphBridge: true });
    const report = {
      keyFindings: [{ entity: 'u1', riskLevel: 'high' }],
    };
    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't3', report);

    expect(result.keyPersonRisksSynced).toBe(false);
    expect(result.errors.some(e => e.includes('GraphBridge'))).toBe(true);
    // 后续步骤仍执行 (不因 GraphBridge 失败而中断)
    expect(result.communityCount).toBe(0);
  });

  it('Given CommunityReports 失败, When 处理后, Then degraded + 错误记录', async () => {
    const store = mockGraphStore({ _failCommunityReports: true });
    const report: Record<string, unknown> = {};
    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't4', report);

    expect(result.errors.some(e => e.includes('CommunityReports'))).toBe(true);
  });

  it('Given EntityResolution 失败, When 处理后, Then degraded + 错误记录', async () => {
    const store = mockGraphStore({ _failEntityResolution: true });
    const report: Record<string, unknown> = {};
    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't5', report);

    expect(result.errors.some(e => e.includes('EntityResolution'))).toBe(true);
  });

  it('Given 有社区报告的 store, When 处理后, Then 触发 onCommunityReports 回调', async () => {
    const communities: CommunityReportLike[] = [
      { id: 'c1', nodeCount: 5, summary: '核心团队' },
      { id: 'c2', nodeCount: 3, summary: '外部协作' },
    ];
    const store = mockGraphStore({ _communityReports: communities });
    const report: Record<string, unknown> = {};
    const events: PostProcessEvents = {
      onCommunityReports: vi.fn(),
    };

    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't6', report, events);

    expect(result.communityCount).toBe(2);
    expect(events.onCommunityReports).toHaveBeenCalledWith(2, communities);
  });

  it('Given 全部步骤成功, When 处理后, Then errors 为空', async () => {
    const communities: CommunityReportLike[] = [
      { id: 'c1', nodeCount: 3, summary: '测试社区' },
    ];
    const store = mockGraphStore({
      _communityReports: communities,
      _entityResolution: { autoMerged: 1, queuedForReview: 2 },
    });
    const report = {
      keyFindings: [{ entity: 'u1', riskLevel: 'low' }],
    };

    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't7', report);

    expect(result.errors).toHaveLength(0);
    expect(result.keyPersonRisksSynced).toBe(true);
    expect(result.communityCount).toBe(1);
    expect(result.autoMerged).toBe(1);
    expect(result.queuedForReview).toBe(2);
  });

  it('Given 多步失败, When 处理后, Then 所有错误被收集且不中断执行', async () => {
    const store = mockGraphStore({
      _failGraphBridge: true,
      _failCommunityReports: true,
    });
    const report = {
      keyFindings: [{ entity: 'u1', riskLevel: 'high' }],
    };

    const { runPostDiagnosisProcessing } = await loadModule();
    const result = await runPostDiagnosisProcessing(store, 't8', report);

    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some(e => e.includes('GraphBridge'))).toBe(true);
    expect(result.errors.some(e => e.includes('CommunityReports'))).toBe(true);
    // EntityResolution 仍尝试执行
    expect(result.autoMerged).toBe(0);
  });
});
