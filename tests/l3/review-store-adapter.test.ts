/**
 * review-store-adapter.test.ts — L3 适配层单测: 审核队列存储 (D292)
 *
 * 验证 (铁律 0-2 测试先行 + 铁律 39):
 *   1. 正常路径: 适配器导出与 L4 原模块为同一引用 (纯代理 re-export)
 *   2. 降级路径: 适配器可独立导入不抛错
 *   3. 边界: ReviewItem 类型再导出可被 L2 消费方引用 (review-service 消费方式)
 *
 * Given/When/Then 格式。不调用 getReviewStore() 本体, 避免建库副作用。
 */
import { describe, it, expect } from 'vitest';
import { getReviewStore, type ReviewItem } from '../../src/l3/review-store-adapter';
import { getReviewStore as l4GetReviewStore } from '../../src/l4/review-store';

describe('L3 review-store-adapter (D292)', () => {
  it('正常路径: 与 L4 原模块为同一引用 (纯代理)', () => {
    expect(getReviewStore).toBe(l4GetReviewStore);
  });

  it('降级路径: 可独立导入, 函数可调用', () => {
    expect(typeof getReviewStore).toBe('function');
  });

  it('边界: ReviewItem 类型再导出可被 L2 消费方引用', () => {
    // 编译期验证 — review-service.ts 的消费方式 (类型标注返回值)
    const item: ReviewItem = {
      id: 'review_test', finding_id: 'finding_test', reason: 'needs-review',
      priority: 'medium', status: 'pending', created_at: '2026-08-02',
    };
    expect(item.finding_id).toBe('finding_test');
  });
});
