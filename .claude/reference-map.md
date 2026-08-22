# Reference Map

> 生成: 2026-08-22 D338 | 来源: grep-refs.sh 门禁 + 三路 Explore agent 全仓核验（file:line 实测 @69be07c8）
> 标注: ✅ 本任务要改 | 👀 不改但受影响 | 🧪 测试同步改

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## ActionStore
| ✅ new ActionStore() 生产构造点 | src/agent/synova-agent.ts | 139 | `proactivePush.setActionStore(new ActionStore())` — 将传 orgId |
| 🧪 new ActionStore 测试构造点 ×9 | tests/growth/action-store.test.ts | 46/56/65/87/93/104/112/121/128 | 全部补 'test-org' |
| 👀 ActionStoreLike 接口 | src/growth/action-types.ts | 73-76 | 仅 createAction+updateLifecycle，构造器无关，零改 |

## createGraphTraversal
| ✅ 生产构造点 | src/agent/diagnosis-launcher.ts | 145 | `createGraphTraversal(store)` — 将传 teamId（L61 已有） |
| 👀 纯 re-export 适配器 | src/l3/graph-traversal-adapter.ts | 7 | 零改（透传） |
| 👀 DSH 地盘消费 | src/sentinel/sentinel-loader.ts | 204-207 | 不传第 2 参 → 默认 'default'，零行为变化 |
| 🧪 既有测试（1 参调用） | tests/l4/graph-traversal.test.ts 等 | — | mock 忽略 graph，保持绿 |

## queryFeedback
| ✅ 定义（改返回形态） | src/growth/feedback-collector.ts | 205-258 | FeedbackRecord[] → FeedbackQueryResult{entries,degraded} |
| 🧪 测试调用点 ×4 | tests/growth/feedback-collector.test.ts | 46/56/68/83 | 适配 .entries |
| 👀 生产调用方 | src/ — | 零命中 | grep 实证，形状变更零生产影响 |
| ❄️ 冻结不碰 | src/agent/loop-handlers.ts | 82 | getAggregatedSignals()（D472 只读依赖，一字不动） |

## DataPurger
| ✅ 生产构造点 | src/l3/data-lifecycle-service.ts | 75/92 | L75 executePurge 传 tenantId；L92 queryPurgeStatus 保持 3 参 |
| 🧪 既有测试（3 参构造 ×7） | tests/l4/data-purger.test.ts | 115/138/160/182/215/234/247 | 第 4 参可选 + mock 忽略 graph，保持绿 |

## overflow snapshot graph
| ✅ SNAPSHOT_GRAPH 使用点 ×3 | src/cycles/overflow-graph-bridge.ts | 47/70/97/154 | 改 snapshotGraph(enterpriseId) 派生 `${enterpriseId}:cycles` |
| 👀 消费方（只读，零改） | src/cycles/overflow-dashboard.ts:19、investment-advisor.ts:15、cross-scale-validator.ts:22、src/routes/overflow.ts:14 | — | 方法签名已带 enterpriseId，内部派生 |

## orgId 隔离面
| ✅ GA 路由 auth 回退 ×7 | src/routes/ga-annotations.ts 101/111/162/223 + ga-corrections.ts 30/31/48 | — | `auth.orgId || 'default'` → fail-closed |
| 👀 数据回显（不改） | src/routes/ga-annotations.ts | 196 | `(val.orgId as string) || ''` 读已存 JSON，非 auth 回退 |
| ✅ config 配置源 | src/config.ts | — | 加 orgId + SYNOVA_ORG_ID env |
| 👀 上游硬编码断点（写集外，记审计观察项） | src/agent/interactive-card.ts 173、src/l3/ga-collaboration.ts 211 | — | enterpriseId: 'default' 有值但错值 |
| 👀 GA 反馈写方（已传 enterpriseId:'default'，不受 fail-closed 阻断） | src/routes/workspace-data.ts | 142/167/192 | 写集外，行为不变 |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/decision_concentrates.test.ts | `9:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/decision_concentrates.test.ts | `37:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/decision_concentrates.test.ts | `48:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/depends_on_platform.test.ts | `9:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/depends_on_platform.test.ts | `37:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/depends_on_platform.test.ts | `48:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/external_assumption.test.ts | `10:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/external_assumption.test.ts | `38:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/external_assumption.test.ts | `49:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/incentive_binds.test.ts | `9:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/incentive_binds.test.ts | `37:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/incentive_binds.test.ts | `48:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/locks_in.test.ts | `9:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/locks_in.test.ts | `37:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/locks_in.test.ts | `48:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/metric_binds.test.ts | `9:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/metric_binds.test.ts | `37:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/metric_binds.test.ts | `48:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/replenishes.test.ts | `9:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/replenishes.test.ts | `37:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/replenishes.test.ts | `48:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/substitutes.test.ts | `10:import { createGraphTraversal } from '../../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/substitutes.test.ts | `39:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/edges/substitutes.test.ts | `50:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `5:import { createGraphTraversal } from '../../src/l4/graph-traversal';` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `39:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `47:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `55:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `61:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `69:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `76:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `84:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `94:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/l4/graph-traversal.test.ts | `102:    const gt = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `30:  it('createGraphTraversal produces a valid GraphTraversal from GraphStore', async () => {` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `31:    const { createGraphTraversal } = await import('../../src/l4/graph-traversal');` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `33:    const traversal = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `43:    const { createGraphTraversal } = await import('../../src/l4/graph-traversal');` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `45:    const traversal = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `56:    const { createGraphTraversal } = await import('../../src/l4/graph-traversal');` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `69:    const traversal = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `80:    const { createGraphTraversal } = await import('../../src/l4/graph-traversal');` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `81:    const traversal = createGraphTraversal(mockGraphStore());` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `88:    const { createGraphTraversal } = await import('../../src/l4/graph-traversal');` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `89:    const traversal = createGraphTraversal(mockGraphStore());` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `96:    const { createGraphTraversal } = await import('../../src/l4/graph-traversal');` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `99:    const traversal = createGraphTraversal(store);` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `112:    const { createGraphTraversal } = await import('../../src/l4/graph-traversal');` |
| `createGraphTraversal` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d338/tests/sentinel/graph-traversal-integration.test.ts | `114:    const traversal = createGraphTraversal(store);` |
