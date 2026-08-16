/**
 * src/store/migrations/001-graph-nodes-props.ts — D355: graph_nodes props 列迁移
 *
 * 背景 (K3 P0-3 实测): 旧库 graph_nodes 以 props_json 列存储节点属性，
 * 当前代码期望 props 列 → queryNodes SELECT 报 no such column 被 catch 静默吞掉，
 * 哨兵把"查询失败"当"无数据"。
 *
 * 契约:
 *   @input  — better-sqlite3 Database 实例（可能含旧版 graph_nodes 表）
 *   @output — void；成功后 graph_nodes 含 props 列（TEXT NOT NULL DEFAULT '{}'），
 *             且旧 props_json 值已回填
 *   @degraded — 表不存在（全新库）→ no-op（initSchema 会创建含 props 的表）；
 *               props 列已存在 → no-op（幂等，重复执行安全）；
 *               异常 schema（如 graph_nodes 是视图）→ 抛错（fail-closed，迁移失败必须阻止启动）
 */
import type Database from 'better-sqlite3';
import type { Migration } from '../schema-migration';

export const graphNodesPropsMigration: Migration = {
  version: 2,
  name: 'graph-nodes-props',
  up: (db: Database.Database): void => {
    const cols = db.pragma('table_info(graph_nodes)') as Array<{ name: string }>;
    if (cols.length === 0) return; // 全新库: 表不存在, initSchema 将创建含 props 的表

    const hasProps = cols.some((c) => c.name === 'props');
    if (hasProps) return; // 幂等: 已迁移过（或新库已含 props），不重复执行

    db.exec("ALTER TABLE graph_nodes ADD COLUMN props TEXT NOT NULL DEFAULT '{}'");

    const hasPropsJson = cols.some((c) => c.name === 'props_json');
    if (hasPropsJson) {
      db.exec("UPDATE graph_nodes SET props = props_json WHERE props_json IS NOT NULL AND props_json != ''");
    }
  },
};
