/**
 * agent/review-service.ts — 审核队列 L2 服务
 * @state: real
 *
 * L1→L2 ✅ | L2→L4 ✅
 */

import { getReviewStore, type ReviewItem } from '../l4/review-store';

export function enqueueReview(findingId: string, reason: string, priority: string): ReviewItem {
  return getReviewStore().enqueue(findingId, reason, priority);
}

export function listReviews(limit = 50): ReviewItem[] {
  return getReviewStore().list(limit);
}
