# Task Brief: D394 片1: 哨兵 findings 事件化（派活登记）

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D394) | 认领: 📋 synova-devdoc（spec）
> 来源: K3 战略咨询 §4.1（改切片后片 1 先做）——以咨询为准

## 任务定义（片 1，先做）
哨兵 findings + 信号事件化：`src/sentinel/runner.ts`（findings 目前只在内存 records，重启即丢）→ 新增 `sentinel_events` append-only 表（L5），finding/signal/ticket 状态迁移全部事件写入；runner 内存态变事件流物化投影，启动重放重建。
**附带修**：`src/agent/sentinel-service.ts:97` durationMs 当时间戳 bug（恒输出 1970-01-01）。

## 三条 invariant（K3 定义，必须写进 spec）
- **I1 可重建**：kill -9 后重启，事件流重建状态与崩溃前等价
- **I2 单源**：状态只有事件流一个写入口；读路径全部从事件流（或其投影）派生
- **I3 可审计**：任何 finding 能从事件流回答「由哪些输入事件产生」

## 形似神不似预警（写进 spec 防做歪）
> 双写 messages+events、读路径不动 → events 表沦为没人读的日志副本 → 三个月后数据漂移无人发现

## 参考材料（main 上可自取）
- K3 咨询: docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md §4.1（验收/工时 2-3 天）
- 问题代码: src/sentinel/runner.ts（findings 内存 records）+ src/agent/sentinel-service.ts:97（durationMs bug）
- K3 08-14 全链路审计: docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md（findings 持久化分裂）

## 产出物
- SYNOVA-IMPL-DSH-D394-sentinel-events-20260816.md（仅片 1；片 2/片 3 不做）

## 验收锚点（K3 定义）
- `npm run dev` 启动 → 触发哨兵 → kill -9 → 重启 → `GET /api/sentinel/findings` 输出与 kill 前一致
- 事件表 `seq` 单调无洞（SQL 可验）

## 边界
- 只做片 1（哨兵 findings），不做诊断会话事件化（片 2 部署后）
- 与 D355-D360 无冲突（不同表不同代码路径）
