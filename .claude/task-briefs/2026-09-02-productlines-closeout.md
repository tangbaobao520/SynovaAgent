# 产品线 17 点批收尾：台账 + FIX 立项（21-2/15-1/18-5）+ L4-1

> 派单: CTO 自办 | 2026-09-02 | 类型: 协调文档
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
K3 产品线 17 点批回流（#327 b300617c）：🟢×5/🟡×11/🔴×1。收尾 = 台账登记 + 三项 FIX 立项 + L4-1 建议入 CT。

### b) 文件审计
- 审计发现台账（登记）
- K3 审计清单（翻转 + FIX 入列）

### c) 决策
纯协调文档。

## Q1: 调研
审计闭环铁律 D382（审计出问题 → 另起 FIX）。

## Q2: 范围
做什么：
- 修改 docs/synova/coordination/审计发现台账-DSH-CTO.md：批回流登记 + FIX 立项（D566 提示词优化 / D567 专家枚举残留 ×4 / D568 superseded_by 语义）+ CT-52（suite-registry）
- 修改 docs/synova/coordination/K3审计清单-20260822.md：FIX 入列 + 17 点批闭环标注
- 修改 .claude/task-briefs/2026-09-02-productlines-closeout.md：本 brief

不做什么：
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线

## Q3: 验收
入口：两文档在 main
结果：三个 FIX 可派 + 17 点批闭环

## 架构层:

L0 控制塔（协调文档）

## Done 标准
- [x] 台账登记 verify: grep -c "产品线 17 点批回流" docs/synova/coordination/审计发现台账-DSH-CTO.md | xargs test 1 -ge
- [x] FIX 立项 verify: grep -cE "D566|D567|D568" docs/synova/coordination/审计发现台账-DSH-CTO.md | xargs test 3 -ge
