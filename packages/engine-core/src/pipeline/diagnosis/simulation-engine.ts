import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
/**
 * simulation-engine.ts — 组织仿真引擎 (ARCH-23 Phase C)
 *
 * 数字孪生的终极能力: 在本体图上运行 "what-if" 仿真。
 * Clone 图 → 应用变换 → 运行诊断 → 对比基线 → 生成建议。
 *
 * 关键设计决策: Clone, don't mutate-and-rollback.
 * 仿真在独立的 clone store 上运行，原始 store 完全不受影响。
 */
import { createGraphStore, type GraphStore } from './graph-store';
import type { EdgeType, NodeType } from './types';
import { shortestPath, degreeCentrality, detectCommunities } from './graph-query';
import { runMonitorTick, type GraphAlert } from './graph-monitor';
import { runDecisionEngine, type DecisionAction } from './decision-engine';
import { createSnapshot } from './ontology-versioning';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/simulation-engine');

// ═══ Types ═══

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  /** 图变换操作 */
  transformations: SimulationTransform[];
}

export type SimulationTransform =
  | { type: 'add_node'; nodeType: NodeType; props: Record<string, unknown> }
  | { type: 'remove_node'; nodeId: string }
  | { type: 'add_edge'; edgeType: EdgeType; from: string; to: string; weight: number }
  | { type: 'modify_edge'; from: string; to: string; edgeType: EdgeType; newWeight: number }
  | { type: 'add_team'; name: string; members: string[] }
  | { type: 'restructure_team'; teamId: string; addMembers?: string[]; removeMembers?: string[] };

export interface SimulationResult {
  scenarioId: string;
  scenarioName: string;
  /** 基线快照 ID */
  baselineSnapshotId: string;
  /** 仿真后快照 ID */
  simulatedSnapshotId: string;
  /** 图变化统计 */
  delta: { addedNodes: number; addedEdges: number; modifiedEdges: number };
  /** 中心性变化 (关键人物影响力变化) */
  centralityChanges: Array<{ nodeId: string; baseline: number; simulated: number; delta: number }>;
  /** 社区结构变化 */
  communityChanges: { baselineCommunities: number; simulatedCommunities: number };
  /** 触发的告警 (仿真后新出现的异常) */
  newAlerts: GraphAlert[];
  /** 触发的决策行动 */
  triggeredActions: DecisionAction[];
  /** 最短路径变化 (关键协作路径的效率变化) */
  pathChanges: Array<{ from: string; to: string; baselineLength: number; simulatedLength: number; improved: boolean }>;
  generatedAt: string;
}

// ═══ ID generator (deterministic, no Date.now()) ═══
let _idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${(++_idCounter).toString(36)}`;
}

// ═══ Store Cloning ═══

interface CloneContext {
  store: GraphStore;
  /** nodeId mapping: original → clone */
  nodeMap: Map<string, string>;
  /** edgeId mapping: original → clone (for modify_edge lookup) */
  edgeMap: Map<string, string>;
}

/** Clone all nodes and edges from source store into a new in-memory store. */
function cloneStore(source: GraphStore, graph: string): CloneContext {
  const BetterSqlite3 = require('better-sqlite3');
  const clone: GraphStore = createGraphStore('sqlite', new BetterSqlite3(':memory:'));

  const nodeMap = new Map<string, string>();
  const edgeMap = new Map<string, string>();

  // Clone all node types
  const nodeTypes: NodeType[] = [SOGNodeType.PERSON, SOGNodeType.TEAM, SOGNodeType.AGENT, SOGNodeType.TOOL, SOGNodeType.CLIENT, SOGNodeType.PROCESS, SOGNodeType.EVENT, SOGNodeType.DOCUMENT, SOGNodeType.FINANCIAL];
  for (const ntype of nodeTypes) {
    const nodes = source.queryNodes(ntype, undefined, graph);
    for (const node of nodes) {
      const newId = clone.createNode(ntype, { ...node.props }, graph);
      nodeMap.set(node.id, newId);
    }
  }

  // Clone all edges
  const edges = source.queryEdges(undefined, undefined, undefined, graph);
  for (const edge of edges) {
    const newFrom = nodeMap.get(edge.from) || edge.from;
    const newTo = nodeMap.get(edge.to) || edge.to;
    const newId = clone.createEdge(edge.type, newFrom, newTo, edge.weight, { ...edge.props }, graph);
    edgeMap.set(edge.id, newId);
  }

  log.info({ nodes: nodeMap.size, edges: edgeMap.size, graph }, '[simulation] Cloned store');
  return { store: clone, nodeMap, edgeMap };
}

// ═══ Engine ═══

/** 在图上运行仿真场景。原始 store 不会被修改。 */
export function runSimulation(
  store: GraphStore, graph: string, scenario: SimulationScenario,
): SimulationResult | null {
  // 1. 基线快照 (原始 store)
  const baseline = createSnapshot(store, graph);
  if (!baseline) return null;

  // 2. 检查基线是否有可分析的内容
  const baselinePersons = store.queryNodes(SOGNodeType.PERSON, undefined, graph);
  if (baselinePersons.length === 0) {
    log.warn({ graph, scenario: scenario.id }, '[simulation] Empty baseline — nothing to simulate');
    return null;
  }

  // 3. 基线指标 (原始 store)
  const baselineCent = computeAllCentralities(store, graph);
  const baselineCommunities = detectCommunities(store, 2, graph).length;

  // 4. Clone store + 应用变换
  const clone = cloneStore(store, graph);
  const changes = applyTransformations(clone, graph, scenario.transformations);

  // 5. 仿真后快照 + 指标
  const simulated = createSnapshot(clone.store, graph);
  const simCentRaw = computeAllCentralities(clone.store, graph);
  const simCommunities = detectCommunities(clone.store, 2, graph).length;

  // Build reverse map: clone ID → original ID
  const reverseMap = new Map<string, string>();
  for (const [origId, cloneId] of clone.nodeMap) {
    reverseMap.set(cloneId, origId);
  }

  // Translate clone centrality entries to use original node IDs
  const simCent = simCentRaw.map(s => ({
    nodeId: reverseMap.get(s.nodeId) || s.nodeId,
    centrality: s.centrality,
  }));

  // 6. 中心性变化 (delta > 0.05 视为有意义)
  const centralityChanges = baselineCent.map(b => {
    const sim = simCent.find(s => s.nodeId === b.nodeId);
    const simulatedVal = sim?.centrality || 0;
    return {
      nodeId: b.nodeId,
      baseline: b.centrality,
      simulated: simulatedVal,
      delta: simulatedVal - b.centrality,
    };
  }).filter(c => Math.abs(c.delta) > 0.05);

  // 7. 路径对比 (关键人员之间的协作效率)
  //    基线路径用原始 store，仿真路径用 clone store
  const pathChanges = computePathChanges(store, clone.store, graph);

  // 8. 告警 + 行动 (在 clone 上运行)
  const alerts = runMonitorTick(clone.store, graph, {
    edgeTypes: [SOGEdgeType.INTERACTS_WITH],
    weightThreshold: 0.2,
    centralityShiftThreshold: 0.3,
  });
  const actions = runDecisionEngine(clone.store, graph);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    baselineSnapshotId: baseline.id,
    simulatedSnapshotId: simulated.id,
    delta: { addedNodes: changes.addedNodes, addedEdges: changes.addedEdges, modifiedEdges: changes.modifiedEdges },
    centralityChanges,
    communityChanges: {
      baselineCommunities,
      simulatedCommunities: simCommunities,
    },
    newAlerts: alerts,
    triggeredActions: actions,
    pathChanges,
    generatedAt: new Date().toISOString(),
  };
}

// ═══ Path Comparison ═══

function computePathChanges(
  baselineStore: GraphStore,
  simStore: GraphStore,
  graph: string,
): SimulationResult['pathChanges'] {
  const changes: SimulationResult['pathChanges'] = [];
  const basePersons = baselineStore.queryNodes(SOGNodeType.PERSON, undefined, graph);

  // Compare paths between consecutive persons (limited to 5 pairs to avoid O(N²))
  for (let i = 0; i < Math.min(basePersons.length - 1, 5); i++) {
    for (let j = i + 1; j < Math.min(basePersons.length, i + 3); j++) {
      const fromId = basePersons[i].id;
      const toId = basePersons[j].id;

      const basePath = shortestPath(baselineStore, fromId, toId, SOGEdgeType.INTERACTS_WITH, graph);
      const simPath = shortestPath(simStore, fromId, toId, SOGEdgeType.INTERACTS_WITH, graph);

      const baseLen = basePath ? basePath.length : Infinity;
      const simLen = simPath ? simPath.length : Infinity;

      // Only report if there's a meaningful change
      if (baseLen !== simLen) {
        changes.push({
          from: fromId,
          to: toId,
          baselineLength: baseLen === Infinity ? 99 : baseLen,
          simulatedLength: simLen === Infinity ? 99 : simLen,
          improved: simLen < baseLen,
        });
      }
    }
  }

  return changes;
}

// ═══ Helpers ═══

function computeAllCentralities(store: GraphStore, graph: string): Array<{ nodeId: string; centrality: number }> {
  const persons = store.queryNodes(SOGNodeType.PERSON, undefined, graph);
  return persons.map(p => ({ nodeId: p.id, centrality: degreeCentrality(store, p.id, graph) }));
}

function applyTransformations(
  clone: CloneContext, graph: string,
  transforms: SimulationTransform[],
): { addedNodes: number; addedEdges: number; modifiedEdges: number } {
  let addedNodes = 0, addedEdges = 0, modifiedEdges = 0;

  for (const t of transforms) {
    switch (t.type) {
      case 'add_node': {
        clone.store.createNode(t.nodeType, t.props, graph);
        addedNodes++;
        break;
      }
      case 'remove_node': {
        // Verify node exists before attempting delete
        const node = clone.store.getNode(t.nodeId, graph);
        if (node) {
          clone.store.deleteNode(t.nodeId, graph);
        } else {
          log.warn({ nodeId: t.nodeId }, '[simulation] remove_node skipped — node not found');
        }
        break;
      }
      case 'add_edge': {
        clone.store.createEdge(t.edgeType, t.from, t.to, t.weight, getDefaultEdgeProps(t.edgeType as string), graph);
        addedEdges++;
        break;
      }
      case 'modify_edge': {
        const edges = clone.store.queryEdges(t.edgeType, t.from, t.to, graph);
        if (edges.length > 0) {
          clone.store.deleteEdge(edges[0].id, graph);
          clone.store.createEdge(t.edgeType, t.from, t.to, t.newWeight, getDefaultEdgeProps(t.edgeType as string), graph);
          modifiedEdges++;
        } else {
          log.warn({ from: t.from, to: t.to, edgeType: t.edgeType }, '[simulation] modify_edge skipped — edge not found');
        }
        break;
      }
      case 'add_team': {
        // FIXED: Capture the created Team node ID
        const teamId = clone.store.createNode(SOGNodeType.TEAM, { name: t.name, teamType: 'permanent' }, graph);
        addedNodes++;
        for (const memberId of t.members) {
          clone.store.createEdge(SOGEdgeType.BELONGS_TO, memberId, teamId, 1, {}, graph);
          addedEdges++;
        }
        break;
      }
      case 'restructure_team': {
        for (const mid of (t.addMembers || [])) {
          clone.store.createEdge(SOGEdgeType.BELONGS_TO, mid, t.teamId, 1, {}, graph);
          addedEdges++;
        }
        for (const mid of (t.removeMembers || [])) {
          const edges = clone.store.queryEdges(SOGEdgeType.BELONGS_TO, mid, t.teamId, graph);
          for (const e of edges) {
            clone.store.deleteEdge(e.id, graph);
          }
        }
        break;
      }
    }
  }
  return { addedNodes, addedEdges, modifiedEdges };
}

// ═══ Scenario Templates ═══

/** 根据边类型返回 SOG 必需的默认属性 */
function getDefaultEdgeProps(edgeType: string): Record<string, unknown> {
  switch (edgeType) {
    case 'INTERACTS_WITH': return { channel: 'direct_message' };
    case 'OWNS':            return { ownershipType: 'manages' };
    case 'CORRESPONDS_TO':  return { correspondenceType: 'related', confidence: 0.9 };
    case 'AFFECTS':         return { direction: 'positive' };
    case 'DEPENDS_ON':      return { criticality: 'optional' };
    case 'CONSUMES':        return { amount: 1, period: 'P1M' };
    case 'ALIGNS_WITH':     return { alignmentStrength: 0.5, alignmentType: 'direct' };
    default: return {};
  }
}

export function newHireScenario(personName: string, teamId: string): SimulationScenario {
  return {
    id: nextId('sim_hire'),
    name: `新成员加入: ${personName}`,
    description: `模拟 ${personName} 加入团队后的组织影响`,
    transformations: [
      { type: 'add_node', nodeType: SOGNodeType.PERSON, props: { name: personName, role: 'new_hire' } },
      { type: 'add_edge', edgeType: SOGEdgeType.BELONGS_TO, from: 'PLACEHOLDER', to: teamId, weight: 1 },
    ],
  };
}

export function restructureScenario(teamName: string, members: string[]): SimulationScenario {
  return {
    id: nextId('sim_restruct'),
    name: `团队重组: ${teamName}`,
    description: `模拟创建新团队 ${teamName} 并移入 ${members.length} 名成员`,
    transformations: [{ type: 'add_team', name: teamName, members }],
  };
}
