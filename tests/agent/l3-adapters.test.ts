/**
 * l3-adapters.test.ts — L3 适配层测试 (D292: Fix L2→L4 Cross-Layer Imports)
 *
 * 验证 (铁律 0-2 测试先行 + 铁律 39 五层边界):
 *   1. 正常路径: 4 个 L3 适配器导出与 L4 原模块为同一引用 (纯代理 re-export 语义 —
 *      适配器不包装/不重写, 转发同一实现, 消费方行为零改变)
 *   2. 降级路径: 适配器可独立导入不抛错 (模块加载完整, 无悬挂引用)
 *   3. 边界: ReviewItem 类型再导出可被 L2 消费方引用 (类型级验证, 模拟 review-service 消费方式)
 *
 * Given/When/Then 格式。L4 原模块仅用于引用对比, 不调用函数本体 (避免建库副作用)。
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../src/l3/graph-traversal-adapter';
import { getReviewStore, type ReviewItem } from '../../src/l3/review-store-adapter';
import { generateCommunityReports } from '../../src/l3/community-reports-adapter';
import { resolveEntitiesL3 } from '../../src/l3/entity-resolver-adapter';
// L4 原模块 — 仅用于引用对比 (纯代理断言: 同一引用 = 零逻辑转发)
import { createGraphTraversal as l4CreateGraphTraversal } from '../../src/l4/graph-traversal';
import { getReviewStore as l4GetReviewStore } from '../../src/l4/review-store';
import { generateCommunityReports as l4GenerateCommunityReports } from '../../src/l4/community-reports';
import { resolveEntitiesL3 as l4ResolveEntitiesL3 } from '../../src/l4/entity-resolver';

describe('L3 适配层 (D292)', () => {
  it('正常路径: 适配器导出与 L4 原模块为同一引用 (纯代理 re-export)', () => {
    expect(createGraphTraversal).toBe(l4CreateGraphTraversal);
    expect(getReviewStore).toBe(l4GetReviewStore);
    expect(generateCommunityReports).toBe(l4GenerateCommunityReports);
    expect(resolveEntitiesL3).toBe(l4ResolveEntitiesL3);
  });

  it('降级路径: 适配器可独立导入不抛错, 函数可被消费方调用', () => {
    // 静态 import 在模块加载时执行 — 加载成功即验证模块完整 (无悬挂引用)
    expect(typeof createGraphTraversal).toBe('function');
    expect(typeof getReviewStore).toBe('function');
    expect(typeof generateCommunityReports).toBe('function');
    expect(typeof resolveEntitiesL3).toBe('function');
  });

  it('边界: ReviewItem 类型再导出可被 L2 消费方引用 (模拟 review-service 消费方式)', () => {
    // 类型级验证 — 编译期: 适配器再导出的 ReviewItem 可标注 L2 服务返回值
    // 不调用 getReviewStore() 本体, 避免测试环境建库副作用 (DB 行为由 L4 自有测试覆盖)
    const item: ReviewItem = {
      id: 'review_test', finding_id: 'finding_test', reason: 'needs-review',
      priority: 'medium', status: 'pending', created_at: '2026-08-02',
    };
    expect(item.finding_id).toBe('finding_test');
    // 消费方 (review-service) 仅依赖 enqueue/list 签名 — 适配器转发的 getReviewStore 保持同一契约
    expect(typeof getReviewStore).toBe('function');
  });
});
