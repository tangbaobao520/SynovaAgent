import { describe, it, expect } from 'vitest';
import {
  discoverIndustryPatterns,
  generateThresholdProposal,
  listProposals,
  rejectProposal,
} from '@synova/evolution';
import type { IndustryBaseline } from '@synova/evolution';

function makeMemoryStore() {
  const store = new Map<string, { orgId: string; key: string; value: string; tags: string[]; type: string }>();
  const mapKey = (orgId: string, key: string) => `${orgId}:${key}`;
  return {
    remember: (entry: { orgId: string; key: string; value: string; type: string; tags: string[]; confidence: number; source: string; expiresAt: string | null }) => {
      store.set(mapKey(entry.orgId, entry.key), { orgId: entry.orgId, key: entry.key, value: entry.value, tags: entry.tags, type: entry.type });
      return entry;
    },
    recall: (orgId: string, key: string) => {
      const item = store.get(mapKey(orgId, key));
      return item ? { value: item.value } : null;
    },
    list: (query: { orgId: string; type?: string; tags?: string[]; limit?: number }) => {
      return Array.from(store.values())
        .filter(item => item.orgId === query.orgId)
        .filter(item => query.type ? item.type === query.type : true)
        .filter(item => query.tags && query.tags.length > 0
          ? query.tags.some(t => item.tags.includes(t))
          : true)
        .slice(0, query.limit || 50)
        .map(r => ({ value: r.value, tags: r.tags, type: r.type }));
    },
    forget: (orgId: string, key: string) => store.delete(mapKey(orgId, key)),
  };
}

describe('discoverIndustryPatterns', () => {
  it('无纠错数据 → 空模式列表', async () => {
    const mem = makeMemoryStore();
    const patterns = await discoverIndustryPatterns(mem as never, ['org1']);
    expect(patterns).toEqual([]);
  });

  it('1 个组织有纠错 → 不触发模式（需≥3）', async () => {
    const mem = makeMemoryStore();
    mem.remember({
      orgId: 'org1', key: 'c1',
      value: JSON.stringify({ sentinelId: 'F1', reason: '现金流不符' }),
      type: 'user_correction', confidence: 0.8, source: 'user_feedback',
      tags: ['correction', 'F1'], expiresAt: null,
    });
    const patterns = await discoverIndustryPatterns(mem as never, ['org1']);
    expect(patterns).toEqual([]);
  });

  it('≥3 个组织纠错同一哨兵 → 发现模式', async () => {
    const mem = makeMemoryStore();
    for (let i = 0; i < 3; i++) {
      mem.remember({
        orgId: `org${i}`, key: `c_f1_${i}`,
        value: JSON.stringify({ sentinelId: 'F1', reason: 'KZ指数不对' }),
        type: 'user_correction', confidence: 0.8, source: 'user_feedback',
        tags: ['correction', 'F1'], expiresAt: null,
      });
    }
    const patterns = await discoverIndustryPatterns(mem as never, ['org0', 'org1', 'org2']);
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    expect(patterns[0].sentinelId).toBe('F1');
    expect(patterns[0].orgCount).toBeGreaterThanOrEqual(3);
  });
});

describe('generateThresholdProposal', () => {
  it('有阈值建议 → 生成 pending 提案', async () => {
    const suggestions: IndustryBaseline['thresholdSuggestions'] = [{
      sentinelId: 'F1_KZ',
      generalThreshold: { warning: 1.5, critical: 2.0 },
      industryMedian: 1.0,
      suggestion: '行业中位数 1.0 与通用阈值 2.0 偏差 50%',
    }];
    const mem = makeMemoryStore();
    const proposal = await generateThresholdProposal('saas-tech', suggestions, mem as never);
    expect(proposal).not.toBeNull();
    expect(proposal.type).toBe('threshold_adjustment');
    expect(proposal.status).toBe('pending');
    expect(proposal.changes.length).toBe(1);
    expect(proposal.changes[0].sentinelId).toBe('F1_KZ');
  });

  it('无 memoryStore → 仍返回提案（内存降级）', async () => {
    const suggestions: IndustryBaseline['thresholdSuggestions'] = [];
    const proposal = await generateThresholdProposal('test-industry', suggestions);
    expect(proposal).not.toBeNull();
    expect(proposal.status).toBe('pending');
    expect(proposal.changes).toEqual([]);
  });
});

describe('listProposals', () => {
  it('无提案 → 空数组', () => {
    const mem = makeMemoryStore();
    const result = listProposals(mem as never);
    expect(result).toEqual([]);
  });

  it('有提案 → 返回按时间降序', async () => {
    const mem = makeMemoryStore();
    const suggestions: IndustryBaseline['thresholdSuggestions'] = [{
      sentinelId: 'F1', generalThreshold: { warning: 1, critical: 2 }, industryMedian: 1, suggestion: 'test',
    }];
    await generateThresholdProposal('saas-tech', suggestions, mem as never);
    const proposals = listProposals(mem as never);
    expect(proposals.length).toBe(1);
    expect(proposals[0].status).toBe('pending');
  });
});

describe('rejectProposal', () => {
  it('拒绝 pending 提案 → 状态变为 rejected', async () => {
    const mem = makeMemoryStore();
    const suggestions: IndustryBaseline['thresholdSuggestions'] = [{
      sentinelId: 'F1', generalThreshold: { warning: 1, critical: 2 }, industryMedian: 1, suggestion: 'test',
    }];
    const proposal = await generateThresholdProposal('test', suggestions, mem as never);
    const rejected = await rejectProposal(mem as never, proposal.id);
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe('rejected');
  });

  it('拒绝不存在的提案 → 返回 null', async () => {
    const mem = makeMemoryStore();
    const result = await rejectProposal(mem as never, 'prop_nonexistent');
    expect(result).toBeNull();
  });
});
