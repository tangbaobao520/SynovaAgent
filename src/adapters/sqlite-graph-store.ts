/**
 * src/adapters/sqlite-graph-store.ts — SQLite → GraphStoreLike 适配器 (D224)
 *
 * 将 better-sqlite3 Database 包装为 GraphStoreLike 接口，
 * 使 UserStore 等 L3 模块可以直接使用 SQLite 数据库作为图存储。
 *
 * 长久方案: 复用 engine-core 中的 GraphBridge 实例替代此适配器。
 *
 * 契约:
 *   @input  — better-sqlite3 Database 实例
 *   @output — GraphStoreLike { createNode, queryNodes, getNode, updateNode }
 *   @degraded — SQL 错误 → log.warn + 抛出/返回空
 */
import type Database from "better-sqlite3";
import { createLogger } from "@synova/logger";

const log = createLogger("adapters/sqlite-graph-store");

/** 图节点表结构 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS _graph_nodes (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL,
  props     TEXT NOT NULL DEFAULT '{}',
  graph     TEXT NOT NULL DEFAULT 'enterprise',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON _graph_nodes(type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_graph ON _graph_nodes(graph);
`;

/** UUID v4 生成（零外部依赖） */
function uuid(): string {
  const hex = "0123456789abcdef";
  let id = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      id += "-";
    } else if (i === 14) {
      id += "4";
    } else if (i === 19) {
      id += hex[(Math.random() * 16) | 0];
    } else {
      id += hex[(Math.random() * 16) | 0];
    }
  }
  return id;
}

/**
 * SqliteGraphStore — 将 SQLite 数据库包装为 GraphStoreLike 接口。
 *
 * 创建节点 → INSERT INTO _graph_nodes
 * 查询节点 → SELECT FROM _graph_nodes WHERE type=? AND ...
 * 获取节点 → SELECT FROM _graph_nodes WHERE id=?
 * 更新节点 → UPDATE _graph_nodes SET props=? WHERE id=?
 */
export class SqliteGraphStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    try {
      this.db.exec(SCHEMA_SQL);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, "图存储表初始化失败");
    }
  }

  /** 创建节点，返回节点 ID */
  createNode(
    type: string,
    props: Record<string, unknown>,
    graph: string = "enterprise",
  ): string {
    const id = `node-${uuid()}`;
    try {
      this.db
        .prepare(
          "INSERT INTO _graph_nodes (id, type, props, graph) VALUES (?, ?, ?, ?)",
        )
        .run(id, type, JSON.stringify(props), graph);
      return id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, type }, "创建图节点失败");
      throw err;
    }
  }

  /** 查询节点，支持按 JSON 属性和图过滤 */
  queryNodes(
    type: string,
    filters?: Record<string, unknown>,
    graph?: string,
  ): Array<{ id: string; type: string; props: Record<string, unknown> }> {
    try {
      let sql = "SELECT id, type, props FROM _graph_nodes WHERE type = ?";
      const params: unknown[] = [type];

      if (graph) {
        sql += " AND graph = ?";
        params.push(graph);
      }

      // 支持 JSON 属性过滤: 使用 json_extract 匹配 props 中的字段
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null) {
            sql += ` AND json_extract(props, '$.${key}') = ?`;
            params.push(String(value));
          }
        }
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        type: string;
        props: string;
      }>;

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        props: JSON.parse(row.props || "{}") as Record<string, unknown>,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, type }, "查询图节点失败");
      return [];
    }
  }

  /** 获取单个节点 */
  getNode(
    id: string,
    graph: string = "enterprise",
  ): { id: string; type: string; props: Record<string, unknown> } | null {
    try {
      const row = this.db
        .prepare("SELECT id, type, props FROM _graph_nodes WHERE id = ? AND graph = ?")
        .get(id, graph) as { id: string; type: string; props: string } | undefined;

      if (!row) return null;
      return {
        id: row.id,
        type: row.type,
        props: JSON.parse(row.props || "{}") as Record<string, unknown>,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id }, "获取图节点失败");
      return null;
    }
  }

  /** 更新节点属性 */
  updateNode(
    id: string,
    props: Record<string, unknown>,
    graph: string = "enterprise",
  ): void {
    try {
      const existing = this.getNode(id, graph);
      const merged = { ...(existing?.props || {}), ...props };
      this.db
        .prepare("UPDATE _graph_nodes SET props = ? WHERE id = ? AND graph = ?")
        .run(JSON.stringify(merged), id, graph);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, id }, "更新图节点失败");
      throw err;
    }
  }
}
