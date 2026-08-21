/**
 * memory-access-service.test.ts — L2 记忆访问服务测试
 *
 * 覆盖三条路径（铁律 48）：
 *   正常路径 — listByType/list/remember 返回真实数据
 *   降级路径 — AgentMemoryStore 抛错 → 空数组/null
 *   边界 — 空结果、limit 参数透传
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listByType: vi.fn(),
  list: vi.fn(),
  remember: vi.fn(),
}));

vi.mock('../../src/l4/agent-memory-store', () => ({
  getAgentMemoryStore: () => ({
    listByType: mocks.listByType,
    list: mocks.list,
    remember: mocks.remember,
  }),
}));

vi.mock('../../src/init/engine-context', () => ({
  getDatabase: () => ({}) as never,
}));

import { listMemoryByType, listMemory, rememberMemory } from '../../src/services/memory-access-service';

describe('services/memory-access-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listByType 正常路径 — 返回列表并透传 type/limit', () => {
    const entry = { id: 'm1', orgId: 'o1', key: 'k', value: 'v', type: 'sentinel_finding' };
    mocks.listByType.mockReturnValue([entry]);

    const result = listMemoryByType('sentinel_finding', 10);

    expect(mocks.listByType).toHaveBeenCalledWith('sentinel_finding', 10);
    expect(result).toEqual([entry]);
  });

  it('listByType 降级路径 — store 抛错 → 返回空数组', () => {
    mocks.listByType.mockImplementation(() => { throw new Error('store unavailable'); });

    const result = listMemoryByType('sentinel_finding');

    expect(result).toEqual([]);
  });

  it('listByType 边界 — 空结果返回空数组', () => {
    mocks.listByType.mockReturnValue([]);

    const result = listMemoryByType('sentinel_finding');

    expect(result).toEqual([]);
  });

  it('list 正常路径 — 透传 query 并返回记录', () => {
    const entry = { id: 'm2', orgId: 'o1', key: 'action_x', value: '{}', type: 'enterprise_fact' };
    mocks.list.mockReturnValue([entry]);

    const result = listMemory({ orgId: 'o1', type: 'enterprise_fact', tags: ['action'], limit: 50 });

    expect(mocks.list).toHaveBeenCalledWith({ orgId: 'o1', type: 'enterprise_fact', tags: ['action'], limit: 50 });
    expect(result).toEqual([entry]);
  });

  it('list 降级路径 — store 抛错 → 返回空数组', () => {
    mocks.list.mockImplementation(() => { throw new Error('boom'); });

    const result = listMemory({ orgId: 'o1', limit: 5 });

    expect(result).toEqual([]);
  });

  it('remember 正常路径 — 返回写入记录', () => {
    const entry = { id: 'm3', orgId: 'o1', key: 'action_1', value: '{}', type: 'enterprise_fact' };
    mocks.remember.mockReturnValue(entry);

    const result = rememberMemory({
      orgId: 'o1', key: 'action_1', value: '{}', type: 'enterprise_fact',
      confidence: 0.9, source: 'user_confirmed', tags: ['action'], expiresAt: null,
    });

    expect(mocks.remember).toHaveBeenCalled();
    expect(result).toEqual(entry);
  });

  it('remember 降级路径 — store 抛错 → 返回 null', () => {
    mocks.remember.mockImplementation(() => { throw new Error('db locked'); });

    const result = rememberMemory({
      orgId: 'o1', key: 'action_1', value: '{}', type: 'enterprise_fact',
      confidence: 0.9, source: 'user_confirmed', tags: ['action'], expiresAt: null,
    });

    expect(result).toBeNull();
  });
});
