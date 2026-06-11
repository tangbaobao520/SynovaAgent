/**
 * expert-ontology-bridge.ts — 专家本体桥接 (ARCH-20 Phase A4)
 *
 * 专家子Agent通过此桥接输出本体图更新(ontologyPatches)。
 * 对标 Claw-Code 的 sub-agent file-based IPC: 专家输出→协调者收集→合并应用。
 */
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import type { ExpertReport, ExpertType, NodeType, EdgeType } from './types';
import type { GraphStore } from './graph-store';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/expert-ontology-bridge');

// ═══ Types ═══

export interface OntologyPatch {
  createNodes?: Array<{ type: NodeType; props: Record<string,unknown>; confidence: number }>;
  createEdges?: Array<{ type: EdgeType; from: string; to: string; weight?: number; props?: Record<string,unknown>; confidence: number }>;
  mergeNodes?: Array<{ nodeA: string; nodeB: string; reason: string }>;
  updateProps?: Array<{ nodeId: string; props: Record<string,unknown> }>;
}

export interface AppliedPatchResult {
  expertType: ExpertType;
  nodesCreated: number;
  edgesCreated: number;
  mergesApplied: number;
  propsUpdated: number;
  conflicts: string[];
}

// ═══ Validation ═══

const ALLOWED_NODE_TYPES = new Set<NodeType>([SOGNodeType.PERSON,SOGNodeType.TEAM,SOGNodeType.AGENT,SOGNodeType.TOOL,SOGNodeType.CLIENT,SOGNodeType.PROCESS,SOGNodeType.EVENT,SOGNodeType.DOCUMENT,SOGNodeType.FINANCIAL]);
const ALLOWED_EDGE_TYPES = new Set<EdgeType>([SOGEdgeType.INTERACTS_WITH,SOGEdgeType.BELONGS_TO,SOGEdgeType.OWNS,SOGEdgeType.TRIGGERS,SOGEdgeType.AFFECTS,SOGEdgeType.DEPENDS_ON,SOGEdgeType.CORRESPONDS_TO,SOGEdgeType.CONSUMES]);

function validatePatches(patches: OntologyPatch[], expertType: ExpertType): string[] {
  const errors: string[] = [];
  for (const p of patches) {
    for (const n of (p.createNodes || [])) {
      if (!ALLOWED_NODE_TYPES.has(n.type)) errors.push(`[${expertType}] Invalid node type: ${n.type}`);
    }
    for (const e of (p.createEdges || [])) {
      if (!ALLOWED_EDGE_TYPES.has(e.type)) errors.push(`[${expertType}] Invalid edge type: ${e.type}`);
    }
    for (const m of (p.mergeNodes || [])) {
      if (m.nodeA === m.nodeB) errors.push(`[${expertType}] Cannot merge node with itself: ${m.nodeA}`);
    }
  }
  return errors;
}

// ═══ Dedup + Merge ═══

function dedupPatches(allPatches: Array<{ expertType: ExpertType; patch: OntologyPatch }>): OntologyPatch {
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();
  const result: OntologyPatch = { createNodes: [], createEdges: [], mergeNodes: [], updateProps: [] };

  for (const { patch } of allPatches) {
    for (const n of (patch.createNodes || [])) {
      const key = `${n.type}:${JSON.stringify(n.props)}`;
      if (!seenNodes.has(key)) { seenNodes.add(key); result.createNodes!.push(n); }
    }
    for (const e of (patch.createEdges || [])) {
      const key = `${e.type}:${e.from}:${e.to}`;
      if (!seenEdges.has(key)) { seenEdges.add(key); result.createEdges!.push(e); }
    }
    for (const m of (patch.mergeNodes || [])) result.mergeNodes!.push(m);
    for (const u of (patch.updateProps || [])) result.updateProps!.push(u);
  }
  return result;
}

// ═══ Apply ═══

export function applyOntologyPatches(
  reports: ExpertReport[],
  graphStore: GraphStore,
  orgGraph: string,
): AppliedPatchResult[] {
  const results: AppliedPatchResult[] = [];

  // Collect all patches from all experts
  const allPatches: Array<{ expertType: ExpertType; patch: OntologyPatch }> = [];
  for (const report of reports) {
    if (report.status !== 'completed') continue;
    const patches = (report as any).ontologyPatches as OntologyPatch[] | undefined;
    if (!patches || patches.length === 0) continue;
    allPatches.push({ expertType: report.expertType, patch: patches[0] }); // 1 patch per expert
  }

  if (allPatches.length === 0) return [];

  // Validate
  for (const { expertType, patch } of allPatches) {
    const errors = validatePatches([patch], expertType);
    if (errors.length > 0) {
      log.warn({ expertType, errors }, '[ontology-bridge] Patches validation failed');
      continue;
    }
  }

  // Dedup + merge
  const merged = dedupPatches(allPatches);

  // Apply (in transaction)
  let nodesCreated = 0, edgesCreated = 0, mergesApplied = 0, propsUpdated = 0;
  const conflicts: string[] = [];

  // 1. Create nodes
  if (merged.createNodes && merged.createNodes.length > 0) {
    const ids = graphStore.createNodes(
      merged.createNodes.map(n => ({ type: n.type, props: n.props })),
      orgGraph,
    );
    nodesCreated = ids.length;
  }

  // 2. Create edges
  if (merged.createEdges && merged.createEdges.length > 0) {
    const ids = graphStore.createEdges(
      merged.createEdges.map(e => ({ type: e.type, from: e.from, to: e.to, weight: e.weight, props: e.props })),
      orgGraph,
    );
    edgesCreated = ids.length;
  }

  // 3. Merge nodes (manual confirmation required — only auto-apply for same-type merges)
  if (merged.mergeNodes && merged.mergeNodes.length > 0) {
    for (const m of merged.mergeNodes) {
      const nodeA = graphStore.getNode(m.nodeA, orgGraph);
      const nodeB = graphStore.getNode(m.nodeB, orgGraph);
      if (nodeA && nodeB && nodeA.type === nodeB.type) {
        // Auto-apply: same type merges (L1 deterministic)
        const edgesFromA = graphStore.queryEdges(undefined, m.nodeA, undefined, orgGraph);
        const edgesToA = graphStore.queryEdges(undefined, undefined, m.nodeA, orgGraph);
        for (const e of edgesFromA) graphStore.createEdge(e.type, m.nodeB, e.to, e.weight, e.props, orgGraph);
        for (const e of edgesToA) graphStore.createEdge(e.type, e.from, m.nodeB, e.weight, e.props, orgGraph);
        graphStore.deleteNode(m.nodeA, orgGraph);
        mergesApplied++;
      } else {
        conflicts.push(`Merge conflict: ${m.nodeA}(${nodeA?.type}) vs ${m.nodeB}(${nodeB?.type}) — different types, requires manual review`);
      }
    }
  }

  // 4. Update props
  if (merged.updateProps && merged.updateProps.length > 0) {
    for (const u of merged.updateProps) {
      try { graphStore.updateNode(u.nodeId, u.props, orgGraph); propsUpdated++; }
      catch { conflicts.push(`Update failed: ${u.nodeId}`); }
    }
  }

  results.push({
    expertType: 'action_advisor', // aggregator — applies merged patches from all experts
    nodesCreated, edgesCreated, mergesApplied, propsUpdated, conflicts,
  });

  log.info({ nodesCreated, edgesCreated, mergesApplied, propsUpdated, conflicts: conflicts.length },
    '[ontology-bridge] Patches applied');

  return results;
}

/** Extract ontology patches from expert reports (for ExpertReport extension) */
export function collectExpertPatches(reports: ExpertReport[]): OntologyPatch[] {
  return reports
    .filter(r => r.status === 'completed')
    .map(r => (r as any).ontologyPatches as OntologyPatch[] | undefined)
    .filter(p => p && Array.isArray(p) && p.length > 0) as OntologyPatch[];
}
