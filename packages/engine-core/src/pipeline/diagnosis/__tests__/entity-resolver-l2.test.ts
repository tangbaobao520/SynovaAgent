/**
 * entity-resolver-l2.test.ts — B7 L2实体解析测试 (铁律 0-2: 测试先行)
 *
 * L2: 模糊匹配 + 候选生成 → 人工审核队列
 * 不确定的关联不自动写入本体图 — 这是硬边界
 */
import {
  computeNameSimilarity, generateL2Candidates, addToReviewQueue,
  getReviewQueue, confirmCandidate, rejectCandidate,
  clearReviewQueue,
} from '../entity-resolver-l2';

describe('computeNameSimilarity', () => {
  it('Given identical names, When similarity computed, Then returns 1.0', () => {
    expect(computeNameSimilarity('张三', '张三')).toBe(1.0);
  });

  it('Given completely different names, When similarity computed, Then returns low score', () => {
    expect(computeNameSimilarity('张三', '李四')).toBeLessThan(0.3);
  });

  it('Given similar names with pinyin overlap, When similarity computed, Then returns > 0.4', () => {
    expect(computeNameSimilarity('星辰科技', '星辰科技有限公司')).toBeGreaterThan(0.45);
  });
});

describe('generateL2Candidates', () => {
  it('Given high-similarity names in same org, When L2 scan runs, Then generates candidate pair', () => {
    const nodes = [
      { id: 'n1', type: 'Person' as const, props: { name: '张伟', orgId: 'org-1', email: 'zw@a.com' } },
      { id: 'n2', type: 'Person' as const, props: { name: '张伟', orgId: 'org-1', email: 'zhangwei@b.com' } },
      { id: 'n3', type: 'Person' as const, props: { name: '王芳', orgId: 'org-1' } },
    ];
    const candidates = generateL2Candidates(nodes, 0.7);
    // n1 and n2: same name, same org, different email → candidate
    const zhangWei = candidates.filter(c => c.nodeA === 'n1' || c.nodeB === 'n1');
    expect(zhangWei.length).toBeGreaterThanOrEqual(1);
    expect(zhangWei[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('Given distinct names, When L2 scan runs, Then returns empty', () => {
    const nodes = [
      { id: 'n1', type: 'Person' as const, props: { name: '张三', orgId: 'org-1' } },
      { id: 'n2', type: 'Person' as const, props: { name: '李四', orgId: 'org-1' } },
    ];
    expect(generateL2Candidates(nodes, 0.7)).toHaveLength(0);
  });

  it('Given empty input, When L2 scan runs, Then returns empty', () => {
    expect(generateL2Candidates([], 0.7)).toHaveLength(0);
  });
});

describe('review queue', () => {
  beforeEach(() => clearReviewQueue());

  it('Given candidate, When added to queue, Then appears in pending list', () => {
    addToReviewQueue('n1', 'n2', 0.85, '同名不同邮箱');
    const queue = getReviewQueue('pending');
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('pending');
  });

  it('Given confirmed candidate, When status changed, Then moves to confirmed', () => {
    addToReviewQueue('n1', 'n2', 0.85, '同名不同邮箱');
    confirmCandidate(0);
    expect(getReviewQueue('confirmed')).toHaveLength(1);
    expect(getReviewQueue('pending')).toHaveLength(0);
  });

  it('Given rejected candidate, When status changed, Then moves to rejected', () => {
    addToReviewQueue('n1', 'n2', 0.6, '低置信度');
    rejectCandidate(0);
    expect(getReviewQueue('rejected')).toHaveLength(1);
  });
});
