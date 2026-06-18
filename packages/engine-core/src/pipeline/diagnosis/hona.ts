/**
 * diagnosis/hona.ts — 异质节点网络分析 (Heterogeneous Node Network Analysis)
 *
 * SOG v1.0 升级：支持 14 种节点类型、10 种边类型，
 * 区分节点角色分析，ALIGNS_WITH/PROVIDES 专项统计，
 * 输出本体补丁（ontologyPatches）更新节点中心性和桥接属性。
 *
 * 数据源：Agent 间交互记录（通过 recordAgentInteraction() feeder 采集）。
 * 无交互数据时返回 null。
 */

import type { HONAReport, HONANode, HONAEdge } from './types';
import { getAllStats } from '../collaboration-collector';
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';

// ====================================================================
// In-memory store: agent interaction pairs (legacy, backward compat)
// ====================================================================

const interactionMap = new Map<string, Map<string, { count: number; lastSeen: string }>>();

// ====================================================================
// SOG v1.0 typed interaction store
// ====================================================================

interface TypedInteractionEntry {
  from: string;
  fromType: SOGNodeType;
  to: string;
  toType: SOGNodeType;
  edgeType: SOGEdgeType;
  count: number;
  lastSeen: string;
  props?: Record<string, unknown>;
}

const typedInteractions: TypedInteractionEntry[] = [];

// ====================================================================
// Node type registry: tracks nodeId → SOGNodeType
// ====================================================================

const nodeTypeRegistry = new Map<string, SOGNodeType>();

// ====================================================================
// SOG v1.0 local types (enrich public HONA types with ontology fields)
// ====================================================================

/** 本体补丁：更新节点的中心性和桥接属性，供图谱层消费 */
export interface OntologyPatch {
  nodeId: string;
  updates: {
    centrality?: number;
    isBridge?: boolean;
    nodeType?: SOGNodeType;
  };
}

/** SOG v1.0 边类型专项统计 */
export interface EdgeTypeStatistics {
  /** ALIGNS_WITH 子图聚类系数 (0-1) — 目标对齐边的局部聚类程度 */
  alignsWithClusteringCoefficient: number;
  /** PROVIDES 子图密度 (0-1) — 能力供给网络的紧密程度 */
  providesDensity: number;
  /** 按边类型分组统计 */
  byType: Partial<Record<SOGEdgeType, { count: number; totalWeight: number }>>;
}

// ====================================================================
// Internal enriched types (extend public HONA types with SOG v1.0 fields)
// ====================================================================

interface EnrichedNode extends HONANode {
  nodeType: SOGNodeType;
  betweennessCentrality: number;
  isBridge: boolean;
}

interface EnrichedEdge extends HONAEdge {
  edgeType: SOGEdgeType;
}

interface EnrichedReport extends HONAReport {
  nodes: EnrichedNode[];
  edges: EnrichedEdge[];
  ontologyPatches: OntologyPatch[];
  edgeTypeStats: EdgeTypeStatistics;
}

// ====================================================================
// Feeder API — backward compatible
// ====================================================================

/**
 * Record an agent-to-agent interaction.
 * Call from Gateway message routing or protocol interceptor.
 *
 * Backward compat: defaults node types to AGENT, edge type to INTERACTS_WITH.
 */
export function recordAgentInteraction(from: string, to: string): void {
  if (!interactionMap.has(from)) {
    interactionMap.set(from, new Map());
  }
  const targets = interactionMap.get(from)!;
  const existing = targets.get(to);
  targets.set(to, {
    count: (existing?.count ?? 0) + 1,
    lastSeen: new Date().toISOString(),
  });

  // Populate node type registry with defaults for backward compat
  if (!nodeTypeRegistry.has(from)) {
    nodeTypeRegistry.set(from, SOGNodeType.AGENT);
  }
  if (!nodeTypeRegistry.has(to)) {
    nodeTypeRegistry.set(to, SOGNodeType.AGENT);
  }
}

/**
 * Record a typed SOG interaction between two typed nodes.
 * SOG v1.0: supports all 14 node types and 10 edge types.
 *
 * @param from      Source node ID
 * @param fromType  Source node SOG type
 * @param to        Target node ID
 * @param toType    Target node SOG type
 * @param edgeType  Relationship type
 * @param props     Optional edge properties (e.g. alignmentStrength, proficiencyLevel)
 */
export function recordTypedInteraction(
  from: string,
  fromType: SOGNodeType,
  to: string,
  toType: SOGNodeType,
  edgeType: SOGEdgeType,
  props?: Record<string, unknown>,
): void {
  // Update node type registry
  nodeTypeRegistry.set(from, fromType);
  nodeTypeRegistry.set(to, toType);

  // Deduplicate: bump count on existing, or push new entry
  const existing = typedInteractions.find(
    (ti) => ti.from === from && ti.to === to && ti.edgeType === edgeType,
  );
  if (existing) {
    existing.count += 1;
    existing.lastSeen = new Date().toISOString();
    if (props) {
      existing.props = { ...existing.props, ...props };
    }
    return;
  }

  typedInteractions.push({
    from,
    fromType,
    to,
    toType,
    edgeType,
    count: 1,
    lastSeen: new Date().toISOString(),
    props,
  });
}

/**
 * Register a node with its SOG type without recording an interaction.
 * Useful for nodes that exist in the ontology but haven't interacted yet.
 */
export function registerNodeType(nodeId: string, nodeType: SOGNodeType): void {
  nodeTypeRegistry.set(nodeId, nodeType);
}

/**
 * Clear all interaction data for testing.
 */
export function clearAgentInteractions(): void {
  interactionMap.clear();
  typedInteractions.length = 0;
  nodeTypeRegistry.clear();
}

// ====================================================================
// Helpers: node type inference
// ====================================================================

/**
 * Resolve a node's SOG type.
 * Priority: explicit registry → heuristic from ID → AGENT default.
 */
function resolveNodeType(id: string): SOGNodeType {
  if (nodeTypeRegistry.has(id)) {
    return nodeTypeRegistry.get(id)!;
  }

  // Heuristic matching from node ID (backward compat + convenience)
  const lower = id.toLowerCase();
  if (lower.includes('team') || lower.includes('authority') || lower.includes('governance')) return SOGNodeType.TEAM;
  if (lower.includes('person') || lower.includes('user') || lower.includes('member')) return SOGNodeType.PERSON;
  if (lower.includes('client') || lower.includes('customer') || lower.includes('external') || lower.includes('interface')) return SOGNodeType.CLIENT;
  if (lower.includes('tool') || lower.includes('plugin') || lower.includes('mcp')) return SOGNodeType.TOOL;
  if (lower.includes('process') || lower.includes('workflow') || lower.includes('pipeline')) return SOGNodeType.PROCESS;
  if (lower.includes('event') || lower.includes('incident') || lower.includes('meeting')) return SOGNodeType.EVENT;
  if (lower.includes('doc') || lower.includes('document') || lower.includes('report') || lower.includes('prd')) return SOGNodeType.DOCUMENT;
  if (lower.includes('finance') || lower.includes('cost') || lower.includes('budget') || lower.includes('revenue')) return SOGNodeType.FINANCIAL;
  if (lower.includes('location') || lower.includes('site') || lower.includes('office') || lower.includes('remote')) return SOGNodeType.LOCATION;
  if (lower.includes('goal') || lower.includes('objective') || lower.includes('okr') || lower.includes('mission')) return SOGNodeType.GOAL;
  if (lower.includes('capability') || lower.includes('skill') || lower.includes('competency')) return SOGNodeType.CAPABILITY;
  if (lower.includes('risk') || lower.includes('threat') || lower.includes('vulnerability')) return SOGNodeType.RISK;
  if (lower.includes('compliance') || lower.includes('regulatory') || lower.includes('audit')) return SOGNodeType.COMPLIANCE;

  return SOGNodeType.AGENT; // default
}

/**
 * Map SOG node type to HONA structural role.
 * Different node types play different roles in the network:
 * - TEAM / COMPLIANCE → authority (governance hubs)
 * - CLIENT / LOCATION → bridge (external interface points)
 * - GOAL / CAPABILITY → peer (collaboration nodes)
 * - RISK → peer (monitoring nodes)
 * - Everything else → peer
 */
function nodeTypeToRole(nodeType: SOGNodeType): HONANode['role'] {
  switch (nodeType) {
    case SOGNodeType.TEAM:
    case SOGNodeType.COMPLIANCE:
      return 'authority';
    case SOGNodeType.CLIENT:
    case SOGNodeType.LOCATION:
      return 'bridge';
    default:
      return 'peer';
  }
}

// ====================================================================
// Helpers: betweenness centrality (Brandes algorithm, unweighted)
// ====================================================================

/**
 * Compute betweenness centrality for all nodes using Brandes' algorithm.
 * O(n*m) where n = node count, m = edge count.
 */
function computeBetweenness(
  nodeList: string[],
  adjacency: Map<string, Set<string>>,
): Map<string, number> {
  const betweenness = new Map<string, number>();
  for (const v of nodeList) {
    betweenness.set(v, 0);
  }

  for (const s of nodeList) {
    // Single-source shortest paths from s
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();

    for (const v of nodeList) {
      predecessors.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
    }
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      const dv = dist.get(v)!;

      for (const w of adjacency.get(v) || []) {
        // w found for the first time?
        if (dist.get(w)! < 0) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
        // shortest path to w via v?
        if (dist.get(w) === dv + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          predecessors.get(w)!.push(v);
        }
      }
    }

    // Back-propagation of dependencies
    const delta = new Map<string, number>();
    for (const v of nodeList) {
      delta.set(v, 0);
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w) || []) {
        const contribution = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + contribution);
      }
      if (w !== s) {
        betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalize: divide by 2 (undirected) and by (n-1)*(n-2)/2 (max possible)
  const n = nodeList.length;
  if (n <= 2) return betweenness; // trivial network, all 0

  const normFactor = ((n - 1) * (n - 2)) / 2;
  for (const [v, val] of betweenness) {
    betweenness.set(v, val / 2 / normFactor);
  }

  return betweenness;
}

// ====================================================================
// Helpers: edge type statistics
// ====================================================================

/**
 * Compute SOG v1.0 edge type statistics.
 * Includes ALIGNS_WITH clustering coefficient and PROVIDES subgraph density.
 */
function computeEdgeTypeStats(
  edges: EnrichedEdge[],
  nodeList: string[],
  fullAdjacency: Map<string, Set<string>>,
): EdgeTypeStatistics {
  // Per-type counts
  const byType: EdgeTypeStatistics['byType'] = {};
  for (const e of edges) {
    const entry = byType[e.edgeType] || { count: 0, totalWeight: 0 };
    entry.count += 1;
    entry.totalWeight += e.weight;
    byType[e.edgeType] = entry;
  }

  // ALIGNS_WITH subgraph: build adjacency and compute clustering coefficient
  const alignsEdges = edges.filter((e) => e.edgeType === SOGEdgeType.ALIGNS_WITH);
  const alignsAdjacency = new Map<string, Set<string>>();
  for (const id of nodeList) {
    alignsAdjacency.set(id, new Set());
  }
  for (const e of alignsEdges) {
    alignsAdjacency.get(e.from)!.add(e.to);
    alignsAdjacency.get(e.to)!.add(e.from);
  }

  let alignsWithClusteringCoefficient = 0;
  const alignsNodes = nodeList.filter((id) => (alignsAdjacency.get(id)?.size ?? 0) >= 2);
  if (alignsNodes.length > 0) {
    let totalLocalClustering = 0;
    for (const v of alignsNodes) {
      const neighbors = [...(alignsAdjacency.get(v) || [])];
      const k = neighbors.length;
      if (k < 2) continue;

      // Count edges between neighbors in the ALIGNS_WITH subgraph
      let connectedPairs = 0;
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          if (alignsAdjacency.get(neighbors[i])?.has(neighbors[j])) {
            connectedPairs += 1;
          }
        }
      }
      const possiblePairs = (k * (k - 1)) / 2;
      totalLocalClustering += connectedPairs / possiblePairs;
    }
    alignsWithClusteringCoefficient = Math.round((totalLocalClustering / alignsNodes.length) * 1000) / 1000;
  }

  // PROVIDES subgraph density
  const providesEdges = edges.filter((e) => e.edgeType === SOGEdgeType.PROVIDES);
  const providesNodes = new Set<string>();
  for (const e of providesEdges) {
    providesNodes.add(e.from);
    providesNodes.add(e.to);
  }
  const pn = providesNodes.size;
  let providesDensity = 0;
  if (pn > 1) {
    const possibleProvidesEdges = (pn * (pn - 1)) / 2;
    providesDensity = Math.round((providesEdges.length / possibleProvidesEdges) * 1000) / 1000;
  }

  return {
    alignsWithClusteringCoefficient,
    providesDensity,
    byType,
  };
}

// ====================================================================
// Helpers: node type counting
// ====================================================================

function countNodeTypes(nodes: EnrichedNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const nd of nodes) {
    counts[nd.nodeType] = (counts[nd.nodeType] || 0) + 1;
  }
  return counts;
}

// ====================================================================
// Public API: computeHONA
// ====================================================================

/**
 * Compute Heterogeneous Node Network Analysis for a team.
 *
 * Builds a network graph from recorded agent interactions,
 * computes density, degree centrality, betweenness centrality,
 * and identifies structural patterns with SOG v1.0 type awareness.
 *
 * Returns null if no interaction data exists.
 *
 * SOG v1.0 additions (returned as extra properties on HONAReport):
 * - nodes gain nodeType, betweennessCentrality, isBridge
 * - edges gain edgeType
 * - ontologyPatches: centrality and isBridge updates for the graph DB
 * - edgeTypeStats: ALIGNS_WITH clustering, PROVIDES density, per-type breakdown
 */
export function computeHONA(teamId: string): HONAReport | null {
  // Collect unique node IDs from all sources
  const nodeIds = new Set<string>();

  // From legacy interaction map
  for (const [from, targets] of interactionMap) {
    nodeIds.add(String(from));
    for (const to of targets.keys()) {
      nodeIds.add(String(to));
    }
  }

  // From typed interactions
  for (const ti of typedInteractions) {
    nodeIds.add(ti.from);
    nodeIds.add(ti.to);
  }

  // From collaboration events (dimension names as proxy for agent groups)
  const stats = getAllStats();
  for (const dim of Object.values(stats)) {
    if (dim.totalEvents > 0) {
      nodeIds.add(String(dim.dimension));
    }
  }

  // Week 4: SOG graph fallback — 内存为空时从本体图读取 AGENT 节点 + INTERACTS_WITH 边
  if (nodeIds.size === 0) {
    try {
      const { getEngineContext } = require('../infra/engine-context') as {
        getEngineContext: () => { database: { getDb(): { prepare(sql: string): { all(): Array<Record<string,unknown>> } } } } | null;
      };
      const db = getEngineContext()?.database?.getDb();
      if (db) {
        // 读取 AGENT/PERSON 节点 (graph_nodes schema: type/name/props_json)
        const agentRows = db.prepare(
          `SELECT name, props_json FROM graph_nodes WHERE type IN ('AGENT','PERSON') AND props_json IS NOT NULL`
        ).all();
        for (const r of agentRows) {
          const name = (r.name || '') as string;
          const p = typeof r.props_json === 'string' ? JSON.parse(r.props_json as string) : (r.props_json || {}) as Record<string, unknown>;
          const id = name || (p.id || p.agent_id || '') as string;
          if (id) { nodeIds.add(id); typedInteractions.push({ from: id, to: id, fromType: SOGNodeType.AGENT, toType: SOGNodeType.AGENT, edgeType: SOGEdgeType.INTERACTS_WITH, count: 1, lastSeen: new Date().toISOString() }); }
        }

        // 读取 INTERACTS_WITH 边 (graph_triples schema: subject_id/predicate/object_id)
        const edgeRows = db.prepare(
          `SELECT subject_id, object_id FROM graph_triples WHERE predicate = 'INTERACTS_WITH' LIMIT 500`
        ).all();
        for (const r of edgeRows) {
          const from = r.subject_id as string;
          const to = r.object_id as string;
          if (from && to) {
            nodeIds.add(from); nodeIds.add(to);
            typedInteractions.push({ from, to, fromType: SOGNodeType.AGENT, toType: SOGNodeType.AGENT, edgeType: SOGEdgeType.INTERACTS_WITH, count: 1, lastSeen: new Date().toISOString() });
          }
        }
      }
    } catch { /* SOG fallback 不可用 */ }
  }

  if (nodeIds.size === 0) return null;

  const agentList = [...nodeIds];
  const n = agentList.length;

  // Resolve SOG node types
  const nodeTypes = new Map<string, SOGNodeType>();
  for (const id of agentList) {
    nodeTypes.set(id, resolveNodeType(id));
  }

  // Build unified adjacency
  const adjacency = new Map<string, Set<string>>();
  for (const id of agentList) {
    adjacency.set(id, new Set());
  }

  // Build unified edge list with SOG types
  const enrichedEdges: EnrichedEdge[] = [];
  const edgeSet = new Set<string>();

  // From legacy interactions (default edge type = INTERACTS_WITH)
  for (const [from, targets] of interactionMap) {
    for (const [to, data] of targets) {
      const key = [from, to].sort().join('|');
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      adjacency.get(from)!.add(to);
      adjacency.get(to)!.add(from);

      enrichedEdges.push({
        from,
        to,
        weight: data.count,
        edgeType: SOGEdgeType.INTERACTS_WITH,
      });
    }
  }

  // From typed interactions
  for (const ti of typedInteractions) {
    const key = [ti.from, ti.to].sort().join('|') + '|' + ti.edgeType;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);

    if (!adjacency.has(ti.from)) adjacency.set(ti.from, new Set());
    if (!adjacency.has(ti.to)) adjacency.set(ti.to, new Set());
    adjacency.get(ti.from)!.add(ti.to);
    adjacency.get(ti.to)!.add(ti.from);

    enrichedEdges.push({
      from: ti.from,
      to: ti.to,
      weight: ti.count,
      edgeType: ti.edgeType,
    });
  }

  // Compute betweenness centrality
  const betweenness = computeBetweenness(agentList, adjacency);

  // Determine bridge threshold: top 25% betweenness, min 0.05
  const sortedBtwn = [...betweenness.values()].filter((v) => v > 0).sort((a, b) => b - a);
  const top25Idx = Math.max(0, Math.floor(n * 0.25) - 1);
  const bridgeThreshold = Math.max(sortedBtwn[top25Idx] ?? 0, 0.05);

  // Build nodes
  const nodes: EnrichedNode[] = agentList.map((id) => {
    const neighbors = adjacency.get(id) || new Set();
    const degree = neighbors.size;
    const maxPossible = n - 1;
    const centrality = maxPossible > 0 ? degree / maxPossible : 0;

    const nodeType = nodeTypes.get(id) || SOGNodeType.AGENT;
    const btwn = betweenness.get(id) || 0;

    // SOG v1.0: role from node type, not string heuristic
    const role = nodeTypeToRole(nodeType);

    // isBridge: high betweenness centrality indicates a structural bridge
    // connecting otherwise separate communities
    const isBridge = btwn >= bridgeThreshold && degree >= 2;

    return {
      id,
      degree,
      centrality: Math.round(centrality * 100) / 100,
      role,
      isIsolated: degree === 0,
      nodeType,
      betweennessCentrality: Math.round(btwn * 1000) / 1000,
      isBridge,
    };
  });

  // Edge type statistics (ALIGNS_WITH clustering, PROVIDES density, by-type breakdown)
  const edgeTypeStats = computeEdgeTypeStats(enrichedEdges, agentList, adjacency);

  // Ontology patches: centrality + isBridge updates for graph DB consumption
  const ontologyPatches: OntologyPatch[] = nodes.map((nd) => ({
    nodeId: nd.id,
    updates: {
      centrality: nd.centrality,
      isBridge: nd.isBridge,
      nodeType: nd.nodeType,
    },
  }));

  // Network density: actual edges / possible edges
  const possibleEdges = (n * (n - 1)) / 2;
  const density = possibleEdges > 0 ? enrichedEdges.length / possibleEdges : 0;

  // Centrality distribution
  const centralities = nodes.map((nd) => nd.centrality);
  const avgCentrality = centralities.length > 0
    ? centralities.reduce((a, b) => a + b, 0) / centralities.length
    : 0;
  const maxCentrality = centralities.length > 0 ? Math.max(...centralities) : 0;
  const isolatedCount = nodes.filter((nd) => nd.isIsolated).length;

  // Structure classification (SOG v1.0: AGENT-type isolation is the key signal)
  const agentNodes = nodes.filter((nd) => nd.nodeType === SOGNodeType.AGENT);
  const agentIsolatedCount = agentNodes.filter((nd) => nd.isIsolated).length;
  const agentIsolatedRatio = agentNodes.length > 0 ? agentIsolatedCount / agentNodes.length : 0;

  let structure: HONAReport['structure'];
  if (density >= 0.5) {
    structure = 'dense';
  } else if (density >= 0.2) {
    structure = 'moderate';
  } else if (agentIsolatedRatio > 0.3 || isolatedCount > n * 0.3) {
    structure = 'fragmented';
  } else {
    structure = 'sparse';
  }

  const structureLabel: Record<string, string> = {
    dense: '紧密耦合——Agent 间沟通频繁，适合快速迭代',
    moderate: '适中——核心节点承担主要协调工作',
    sparse: '稀疏——Agent 大多独立运作，跨角色协作较少',
    fragmented: '碎片化——多个 Agent 处于孤立状态，可能存在信息孤岛',
  };

  // Build rich interpretation with SOG type awareness
  const typeCounts = countNodeTypes(nodes);
  const typeSummary = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([t, c]) => `${t}:${c}`)
    .join(', ');

  const bridgeCount = nodes.filter((nd) => nd.isBridge).length;
  const capabilityNodes = nodes.filter((nd) => nd.nodeType === SOGNodeType.CAPABILITY);
  const goalNodes = nodes.filter((nd) => nd.nodeType === SOGNodeType.GOAL);
  const riskNodes = nodes.filter((nd) => nd.nodeType === SOGNodeType.RISK);

  let interpretation = `网络${structureLabel[structure]}。` +
    `${n} 个节点(${typeSummary})，${enrichedEdges.length} 条边，密度${(density * 100).toFixed(0)}%。`;

  if (isolatedCount > 0) {
    interpretation += `${isolatedCount} 个孤立节点需关注。`;
  } else {
    interpretation += '无孤立节点。';
  }

  if (maxCentrality > 0.7) {
    interpretation += '存在高度中心节点，可能成为单点瓶颈。';
  }

  if (bridgeCount > 0) {
    interpretation += `${bridgeCount} 个桥接节点连接不同子群。`;
  }

  // SOG v1.0 specific insights
  if (capabilityNodes.length > 0 && edgeTypeStats.providesDensity < 0.3) {
    interpretation += `能力供给网络稀疏（PROVIDES 密度${(edgeTypeStats.providesDensity * 100).toFixed(0)}%），建议审查${capabilityNodes.length}个能力节点的覆盖完备性。`;
  }

  if (goalNodes.length > 0 && edgeTypeStats.alignsWithClusteringCoefficient < 0.2) {
    interpretation += `目标对齐聚类系数低（${(edgeTypeStats.alignsWithClusteringCoefficient * 100).toFixed(0)}%），${goalNodes.length}个目标之间缺乏相互支撑关系。`;
  }

  if (riskNodes.length > 0 && riskNodes.every((nd) => nd.isIsolated)) {
    interpretation += `所有${riskNodes.length}个风险节点孤立——风险监控网络未形成。`;
  }

  const enrichedReport: EnrichedReport = {
    nodes,
    edges: enrichedEdges,
    density: Math.round(density * 100) / 100,
    avgCentrality: Math.round(avgCentrality * 100) / 100,
    maxCentrality: Math.round(maxCentrality * 100) / 100,
    isolatedCount,
    structure,
    interpretation,
    ontologyPatches,
    edgeTypeStats,
  };

  // Return as HONAReport (structural typing accepts extra properties)
  return enrichedReport;
}
