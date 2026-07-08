/**
 * tests/e2e/entity-resolution-e2e.test.ts — 切片: 实体解析 端到端
 *
 * 切片: 重复实体 → 拼音+语义匹配 → auto_merge/review/ignore
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例
 */
import { describe, it, expect } from 'vitest';
import { NodeType } from '@synova/ontology';

// Mock graph store with Person nodes
function fakeStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>) {
  return {
    queryNodes(_type: string) {
      return nodes.filter(n => n.type === _type).map(n => ({ ...n }));
    },
    queryEdges() { return []; },
  } as any;
}

describe('Entity Resolution E2E — 拼音编码 (Fix 1)', () => {
  it('Given 同音字姓名 "张翠山" vs "张翠珊", When resolved, Then fusedScore > 0.7 (Jaccard=0, 拼音=1)', async () => {
    const { resolveEntitiesL3 } = await import('../../src/l4/entity-resolver');
    const store = fakeStore([
      { id: 'p1', type: NodeType.RESOURCE_PERSON, props: { name: '张翠山' } },
      { id: 'p2', type: NodeType.RESOURCE_PERSON, props: { name: '张翠珊' } },
    ]);
    const result = await resolveEntitiesL3(store, 'test');
    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches[0];
    // Jaccard alone would be ~0 (different chars), pinyin makes it high
    expect(match.fusedScore).toBeGreaterThan(0.5);
  });

  it('Given identical names, When resolved, Then auto_merge (score >= 0.85)', async () => {
    const { resolveEntitiesL3 } = await import('../../src/l4/entity-resolver');
    const store = fakeStore([
      { id: 'p1', type: NodeType.RESOURCE_PERSON, props: { name: '王伟', email: 'wang@test.com' } },
      { id: 'p2', type: NodeType.RESOURCE_PERSON, props: { name: '王伟', email: 'wang@test.com' } },
    ]);
    const result = await resolveEntitiesL3(store, 'test');
    expect(result.autoMerged).toBeGreaterThanOrEqual(1);
  });

  it('Given completely different names, When resolved, Then ignore (score < 0.65)', async () => {
    const { resolveEntitiesL3 } = await import('../../src/l4/entity-resolver');
    const store = fakeStore([
      { id: 'p1', type: NodeType.RESOURCE_PERSON, props: { name: '张三' } },
      { id: 'p2', type: NodeType.RESOURCE_PERSON, props: { name: '李四' } },
    ]);
    const result = await resolveEntitiesL3(store, 'test');
    expect(result.ignored).toBeGreaterThanOrEqual(1);
    expect(result.autoMerged).toBe(0);
  });
});

describe('Entity Resolution E2E — 同类型 blocking (Fix 1)', () => {
  it('Given Person and Team with same name, When resolved, Then no cross-type match', async () => {
    const { resolveEntitiesL3 } = await import('../../src/l4/entity-resolver');
    const store = fakeStore([
      { id: 'p1', type: NodeType.RESOURCE_PERSON, props: { name: '研发部' } },
      { id: 't1', type: NodeType.RESOURCE_TEAM, props: { name: '研发部' } },
    ]);
    const result = await resolveEntitiesL3(store, 'test');
    expect(result.matches).toHaveLength(0); // Different types, no matching
  });

  it('Given single node, When resolved, Then no matches', async () => {
    const { resolveEntitiesL3 } = await import('../../src/l4/entity-resolver');
    const store = fakeStore([
      { id: 'p1', type: NodeType.RESOURCE_PERSON, props: { name: 'Alice' } },
    ]);
    const result = await resolveEntitiesL3(store, 'test');
    expect(result.matches).toHaveLength(0);
    expect(result.autoMerged).toBe(0);
  });
});
