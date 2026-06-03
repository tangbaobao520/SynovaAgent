/**
 * information-flow/load-monitor.ts — 角色负载追踪 (GAP-2: InformationFlow Phase 1)
 *
 * Tracks per-role load metrics: active tasks, token usage, queue depth.
 * In-memory for Phase 1; SQLite persistence to follow in Phase 2.
 */

import type { LoadSnapshot } from './types';

const loadStore = new Map<string, LoadSnapshot>();

const DEFAULT_SNAPSHOT: Omit<LoadSnapshot, 'roleId' | 'timestamp'> = {
  activeTaskCount: 0,
  tokenBudgetUsed: 0,
  queueDepth: 0,
};

/** Get current load snapshot for a role */
export function getLoadSnapshot(roleId: string): LoadSnapshot {
  const existing = loadStore.get(roleId);
  if (existing) return { ...existing, timestamp: new Date().toISOString() };
  return { roleId, ...DEFAULT_SNAPSHOT, timestamp: new Date().toISOString() };
}

/** Update a role's load metrics */
export function updateLoad(
  roleId: string,
  delta: { activeTasks?: number; tokensUsed?: number; queueDelta?: number }
): LoadSnapshot {
  const current = loadStore.get(roleId) || { roleId, ...DEFAULT_SNAPSHOT, timestamp: '' };
  const updated: LoadSnapshot = {
    roleId,
    activeTaskCount: Math.max(0, current.activeTaskCount + (delta.activeTasks || 0)),
    tokenBudgetUsed: Math.max(0, current.tokenBudgetUsed + (delta.tokensUsed || 0)),
    queueDepth: Math.max(0, current.queueDepth + (delta.queueDelta || 0)),
    timestamp: new Date().toISOString(),
  };
  loadStore.set(roleId, updated);
  return updated;
}

/** Check if a role is overloaded (> 80% token budget used or queue > 5) */
export function isOverloaded(roleId: string): boolean {
  const snap = getLoadSnapshot(roleId);
  return snap.activeTaskCount >= 5 || snap.queueDepth >= 5;
}

/** Reset load data for a role */
export function resetLoad(roleId: string): void {
  loadStore.delete(roleId);
}

/** Reset all load data */
export function resetAllLoad(): void {
  loadStore.clear();
}

/** Get all role load snapshots */
export function getAllLoadSnapshots(): LoadSnapshot[] {
  return Array.from(loadStore.values()).map(s => ({
    ...s,
    timestamp: new Date().toISOString(),
  }));
}
