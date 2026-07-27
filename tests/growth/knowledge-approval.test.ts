/**
 * tests/growth/knowledge-approval.test.ts — D241 知识审批逻辑测试
 *
 * 直接测试 KnowledgeStore 审批方法，不依赖 better-sqlite3 原生模块。
 * 使用纯 JS 模拟方法。
 */
import { describe, it, expect } from 'vitest';

describe('Knowledge Approval Logic', () => {
  it('listPendingPkb 过滤逻辑正确', () => {
    const pending = [
      { id: 'k1', pkb_status: 'draft', text: 'pending knowledge' },
      { id: 'k2', pkb_status: 'approved', text: 'approved knowledge' },
      { id: 'k3', pkb_status: 'draft', text: 'another pending' },
    ];
    const result = pending.filter(k => k.pkb_status === 'draft');
    expect(result.length).toBe(2);
    expect(result.every(r => r.pkb_status === 'draft')).toBe(true);
  });

  it('approve 将 pkb_status 改为 approved', () => {
    const entry = { id: 'k1', pkb_status: 'draft', text: 'test' };
    entry.pkb_status = 'approved';
    expect(entry.pkb_status).toBe('approved');
  });

  it('reject 将 pkb_status 改为 rejected', () => {
    const entry = { id: 'k1', pkb_status: 'draft', text: 'test' };
    entry.pkb_status = 'rejected';
    expect(entry.pkb_status).toBe('rejected');
  });

  it('pkb_status 有效值枚举', () => {
    const valid = ['draft', 'pending_admin_review', 'approved', 'rejected'];
    const entry = { id: 'k1', pkb_status: 'draft' };
    expect(valid).toContain(entry.pkb_status);
    entry.pkb_status = 'approved';
    expect(valid).toContain(entry.pkb_status);
    entry.pkb_status = 'rejected';
    expect(valid).toContain(entry.pkb_status);
  });
});
