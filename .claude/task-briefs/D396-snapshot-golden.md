# Task Brief: D396: snapshot 黄金用例回归门禁（派活登记）

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D396) | 认领: 📋 synova-devdoc（spec）
> 来源: K3 战略咨询 §4.3（提前 P0 同批）——以咨询为准

## 任务定义
把 D355-D360 修复的「一次性场景转绿」固化为「每次 push 重跑的门禁」：扩展 scripts/ci/golden-case-checker.ts（从 1 条用例 → N 条），每个 D355-D360 修复同 PR 带一条黄金用例（该修复断裂场景的最小数据副本）。

## 参考材料（main 上可自取）
- K3 咨询: docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md §4.3（神/形似神不似/验收）
- 现有门禁: scripts/ci/golden-case-checker.ts（D300 pre-push）
- 场景验收计划: docs/synova/coordination/FOUNDER-OPERATING-MODE.md（Phase 1 GS-02~05）
- 修复对象: D355-D360（台账/仪表盘）

## 产出物
- SYNOVA-IMPL-DSH-D396-golden-case-gate-20260816.md

## 验收锚点（K3 定义）
- 故意改坏一个 compute 阈值 → golden 门禁红 → 修复 → 绿（红-绿演练必须跑一次）
- 快照分层：compute 全 diff / findings 全 diff / 专家报告结构化断言

## 注意（K3）
- 扩用例不碰 src/ 业务逻辑（加测试+CI 数据+扩展 checker）
- golden-case-checker.ts 变更当次需人工确认门禁行为无变化（只扩用例不改判定）
