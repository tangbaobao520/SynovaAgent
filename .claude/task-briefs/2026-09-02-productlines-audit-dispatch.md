# 产品线 17 点批量审计派单（CTO 派单）

> 派单: CTO | 2026-09-02 | 类型: 协调文档（K3 派单）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
K3 审计线。产品完成度 156 点中 17 点 🟡「待审计员确认/待重跑」——实现声称存在但从未独立复核。批量派审后产品线 🟢 可达 32/156。

### b) 文件审计
- docs/synova/product-lines/product-progress.html（17 点明细 + 证据指针）
- 对应子系统代码（专家/插件/企业事实层/providers/循环/cron）

### c) 决策
分组批量审计（同子系统归组），K3 独立工作区。

## Q1: 调研
K3 impl-done 批先例（分组 + 命令断言 + 独立复现）；审计红线（不改审计脚本）。

## Q2: 范围
做什么：
- docs/synova/coordination/审计派单-20260902-产品线17点.md：批量审计派单
- 修改 docs/synova/coordination/K3审计清单-20260822.md：产品线 17 点批入列
- 修改 .claude/task-briefs/2026-09-02-productlines-audit-dispatch.md：本 brief

不做什么：
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线
- 不改产品代码：审计派单仅协调

## Q3: 验收
入口：派单文档在 main
结果：K3 可领取

## 架构层:

L0 控制塔（协调文档）

## Done 标准
- [x] 派单文档存在 verify: test -f "docs/synova/coordination/审计派单-20260902-产品线17点.md"
- [x] 清单入列 verify: grep -c "产品线 17 点批" docs/synova/coordination/K3审计清单-20260822.md | xargs test 1 -ge
