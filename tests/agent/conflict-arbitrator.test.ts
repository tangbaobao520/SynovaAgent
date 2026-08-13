/**
 * tests/agent/conflict-arbitrator.test.ts — D8e 冲突仲裁器测试
 */
import { describe, it, expect, vi } from 'vitest';

describe('autoResolve — 自动裁决', () => {
  it('分差 > 0.3 → 自动裁决出胜者', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const arbitrator = new ConflictArbitrator(null, { finance: 0.9, strategy: 0.5 });
    const conflict = {
      id: 'c1', experts: ['finance', 'strategy'] as [string, string],
      type: 'severity_opposite' as const, description: 'test',
      responses: [{ subTaskId: '', expertType: 'finance', analysis: '', confidence: 0, evidence: [], edgeIds: [], degraded: false, durationMs: 0 }] as any,
    };
    const result = await arbitrator.autoResolve(conflict);
    expect(result.winner).toBe('finance');
    expect(result.loser).toBe('strategy');
    expect(result.gap).toBe(0.4);
    expect(result.gap).toBeGreaterThan(0.3);
  });

  it('分差 <= 0.3 → 不自动决议', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const arbitrator = new ConflictArbitrator(null, { finance: 0.72, strategy: 0.70 });
    const conflict = {
      id: 'c2', experts: ['finance', 'strategy'] as [string, string],
      type: 'severity_opposite' as const, description: 'test',
      responses: [{ subTaskId: '', expertType: '', analysis: '', confidence: 0, evidence: [], edgeIds: [], degraded: false, durationMs: 0 }] as any,
    };
    const result = await arbitrator.autoResolve(conflict);
    expect(result.gap).toBeLessThanOrEqual(0.3);
  });
});

describe('arbitrate — 完整仲裁', () => {
  it('全部自动裁决 → degraded:false', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const auditStore = { log: vi.fn() };
    // 分差大 → 自动裁决
    const arbitrator = new ConflictArbitrator(auditStore, { finance: 0.9, strategy: 0.5 });
    const summary = await arbitrator.arbitrate({
      conflicts: [{
        id: 'c1', experts: ['finance', 'strategy'] as [string, string],
        type: 'severity_opposite' as const, description: 'test',
        responses: [] as any,
      }],
      tieBreakers: [],
      hasUnresolved: true,
      consensus: 'none',
    });
    expect(summary.totalAutoResolved).toBe(1);
    expect(summary.totalEscalated).toBe(0);
    expect(summary.degraded).toBe(false);
  });

  it('需要 GA 升级 → degraded:true', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const auditStore = { log: vi.fn() };
    // 分差小 → GA 升级
    const arbitrator = new ConflictArbitrator(auditStore, { finance: 0.70, strategy: 0.72 });
    const summary = await arbitrator.arbitrate({
      conflicts: [{
        id: 'c1', experts: ['finance', 'strategy'] as [string, string],
        type: 'severity_opposite' as const, description: 'test',
        responses: [] as any,
      }],
      tieBreakers: [],
      hasUnresolved: true,
      consensus: 'none',
    });
    expect(summary.totalEscalated).toBe(1);
    expect(summary.degraded).toBe(true);
    expect(summary.gaTickets).toHaveLength(1);
    expect(summary.gaTickets[0].ticketId).toContain('GA-');
  });

  it('空冲突 → 空结果', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const arbitrator = new ConflictArbitrator();
    const summary = await arbitrator.arbitrate({
      conflicts: [], tieBreakers: [], hasUnresolved: false, consensus: 'full',
    });
    expect(summary.totalAutoResolved).toBe(0);
    expect(summary.totalEscalated).toBe(0);
    expect(summary.degraded).toBe(false);
  });
});

describe('escalateToGA — GA 升级', () => {
  it('创建 GA 工单含必需字段', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const auditStore = { log: vi.fn() };
    const arbitrator = new ConflictArbitrator(auditStore);
    const conflict = {
      id: 'c1', experts: ['finance', 'strategy'] as [string, string],
      type: 'edge_mismatch' as const, description: 'test conflict',
      responses: [] as any,
    };
    const ticket = arbitrator.escalateToGA([conflict], []);
    expect(ticket.ticketId).toBeTruthy();
    expect(ticket.ticketId).toContain('GA-');
    expect(ticket.conflicts).toHaveLength(1);
    expect(ticket.status).toBe('pending');
    expect(ticket.createdAt).toBeTruthy();
    expect(auditStore.log).toHaveBeenCalled();
  });
});

describe('recordPrecedent — 先例记录', () => {
  it('写入审计日志', async () => {
    const { ConflictArbitrator } = await import('../../src/agent/conflict-arbitrator');
    const auditStore = { log: vi.fn() };
    const arbitrator = new ConflictArbitrator(auditStore);
    arbitrator.recordPrecedent(
      { conflictId: 'c1', resolution: 'auto', winner: 'finance', reason: 'higher score', precedentRecorded: true, timestamp: new Date().toISOString() },
      { id: 'c1', experts: ['finance', 'strategy'] as [string, string], type: 'severity_opposite' as const, description: 'test', responses: [] as any },
    );
    expect(auditStore.log).toHaveBeenCalled();
    const entry = auditStore.log.mock.calls[0][0];
    expect(entry.action).toBe('arbitration.auto');
    expect(entry.targetType).toBe('arbitration_precedent');
  });
});
