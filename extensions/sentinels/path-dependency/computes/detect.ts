/**
 * path-dependency/computes/detect.ts — 路径依赖检测 (Path Dependency Detection)
 *
 * 理论依据: 检测组织对特定技术栈、流程或合作模式的依赖程度。
 * 高路径依赖 = 切换成本高、灵活性低、锁定风险大。
 * 通过分析节点入度集中度(HHI-like)和单一依赖比例来量化。
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/path-dependency.ts
 */

export interface PathDependencyResult {
  value: number;       // 0-1, 依赖程度(越高越依赖)
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

export async function detectPathDependency(
  store: GraphStoreLike,
  _orgId: string,
): Promise<PathDependencyResult> {
  try {
    const nodes = await store.queryNodes().catch(() => []);
    const edges = await store.queryEdges().catch(() => []);

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return {
        value: 0.5,
        threshold: 'warning',
        metadata: {
          degraded: true,
          reason: 'no graph data available',
          nodeCount: 0,
          edgeCount: 0,
        },
      };
    }

    const edgeArr = edges as Array<Record<string, unknown>>;

    // Count incoming edges per target node (dependency concentration)
    const inDegree = new Map<string, number>();
    const typeCount = new Map<string, number>();

    for (const e of edgeArr) {
      const target = e.target as string;
      if (target) inDegree.set(target, (inDegree.get(target) || 0) + 1);

      const type = e.type as string || 'unknown';
      typeCount.set(type, (typeCount.get(type) || 0) + 1);
    }

    // HHI-like concentration on incoming edges
    const totalInDegrees = Array.from(inDegree.values()).reduce((s, c) => s + c, 0);
    let hhiDependency = 0;
    if (totalInDegrees > 0) {
      for (const count of inDegree.values()) {
        const share = count / totalInDegrees;
        hhiDependency += share * share;
      }
      // Normalize: for N targets, max HHI = 1, min = 1/N
      const n = inDegree.size;
      const minHHI = n > 0 ? 1 / n : 0;
      hhiDependency = n > 1 ? (hhiDependency - minHHI) / (1 - minHHI) : 1;
    }

    // Single-source dependency: ratio of edges from a single dominant source
    const outDegree = new Map<string, number>();
    for (const e of edgeArr) {
      const source = e.source as string;
      if (source) outDegree.set(source, (outDegree.get(source) || 0) + 1);
    }

    const maxOut = Math.max(0, ...outDegree.values());
    const singleSourceRatio = totalInDegrees > 0 ? maxOut / totalInDegrees : 0;

    // Composite: 60% HHI concentration + 40% single-source dependency
    const dependencyScore = 0.6 * hhiDependency + 0.4 * singleSourceRatio;

    const threshold: 'ok' | 'warning' | 'critical' =
      dependencyScore <= 0.3 ? 'ok'
      : dependencyScore <= 0.6 ? 'warning'
      : 'critical';

    return {
      value: Math.round(dependencyScore * 100) / 100,
      threshold,
      metadata: {
        hhiDependency: Math.round(hhiDependency * 100) / 100,
        singleSourceRatio: Math.round(singleSourceRatio * 100) / 100,
        totalEdges: edgeArr.length,
        uniqueTargets: inDegree.size,
        uniqueSources: outDegree.size,
      },
    };
  } catch (err) {
    return {
      value: 0,
      threshold: 'critical',
      metadata: { degraded: true, error: String(err) },
    };
  }
}
