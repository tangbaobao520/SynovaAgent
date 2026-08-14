<!-- SYNOVA-IMPL-D263 v1.0 | 2026-07-29 | 权威17 §四 Phase 0 -->
# SynovaAgent -- D263 GraphStore 增量查询 v1.0
> 权威17 工程规格 §四.2: diagnosis-graph-query.ts 新增 queryNodesCreatedAfter()

## 代码验证
- src/l4/diagnosis-graph-query.ts: 存在 ✅
- 当前无 `queryNodesCreatedAfter(graph, days)` 方法 ❌

## Q0-Q4
Q0: product-health.py 的"数据管道"维度需要查询近 N 天创建的节点数。当前 GraphStore 无增量查询。
Q2: 做——diagnosis-graph-query.ts 新增 `queryNodesCreatedAfter(graph: string, days: number): number`。
Q3: product-health.py 调用 → 返回近7天节点数 → >0 = healthy, =0 = degraded

## 改动 (diagnosis-graph-query.ts, ~15行)

### src/l4/diagnosis-graph-query.ts
```typescript
export function queryNodesCreatedAfter(graph: string, days: number): number {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = this.db.prepare(
    'SELECT COUNT(*) as cnt FROM graph_nodes WHERE graph = ? AND json_extract(props, "$.createdAt") >= ?'
  ).get(graph, cutoff) as { cnt: number };
  return rows.cnt;
}
```

## 测试 (L1×2)
| # | 测试 |
|---|------|
| 1 | 近 30 天 → 返回计数 >= 0 |
| 2 | 近 1 天 → 返回计数 >= 0 |

## 完成标准
queryNodesCreatedAfter 可用, 返回整数。tsc零新增, as any=0。
