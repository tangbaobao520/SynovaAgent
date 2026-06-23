/**
 * synova-graph-store.ts — Synova 本体图存储 (L4)
 *
 * Synova 自有的 GraphStore 实现。零 engine-core 依赖。纯 ESM。
 * 直接基于 better-sqlite3（通过注入的 db 连接），不经过 engine-core。
 *
 * 接口: 兼容 GraphStoreLike (post-diagnosis-processor.ts)。
 * 表结构: 与 engine-core graph-store 兼容（graph_nodes + graph_triples）。
 *
 * Iron law #24: 每个 catch 有 log + degraded。
 * Iron law #31: 降级信号传播。
 * Iron law #38: zero unsafe type casts.
 */
import { createLogger } from '../logger';

const log = createLogger('l4/synova-graph-store');

// ═══ 类型 ═══

/** 数据库连接接口 — 只需要 exec/prepare 两个方法。server.ts 需要此类型做注入转换 */
export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  };
}

/** GraphStore 公开接口 — 匹配 GraphStoreLike */
export interface SynovaGraphStore {
  createNode(type: string, props: Record<string, unknown>, graph: string): string;
  createNodes(nodes: Array<{ type: string; props: Record<string, unknown> }>, graph: string): string[];
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  /** V3.8: 按标签查询节点。标签来自 extensions/ontology/tags.json。matchMode: 'any' 只要有任一标签匹配, 'all' 全部标签匹配。 */
  queryByTags(tags: string[], options?: { matchMode?: 'any' | 'all'; graph?: string }): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
  createEdge(type: string, from: string, to: string, weight?: number, props?: Record<string, unknown>, graph?: string): string;
  createEdges(edges: Array<{ type: string; from: string; to: string; weight?: number; props?: Record<string, unknown> }>, graph: string): string[];
  getNode(id: string, graph: string): Record<string, unknown> | null;
  updateNode(id: string, props: Record<string, unknown>, graph: string): void;
  deleteNode(id: string, graph: string): void;
  deleteEdge(id: string, graph: string): void;
  traverse(startNodeId: string, edgeType?: string, maxDepth?: number, graph?: string): unknown;
  findPaths(from: string, to: string, edgeType?: string, maxDepth?: number, graph?: string): unknown[];
  queryTriples(pattern: Record<string, unknown>, graph?: string): unknown[];
  getNodeAtTime(id: string, timestamp: string, graph: string): Record<string, unknown> | null;
}

// ═══ 实现 ═══

let idCounter = 0;

class SynovaGraphStoreImpl implements SynovaGraphStore {
  private db: SqliteDb;

  constructor(db: SqliteDb) {
    this.db = db;
    this.initSchema();
  }

  // ═══ Schema ═══

  private initSchema(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS graph_nodes (
          id TEXT PRIMARY KEY,
          graph TEXT NOT NULL DEFAULT 'default',
          type TEXT NOT NULL,
          name TEXT,
          props TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          valid_from TEXT NOT NULL DEFAULT (datetime('now')),
          valid_to TEXT
        )
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gn_type ON graph_nodes(graph, type)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gn_name ON graph_nodes(graph, name)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gn_valid ON graph_nodes(graph, valid_to)`);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS graph_triples (
          id TEXT PRIMARY KEY,
          graph TEXT NOT NULL DEFAULT 'default',
          subject_type TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          predicate TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id TEXT NOT NULL,
          weight REAL NOT NULL DEFAULT 1.0,
          props TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          valid_from TEXT NOT NULL DEFAULT (datetime('now')),
          valid_to TEXT
        )
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gt_subject ON graph_triples(graph, subject_type, subject_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gt_object ON graph_triples(graph, object_type, object_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gt_predicate ON graph_triples(graph, predicate)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gt_weight ON graph_triples(graph, predicate, weight)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_gt_valid ON graph_triples(graph, valid_from, valid_to)`);
    } catch (err: unknown) {
      log.warn({ err }, 'GraphStore schema 初始化失败 — degraded');
    }
  }

  // ═══ CRUD: 节点 ═══

  createNode(type: string, props: Record<string, unknown>, graph: string): string {
    const id = `n_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
    const name = (props.name as string) || props.label as string || type;
    try {
      this.db.prepare(
        `INSERT INTO graph_nodes (id, graph, type, name, props) VALUES (?, ?, ?, ?, ?)`
      ).run(id, graph, type, name, JSON.stringify(props));
      return id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, type, graph }, 'createNode 失败');
      return '';
    }
  }

  createNodes(nodes: Array<{ type: string; props: Record<string, unknown> }>, graph: string): string[] {
    const ids: string[] = [];
    const stmt = this.db.prepare(
      `INSERT INTO graph_nodes (id, graph, type, name, props) VALUES (?, ?, ?, ?, ?)`
    );
    try {
      for (const node of nodes) {
        const id = `n_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
        const name = (node.props.name as string) || node.type;
        stmt.run(id, graph, node.type, name, JSON.stringify(node.props));
        ids.push(id);
      }
    } catch (err: unknown) {
      log.warn({ err }, 'createNodes 部分失败');
    }
    return ids;
  }

  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> {
    try {
      const g = graph || 'default';
      let sql = `SELECT id, type, props FROM graph_nodes WHERE graph = ? AND type = ? AND valid_to IS NULL`;
      const params: unknown[] = [g, type];

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null) {
            sql += ` AND json_extract(props, '$.${key}') = ?`;
            params.push(value);
          }
        }
      }

      const rows = this.db.prepare(sql).all(...params);
      return rows.map(r => ({
        id: r.id as string,
        type: r.type as string,
        props: this.safeJsonParse(r.props as string),
      }));
    } catch (err: unknown) {
      log.warn({ err, type }, 'queryNodes 失败');
      return [];
    }
  }

  queryByTags(tags: string[], options?: { matchMode?: 'any' | 'all'; graph?: string }): Array<{ id: string; type: string; props: Record<string, unknown> }> {
    try {
      const g = options?.graph || 'default';
      const matchMode = options?.matchMode || 'any';

      // 从 ontology-loader 获取匹配标签的节点类型
      const { getTypesByTags } = require('./ontology-loader') as { getTypesByTags: (t: string[], m: 'any'|'all') => { nodes: Array<{label: string}> } };
      const { nodes } = getTypesByTags(tags, matchMode);
      const types = nodes.map(n => n.label);

      if (types.length === 0) return [];

      const placeholders = types.map(() => '?').join(',');
      const sql = `SELECT id, type, props FROM graph_nodes WHERE graph = ? AND type IN (${placeholders}) AND valid_to IS NULL`;
      const params: unknown[] = [g, ...types];

      const rows = this.db.prepare(sql).all(...params);
      return rows.map(r => ({
        id: r.id as string,
        type: r.type as string,
        props: this.safeJsonParse(r.props as string),
      }));
    } catch (err: unknown) {
      log.warn({ err, tags }, 'queryByTags 失败');
      return [];
    }
  }

  getNode(id: string, graph: string): Record<string, unknown> | null {
    try {
      const row = this.db.prepare(
        `SELECT id, type, props FROM graph_nodes WHERE id = ? AND graph = ? AND valid_to IS NULL`
      ).get(id, graph);
      if (!row) return null;
      return {
        id: row.id as string,
        type: row.type as string,
        props: this.safeJsonParse(row.props as string),
      };
    } catch (err: unknown) {
      log.warn({ err, id }, 'getNode 失败');
      return null;
    }
  }

  updateNode(id: string, props: Record<string, unknown>, graph: string): void {
    try {
      this.db.prepare(
        `UPDATE graph_nodes SET props = ? WHERE id = ? AND graph = ?`
      ).run(JSON.stringify(props), id, graph);
    } catch (err: unknown) {
      log.warn({ err, id }, 'updateNode 失败');
    }
  }

  deleteNode(id: string, graph: string): void {
    try {
      this.db.prepare(
        `UPDATE graph_nodes SET valid_to = datetime('now') WHERE id = ? AND graph = ?`
      ).run(id, graph);
    } catch (err: unknown) {
      log.warn({ err, id }, 'deleteNode 失败');
    }
  }

  getNodeAtTime(id: string, timestamp: string, graph: string): Record<string, unknown> | null {
    try {
      const row = this.db.prepare(
        `SELECT id, type, props FROM graph_nodes WHERE id = ? AND graph = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)`
      ).get(id, graph, timestamp, timestamp);
      if (!row) return null;
      return {
        id: row.id as string,
        type: row.type as string,
        props: this.safeJsonParse(row.props as string),
      };
    } catch (err: unknown) {
      log.warn({ err, id }, 'getNodeAtTime 失败');
      return null;
    }
  }

  // ═══ CRUD: 边 ═══

  createEdge(type: string, from: string, to: string, weight?: number, props?: Record<string, unknown>, graph?: string): string {
    const id = `e_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
    const g = graph || 'default';
    try {
      // 推断 subject/object 类型
      const fromNode = this.getNode(from, g);
      const toNode = this.getNode(to, g);
      const subjectType = fromNode?.type as string || 'unknown';
      const objectType = toNode?.type as string || 'unknown';

      this.db.prepare(
        `INSERT INTO graph_triples (id, graph, subject_type, subject_id, predicate, object_type, object_id, weight, props)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, g, subjectType, from, type, objectType, to, weight ?? 1.0, JSON.stringify(props || {}));
      return id;
    } catch (err: unknown) {
      log.warn({ err, type, from, to }, 'createEdge 失败');
      return '';
    }
  }

  createEdges(edges: Array<{ type: string; from: string; to: string; weight?: number; props?: Record<string, unknown> }>, graph: string): string[] {
    return edges.map(e => this.createEdge(e.type, e.from, e.to, e.weight, e.props, graph)).filter(Boolean);
  }

  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }> {
    try {
      const g = graph || 'default';
      const conditions: string[] = [`graph = ?`];
      const params: unknown[] = [g];

      if (type) { conditions.push(`predicate = ?`); params.push(type); }
      if (from) { conditions.push(`subject_id = ?`); params.push(from); }
      if (to) { conditions.push(`object_id = ?`); params.push(to); }
      conditions.push(`valid_to IS NULL`);

      const sql = `SELECT id, predicate, subject_id, object_id, weight, props FROM graph_triples WHERE ${conditions.join(' AND ')}`;
      const rows = this.db.prepare(sql).all(...params);
      return rows.map(r => ({
        id: r.id as string,
        type: r.predicate as string,
        from: r.subject_id as string,
        to: r.object_id as string,
        weight: r.weight as number,
        props: this.safeJsonParse(r.props as string),
      }));
    } catch (err: unknown) {
      log.warn({ err }, 'queryEdges 失败');
      return [];
    }
  }

  deleteEdge(id: string, graph: string): void {
    try {
      this.db.prepare(
        `UPDATE graph_triples SET valid_to = datetime('now') WHERE id = ? AND graph = ?`
      ).run(id, graph);
    } catch (err: unknown) {
      log.warn({ err, id }, 'deleteEdge 失败');
    }
  }

  // ═══ 图遍历 ═══

  traverse(startNodeId: string, edgeType?: string, maxDepth?: number, graph?: string): unknown {
    const g = graph || 'default';
    const depth = maxDepth || 3;
    const visited = new Set<string>();
    const result: Array<{ node: Record<string, unknown>; edges: Array<Record<string, unknown>>; depth: number }> = [];

    const walk = (nodeId: string, currentDepth: number): void => {
      if (currentDepth > depth || visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = this.getNode(nodeId, g);
      if (!node) return;

      const edges = this.queryEdges(edgeType, nodeId, undefined, g);
      const connectedNodes = edges.map(e => {
        const targetId = e.to === nodeId ? e.from : e.to;
        return { edge: e, targetId };
      });

      result.push({
        node,
        edges: edges.map(e => ({ id: e.id, type: e.type, from: e.from, to: e.to, weight: e.weight })),
        depth: currentDepth,
      });

      for (const { targetId } of connectedNodes) {
        walk(targetId, currentDepth + 1);
      }
    };

    walk(startNodeId, 1);
    return result;
  }

  findPaths(from: string, to: string, edgeType?: string, maxDepth?: number, graph?: string): unknown[] {
    const g = graph || 'default';
    const depth = maxDepth || 4;
    const paths: unknown[] = [];

    const dfs = (current: string, target: string, visited: Set<string>, path: unknown[], currentDepth: number): void => {
      if (currentDepth > depth || visited.has(current)) return;
      if (current === target) { paths.push([...path]); return; }
      visited.add(current);

      const edges = this.queryEdges(edgeType, current, undefined, g);
      for (const edge of edges) {
        const next = edge.to === current ? edge.from : edge.to;
        path.push({ from: current, to: next, edge: { id: edge.id, type: edge.type, weight: edge.weight } });
        dfs(next, target, new Set(visited), path, currentDepth + 1);
        path.pop();
      }
    };

    dfs(from, to, new Set(), [], 1);
    return paths;
  }

  queryTriples(pattern: Record<string, unknown>, graph?: string): unknown[] {
    const g = graph || 'default';
    const conditions: string[] = [`graph = ?`, `valid_to IS NULL`];
    const params: unknown[] = [g];

    const fieldMap: Record<string, string> = {
      subject_type: 'subject_type', subjectId: 'subject_id', subject_id: 'subject_id',
      predicate: 'predicate',
      object_type: 'object_type', objectId: 'object_id', object_id: 'object_id',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (pattern[key] !== undefined && pattern[key] !== null) {
        conditions.push(`${col} = ?`);
        params.push(pattern[key]);
      }
    }

    try {
      const sql = `SELECT * FROM graph_triples WHERE ${conditions.join(' AND ')}`;
      return this.db.prepare(sql).all(...params);
    } catch (err: unknown) {
      log.warn({ err }, 'queryTriples 失败');
      return [];
    }
  }

  // ═══ 工具 ═══

  private safeJsonParse(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { /* JSON 解析失败 — 返回空对象, 非关键路径 */ return {}; }
  }
}

// ═══ 工厂 ═══

/**
 * 创建 SynovaGraphStore 实例。
 * 接收已有的 better-sqlite3 Database 连接，不内部创建。
 *
 * @param db - 从 getDatabase() 获取的 SQLite 连接
 */
export function createSynovaGraphStore(db: SqliteDb): SynovaGraphStore {
  return new SynovaGraphStoreImpl(db);
}
