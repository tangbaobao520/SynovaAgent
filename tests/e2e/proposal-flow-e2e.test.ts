/**
 * tests/e2e/proposal-flow-e2e.test.ts — 切片: 提议→确认 端到端
 *
 * 切片: 告警触发 → ProposalManager.propose → 用户 confirm → 右边栏更新
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProposalManager } from '../../src/l2/proposal-manager';

describe('Proposal E2E — create → confirm', () => {
  let mgr: ProposalManager;
  beforeEach(() => { mgr = new ProposalManager(); });

  it('Given alert_create proposal, When proposed then confirmed, Then status=confirmed', () => {
    const p = mgr.propose({
      type: 'alert_create',
      title: '线索转化率下降',
      description: '2小时内从15%降至12%',
      confidence: 0.85,
      source: 'metric.updated',
    });
    expect(p.status).toBe('proposed');
    expect(p.id).toBeTruthy();

    const result = mgr.resolve(p.id, 'confirm');
    expect(result.ok).toBe(true);
    expect(result.proposal!.status).toBe('confirmed');
  });

  it('Given proposal rejected, When same type proposed again within 24h, Then auto-suppressed', () => {
    const p1 = mgr.propose({
      type: 'alert_create', title: 'Test alert',
      description: 'test', confidence: 0.8, source: 'test',
    });
    mgr.resolve(p1.id, 'reject', 'not needed');

    // Same type within 24h → auto-suppressed
    const p2 = mgr.propose({
      type: 'alert_create', title: 'Test alert 2',
      description: 'test 2', confidence: 0.8, source: 'test',
    });
    expect(p2.status).toBe('rejected');
    expect(p2.userFeedback).toBe('auto-suppressed');
  });

  it('Given proposal with opinion feedback, When resolved, Then status=opinion', () => {
    const p = mgr.propose({
      type: 'goal_update', title: 'Update revenue goal',
      description: 'Revenue target should be 2M', confidence: 0.7, source: 'expert_analysis',
    });
    const result = mgr.resolve(p.id, 'opinion', '再观察一周');
    expect(result.ok).toBe(true);
    expect(result.proposal!.status).toBe('opinion');
    expect(result.proposal!.userFeedback).toBe('再观察一周');
  });
});

describe('Proposal E2E — expiry + stats', () => {
  it('Given proposal past expiry, When getPending, Then not returned (auto-expired)', () => {
    const mgr = new ProposalManager();
    const p = mgr.propose({
      type: 'obstacle_add', title: 'Old obstacle',
      description: 'test', confidence: 0.5, source: 'test',
    });
    // Manually set expiry to past
    (p as any).expiresAt = new Date(Date.now() - 1).toISOString();
    const pending = mgr.getPending();
    expect(pending.find(x => x.id === p.id)).toBeUndefined();
    expect(p.status).toBe('expired');
  });

  it('Given mixed proposals, When getConfirmationRate, Then correct stats', () => {
    const mgr = new ProposalManager();
    const p1 = mgr.propose({ type: 'alert_create', title: 'A1', description: '', confidence: 0.8, source: '' });
    const p2 = mgr.propose({ type: 'goal_create', title: 'G1', description: '', confidence: 0.6, source: '' });
    const p3 = mgr.propose({ type: 'alert_create', title: 'A2', description: '', confidence: 0.7, source: '' });
    mgr.resolve(p1.id, 'confirm');
    mgr.resolve(p2.id, 'reject');
    mgr.resolve(p3.id, 'opinion');

    const stats = mgr.getConfirmationRate();
    expect(stats.total).toBe(3);
    expect(stats.confirmed).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.rate).toBe(33);
  });
});
