/**
 * pipeline/index.ts — Pipeline module exports
 *
 * Core pipeline types and functions that are safe to use in engine-core.
 * Full pipeline orchestration lives in ClawOrg-BOX.
 */
export {
  recordCollaborationEvent,
  collectEvolutionSignals,
  getAllStats,
  getRecentEvents,
  getDimensionStats,
  resetCollector,
  getTotalEventCount,
} from './collaboration-collector';
export type { RuntimeCollaborationEvent, EvolutionSignal } from './schema-bridge';
export type { GapDimension } from './schema-bridge';
export {
  mapPowerDistributionToAuthority,
  mapTrustModel,
  mapConflictResolution,
  mapDivisionOfLabor,
  mapInformationFlow,
  buildCollaborationModeFromGaps,
} from './schema-bridge';
