/**
 * snapshots/index.ts — Snapshot Manager module exports
 */
export {
  saveSnapshot,
  restoreSnapshot,
  restoreSnapshotSoft,
  restoreSnapshotHard,
  listSnapshots,
  getSnapshot,
  getLatestSnapshot,
  deleteSnapshot,
  clearSnapshots,
  generateSnapshotId,
  resetAllSnapshots,
  diffSnapshots,
} from './snapshot-manager';
export type {
  Snapshot,
  SnapshotSummary,
  SnapshotDiff,
  ProtoDiffEntry,
  AgentFileDiffEntry,
} from './snapshot-manager';
