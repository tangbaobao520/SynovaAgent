<!-- SYNOVA-IMPL-D266 v1.0 | 2026-07-29 | 权威17 §四 Phase 0 -->
# SynovaAgent -- D266 数据管道监控模块 v1.0
> 权威17 §四.5: src/ingest/data-pipeline-monitor.ts 新建——GraphStore 增量节点检测

## 代码验证
- src/ingest/data-pipeline-monitor.ts 不存在 ❌
- product-health.py "数据管道"维度依赖此模块 (D263 queryNodesCreatedAfter)

## Q0-Q4
Q0: product-health.py 需要检测数据管道是否在最近 N 天有新数据流入。
Q2: 做——新建 data-pipeline-monitor.ts, 调用 D263 的 queryNodesCreatedAfter()。
Q3: product-health.py → getPipelineHealth(days=7) → count > 0 = healthy, = 0 = degraded

## 改动 (data-pipeline-monitor.ts 新建, ~60行)

### src/ingest/data-pipeline-monitor.ts
```typescript
import { queryNodesCreatedAfter } from '../l4/diagnosis-graph-query';
export interface PipelineHealth { nodesCreated7d: number; status: 'healthy' | 'degraded' }
export function getPipelineHealth(store: GraphStoreLike, graph='default', days=7): PipelineHealth {
  const count = queryNodesCreatedAfter(store, graph, days);
  return { nodesCreated7d: count, status: count > 0 ? 'healthy' : 'degraded' };
}
```

## 测试 (L1×2)
| # | 测试 |
|---|------|
| 1 | getPipelineHealth(store) 返回 {nodesCreated7d, status} |
| 2 | nodesCreated7d = 0 → status = 'degraded' |

## 完成标准
getPipelineHealth() 可用, 复用 D263 queryNodesCreatedAfter。
