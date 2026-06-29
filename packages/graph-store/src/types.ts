/**
 * packages/graph-store/src/types.ts — GraphStore 接口定义
 *
 * 从 src/l4/graph-bridge.ts + src/l4/synova-graph-store.ts 提取的类型。
 * 哨兵消费 GraphStoreReader 只读子集。
 */

/** 数据库连接接口 — 只需要 exec/prepare 两个方法 */
export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  };
}

/** GraphStore 只读查询接口 (哨兵消费) */
export interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
  getNode(id: string, graph: string): Record<string, unknown> | null;
}

/** GraphStore 完整读写接口 */
export interface GraphStore {
  createNode(type: string, props: Record<string, unknown>, graph: string): string;
  createNodes(nodes: Array<{ type: string; props: Record<string, unknown> }>, graph: string): string[];
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  queryByTags?(tags: string[], options?: { matchMode?: 'any' | 'all'; graph?: string }): Array<{ id: string; type: string; props: Record<string, unknown> }>;
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
