/**
 * storage.ts — 存储抽象层（接口 + 注入 + 内存降级）
 *
 * engine-core 独立运行时使用内存 Map；宿主应用（ClawOrg-BOX）通过 setStorageBackend()
 * 注入 SQLite/harness-store 实现，数据重启不丢失。
 */

import type { Snapshot } from './snapshots/snapshot-manager';
import type { TeamHealthSnapshot, DegradationWarning, OptimizationSuggestion, EvolutionEvent } from './observer/team-observer-types';
import type { MemoryEntry } from './types';

// ====================================================================
// StorageBackend 接口
// ====================================================================

export interface StorageBackend {
  saveSnapshot(snapshot: Snapshot): void;
  loadSnapshots(teamId: string): Snapshot[];
  deleteSnapshot(teamId: string, snapshotId: string): boolean;

  saveHealthSnapshot(snapshot: TeamHealthSnapshot): void;
  loadHealthSnapshots(blueprintId: string): TeamHealthSnapshot[];

  saveWarnings(blueprintId: string, warnings: DegradationWarning[]): void;
  loadWarnings(blueprintId: string): DegradationWarning[];

  saveEvolutionEvent(blueprintId: string, event: EvolutionEvent): void;
  loadEvolutionEvents(blueprintId: string): EvolutionEvent[];

  saveSuggestions(blueprintId: string, suggestions: OptimizationSuggestion[]): void;
  loadSuggestions(blueprintId: string): OptimizationSuggestion[];

  savePendingOutcomes(outcomes: PendingOutcome[]): void;
  loadPendingOutcomes(): PendingOutcome[];

  saveKnowledgeRecord(record: KnowledgeInjectionRecord): void;
  loadKnowledgeRecords(blueprintId: string): KnowledgeInjectionRecord[];

  saveMemoryEntry(entry: MemoryEntry): void;
  loadMemoryEntries(teamId: string, filters?: { type?: string; authorRoleId?: string }): MemoryEntry[];
  updateMemoryReuseCount(entryId: string): void;

  resetAll(): void;
}

// ====================================================================
// PendingOutcome type
// ====================================================================

export interface PendingOutcome {
  suggestionId: string;
  suggestionTitle: string;
  eventId: string;
  blueprintId: string;
  beforeScore: number;
  appliedAt: string;
  dimension?: string | null;
}

// ====================================================================
// 注入机制
// ====================================================================

let _backend: StorageBackend | null = null;

export function setStorageBackend(backend: StorageBackend): void {
  _backend = backend;
}

export function getStorageBackend(): StorageBackend | null {
  return _backend;
}

// ====================================================================
// 内存降级（无注入时使用）
// ====================================================================

const memSnapshots = new Map<string, Snapshot[]>();
const memHealthSnapshots = new Map<string, TeamHealthSnapshot[]>();
const memWarnings = new Map<string, DegradationWarning[]>();
const memEvolutionEvents = new Map<string, EvolutionEvent[]>();
const memPendingOutcomes = new Map<string, PendingOutcome[]>();
const memSuggestions = new Map<string, OptimizationSuggestion[]>();
const memKnowledgeRecords = new Map<string, KnowledgeInjectionRecord[]>();
const memMemoryEntries = new Map<string, MemoryEntry[]>();

interface KnowledgeInjectionRecord {
  blueprintId: string;
  timestamp: string;
  totalEntries: number;
  entriesWithImplication: number;
  avgDeviation: number;
  agentCount: number;
  sharedCount: number;
}

// ====================================================================
// Snapshot operations
// ====================================================================

export function saveSnapshotDB(snapshot: Snapshot): void {
  if (_backend) { _backend.saveSnapshot(snapshot); return; }
  let list = memSnapshots.get(snapshot.teamId);
  if (!list) { list = []; memSnapshots.set(snapshot.teamId, list); }
  const existing = list.findIndex(s => s.snapshotId === snapshot.snapshotId);
  if (existing >= 0) list[existing] = snapshot;
  else list.push(snapshot);
  while (list.length > 5) list.shift();
}

export function loadSnapshotsDB(teamId: string): Snapshot[] {
  if (_backend) return _backend.loadSnapshots(teamId);
  return memSnapshots.get(teamId) || [];
}

export function deleteSnapshotDB(teamId: string, snapshotId: string): boolean {
  if (_backend) return _backend.deleteSnapshot(teamId, snapshotId);
  const list = memSnapshots.get(teamId);
  if (!list) return false;
  const idx = list.findIndex(s => s.snapshotId === snapshotId);
  if (idx < 0) return false;
  list.splice(idx, 1);
  return true;
}

// ====================================================================
// Health snapshot operations
// ====================================================================

export function saveHealthSnapshotDB(snapshot: TeamHealthSnapshot): void {
  if (_backend) { _backend.saveHealthSnapshot(snapshot); return; }
  let list = memHealthSnapshots.get(snapshot.blueprintId);
  if (!list) { list = []; memHealthSnapshots.set(snapshot.blueprintId, list); }
  list.push(snapshot);
  while (list.length > 60) list.shift();
}

export function loadHealthSnapshotsDB(blueprintId: string): TeamHealthSnapshot[] {
  if (_backend) return _backend.loadHealthSnapshots(blueprintId);
  return memHealthSnapshots.get(blueprintId) || [];
}

// ====================================================================
// Warning operations
// ====================================================================

export function saveWarningsDB(blueprintId: string, warnings: DegradationWarning[]): void {
  if (_backend) { _backend.saveWarnings(blueprintId, warnings); return; }
  memWarnings.set(blueprintId, warnings);
}

export function loadWarningsDB(blueprintId: string): DegradationWarning[] {
  if (_backend) return _backend.loadWarnings(blueprintId);
  return memWarnings.get(blueprintId) || [];
}

// ====================================================================
// Evolution event operations
// ====================================================================

export function saveEvolutionEventDB(blueprintId: string, event: EvolutionEvent): void {
  if (_backend) { _backend.saveEvolutionEvent(blueprintId, event); return; }
  let list = memEvolutionEvents.get(blueprintId);
  if (!list) { list = []; memEvolutionEvents.set(blueprintId, list); }
  list.push(event);
  while (list.length > 200) list.shift();
}

export function loadEvolutionEventsDB(blueprintId: string): EvolutionEvent[] {
  if (_backend) return _backend.loadEvolutionEvents(blueprintId);
  return memEvolutionEvents.get(blueprintId) || [];
}

// ====================================================================
// Suggestion operations
// ====================================================================

export function saveSuggestionsDB(blueprintId: string, suggestions: OptimizationSuggestion[]): void {
  if (_backend) { _backend.saveSuggestions(blueprintId, suggestions); return; }
  memSuggestions.set(blueprintId, suggestions);
}

export function loadSuggestionsDB(blueprintId: string): OptimizationSuggestion[] {
  if (_backend) return _backend.loadSuggestions(blueprintId);
  return memSuggestions.get(blueprintId) || [];
}

// ====================================================================
// Pending outcome operations
// ====================================================================

export function savePendingOutcomesDB(outcomes: PendingOutcome[]): void {
  if (_backend) { _backend.savePendingOutcomes(outcomes); return; }
  memPendingOutcomes.clear();
  for (const o of outcomes) {
    let list = memPendingOutcomes.get(o.blueprintId);
    if (!list) { list = []; memPendingOutcomes.set(o.blueprintId, list); }
    list.push(o);
  }
}

export function loadPendingOutcomesDB(): PendingOutcome[] {
  if (_backend) return _backend.loadPendingOutcomes();
  const all: PendingOutcome[] = [];
  for (const list of memPendingOutcomes.values()) all.push(...list);
  return all;
}

// ====================================================================
// Knowledge record operations
// ====================================================================

export function saveKnowledgeRecordDB(record: KnowledgeInjectionRecord): void {
  if (_backend) { _backend.saveKnowledgeRecord(record); return; }
  let list = memKnowledgeRecords.get(record.blueprintId);
  if (!list) { list = []; memKnowledgeRecords.set(record.blueprintId, list); }
  list.push(record);
  while (list.length > 50) list.shift();
}

export function loadKnowledgeRecordsDB(blueprintId: string): KnowledgeInjectionRecord[] {
  if (_backend) return _backend.loadKnowledgeRecords(blueprintId);
  return memKnowledgeRecords.get(blueprintId) || [];
}

// ====================================================================
// Global reset (for testing)
// ====================================================================

// ====================================================================
// Memory Entry operations (GAP-4: KnowledgeSharing Phase 1)
// ====================================================================

export function saveMemoryEntryDB(entry: MemoryEntry): void {
  if (_backend) { _backend.saveMemoryEntry(entry); return; }
  let list = memMemoryEntries.get(entry.teamId);
  if (!list) { list = []; memMemoryEntries.set(entry.teamId, list); }
  const existing = list.findIndex(e => e.id === entry.id);
  if (existing >= 0) list[existing] = entry;
  else list.push(entry);
  while (list.length > 1000) list.shift();
}

export function loadMemoryEntriesDB(teamId: string, filters?: { type?: string; authorRoleId?: string }): MemoryEntry[] {
  if (_backend) return _backend.loadMemoryEntries(teamId, filters);
  const list = memMemoryEntries.get(teamId) || [];
  return list.filter(e => {
    if (filters?.type && e.type !== filters.type) return false;
    if (filters?.authorRoleId && e.authorRoleId !== filters.authorRoleId) return false;
    return true;
  });
}

export function updateMemoryReuseCountDB(entryId: string): void {
  if (_backend) { _backend.updateMemoryReuseCount(entryId); return; }
  for (const [, entries] of memMemoryEntries) {
    const entry = entries.find(e => e.id === entryId);
    if (entry) { entry.reuseCount++; return; }
  }
}

export function resetAllHarnessData(): void {
  if (_backend) { _backend.resetAll(); return; }
  memSnapshots.clear();
  memHealthSnapshots.clear();
  memWarnings.clear();
  memEvolutionEvents.clear();
  memPendingOutcomes.clear();
  memKnowledgeRecords.clear();
  memMemoryEntries.clear();
  memSuggestions.clear();
}
