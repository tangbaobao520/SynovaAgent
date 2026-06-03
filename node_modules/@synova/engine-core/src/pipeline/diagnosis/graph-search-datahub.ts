/**
 * graph-search-datahub.ts — Graph-then-Search (Phase B, 决策 4)
 *
 * 对标 DataHub LineageSearchService:
 *   1. 图遍历 (LineageRegistry edges) → 候选实体
 *   2. 文本过滤 (可选) → 排序
 *   3. Lightning (纯图) vs Tortoise (图+文本) 双路径
 */
import type { GraphStore } from './graph-store';
import type { LineageRegistry, EdgeInfo } from './entity-registry-datahub';

export type LineageDirection = 'UPSTREAM' | 'DOWNSTREAM';

export interface GraphSearchResult {
  entityId: string;
  entityType: string;
  entityName: string;
  degree: number;
  paths: string[][];
  textMatchScore?: number;
}

/** 图遍历 + 可选文本搜索 (对标 DataHub searchAcrossLineage) */
export function searchAcrossLineage(
  store: GraphStore, lineage: LineageRegistry,
  startEntityId: string, direction: LineageDirection,
  maxHops: number, graph: string,
  textQuery?: string,
): GraphSearchResult[] {
  if (maxHops <= 0) return [];

  // Step 1: Graph traversal — BFS via lineage edges
  const visited = new Set<string>([startEntityId]);
  const queue: Array<{ entityId: string; degree: number; path: string[] }> = [{ entityId: startEntityId, degree: 0, path: [startEntityId] }];
  const candidates = new Map<string, { degree: number; paths: string[][] }>();

  while (queue.length > 0) {
    const { entityId, degree, path } = queue.shift()!;
    if (degree >= maxHops) continue;

    // Get lineage edges for this entity type
    const node = store.getNode(entityId, graph);
    if (!node) continue;
    const spec = lineage.getSpec(node.type);
    if (!spec) continue;

    const edges = direction === 'UPSTREAM' ? spec.upstreamEdges : spec.downstreamEdges;

    for (const edge of edges) {
      // Find connected nodes by edge type
      const connected = direction === 'UPSTREAM'
        ? store.queryEdges(edge.type as any, entityId, undefined, graph)
        : store.queryEdges(edge.type as any, undefined, entityId, graph);

      for (const e of connected) {
        const nextId = direction === 'UPSTREAM' ? e.to : e.from;
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        const newPath = [...path, nextId];

        if (!candidates.has(nextId)) candidates.set(nextId, { degree: degree + 1, paths: [] });
        candidates.get(nextId)!.paths.push(newPath);

        queue.push({ entityId: nextId, degree: degree + 1, path: newPath });
      }
    }
  }

  // Step 2: Resolve candidates to results
  const results: GraphSearchResult[] = [];
  for (const [entityId, info] of candidates) {
    const node = store.getNode(entityId, graph);
    if (!node) continue;

    // Step 3: Text filter (Tortoise path)
    if (textQuery) {
      const name = String(node.props.name || node.props.title || node.props.description || '');
      if (!name.includes(textQuery)) continue;
    }

    results.push({
      entityId,
      entityType: node.type,
      entityName: String(node.props.name || node.props.title || entityId),
      degree: info.degree,
      paths: info.paths.slice(0, 3),
      textMatchScore: textQuery ? 0.5 : undefined,
    });
  }

  return results;
}
