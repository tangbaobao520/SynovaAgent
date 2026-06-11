/**
 * knowledge-sharing/memory-store.ts — Memory entry CRUD (GAP-4: KnowledgeSharing Phase 1)
 *
 * Provides the core memory write/read/increment operations.
 * Backend-agnostic: delegates to StorageBackend if injected, falls back to in-memory Map.
 */

import { saveMemoryEntryDB, loadMemoryEntriesDB, updateMemoryReuseCountDB } from '../storage';
import type { MemoryEntry, MemoryEntryType, MemoryVisibility, MemorySource } from '../types';

/** Create a MemoryEntry with auto-generated id and timestamps */
export function createMemoryEntry(input: {
  type: MemoryEntryType;
  title: string;
  content: string;
  authorRoleId: string;
  visibility?: MemoryVisibility;
  linkedArtifact?: string;
  source?: MemorySource;
  teamId: string;
  blueprintId?: string;
  ttlDays?: number;
  priority?: 'low' | 'normal' | 'high';
  caqrScore?: number;
}): MemoryEntry {
  const now = new Date().toISOString();
  const id = `mem-${input.teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    type: input.type,
    title: input.title,
    content: input.content,
    authorRoleId: input.authorRoleId,
    visibility: input.visibility || 'team',
    linkedArtifact: input.linkedArtifact,
    source: input.source || 'observed',
    reuseCount: 0,
    teamId: input.teamId,
    blueprintId: input.blueprintId,
    createdAt: now,
    updatedAt: now,
    ttlDays: input.ttlDays,
    priority: input.priority || 'normal',
    caqrScore: input.caqrScore,
  };
}

/**
 * Add a memory entry to storage.
 * Returns the stored entry with generated id.
 */
export function addMemory(input: Parameters<typeof createMemoryEntry>[0]): MemoryEntry {
  const entry = createMemoryEntry(input);
  saveMemoryEntryDB(entry);
  return entry;
}

/**
 * Retrieve memory entries for a team, optionally filtered.
 */
export function getTeamMemories(
  teamId: string,
  filters?: { type?: MemoryEntryType; authorRoleId?: string; visibility?: MemoryVisibility }
): MemoryEntry[] {
  const results = loadMemoryEntriesDB(teamId, {
    type: filters?.type,
    authorRoleId: filters?.authorRoleId,
  });
  if (filters?.visibility) {
    return results.filter(e => e.visibility === filters.visibility);
  }
  return results;
}

/**
 * Increment the reuse count of a memory entry.
 */
export function incrementReuse(entryId: string): void {
  updateMemoryReuseCountDB(entryId);
}

/**
 * Get a single memory entry by ID.
 */
export function getMemory(teamId: string, entryId: string): MemoryEntry | undefined {
  return loadMemoryEntriesDB(teamId).find(e => e.id === entryId);
}

/**
 * Upsert a memory entry (update if exists, insert if not).
 */
export function upsertMemory(entry: MemoryEntry): void {
  saveMemoryEntryDB(entry);
}
