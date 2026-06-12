/**
 * graph-store.ts — 属性图存储 (Phase A: SQLite 三元组 + 邻接表)
 * ARCH-20: 可替换后端, 接口预留 SurrealDB
 *
 * @deprecated 公共 API 已迁移到 @synova/diagnosis-engine 包。
 * 新代码请从 '@synova/diagnosis-engine' import { createGraphStore }。
 * 本文件保留作为 engine-core 内部实现。
 */
import type { GraphNode, GraphEdge, Triple, SubGraph, OntologyPath, TriplePattern } from './types';
import type { NodeType, EdgeType } from './types';
import { createLogger } from '../../infra/logger';
import { GraphStoreError } from './ontology-errors';
import { SOGNodeType, SOGEdgeType, NODE_VALIDATORS, EDGE_VALIDATORS, validateEdgeEndpoints, SOGValidationError } from '@synova/sog-core';

const log = createLogger('diagnosis/graph-store');

let _idSeq = 0;
function genId(prefix: string): string { return `${prefix}_${(++_idSeq).toString(36)}_${Date.now().toString(36)}`; }

/** Safe JSON parse — returns {} on corruption, never throws. 铁律 24 + 铁律 31 */
function safeParse(raw: string | null | undefined, context: string): Record<string, unknown> {
  if (!raw || raw === '{}') return {};
  try {
    return JSON.parse(raw);
  } catch {
    log.warn({ raw: raw?.slice(0, 100), context }, '[graph-store] Corrupted props_json — returning {}');
    return {};
  }
}

// ⚠️ 多租户强制隔离: graph (orgId) 参数标记为 `?` 仅因 TypeScript 接口兼容性。
// 运行时所有方法均要求提供 graph — 省略将抛出 GraphStoreError('SOG-002')。
export interface GraphStore {
  createNode(type: NodeType, props: Record<string,unknown>, graph: string): string;
  createNodes(nodes: Array<{type:NodeType, props:Record<string,unknown>}>, graph: string): string[];
  getNode(id: string, graph: string): GraphNode | null;
  updateNode(id: string, props: Record<string,unknown>, graph: string): void;
  queryNodes(type: NodeType, filters?: Record<string,unknown>, graph?: string): GraphNode[];

  createEdge(type: EdgeType, from: string, to: string, weight?: number, props?: Record<string,unknown>, graph?: string): string;
  createEdges(edges: Array<{type:EdgeType, from:string, to:string, weight?:number, props?:Record<string,unknown>}>, graph: string): string[];
  queryEdges(type?: EdgeType, from?: string, to?: string, graph?: string): GraphEdge[];

  traverse(startNodeId: string, edgeType?: EdgeType, maxDepth?: number, graph?: string): SubGraph;
  findPaths(from: string, to: string, edgeType?: EdgeType, maxDepth?: number, graph?: string): OntologyPath[];
  queryTriples(pattern: TriplePattern, graph?: string): Triple[];

  deleteNode(id: string, graph: string): void;
  deleteEdge(id: string, graph: string): void;
  getNodeAtTime(id: string, timestamp: string, graph: string): GraphNode | null;
}

export class SQLiteGraphStore implements GraphStore {
  private db: any;

  constructor(database: any) { this.db = database; this.initSchema(); }

  private initSchema(): void {
    // Phase 1: 建表 (不含依赖 valid_to 的索引, 旧表可能缺少此列)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT NOT NULL, type TEXT NOT NULL, graph TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '', confidence REAL DEFAULT 1.0,
        props_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        valid_to TEXT,
        PRIMARY KEY (id, graph)
      );
      CREATE INDEX IF NOT EXISTS idx_gn_type ON graph_nodes(graph, type);
      CREATE INDEX IF NOT EXISTS idx_gn_name ON graph_nodes(graph, name);

      CREATE TABLE IF NOT EXISTS graph_triples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
        predicate TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
        graph TEXT NOT NULL, weight REAL DEFAULT 1.0,
        props_json TEXT DEFAULT '{}', confidence REAL DEFAULT 1.0, source TEXT,
        valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_gt_subject ON graph_triples(graph, subject_type, subject_id);
      CREATE INDEX IF NOT EXISTS idx_gt_object ON graph_triples(graph, object_type, object_id);
      CREATE INDEX IF NOT EXISTS idx_gt_predicate ON graph_triples(graph, predicate);
      CREATE INDEX IF NOT EXISTS idx_gt_weight ON graph_triples(graph, predicate, weight);
    `);

    // Phase 2: 为旧数据库迁移 (valid_to 列 + 缺失列)
    try { this.db.exec('ALTER TABLE graph_nodes ADD COLUMN valid_to TEXT'); } catch { /* 列已存在 */ }
    try { this.db.exec('ALTER TABLE graph_triples ADD COLUMN valid_to TEXT'); } catch { /* 列已存在 */ }
    try { this.db.exec('ALTER TABLE graph_nodes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime(\'now\'))'); } catch { /* 列已存在 */ }
    try { this.db.exec('ALTER TABLE graph_triples ADD COLUMN confidence REAL DEFAULT 1.0'); } catch { /* 列已存在 */ }
    try { this.db.exec('ALTER TABLE graph_triples ADD COLUMN source TEXT'); } catch { /* 列已存在 */ }

    // Phase 3: 索引 (迁移完成后 valid_to 列一定存在)
    try { this.db.exec('CREATE INDEX IF NOT EXISTS idx_gn_valid ON graph_nodes(graph, valid_to)'); } catch { /* ok */ }
    try { this.db.exec('CREATE INDEX IF NOT EXISTS idx_gt_valid ON graph_triples(graph, valid_from, valid_to)'); } catch { /* ok */ }
  }

  // ═══ Nodes ═══
  createNode(type: NodeType, props: Record<string,unknown>, graph: string): string {
    if (!graph) throw new GraphStoreError('graph (orgId) is required');
    // SOG-Core v1.0 校验
    if (!Object.values(SOGNodeType).includes(type as SOGNodeType)) {
      throw new SOGValidationError(`非法节点类型: ${type}`);
    }
    const nodeValidator = NODE_VALIDATORS[type as SOGNodeType];
    if (nodeValidator && !nodeValidator(props)) {
      throw new SOGValidationError(`节点 ${type} 缺少必填属性或属性类型错误`);
    }
    const id = `node_${type}_${genId('')}`;
    const now = new Date().toISOString();
    const name = String(props.name || props.email || props.title || '');
    const confidence = typeof props.confidence === 'number' ? props.confidence : 1.0;
    this.db.prepare(`INSERT INTO graph_nodes (id,type,graph,name,confidence,props_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, type, graph, name, confidence, JSON.stringify(props), now, now);
    return id;
  }

  createNodes(nodes: Array<{type:NodeType, props:Record<string,unknown>}>, graph: string): string[] {
    // SOG-Core v1.0 批量校验 (Batch 1 #1)
    for (const n of nodes) {
      if (!Object.values(SOGNodeType).includes(n.type as SOGNodeType)) {
        throw new SOGValidationError(`createNodes: 非法节点类型: ${n.type}`);
      }
      const v = NODE_VALIDATORS[n.type as SOGNodeType];
      if (v && !v(n.props)) throw new SOGValidationError(`createNodes: 节点 ${n.type} 缺少必填属性`);
    }
    const insert = this.db.prepare(`INSERT INTO graph_nodes (id,type,graph,name,confidence,props_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`);
    const ids: string[] = [];
    const tx = this.db.transaction(() => {
      for (const n of nodes) {
        const id = `node_${n.type}_${genId('')}`;
        const name = String(n.props.name || n.props.email || n.props.title || '');
        const confidence = typeof n.props.confidence === 'number' ? n.props.confidence : 1.0;
        insert.run(id, n.type, graph, name, confidence, JSON.stringify(n.props), new Date().toISOString(), new Date().toISOString());
        ids.push(id);
      }
    });
    tx();
    return ids;
  }

  getNode(id: string, graph: string): GraphNode | null {
    // Fix 3: 双时序 — 过滤已软删除的节点 (valid_to IS NULL)
    const row = this.db.prepare('SELECT * FROM graph_nodes WHERE id=? AND graph=? AND valid_to IS NULL').get(id, graph) as any;
    if (!row) return null;
    return { id: row.id, type: row.type as NodeType, props: safeParse(row.props_json, `getNode(${id})`), graph: row.graph, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  updateNode(id: string, props: Record<string,unknown>, graph: string): void {
    this.db.prepare('UPDATE graph_nodes SET props_json=?, updated_at=? WHERE id=? AND graph=?')
      .run(JSON.stringify(props), new Date().toISOString(), id, graph);
  }

  queryNodes(type: NodeType, filters?: Record<string,unknown>, graph?: string): GraphNode[] {
    if (!graph) throw new GraphStoreError('SOG-002: graph (orgId) is required for multi-tenant isolation');
    let sql = 'SELECT * FROM graph_nodes WHERE type=? AND valid_to IS NULL AND graph=?';
    const params: any[] = [type, graph];
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.filter(r => {
      if (!filters) return true;
      const props = safeParse(r.props_json, `queryNodes-filter(${r.id})`);
      return Object.entries(filters).every(([k,v]) => props[k] === v);
    }).map(r => ({ id: r.id, type: r.type as NodeType, props: safeParse(r.props_json, `queryNodes-map(${r.id})`), graph: r.graph, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  // ═══ Edges ═══
  createEdge(type: EdgeType, from: string, to: string, weight = 1.0, props: Record<string,unknown> = {}, graph?: string): string {
    if (!graph) throw new GraphStoreError('graph (orgId) is required');
    // SOG-Core v1.0 校验
    if (!Object.values(SOGEdgeType).includes(type as SOGEdgeType)) {
      throw new SOGValidationError(`非法边类型: ${type}`);
    }
    // PERF: validateEdgeEndpoints 每次 createEdge 执行 2 次 getNode 查询。
    // 后续批处理时可一次查询所有相关节点类型并缓存。
    const fromNode = this.getNode(from, graph);
    const toNode = this.getNode(to, graph);
    if (fromNode && toNode && !validateEdgeEndpoints(type as SOGEdgeType, fromNode.type as SOGNodeType, toNode.type as SOGNodeType)) {
      throw new SOGValidationError(`非法边端点组合: ${type} ${fromNode.type}→${toNode.type}`);
    }
    const edgeValidator = EDGE_VALIDATORS[type as SOGEdgeType];
    if (edgeValidator && !edgeValidator(props)) {
      throw new SOGValidationError(`边 ${type} 缺少必填属性或属性类型错误`);
    }
    // CONSUMES 额外校验: to 节点 financialType 必须为 token_account
    if (type === SOGEdgeType.CONSUMES && toNode) {
      if ((toNode.props as any)?.financialType !== 'token_account') {
        throw new SOGValidationError('CONSUMES 边的目标节点 financialType 必须为 token_account');
      }
    }
    const now = new Date().toISOString();
    const result = this.db.prepare(`INSERT INTO graph_triples (subject_type,subject_id,predicate,object_type,object_id,graph,weight,props_json,valid_from) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run('node', from, type, 'node', to, graph, weight, JSON.stringify(props), now);
    return `edge_${result.lastInsertRowid}`;
  }

  createEdges(edges: Array<{type:EdgeType, from:string, to:string, weight?:number, props?:Record<string,unknown>}>, graph: string): string[] {
    // SOG-Core v1.0 批量校验 (Batch 1 #1)
    for (const e of edges) {
      if (!Object.values(SOGEdgeType).includes(e.type as SOGEdgeType)) throw new SOGValidationError(`createEdges: 非法边类型: ${e.type}`);
      const v = EDGE_VALIDATORS[e.type as SOGEdgeType];
      if (v && !v(e.props || {})) throw new SOGValidationError(`createEdges: 边 ${e.type} 缺少必填属性`);
    }
    const insert = this.db.prepare(`INSERT INTO graph_triples (subject_type,subject_id,predicate,object_type,object_id,graph,weight,props_json,valid_from) VALUES (?,?,?,?,?,?,?,?,?)`);
    const ids: string[] = [];
    const tx = this.db.transaction(() => {
      for (const e of edges) {
        const r = insert.run('node', e.from, e.type, 'node', e.to, graph, e.weight ?? 1.0, JSON.stringify(e.props || {}), new Date().toISOString());
        ids.push(`edge_${r.lastInsertRowid}`);
      }
    });
    tx();
    return ids;
  }

  queryEdges(type?: EdgeType, from?: string, to?: string, graph?: string): GraphEdge[] {
    if (!graph) throw new GraphStoreError('SOG-002: graph (orgId) is required for multi-tenant isolation');
    const conditions: string[] = ['valid_to IS NULL', 'graph=?'];
    const params: any[] = [graph];
    if (type) { conditions.push('predicate=?'); params.push(type); }
    if (from) { conditions.push('subject_id=?'); params.push(from); }
    if (to) { conditions.push('object_id=?'); params.push(to); }
    const rows = this.db.prepare(`SELECT * FROM graph_triples WHERE ${conditions.join(' AND ')}`).all(...params) as any[];
    return rows.map(r => ({ id: `edge_${r.id}`, type: r.predicate as EdgeType, from: r.subject_id, to: r.object_id, weight: r.weight, props: safeParse(r.props_json, `queryEdges(${r.id})`), graph: r.graph, validFrom: r.valid_from, validTo: r.valid_to }));
  }

  // ═══ Traversal ═══
  traverse(startNodeId: string, edgeType?: EdgeType, maxDepth = 5, graph?: string): SubGraph {
    if (!graph) throw new GraphStoreError('graph (orgId) is required');
    const visited = new Set<string>(); const nodes: GraphNode[] = []; const edges: GraphEdge[] = [];
    const queue: Array<{nodeId: string; depth: number}> = [{nodeId: startNodeId, depth: 0}];
    while (queue.length > 0) {
      const {nodeId, depth} = queue.shift()!;
      if (visited.has(nodeId) || depth > maxDepth) continue;
      visited.add(nodeId);
      const node = this.getNode(nodeId, graph);
      if (node) nodes.push(node);
      const outEdges = this.queryEdges(edgeType, nodeId, undefined, graph);
      for (const e of outEdges) {
        edges.push(e);
        if (!visited.has(e.to)) queue.push({nodeId: e.to, depth: depth + 1});
      }
    }
    return { nodes, edges };
  }

  findPaths(from: string, to: string, edgeType?: EdgeType, maxDepth = 5, graph?: string): OntologyPath[] {
    if (!graph) throw new GraphStoreError('graph (orgId) is required');
    const paths: OntologyPath[] = [];
    const stack: Array<{nodeId: string; nodePath: string[]; edgePath: string[]; weight: number}> = [{nodeId: from, nodePath: [from], edgePath: [], weight: 0}];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current.nodePath.length > maxDepth + 1) continue;
      if (current.nodeId === to && current.edgePath.length > 0) {
        paths.push({ nodes: [...current.nodePath], edges: [...current.edgePath], totalWeight: current.weight, length: current.edgePath.length });
        continue;
      }
      const outEdges = this.queryEdges(edgeType, current.nodeId, undefined, graph);
      for (const e of outEdges) {
        if (!current.nodePath.includes(e.to)) {
          stack.push({ nodeId: e.to, nodePath: [...current.nodePath, e.to], edgePath: [...current.edgePath, e.id], weight: current.weight + e.weight });
        }
      }
    }
    return paths;
  }

  queryTriples(pattern: TriplePattern, graph?: string): Triple[] {
    // SOG-002: graph (orgId) 是强制多租户隔离参数，运行时必须提供
    if (!graph) throw new GraphStoreError('SOG-002: graph (orgId) is required for multi-tenant isolation');
    const conditions: string[] = [];
    const params: any[] = [];
    if (pattern.subject_type) { conditions.push('subject_type=?'); params.push(pattern.subject_type); }
    if (pattern.subject_id) { conditions.push('subject_id=?'); params.push(pattern.subject_id); }
    if (pattern.predicate) { conditions.push('predicate=?'); params.push(pattern.predicate); }
    if (pattern.object_type) { conditions.push('object_type=?'); params.push(pattern.object_type); }
    if (pattern.object_id) { conditions.push('object_id=?'); params.push(pattern.object_id); }
    if (graph) { conditions.push('graph=?'); params.push(graph); }
    conditions.push('valid_to IS NULL');
    return this.db.prepare(`SELECT * FROM graph_triples WHERE ${conditions.join(' AND ')}`).all(...params) as Triple[];
  }

  deleteNode(id: string, graph: string): void {
    const now = new Date().toISOString();
    // 1. Soft-delete all edges connected to this node
    this.db.prepare('UPDATE graph_triples SET valid_to=? WHERE (subject_id=? OR object_id=?) AND graph=? AND valid_to IS NULL').run(now, id, id, graph);
    // 2. SOG-001: 软删除节点 — UPDATE valid_to, 不物理 DELETE (Arch-20 双时序原则)
    this.db.prepare('UPDATE graph_nodes SET valid_to=? WHERE id=? AND graph=? AND valid_to IS NULL').run(now, id, graph);
  }

  deleteEdge(id: string, graph: string): void {
    const now = new Date().toISOString();
    const numId = parseInt(id.replace('edge_', ''));
    if (!isNaN(numId)) this.db.prepare('UPDATE graph_triples SET valid_to=? WHERE id=? AND graph=?').run(now, numId, graph);
  }

  getNodeAtTime(id: string, timestamp: string, graph: string): GraphNode | null {
    // Fix 3: 双时序查询 — 按时间点返回正确的历史版本
    // valid_from <= timestamp AND (valid_to IS NULL OR valid_to > timestamp)
    const row = this.db.prepare(
      "SELECT * FROM graph_nodes WHERE id=? AND graph=? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?) ORDER BY valid_from DESC LIMIT 1"
    ).get(id, graph, timestamp, timestamp) as any;
    if (!row) return null;
    if (new Date(row.created_at) > new Date(timestamp)) return null;
    return { id: row.id, type: row.type as NodeType, props: safeParse(row.props_json, `getNodeAtTime(${id})`), graph: row.graph, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}

export function createGraphStore(type: 'sqlite', db: any): GraphStore {
  if (type === 'sqlite') return new SQLiteGraphStore(db);
  throw new GraphStoreError(`Unsupported graph store type: ${type}`);
}
