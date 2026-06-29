/**
 * l4/report-graph-adapter.ts — 报告渲染器与 GraphStore 桥梁 (Phase 1c)
 *
 * Phase 4 (报告生成) 和 Phase 3 (根因分析) 从 GraphStore 读数据,
 * 非硬编码模板。图空时降级为模板默认。
 */
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/report-graph-adapter');

// ═══ Types ═══

export interface NodeStats {
  totalNodes: number;
  totalEdges: number;
  byType: Record<string, number>;
  degraded: boolean;
}

export interface RiskSummaryItem {
  id: string;
  name: string;
  severity: string;
  riskType: string;
  affectedEntities?: number;
}

export interface CausalChain {
  nodes: string[];
  edges: Array<{ from: string; to: string; type: string }>;
  rootCause: boolean;
  description: string;
}

export interface GraphStoreRO {
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, type:string, props:Record<string,unknown>}>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{id:string, type:string, from:string, to:string, weight:number, props:Record<string,unknown>}>;
  traverse(startNodeId: string, edgeType?: string, maxDepth?: number, graph?: string): { nodes: Array<{id:string, type:string}>; edges: Array<{id:string, type:string, from:string, to:string}> };
  findPaths(from: string, to: string, edgeType?: string, maxDepth?: number, graph?: string): Array<{ nodes: string[]; edges: Array<{from:string, to:string, type:string}>; length: number; totalWeight: number }>;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ═══ ReportGraphAdapter ═══

export class ReportGraphAdapter {
  private store: GraphStoreRO;
  private graph: string;
  private maxRiskNodes: number;

  constructor(store: GraphStoreRO, graph: string, opts: { maxRiskNodes?: number } = {}) {
    this.store = store;
    this.graph = graph;
    this.maxRiskNodes = opts.maxRiskNodes ?? 20;
  }

  /** Get node/edge statistics for report header */
  getNodeStats(): NodeStats {
    const byType: Record<string, number> = {};
    let totalEdges = 0;

    try {
      const allNodeTypes = Object.values(SOGNodeType);
      for (const type of allNodeTypes) {
        const nodes = this.store.queryNodes(type, undefined, this.graph);
        if (nodes.length > 0) byType[type] = nodes.length;
      }

      const edges = this.store.queryEdges(undefined, undefined, undefined, this.graph);
      totalEdges = edges.length;

      const totalNodes = Object.values(byType).reduce((s, c) => s + c, 0);
      return { totalNodes, totalEdges, byType, degraded: totalNodes === 0 };
    } catch (err: any) {
      log.warn({ err }, 'getNodeStats failed — returning empty');
      return { totalNodes: 0, totalEdges: 0, byType: {}, degraded: true };
    }
  }

  /** Get risk summary sorted by severity (critical → high → medium → low) */
  getRiskSummary(): RiskSummaryItem[] {
    try {
      const riskNodes = this.store.queryNodes(SOGNodeType.RISK, undefined, this.graph);
      if (riskNodes.length === 0) return [];

      const items: RiskSummaryItem[] = riskNodes.slice(0, this.maxRiskNodes).map(n => ({
        id: n.id,
        name: (n.props.name as string) || n.id,
        severity: (n.props.severity as string) || 'medium',
        riskType: (n.props.riskType as string) || 'unknown',
      }));

      // Sort by severity
      items.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));
      return items;
    } catch (err: any) {
      log.warn({ err }, 'getRiskSummary failed');
      return [];
    }
  }

  /** Get causal chains starting from a root cause node */
  getCausalChains(rootNodeId: string): CausalChain[] {
    try {
      // Traverse from the root node
      const subgraph = this.store.traverse(rootNodeId, undefined, 3, this.graph);
      if (!subgraph || subgraph.nodes.length <= 1) return [];

      const chains: CausalChain[] = [];
      const nodeMap = new Map(subgraph.nodes.map(n => [n.id, n.type]));
      const edgeMap = subgraph.edges.map(e => ({
        from: e.from, to: e.to, type: e.type,
      }));

      // Build simple linear chains from the edges
      const visitedEdges = new Set<string>();
      for (const edge of edgeMap) {
        const key = `${edge.from}→${edge.to}`;
        if (visitedEdges.has(key)) continue;
        visitedEdges.add(key);

        const chainNodes = [edge.from, edge.to];
        const chainEdges = [{ from: edge.from, to: edge.to, type: edge.type }];

        // Extend chain: look for edges continuing from edge.to
        const nextEdges = edgeMap.filter(e => e.from === edge.to);
        for (const ne of nextEdges) {
          const neKey = `${ne.from}→${ne.to}`;
          if (!visitedEdges.has(neKey)) {
            visitedEdges.add(neKey);
            chainNodes.push(ne.to);
            chainEdges.push({ from: ne.from, to: ne.to, type: ne.type });
          }
        }

        const description = chainEdges.map(e => {
          const fromType = nodeMap.get(e.from) || '?';
          const toType = nodeMap.get(e.to) || '?';
          return `${fromType} →(${e.type})→ ${toType}`;
        }).join(' → ');

        chains.push({
          nodes: [...new Set(chainNodes)],
          edges: chainEdges,
          rootCause: true,
          description: `因果链: ${description}`,
        });
      }

      return chains;
    } catch (err: any) {
      log.warn({ err, rootNodeId }, 'getCausalChains failed');
      return [];
    }
  }
}
