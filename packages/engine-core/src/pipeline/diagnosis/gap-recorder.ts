/**
 * diagnosis/gap-recorder.ts — 六缝隙时间序列记录器
 *
 * 每次 Phase C 产出六缝隙推断后，将快照存入时间序列。
 * 采集时机：orchestrator.ts 中 Phase C 完成后。
 *
 * 存储格式：内存 Map<teamId, GapSnapshot[]>（未来可扩展为文件持久化）
 * 最小数据量：第 3 次快照后衍生层开始可计算。
 */

import type { GapSnapshot, GapDimensionScore } from './types';
import type { GapDimension } from '../schema-bridge';
import type {
  TaskDefinitionDTO,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  CollaborationModeBlue,
} from '../../types';
import { saveSnapshot, loadAllTimelines } from './persistence';

// ====================================================================
// In-memory store
// ====================================================================

const timeline = new Map<string, GapSnapshot[]>();

/** 每团队最多保留快照数。超出后淘汰最旧的，防止内存泄漏。 */
const MAX_SNAPSHOTS_PER_TEAM = 100;

// ====================================================================
// Startup recovery: load persisted data into memory
// ====================================================================

let _recovered = false;
function ensureRecovered(): void {
  if (_recovered) return;
  _recovered = true;
  const persisted = loadAllTimelines();
  for (const [teamId, snapshots] of persisted) {
    const existing = timeline.get(teamId) ?? [];
    // Merge: persisted snapshots first, then any in-memory (e.g. created before recovery)
    const merged = [...snapshots, ...existing];
    // 持久化数据可能超出上限，保留最新 N 条
    timeline.set(teamId, merged.length > MAX_SNAPSHOTS_PER_TEAM
      ? merged.slice(-MAX_SNAPSHOTS_PER_TEAM)
      : merged);
  }
}

// ====================================================================
// Internal helpers
// ====================================================================

export const GAP_DIMENSIONS: GapDimension[] = [
  'division_of_labor',
  'information_flow',
  'authority_governance',
  'trust_incentive',
  'knowledge_sharing',
  'external_interface',
];

/**
 * Extract the mode name string from a CollaborationModeBlue for a given gap dimension.
 */
function extractGapMode(mode: CollaborationModeBlue, dim: GapDimension): string {
  switch (dim) {
    case 'division_of_labor':
      return mode.divisionOfLabor.mode;
    case 'information_flow':
      return mode.informationFlow.topology;
    case 'authority_governance':
      return `${mode.authorityGovernance.authority}+${mode.authorityGovernance.strategy}`;
    case 'trust_incentive':
      return `${mode.trustIncentive.alignment}+${mode.trustIncentive.initialTrust}`;
    case 'knowledge_sharing':
      return mode.knowledgeSharing.strategy;
    case 'external_interface':
      return mode.externalInterface.strategy;
    default:
      return 'unknown';
  }
}

/**
 * Compute an engine confidence score (0-1) for a gap based on data richness.
 * More explicit configuration → higher confidence.
 */
function computeEngineScore(mode: CollaborationModeBlue, dim: GapDimension): number {
  switch (dim) {
    case 'division_of_labor': {
      let score = 0.5;
      const dol = mode.divisionOfLabor;
      if (dol.mode && dol.mode !== 'flexible') score += 0.2;
      if (dol.roleAssignment && Object.keys(dol.roleAssignment).length > 0) score += 0.15;
      if (dol.fallbackRoles && Object.keys(dol.fallbackRoles).length > 0) score += 0.15;
      return Math.min(score, 1.0);
    }
    case 'information_flow': {
      let score = 0.5;
      const flow = mode.informationFlow;
      if (flow.topology) score += 0.15;
      if (flow.syncMode) score += 0.15;
      if (flow.visibilityMatrix && Object.keys(flow.visibilityMatrix).length > 0) score += 0.1;
      if (flow.routingMap && Object.keys(flow.routingMap).length > 0) score += 0.1;
      return Math.min(score, 1.0);
    }
    case 'authority_governance': {
      let score = 0.5;
      const ag = mode.authorityGovernance;
      if (ag.authority) score += 0.15;
      if (ag.strategy) score += 0.1;
      if (ag.decisionFlow) score += 0.1;
      if (ag.vetoRoles && ag.vetoRoles.length > 0) score += 0.1;
      if (ag.escalationPath && ag.escalationPath.length > 0) score += 0.05;
      return Math.min(score, 1.0);
    }
    case 'trust_incentive': {
      let score = 0.5;
      const ti = mode.trustIncentive;
      if (ti.alignment) score += 0.15;
      if (ti.initialTrust && ti.initialTrust !== 'medium') score += 0.1;
      if (ti.degradationTriggers && ti.degradationTriggers.length > 0) score += 0.15;
      if (ti.successSignal && ti.failureSignal) score += 0.1;
      return Math.min(score, 1.0);
    }
    case 'knowledge_sharing': {
      let score = 0.5;
      const ks = mode.knowledgeSharing;
      if (ks.strategy) score += 0.2;
      if (ks.syncIntervalHours > 0) score += 0.15;
      if (ks.hasTacitKnowledge !== undefined) score += 0.15;
      return Math.min(score, 1.0);
    }
    case 'external_interface': {
      let score = 0.5;
      const ei = mode.externalInterface;
      if (ei.strategy) score += 0.2;
      if (ei.authorizedRoles && ei.authorizedRoles.length > 0) score += 0.15;
      if (ei.auditLogEnabled) score += 0.15;
      return Math.min(score, 1.0);
    }
    default:
      return 0.5;
  }
}

function deriveConfidence(engineScore: number): 'high' | 'medium' | 'low' {
  if (engineScore >= 0.75) return 'high';
  if (engineScore >= 0.5) return 'medium';
  return 'low';
}

/**
 * Build a source breakdown for a gap dimension based on what data contributed.
 */
function buildSourceBreakdown(
  mode: CollaborationModeBlue,
  dim: GapDimension,
  phaseATeamSize: number,
  phaseBRoleCount: number,
): Record<string, number> {
  const breakdown: Record<string, number> = {};

  // Always present: Phase A team structure
  breakdown['phase_a_team_structure'] = 0.15;

  // Phase B persona genomes
  if (phaseBRoleCount > 0) {
    breakdown['phase_b_genomes'] = 0.25 * Math.min(phaseBRoleCount / 3, 1);
  }

  // Phase C mode selection
  breakdown['phase_c_mode_selection'] = 0.35;

  // Dimension-specific
  switch (dim) {
    case 'information_flow':
      if (mode.informationFlow.syncMode) breakdown['sync_mode'] = 0.15;
      if (mode.informationFlow.visibilityMatrix) breakdown['visibility_matrix'] = 0.1;
      break;
    case 'authority_governance':
      if (mode.authorityGovernance.decisionFlow) breakdown['decision_flow'] = 0.15;
      if (mode.authorityGovernance.vetoRoles?.length) breakdown['veto_config'] = 0.1;
      break;
    case 'knowledge_sharing':
      if (mode.knowledgeSharing.syncIntervalHours > 0) breakdown['sync_interval'] = 0.15;
      if (mode.knowledgeSharing.hasTacitKnowledge) breakdown['tacit_knowledge'] = 0.1;
      break;
    default:
      breakdown['inferred_context'] = 0.25;
      break;
  }

  // Normalize to sum to 1
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(breakdown)) {
    breakdown[key] = Math.round((breakdown[key] / total) * 100) / 100;
  }

  return breakdown;
}

// ====================================================================
// Public API
// ====================================================================

/**
 * Build a GapSnapshot from Phase C results and pipeline context.
 * Called in orchestrator.ts after Phase C completes.
 */
export function buildGapSnapshot(
  teamId: string,
  taskDef: TaskDefinitionDTO,
  phaseAResult: PhaseAResult,
  phaseBResult: PhaseBResult,
  phaseCResult: PhaseCResult,
): GapSnapshot {
  const mode = phaseCResult.collaborationMode;
  const gaps = {} as Record<GapDimension, GapDimensionScore>;

  for (const dim of GAP_DIMENSIONS) {
    const engineScore = computeEngineScore(mode, dim);
    gaps[dim] = {
      mode: extractGapMode(mode, dim),
      engineScore,
      confidence: deriveConfidence(engineScore),
      sourceBreakdown: buildSourceBreakdown(
        mode,
        dim,
        phaseAResult.teamStructure.totalRoles,
        phaseBResult.personaGenomes.length,
      ),
    };
  }

  return {
    teamId,
    observedAt: new Date().toISOString(),
    sourcePipeline: 'phase-c',
    gaps,
  };
}

/**
 * Record a gap snapshot into the in-memory timeline.
 */
export function recordGapSnapshot(snapshot: GapSnapshot): void {
  ensureRecovered();
  const existing = timeline.get(snapshot.teamId) ?? [];
  existing.push(snapshot);
  // 超出上限时淘汰最旧快照（保留最新 MAX_SNAPSHOTS_PER_TEAM 条）
  if (existing.length > MAX_SNAPSHOTS_PER_TEAM) {
    timeline.set(snapshot.teamId, existing.slice(-MAX_SNAPSHOTS_PER_TEAM));
  } else {
    timeline.set(snapshot.teamId, existing);
  }
  saveSnapshot(snapshot);
}

/**
 * Get the full timeline of gap snapshots for a team.
 * Most recent first when limit is specified.
 */
export function getGapTimeline(
  teamId: string,
  limit?: number,
): GapSnapshot[] {
  ensureRecovered();
  const entries = timeline.get(teamId) ?? [];
  if (limit === undefined) return [...entries];
  return entries.slice(-limit).reverse();
}

/**
 * Get the most recent snapshot for a team.
 */
export function getLatestSnapshot(teamId: string): GapSnapshot | null {
  ensureRecovered();
  const entries = timeline.get(teamId);
  if (!entries || entries.length === 0) return null;
  return entries[entries.length - 1];
}

/**
 * Get the total number of snapshots for a team.
 */
export function getSnapshotCount(teamId: string): number {
  ensureRecovered();
  return (timeline.get(teamId) ?? []).length;
}

/**
 * Clear all snapshots for a team. Returns true if data existed.
 */
export function clearTeamSnapshots(teamId: string): boolean {
  return timeline.delete(teamId);
}

/**
 * Reset all stored snapshots across all teams.
 */
export function resetAllSnapshots(): void {
  timeline.clear();
}

// ====================================================================
// Legacy pipeline bridge — 兼容旧 CultureForge pipeline 数据格式
// ====================================================================

interface LegacyProtocolConfig {
  mode: string;
  modeLabel?: string;
  selectionReason?: string;
  divisionOfLabor?: { mode?: string };
  informationFlow?: { topology?: string; syncMode?: string };
  conflictResolution?: { strategy?: string; deadlockTimeoutSeconds?: number };
  powerDistribution?: { authority?: string; hasVeto?: boolean };
  incentiveAlignment?: { alignment?: string; successSignal?: string; failureSignal?: string };
  trustModel?: { initialTrust?: string; updateMechanism?: string };
  knowledgeSharing?: { strategy?: string; syncIntervalHours?: number; hasTacitKnowledge?: boolean };
  externalInterface?: { strategy?: string; canBypassProtocol?: boolean; auditLogEnabled?: boolean };
}

interface LegacyBuildResult {
  teamStructure?: { roles?: Array<any>; totalRoles?: number };
  personaGenomes?: Array<any>;
  protocolConfig?: LegacyProtocolConfig;
}

function computeLegacyGapScore(protocolConfig: LegacyProtocolConfig, dim: GapDimension): number {
  const pc = protocolConfig;
  let score = 0.5;

  switch (dim) {
    case 'division_of_labor': {
      const dol = pc.divisionOfLabor;
      if (dol?.mode && dol.mode !== 'flexible') score += 0.2;
      // Legacy format doesn't have roleAssignment/fallbackRoles — use mode quality as proxy
      if (dol?.mode === 'fixed') score += 0.15;
      if (dol?.mode === 'morphing') score += 0.1;
      return Math.min(score, 1.0);
    }
    case 'information_flow': {
      const flow = pc.informationFlow;
      if (flow?.topology) score += 0.15;
      if (flow?.syncMode) score += 0.15;
      return Math.min(score, 1.0);
    }
    case 'authority_governance': {
      const cr = pc.conflictResolution;
      const pd = pc.powerDistribution;
      if (cr?.strategy) score += 0.15;
      if (pd?.authority) score += 0.15;
      if (pd?.hasVeto) score += 0.1;
      return Math.min(score, 1.0);
    }
    case 'trust_incentive': {
      const ia = pc.incentiveAlignment;
      const tm = pc.trustModel;
      if (ia?.alignment) score += 0.15;
      if (tm?.initialTrust && tm.initialTrust !== 'medium') score += 0.1;
      if (ia?.successSignal && ia?.failureSignal) score += 0.1;
      return Math.min(score, 1.0);
    }
    case 'knowledge_sharing': {
      const ks = pc.knowledgeSharing;
      if (ks?.strategy) score += 0.2;
      if ((ks?.syncIntervalHours ?? 0) > 0) score += 0.15;
      if (ks?.hasTacitKnowledge !== undefined) score += 0.15;
      return Math.min(score, 1.0);
    }
    case 'external_interface': {
      const ei = pc.externalInterface;
      if (ei?.strategy) score += 0.2;
      if (ei?.auditLogEnabled) score += 0.15;
      return Math.min(score, 1.0);
    }
    default:
      return 0.5;
  }
}

function extractLegacyGapMode(protocolConfig: LegacyProtocolConfig, dim: GapDimension): string {
  const pc = protocolConfig;
  switch (dim) {
    case 'division_of_labor':
      return pc.divisionOfLabor?.mode || pc.mode || 'unknown';
    case 'information_flow':
      return pc.informationFlow?.topology || 'unknown';
    case 'authority_governance':
      return `${pc.powerDistribution?.authority || 'unknown'}+${pc.conflictResolution?.strategy || 'unknown'}`;
    case 'trust_incentive':
      return `${pc.incentiveAlignment?.alignment || 'unknown'}+${pc.trustModel?.initialTrust || 'medium'}`;
    case 'knowledge_sharing':
      return pc.knowledgeSharing?.strategy || 'unknown';
    case 'external_interface':
      return pc.externalInterface?.strategy || 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Record a gap snapshot from legacy CultureForge pipeline output.
 * Bridges the old protocolConfig format to the new GapSnapshot format.
 */
export function recordLegacyGapSnapshot(
  teamId: string,
  taskDef: { job: string; constraints?: string[] },
  buildResult: LegacyBuildResult,
): GapSnapshot | null {
  const pc = buildResult.protocolConfig;
  if (!pc) return null;

  const gaps = {} as Record<GapDimension, GapDimensionScore>;

  for (const dim of GAP_DIMENSIONS) {
    const engineScore = computeLegacyGapScore(pc, dim);
    const roleCount = buildResult.teamStructure?.roles?.length || buildResult.teamStructure?.totalRoles || 0;
    const genomeCount = buildResult.personaGenomes?.length || 0;

    const sourceBreakdown: Record<string, number> = {
      phase_a_team_structure: 0.2,
      phase_b_genomes: genomeCount > 0 ? 0.2 : 0,
      phase_c_mode_selection: 0.4,
      inferred_context: 0.2,
    };
    // Normalize
    const total = Object.values(sourceBreakdown).reduce((a, b) => a + b, 0) || 1;
    for (const key of Object.keys(sourceBreakdown)) {
      sourceBreakdown[key] = Math.round((sourceBreakdown[key] / total) * 100) / 100;
    }

    gaps[dim] = {
      mode: extractLegacyGapMode(pc, dim),
      engineScore,
      confidence: engineScore >= 0.75 ? 'high' : engineScore >= 0.5 ? 'medium' : 'low',
      sourceBreakdown,
    };
  }

  const snapshot: GapSnapshot = {
    teamId,
    observedAt: new Date().toISOString(),
    sourcePipeline: 'legacy-culture-forge',
    gaps,
  };

  recordGapSnapshot(snapshot);
  return snapshot;
}
