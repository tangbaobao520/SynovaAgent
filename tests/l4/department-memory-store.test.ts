/**
 * tests/l4/department-memory.test.ts — D284 跨部门信号检测测试
 *
 * L1 单元 ×3: 关键词匹配 / 跨部门 crossover / 匿名化
 * L2b 集成 ×1: list → scanCrossDeptSignals → CrossDeptSignal
 */
import { describe, it, expect } from 'vitest';
import { scanCrossDeptSignals } from '../../src/l4/department-memory-store';
import type { MemoryEntry } from '../../src/l4/agent-memory-store';

function fakeEntries(items: Array<{ key?: string; value?: string; dept: string; daysAgo?: number; type?: string }>): MemoryEntry[] {
  return items.map((item, i) => ({
    id: `mem_${i}`,
    orgId: 'org-test',
    key: item.key || `key-${i}`,
    value: item.value || '',
    type: (item.type || 'fact') as MemoryEntry['type'],
    confidence: 0.8,
    source: 'test',
    tags: [`dept:${item.dept}`],
    createdAt: new Date(Date.now() - (item.daysAgo || 1) * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
    accessCount: 0,
  }));
}

function makeListStore(entries: MemoryEntry[]) {
  return {
    list(_query: { orgId: string; type?: string; tags?: string[]; limit?: number }) {
      if (_query.type && _query.type !== 'fact') return [];
      return entries.filter(e =>
        !_query.tags || _query.tags.length === 0 ||
        _query.tags.some(t => e.tags.includes(t)),
      ).slice(0, _query.limit || 1000);
    },
    searchMemory(_orgId: string, _query: string, _limit?: number) {
      return [];
    },
  };
}

describe('scanCrossDeptSignals', () => {
  it('Given same-dept entries only, When scanCrossDeptSignals, Then returns no signal', () => {
    const store = makeListStore(fakeEntries([
      { key: 'sale1', value: '客户投诉产品质量', dept: 'sales' },
      { key: 'sale2', value: '客户申请退款', dept: 'sales' },
    ]));
    const signals = scanCrossDeptSignals(store, 'org-test', 30);
    expect(signals).toHaveLength(0);
  });

  it('Given cross-dept entries matching keywords, When scanCrossDeptSignals, Then returns signal with anonymized summary', () => {
    const store = makeListStore(fakeEntries([
      { key: 'sale-record', value: '客户投诉产品缺陷，要求退款', dept: 'sales' },
      { key: 'bug-report', value: '系统有严重bug导致崩溃', dept: 'engineering' },
    ]));
    const signals = scanCrossDeptSignals(store, 'org-test', 30);
    expect(signals.length).toBeGreaterThanOrEqual(1);

    const signal = signals[0];
    // Should have cross-dept detection
    expect(signal.matchedDeptCount).toBeGreaterThanOrEqual(2);
    // Summary should be anonymized (no dept names)
    expect(signal.anonymizedSummary).not.toContain('sales');
    expect(signal.anonymizedSummary).not.toContain('engineering');
    // Should have valid confidence
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.confidence).toBeLessThanOrEqual(1);
    // Should reference source memory keys
    expect(signal.sourceMemoryKeys.length).toBeGreaterThanOrEqual(1);
  });

  it('Given no keyword match, When scanCrossDeptSignals, Then returns empty', () => {
    const store = makeListStore(fakeEntries([
      { key: 'note1', value: '今天天气很好', dept: 'sales' },
      { key: 'note2', value: '服务器运行正常', dept: 'engineering' },
    ]));
    const signals = scanCrossDeptSignals(store, 'org-test', 30);
    expect(signals).toHaveLength(0);
  });

  it('Given entries outside windowDays, When scanCrossDeptSignals, Then excludes them', () => {
    const store = makeListStore(fakeEntries([
      { key: 'old-sale', value: '客户投诉产品质量', dept: 'sales', daysAgo: 60 },
      { key: 'old-eng', value: '产品有bug需要修复', dept: 'engineering', daysAgo: 60 },
    ]));
    const signals = scanCrossDeptSignals(store, 'org-test', 7); // 7-day window
    expect(signals).toHaveLength(0);
  });

  it('Given empty store, When scanCrossDeptSignals, Then returns empty gracefully', () => {
    const store = makeListStore([]);
    const signals = scanCrossDeptSignals(store, 'org-test', 30);
    expect(signals).toHaveLength(0);
  });
});
