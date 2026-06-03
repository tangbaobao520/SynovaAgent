/**
 * information-flow/task-augmenter.ts — 任务增强卡生成器 (GAP-2: InformationFlow Phase 1)
 *
 * Matches cross-role memories against a task to produce augmentation cards.
 * Cards are temporary context injections — they are NOT written to SOUL.md.
 *
 * Algorithm:
 *   1. Tokenize taskCategory into keywords
 *   2. Search team memories for matching entries from OTHER roles
 *   3. Pack up to maxCards matches into a TaskAugmentationCard
 */

import type { TaskAugmentationCard } from '../protocol/types';
import { getTeamMemories } from '../knowledge-sharing/memory-store';
import type { AugmentationParams } from './types';

/** Compute Jaccard similarity between two sets of tokens */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/** Tokenize text into keyword set */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^一-龥a-z0-9\s]/g, '')
      .split(/[\s,，、]+/)
      .filter(w => w.length >= 2)
  );
}

/**
 * Generate a task augmentation card for a given task and target role.
 * Searches team memories for entries authored by OTHER roles that are
 * relevant to the task category.
 */
export function generateAugmentationCard(params: AugmentationParams): TaskAugmentationCard | null {
  const { taskCategory, targetRoleId, teamId, maxCards = 3 } = params;
  const now = new Date().toISOString();

  // Get all team memories
  const allMemories = getTeamMemories(teamId);

  // Filter: only memories from OTHER roles
  const otherRoleMemories = allMemories.filter(m => m.authorRoleId !== targetRoleId);

  if (otherRoleMemories.length === 0) return null;

  // Tokenize task category
  const taskTokens = tokenize(taskCategory);
  if (taskTokens.size === 0) return null;

  // Score each memory by Jaccard similarity to task keywords
  const scored = otherRoleMemories
    .map(m => {
      const memoryTokens = tokenize(`${m.title} ${m.content.slice(0, 200)}`);
      const score = jaccard(taskTokens, memoryTokens);
      return { memory: m, score };
    })
    .filter(e => e.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCards);

  if (scored.length === 0) return null;

  // Find recommended fallback roles (top contributing roles among matches)
  const fallbackCounts = new Map<string, number>();
  for (const { memory } of scored) {
    fallbackCounts.set(memory.authorRoleId, (fallbackCounts.get(memory.authorRoleId) || 0) + 1);
  }
  const recommendedFallbacks = [...fallbackCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([roleId]) => roleId);

  const card: TaskAugmentationCard = {
    id: `aug-${teamId}-${targetRoleId}-${Date.now()}`,
    taskCategory,
    targetRoleId,
    matchedMemories: scored.map(({ memory, score }) => ({
      memoryId: memory.id,
      title: memory.title,
      snippet: memory.content.slice(0, 150) + (memory.content.length > 150 ? '...' : ''),
    })),
    recommendedFallbacks,
    generatedAt: now,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h TTL
  };

  return card;
}
