/**
 * agent/review-service.ts — 审核队列 L2 服务
 * @state: real
 *
 * L1→L2 ✅ | L2→L4 ✅
 */

// D292: L2→L3 适配层 — L2 禁触 L4 (铁律 39)
import { getReviewStore, type ReviewItem } from '../l3/review-store-adapter';

export function enqueueReview(findingId: string, reason: string, priority: string): ReviewItem {
  return getReviewStore().enqueue(findingId, reason, priority);
}

export function listReviews(limit = 50): ReviewItem[] {
  return getReviewStore().list(limit);
}
