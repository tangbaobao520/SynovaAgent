/**
 * l3/review-store-adapter.ts — L3 适配层: 审核队列存储 (D292)
 *
 * 铁律 39: L2 禁触 L4。L2 review-service 经此适配器访问 L4 review-store。
 * 纯代理 — 转发 getReviewStore 与 ReviewItem 类型, 不修改逻辑。
 */
export { getReviewStore, type ReviewItem } from '../l4/review-store';
