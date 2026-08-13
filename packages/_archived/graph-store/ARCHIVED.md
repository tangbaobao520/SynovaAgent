# ARCHIVED — @synova/graph-store (packages/graph-store)

> 归档日期: 2026-08-02 | 归档原因: D286 GraphStore 统一

## 状态

**已废弃，不再使用。** 本包已归档至 `packages/_archived/`，不再被构建系统收集
（无 npm workspaces 收集，tsconfig paths 与 vitest alias 映射已删除）。

## 替代方案

所有功能由原生实现 **`src/adapters/sqlite-graph-store.ts` (SqliteGraphStore)** 取代：

| 旧 API | 新实现 |
|--------|--------|
| `createSynovaGraphStore(db)` 工厂 | `new SqliteGraphStore(db)` 类构造 |
| `SynovaGraphStore` / `SqliteDb` / `GraphStore` / `GraphStoreReader` 类型 | SqliteGraphStore 类 + `Database.Database` (better-sqlite3) |
| `setGraphStoreDeletePermissionChecker` / `clearGraphStoreDeletePermissionChecker` | **已删除** — 原生删除路径无权限门，行为等价于旧"总是允许"语义 |
| `enableWAL(db)` | SqliteGraphStore 构造时自动启用（WAL 不可用降级 DELETE） |

## 迁移内容

- 表结构: `graph_nodes` + `graph_triples`（graph 默认 'default'、软删除 valid_to）— 与旧包/engine-core 兼容
- 方法面: createNode / createEdge / queryNodes / queryEdges / queryTriples / getNode / updateNode / deleteNode / deleteEdge
- 14 个 src 调用点 + 2 个测试已全部迁移（`grep "@synova/graph-store" src/ tests/ tsconfig.json vitest.config.ts` → 0）

## 废弃功能说明

- **删除权限检查器已废弃**（D286 依据: 生产调用仅 bootstrap 一处且语义=总是允许 `{allowed:true}`，
  原生删除路径无权限门行为等价。删除权限过滤的通用机制归 D293 traversal-permission-filter.ts）
- 旧包中无生产调用点的 API（createNodes/createEdges/traverse/findPaths/queryByTags/getNodeAtTime）
  未在 SqliteGraphStore 中实现 — 防止 dead code（铁律 37），按需回归时再加

## 回滚

如需恢复: `git mv packages/_archived/graph-store packages/graph-store` + 恢复 tsconfig paths +
vitest alias + 恢复调用点 import。git 历史完整保留。
