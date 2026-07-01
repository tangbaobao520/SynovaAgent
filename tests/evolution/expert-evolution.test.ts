import { describe, it, expect } from 'vitest';
import {
  analyzeExpertCorrections,
  generateExpertProposal,
} from '@synova/evolution';

function makeMemoryStore() {
  const store = new Map<string, { orgId: string; value: string; tags: string[]; type: string }>();
  const mapKey = (orgId: string, key: string) => `${orgId}:${key}`;
  return {
    remember: (entry: { orgId: string; key: string; value: string; type: string; tags: string[]; confidence: number; source: string; expiresAt: string | null }) => {
      store.set(mapKey(entry.orgId, entry.key), { orgId: entry.orgId, value: entry.value, tags: entry.tags, type: entry.type });
      return entry;
    },
    recall: () => null,
    list: (query: { orgId: string; type?: string; tags?: string[]; limit?: number }) => {
      return Array.from(store.values())
        .filter(item => item.orgId === query.orgId)
        .filter(item => query.type ? item.type === query.type : true)
        .slice(0, query.limit || 50)
        .map(r => ({ value: r.value, tags: r.tags, type: r.type }));
    },
    forget: () => true,
  };
}

describe('analyzeExpertCorrections', () => {
  it('空数据 → 空分析结果', async () => {
    const mem = makeMemoryStore();
    const result = await analyzeExpertCorrections(mem as never, ['org1']);
    expect(result.experts).toEqual([]);
    expect(result.topExpert).toBeNull();
  });

  it('F1 纠错 → 映射到 finance 专家', async () => {
    const mem = makeMemoryStore();
    mem.remember({
      orgId: 'org1', key: 'c1',
      value: JSON.stringify({ sentinelId: 'F1_KZ', reason: 'KZ指数算错了' }),
      type: 'user_correction', confidence: 0.8, source: 'user_feedback',
      tags: ['correction', 'F1'], expiresAt: null,
    });
    const result = await analyzeExpertCorrections(mem as never, ['org1']);
    expect(result.experts.length).toBeGreaterThanOrEqual(1);
    const finance = result.experts.find(e => e.expert === 'finance');
    expect(finance).toBeDefined();
    expect(finance!.totalCorrections).toBe(1);
    expect(finance!.sentinelIds).toContain('F1_KZ');
  });

  it('O1 纠错 → 映射到 org 专家', async () => {
    const mem = makeMemoryStore();
    mem.remember({
      orgId: 'org1', key: 'c2',
      value: JSON.stringify({ sentinelId: 'O1_info_distortion', reason: '信息失真率不对' }),
      type: 'user_correction', confidence: 0.8, source: 'user_feedback',
      tags: ['correction', 'O1'], expiresAt: null,
    });
    const result = await analyzeExpertCorrections(mem as never, ['org1']);
    const orgExpert = result.experts.find(e => e.expert === 'org');
    expect(orgExpert).toBeDefined();
  });

  it('多个组织 + 多个哨兵 → 正确聚合', async () => {
    const mem = makeMemoryStore();
    for (let i = 0; i < 5; i++) {
      mem.remember({
        orgId: `org${i}`, key: `c_f1_${i}`,
        value: JSON.stringify({ sentinelId: 'F1_KZ', reason: '阈值问题' }),
        type: 'user_correction', confidence: 0.8, source: 'user_feedback',
        tags: ['correction', 'F1'], expiresAt: null,
      });
    }
    for (let i = 0; i < 3; i++) {
      mem.remember({
        orgId: `org${i}`, key: `c_t1_${i}`,
        value: JSON.stringify({ sentinelId: 'T1_software_health', reason: '软件评分不对' }),
        type: 'user_correction', confidence: 0.8, source: 'user_feedback',
        tags: ['correction', 'T1'], expiresAt: null,
      });
    }
    const result = await analyzeExpertCorrections(mem as never, ['org0', 'org1', 'org2', 'org3', 'org4']);
    const finance = result.experts.find(e => e.expert === 'finance');
    const tech = result.experts.find(e => e.expert === 'tech');
    expect(finance).toBeDefined();
    expect(finance!.totalCorrections).toBe(5);
    expect(tech).toBeDefined();
    expect(tech!.totalCorrections).toBe(3);
    // topExpert 应该是 finance (5 > 3)
    expect(result.topExpert?.expert).toBe('finance');
  });
});

describe('generateExpertProposal', () => {
  it('topExpert 纠错 < 3 → 返回 null', async () => {
    const analysis = {
      analyzedAt: new Date().toISOString(),
      experts: [{ expert: 'finance', totalCorrections: 1, uniqueSentinels: 1, sentinelIds: ['F1_KZ'], topReasons: ['test'] }],
      topExpert: { expert: 'finance', totalCorrections: 1, uniqueSentinels: 1, sentinelIds: ['F1_KZ'], topReasons: ['test'] },
    };
    const proposal = await generateExpertProposal(analysis);
    expect(proposal).toBeNull();
  });

  it('topExpert 纠错 ≥ 3 → 生成提案', async () => {
    const analysis = {
      analyzedAt: new Date().toISOString(),
      experts: [{ expert: 'finance', totalCorrections: 5, uniqueSentinels: 2, sentinelIds: ['F1_KZ', 'F2_runway'], topReasons: ['阈值问题', '数据不准确'] }],
      topExpert: { expert: 'finance', totalCorrections: 5, uniqueSentinels: 2, sentinelIds: ['F1_KZ', 'F2_runway'], topReasons: ['阈值问题', '数据不准确'] },
    };
    const mem = makeMemoryStore();
    const proposal = await generateExpertProposal(analysis, mem as never);
    expect(proposal).not.toBeNull();
    expect(proposal!.type).toBe('pattern_discovery');
    expect(proposal!.status).toBe('pending');
    expect(proposal!.title).toContain('finance');
    expect(proposal!.changes.length).toBe(2);
  });

  it('无 memoryStore → 仍返回提案（内存降级）', async () => {
    const analysis = {
      analyzedAt: new Date().toISOString(),
      experts: [{ expert: 'org', totalCorrections: 4, uniqueSentinels: 1, sentinelIds: ['O1_info_distortion'], topReasons: ['test'] }],
      topExpert: { expert: 'org', totalCorrections: 4, uniqueSentinels: 1, sentinelIds: ['O1_info_distortion'], topReasons: ['test'] },
    };
    const proposal = await generateExpertProposal(analysis);
    expect(proposal).not.toBeNull();
    expect(proposal!.title).toContain('org');
  });
});
