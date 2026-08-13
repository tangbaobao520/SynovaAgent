/**
 * tests/agent/workspace-context-bridge.test.ts
 * 测试: WorkspaceContextBridge 加载本工作区+关联工作区事实
 */
import { describe, it, expect } from 'vitest';
import { WorkspaceContextBridge } from '../../src/agent/workspace-context-bridge';
import type { AgentMemoryStore, MemoryQuery } from '../../src/l4/agent-memory-store';

describe('WorkspaceContextBridge', () => {
  // 创建一个最小 mock AgentMemoryStore
  function mockStore(entries: Array<{
    orgId: string; key: string; value: string; type: string;
  }>): AgentMemoryStore {
    return {
      list: (query: MemoryQuery) => {
        return entries.filter(e => {
          if (query.orgId && e.orgId !== query.orgId) return false;
          if (query.type && e.type !== query.type) return false;
          return true;
        }) as any[];
      },
      search: (_orgId: string, q: string, limit: number) => {
        return entries.filter(e => {
          return e.key.toLowerCase().includes(q.toLowerCase()) || e.value.toLowerCase().includes(q.toLowerCase());
        }).slice(0, limit) as any[];
      },
    } as unknown as AgentMemoryStore;
  }

  it('加载本工作区事实', async () => {
    const store = mockStore([
      { orgId: 'ws_pricing', key: '根因', value: '采购流程异常', type: 'enterprise_fact' },
      { orgId: 'ws_pricing', key: '建议', value: '暂不催收', type: 'enterprise_fact' },
      { orgId: 'ws_other', key: '无关', value: '其他工作区', type: 'enterprise_fact' },
    ]);
    const bridge = new WorkspaceContextBridge(store);
    const ctx = await bridge.loadContextForWorkspace('ws_pricing');

    expect(ctx.ownFacts).toHaveLength(2);
    expect(ctx.ownFacts[0]).toContain('采购流程异常');
    expect(ctx.relatedFacts).toHaveLength(0); // 无tags时不跨区
  });

  it('跨工作区加载相关事实', async () => {
    const store = mockStore([
      { orgId: 'ws_pricing', key: '根因', value: '采购流程异常', type: 'enterprise_fact' },
      { orgId: 'ws_brand', key: '定价区间', value: '32-38元', type: 'enterprise_fact' },
      { orgId: 'ws_brand', key: '竞品分析', value: '和府捞面45元', type: 'enterprise_fact' },
    ]);
    const bridge = new WorkspaceContextBridge(store);
    const ctx = await bridge.loadContextForWorkspace('ws_pricing', ['定价']);

    expect(ctx.ownFacts).toHaveLength(1);
    expect(ctx.relatedFacts).toHaveLength(1); // ws_brand 的定价区间匹配
    expect(ctx.relatedFacts[0]).toContain('ws_brand');
  });

  it('空store返回空数组', async () => {
    const store = mockStore([]);
    const bridge = new WorkspaceContextBridge(store);
    const ctx = await bridge.loadContextForWorkspace('ws_empty');

    expect(ctx.ownFacts).toEqual([]);
    expect(ctx.relatedFacts).toEqual([]);
  });

  it('tags为undefined时不跨区搜索', async () => {
    const store = mockStore([
      { orgId: 'ws_a', key: '测试', value: 'A的事实', type: 'enterprise_fact' },
      { orgId: 'ws_b', key: '测试', value: 'B的事实', type: 'enterprise_fact' },
    ]);
    const bridge = new WorkspaceContextBridge(store);
    const ctx = await bridge.loadContextForWorkspace('ws_a');

    expect(ctx.ownFacts).toHaveLength(1);
    expect(ctx.relatedFacts).toHaveLength(0); // 无tags
  });
});
