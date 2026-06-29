/**
 * agent/post-diagnosis-processor.ts — 诊断后处理服务 (L2)
 *
 * 封装 L4 的 GraphBridge/CommunityReports/EntityResolution 调用。
 * 铁律 39: L1 不得直接调用 L4，所有 L4 访问必须通过此 L2 服务。
 *
 * 接线: diagnosis.ts POST /api/diagnosis/consult 诊断完成后调用此服务。
 */
// @state: real
import { createLogger } from '@synova/logger';

const log = createLogger('agent/post-diagnosis-processor');

// ═══ L4 接口镜像 (铁律 39) ═══
// L2 声明所需 L4 接口子集，不直接 import L4 类型定义。
// 结构镜像自 src/l4/graph-bridge.ts:GraphStore — 运行时兼容性由结构子类型保证。
// 若 L4 接口变更, tests/architecture/graphstore-compatibility.test.ts 会检测漂移。

export interface GraphStoreLike {
  createNode(type: string, props: Record<string, unknown>, graph: string): string;
  createNodes(nodes: Array<{ type: string; props: Record<string, unknown> }>, graph: string): string[];
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
  createEdge(type: string, from: string, to: string, weight?: number, props?: Record<string, unknown>, graph?: string): string;
  createEdges(edges: Array<{ type: string; from: string; to: string; weight?: number; props?: Record<string, unknown> }>, graph: string): string[];
  getNode(id: string, graph: string): unknown | null;
  updateNode(id: string, props: Record<string, unknown>, graph: string): void;
  deleteNode(id: string, graph: string): void;
  deleteEdge(id: string, graph: string): void;
  traverse(startNodeId: string, edgeType?: string, maxDepth?: number, graph?: string): unknown;
  findPaths(from: string, to: string, edgeType?: string, maxDepth?: number, graph?: string): unknown[];
  queryTriples(pattern: Record<string, unknown>, graph?: string): unknown[];
  getNodeAtTime(id: string, timestamp: string, graph: string): unknown | null;
}

export interface CommunityReportLike {
  id: string;
  nodeCount: number;
  dominantTypes?: string[];
  summary: string;
  keyNodes?: string[];
}

export interface PostProcessResult {
  keyPersonRisksSynced: boolean;
  honaSynced: boolean;
  financialImpactSynced: boolean;
  capabilityGapSynced: boolean;
  sevenPowersSynced: boolean;
  cpcSynced: boolean;
  communityCount: number;
  autoMerged: number;
  queuedForReview: number;
  errors: string[];
}

export interface GraphBridgeLike {
  upsertFromKeyPersonRisk(risks: Array<{ roleId: string; riskLevel: string; knowledgeDomains: string[]; busFactor: number }>): void;
  upsertFromHONA(people: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>>): void;
  upsertFromFinancialImpact(items: Array<Record<string, unknown>>): void;
  upsertFromCapabilityGap(gaps: Array<Record<string, unknown>>): void;
  upsertFromSevenPowers(powers: Array<Record<string, unknown>>): void;
  upsertFromCPC(processes: Array<Record<string, unknown>>): void;
}

export interface PostProcessEvents {
  onCommunityReports?: (count: number, communities: CommunityReportLike[]) => void;
  onEntityResolution?: (autoMerged: number, queuedForReview: number) => void;
}

/**
 * 执行诊断后处理 — GraphBridge 同步 + 社区报告 + 实体解析。
 *
 * 每步独立 try/catch, 单个失败不阻断整体 (铁律 24+31)。
 * 通过 app.locals DI 注入的 graphStore 实例调用 L4。
 */
export async function runPostDiagnosisProcessing(
  graphStore: GraphStoreLike,
  teamId: string,
  report: Record<string, unknown>,
  events?: PostProcessEvents,
): Promise<PostProcessResult> {
  const result: PostProcessResult = {
    keyPersonRisksSynced: false,
    honaSynced: false,
    financialImpactSynced: false,
    capabilityGapSynced: false,
    sevenPowersSynced: false,
    cpcSynced: false,
    communityCount: 0,
    autoMerged: 0,
    queuedForReview: 0,
    errors: [],
  };

  // 延迟导入 L4 模块 (运行时加载, 避免静态跨层依赖)
  // Step 4 fix: import 可能因 engine-core ESM 兼容问题失败 → 降级不阻断诊断
  let graphBridge: GraphBridgeLike | null = null;
  let generateCommunityReports: ((store: GraphStoreLike, teamId: string) => CommunityReportLike[]) | null = null;
  let resolveEntitiesL3: ((store: GraphStoreLike, teamId: string) => Promise<{ autoMerged: number; queuedForReview: number }>) | null = null;

  try {
    const [bridgeMod, communityMod, entityMod] = await Promise.all([
      import('../l4/graph-bridge'),
      import('../l4/community-reports'),
      import('../l4/entity-resolver'),
    ]);
    graphBridge = bridgeMod.createGraphBridge(graphStore, teamId) as unknown as GraphBridgeLike;
    generateCommunityReports = communityMod.generateCommunityReports as unknown as typeof generateCommunityReports;
    resolveEntitiesL3 = entityMod.resolveEntitiesL3 as unknown as typeof resolveEntitiesL3;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'L4 模块加载失败 — post-processing 降级, 诊断结果不受影响');
    result.errors.push(`L4 modules unavailable: ${msg}`);
    return result;
  }

  if (!graphBridge) {
    result.errors.push('GraphBridge: module not loaded');
    return result;
  }

  // 1. 关键人风险同步
  try {
    const findings = (report?.keyFindings || report?.findings) as Array<Record<string, unknown>> | undefined;
    if (findings?.length) {
      const risks = findings
        .filter(f => f.riskLevel)
        .map(f => ({
          roleId: (f.entity || f.roleId || '') as string,
          riskLevel: (f.riskLevel || 'medium') as string,
          knowledgeDomains: (f.domains || []) as string[],
          busFactor: (f.busFactor || 1) as number,
        }));
      if (risks.length > 0) {
        graphBridge.upsertFromKeyPersonRisk(risks);
        result.keyPersonRisksSynced = true;
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GraphBridge: ${msg}`);
    log.warn({ err: msg }, 'GraphBridge keyPersonRisk sync failed — degraded');
  }

  // 1b. HONA — 人-组织网络分析同步
  try {
    const honaData = (report as { hona?: any; humanOrganization?: any }).hona
      || (report as { humanOrganization?: any }).humanOrganization;
    if (honaData?.people?.length > 0) {
      graphBridge.upsertFromHONA(honaData.people, honaData.interactions || honaData.edges || []);
      result.honaSynced = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GraphBridge(HONA): ${msg}`);
    log.warn({ err: msg }, 'GraphBridge HONA sync failed — degraded');
  }

  // 1c. FinancialImpact — 财务影响分析同步
  try {
    const finData = (report as { financialImpact?: any; financial?: any }).financialImpact
      || (report as { financial?: any }).financial;
    if (finData?.items?.length > 0) {
      graphBridge.upsertFromFinancialImpact(finData.items);
      result.financialImpactSynced = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GraphBridge(FinancialImpact): ${msg}`);
    log.warn({ err: msg }, 'GraphBridge FinancialImpact sync failed — degraded');
  }

  // 1d. CapabilityGap — 能力缺口分析同步
  try {
    const capData = (report as { capabilityGap?: any; capabilities?: any }).capabilityGap
      || (report as { capabilities?: any }).capabilities;
    if (capData?.gaps?.length > 0) {
      graphBridge.upsertFromCapabilityGap(capData.gaps);
      result.capabilityGapSynced = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GraphBridge(CapabilityGap): ${msg}`);
    log.warn({ err: msg }, 'GraphBridge CapabilityGap sync failed — degraded');
  }

  // 1e. SevenPowers — 七力战略分析同步
  try {
    const stratData = (report as { sevenPowers?: any; strategy?: any }).sevenPowers
      || (report as { strategy?: any }).strategy;
    if (stratData?.powers?.length > 0) {
      graphBridge.upsertFromSevenPowers(stratData.powers);
      result.sevenPowersSynced = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GraphBridge(SevenPowers): ${msg}`);
    log.warn({ err: msg }, 'GraphBridge SevenPowers sync failed — degraded');
  }

  // 1f. CPC — 关键流程链同步
  try {
    const cpcData = (report as { cpc?: any; processes?: any }).cpc
      || (report as { processes?: any }).processes;
    if (cpcData?.processes?.length > 0) {
      graphBridge.upsertFromCPC(cpcData.processes);
      result.cpcSynced = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GraphBridge(CPC): ${msg}`);
    log.warn({ err: msg }, 'GraphBridge CPC sync failed — degraded');
  }

  // 2. 社区报告生成
  try {
    const communities = generateCommunityReports!(graphStore, teamId);
    result.communityCount = communities.length;
    if (communities.length > 0) {
      log.info({ teamId, count: communities.length }, 'P0-1 社区报告已生成');
      events?.onCommunityReports?.(communities.length, communities);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`CommunityReports: ${msg}`);
    log.warn({ err: msg }, 'CommunityReports failed — degraded');
  }

  // 3. 实体解析
  try {
    const resolution = await resolveEntitiesL3!(graphStore, teamId);
    result.autoMerged = resolution.autoMerged;
    result.queuedForReview = resolution.queuedForReview;
    if (resolution.autoMerged > 0 || resolution.queuedForReview > 0) {
      log.info({ teamId, autoMerged: resolution.autoMerged, queued: resolution.queuedForReview }, 'P0-1 实体解析完成');
      events?.onEntityResolution?.(resolution.autoMerged, resolution.queuedForReview);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`EntityResolution: ${msg}`);
    log.warn({ err: msg }, 'EntityResolution failed — degraded');
  }

  // ═══ P0-2: L0 组织自适应 — 纠错处理 + 阈值自适应 ═══
  try {
    const { OrgAdapter } = await import('@synova/evolution');
    const { getAgentMemoryStore } = await import('./l4/agent-memory-store');
    const { getDatabase } = await import('./init/engine-context');
    const db = getDatabase();
    const memoryStore = getAgentMemoryStore(db);
    const adapter = new OrgAdapter({
      graphStore: graphStore as import('@synova/evolution').GraphStoreLike,
      memoryStore: memoryStore as unknown as import('@synova/evolution').AgentMemoryStoreLike,
      l3: null, // L3WriteAPI 将在 Phase P1-1 注入
    });
    const adaptResult = await adapter.afterDiagnosis(teamId);
    if (adaptResult.degraded) {
      log.warn({ teamId, errors: adaptResult.errors }, '组织自适应降级');
    }
    if (adaptResult.correctionsProcessed > 0 || adaptResult.thresholdsAdjusted.length > 0) {
      log.info({ teamId, corrections: adaptResult.correctionsProcessed, adjustments: adaptResult.thresholdsAdjusted.length }, '组织自适应完成');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, teamId }, 'L0 组织自适应失败 — 降级 (不阻断诊断)');
  }

  return result;
}
