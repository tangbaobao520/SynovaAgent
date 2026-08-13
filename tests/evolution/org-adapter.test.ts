import { describe, it, expect } from 'vitest';
import { OrgAdapter } from '@synova/evolution';

/**
 * 模拟 AgentMemoryStore — 仅用于测试 org-adapter 逻辑。
 * 不做真实持久化, 只在内存中模拟 list/recall/remember。
 */
function makeMemoryStore(initial: Array<{ key: string; value: string; tags: string[]; type: string }> = []) {
  const store = new Map<string, { key: string; value: string; tags: string[]; type: string }>();
  for (const item of initial) {
    store.set(item.key, item);
  }
  return {
    remember: (entry: { orgId: string; key: string; value: string; type: string; tags: string[]; confidence: number; source: string; expiresAt: string | null }) => {
      store.set(entry.key, { key: entry.key, value: entry.value, tags: entry.tags, type: entry.type });
      return entry;
    },
    recall: (orgId: string, key: string) => {
      const item = store.get(key);
      return item ? { value: item.value } : null;
    },
    list: (query: { orgId: string; type?: string; tags?: string[]; limit?: number }) => {
      const results = Array.from(store.values())
        .filter(item => query.type ? item.type === query.type : true)
        .filter(item => query.tags && query.tags.length > 0 ? query.tags.every(t => item.tags.includes(t)) : true)
        .slice(0, query.limit || 50);
      return results.map(r => ({ value: r.value, tags: r.tags, type: r.type }));
    },
    forget: () => true,
  };
}

function makeGraphStore() {
  const nodes = new Map<string, Record<string, unknown>>();
  return {
    createNode: (type: string, props: Record<string, unknown>, graph: string) => {
      const id = `${graph}_${type}`;
      nodes.set(id, props);
      return id;
    },
    updateNode: (id: string, props: Record<string, unknown>, graph: string) => {
      const existing = nodes.get(id) || {};
      nodes.set(id, { ...existing, ...props });
    },
    queryNodes: () => [],
    getNode: (id: string) => nodes.get(id) || null,
  };
}

describe('OrgAdapter', () => {
  describe('afterDiagnosis — 无纠错', () => {
    it('无memoryStore → 降级但不抛错', async () => {
      const adapter = new OrgAdapter({ graphStore: makeGraphStore() });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.correctionsProcessed).toBe(0);
      expect(result.degraded).toBe(true); // memoryStore 未注入
    });

    it('无graphStore → 降级但不抛错', async () => {
      const adapter = new OrgAdapter({ memoryStore: makeMemoryStore() });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.correctionsProcessed).toBe(0);
    });

    it('空memoryStore → 零纠错+零阈值调整', async () => {
      const adapter = new OrgAdapter({
        graphStore: makeGraphStore(),
        memoryStore: makeMemoryStore(),
      });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.correctionsProcessed).toBe(0);
      expect(result.thresholdsAdjusted).toEqual([]);
      expect(result.ticketsClosed).toBe(0);
    });
  });

  describe('processCorrections — 事实提取', () => {
    it('从纠错文本提取现金流', async () => {
      const memStore = makeMemoryStore([
        { key: 'correction_f1_fb1', value: JSON.stringify({ reason: '现金流实际500万', actionId: 'prop_1', sentinelId: 'F1' }), tags: ['user_correction', 'correction', 'reject', 'F1'], type: 'enterprise_fact' },
      ]);
      const graphStore = makeGraphStore();
      const adapter = new OrgAdapter({ graphStore, memoryStore: memStore });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.correctionsProcessed).toBe(1);
      expect(result.factsWritten).toBeGreaterThanOrEqual(1);
    });

    it('从纠错文本提取营收', async () => {
      const memStore = makeMemoryStore([
        { key: 'correction_f3_fb2', value: JSON.stringify({ reason: '营收大约2亿', actionId: 'prop_2', sentinelId: 'F3' }), tags: ['user_correction', 'correction', 'modify', 'F3'], type: 'enterprise_fact' },
      ]);
      const adapter = new OrgAdapter({
        graphStore: makeGraphStore(),
        memoryStore: memStore,
      });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.correctionsProcessed).toBe(1);
      expect(result.factsWritten).toBeGreaterThanOrEqual(1);
    });

    it('无数字的纠错文本 → 不提取事实', async () => {
      const memStore = makeMemoryStore([
        { key: 'correction_o1_fb3', value: JSON.stringify({ reason: '这个判断不对，我们组织架构合理', actionId: 'prop_3', sentinelId: 'O1' }), tags: ['user_correction', 'correction', 'reject', 'O1'], type: 'enterprise_fact' },
      ]);
      const adapter = new OrgAdapter({
        graphStore: makeGraphStore(),
        memoryStore: memStore,
      });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.correctionsProcessed).toBe(1);
      expect(result.factsWritten).toBe(0); // 无数字可提取
    });
  });

  describe('adjustThresholds — 阈值自适应', () => {
    it('单次纠错 → 不触发阈值调整 (需≥3次)', async () => {
      const memStore = makeMemoryStore([
        { key: 'c1', value: JSON.stringify({ reason: '现金流不符', actionId: 'a1', sentinelId: 'F1' }), tags: ['user_correction', 'correction', 'reject', 'F1'], type: 'enterprise_fact' },
      ]);
      const adapter = new OrgAdapter({
        graphStore: makeGraphStore(),
        memoryStore: memStore,
        minCorrectionsForThresholdAdjustment: 3,
      });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.thresholdsAdjusted).toEqual([]);
    });

    it('同一哨兵纠错≥3次 → 触发阈值上调20%', async () => {
      const entries = [];
      for (let i = 0; i < 3; i++) {
        entries.push({
          key: `c_f1_${i}`,
          value: JSON.stringify({ reason: `现金流不符#${i}`, actionId: `a${i}`, sentinelId: 'F1' }),
          tags: ['user_correction', 'correction', 'reject', 'F1'],
          type: 'enterprise_fact',
        });
      }
      const memStore = makeMemoryStore(entries);
      const adapter = new OrgAdapter({
        graphStore: makeGraphStore(),
        memoryStore: memStore,
        minCorrectionsForThresholdAdjustment: 3,
        thresholdAdjustmentRatio: 0.2,
      });
      const result = await adapter.afterDiagnosis('test-org');
      expect(result.thresholdsAdjusted.length).toBe(1);
      expect(result.thresholdsAdjusted[0].sentinelId).toBe('F1');
      // 默认 critical 阈值 1.0 → 上调 20% → 0.8
      expect(result.thresholdsAdjusted[0].new).toBe(0.8);
    });
  });
});
