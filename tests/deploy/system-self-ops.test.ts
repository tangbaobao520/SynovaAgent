/**
 * tests/deploy/system-self-ops.test.ts — D52 自运维模块测试
 *
 * 覆盖: 安全操作/危险操作/未知操作/健康快照/列表
 */
import { describe, it, expect } from 'vitest';
import { executeSelfOp, collectHealthSnapshot, listAvailableOps } from '../../src/deploy/system-self-ops';

describe('SystemSelfOps', () => {
  describe('安全操作 — 直接执行', () => {
    it('restart-sentinels → 成功', () => {
      const result = executeSelfOp({ op: 'restart-sentinels', requestedBy: 'test' });
      expect(result.success).toBe(true);
      expect(result.severity).toBe('safe');
      expect(result.requiresApproval).toBe(false);
    });

    it('clear-cache → 成功', () => {
      const result = executeSelfOp({ op: 'clear-cache', requestedBy: 'test' });
      expect(result.success).toBe(true);
    });

    it('trigger-backup → 成功', () => {
      const result = executeSelfOp({ op: 'trigger-backup', requestedBy: 'test' });
      expect(result.success).toBe(true);
    });

    it('check-health → 成功', () => {
      const result = executeSelfOp({ op: 'check-health', requestedBy: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('危险操作 — 需审批', () => {
    it('version-rollback → 返回审批卡片', () => {
      const result = executeSelfOp({ op: 'version-rollback', params: { targetVersion: 'v1.0.0' }, requestedBy: 'test' });
      expect(result.success).toBe(true);
      expect(result.severity).toBe('dangerous');
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalTicketId).toBeTruthy();
      expect(result.message).toContain('v1.0.0');
    });

    it('db-repair → 返回审批卡片', () => {
      const result = executeSelfOp({ op: 'db-repair', requestedBy: 'test' });
      expect(result.requiresApproval).toBe(true);
    });

    it('schema-migrate → 返回审批卡片', () => {
      const result = executeSelfOp({ op: 'schema-migrate', params: { migrationName: 'add-goal-table' }, requestedBy: 'test' });
      expect(result.requiresApproval).toBe(true);
      expect(result.message).toContain('add-goal-table');
    });
  });

  describe('异常处理', () => {
    it('未知操作 → 失败 + degraded', () => {
      const result = executeSelfOp({ op: 'nonexistent-op', requestedBy: 'test' });
      expect(result.success).toBe(false);
      expect(result.degraded).toBe(true);
    });
  });

  describe('collectHealthSnapshot', () => {
    it('返回完整快照结构', () => {
      const snapshot = collectHealthSnapshot();
      expect(snapshot).toHaveProperty('sentinelHeartbeat');
      expect(snapshot).toHaveProperty('dataFreshness');
      expect(snapshot).toHaveProperty('watchdogAlive');
      expect(snapshot).toHaveProperty('timestamp');
    });
  });

  describe('listAvailableOps', () => {
    it('返回 7 个操作', () => {
      const ops = listAvailableOps();
      expect(ops.length).toBe(7);
      const safe = ops.filter(o => o.severity === 'safe');
      const dangerous = ops.filter(o => o.severity === 'dangerous');
      expect(safe.length).toBe(4);
      expect(dangerous.length).toBe(3);
    });
  });
});
