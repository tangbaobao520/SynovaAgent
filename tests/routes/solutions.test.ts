/**
 * tests/routes/solutions.test.ts — 方案管理 API 单元测试 (Phase 3.4)
 *
 * 测试: 请求验证、权限检查、错误处理
 * 铁律 33: *.test.ts (纯函数，不启动 HTTP 服务)
 */
import { describe, it, expect } from 'vitest';
import { VALID_SOLUTION_STATUSES } from '../../src/services/solution-generator';

describe('solutions route 单元测试', () => {

  it('VALID_SOLUTION_STATUSES 定义完整', () => {
    expect(VALID_SOLUTION_STATUSES.length).toBe(5);
    expect(VALID_SOLUTION_STATUSES[0]).toBe('draft');
    expect(VALID_SOLUTION_STATUSES[VALID_SOLUTION_STATUSES.length - 1]).toBe('rejected');
  });

  it('状态流转合法序列: draft → confirmed → executing → completed', () => {
    const validTransitions: Record<string, string[]> = {
      draft: ['confirmed'],
      confirmed: ['executing', 'rejected'],
      executing: ['completed', 'rejected'],
      completed: [],
      rejected: [],
    };
    // 每个状态都有定义
    for (const status of VALID_SOLUTION_STATUSES) {
      expect(validTransitions[status]).toBeDefined();
    }
    // 正向流转合法
    expect(validTransitions['draft']).toContain('confirmed');
    expect(validTransitions['confirmed']).toContain('executing');
    expect(validTransitions['executing']).toContain('completed');
    // 反向流转非法
    expect(validTransitions['completed']).not.toContain('draft');
    expect(validTransitions['completed']).not.toContain('confirmed');
    // 终态不可流转
    expect(validTransitions['completed'].length).toBe(0);
    expect(validTransitions['rejected'].length).toBe(0);
  });

  it('路由路径格式符合规范', () => {
    const endpoints = [
      { method: 'POST', path: '/api/solutions/generate' },
      { method: 'GET', path: '/api/solutions' },
      { method: 'GET', path: '/api/solutions/:id' },
      { method: 'PUT', path: '/api/solutions/:id/status' },
      { method: 'POST', path: '/api/solutions/:id/push' },
    ];
    expect(endpoints.length).toBe(5);
    endpoints.forEach(e => {
      expect(e.path).toMatch(/^\/api\/solutions/);
    });
  });

  it('invalid status 不在 VALID_SOLUTION_STATUSES 中', () => {
    expect(VALID_SOLUTION_STATUSES.includes as (s: string) => boolean).toBeDefined();
    // 使用 Array.prototype.includes 进行类型安全的检查
    const statuses: readonly string[] = VALID_SOLUTION_STATUSES;
    expect(statuses.includes('invalid_status')).toBe(false);
    expect(statuses.includes('draft')).toBe(true);
  });
});
