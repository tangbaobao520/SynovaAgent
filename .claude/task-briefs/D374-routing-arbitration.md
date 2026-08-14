# Task Brief: D374 路由表仲裁落账（控制塔→Win + GS 依赖标注）

> 生成: 2026-08-16 | 分支: main | 角色: DeepSeek Harness (Mac)
> 背景: 创始人仲裁（08-16）：① 控制塔归属 Win（D366 门禁修复在途）；② GS-02/03/04 脚本等 Win
>       D366/D355-D357 修复合并后再写，Harness 先开工 D361 GSS 基建（纯认领区）。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
协作宪法落账（docs/synova/coordination/，Harness 领地）。物理事实（已核对）：
Win 活跃分支 feat/win-d366-gate-today-fix 改 pre-commit-check.sh/verify-parallel.sh/hooks；
TASK-ROUTING 上控制塔仍标"进行中·DeepSeek Harness"（过期标注）→ 漂移，需落账。

### b) 文件审计
仅改 docs/synova/coordination/TASK-ROUTING.md 的认领表三行（控制塔/src/golden-scenarios 备注）。

### c) 决策
参考：D336 协议（防撞车）+ 第一性原理（状态表 = 单一真相，仲裁结果必须落成物理记录）。
无分歧——直接落账创始人仲裁结论。

## Q1: 调研 — 决策链 + 执行约束
依据铁律 0-5（多 Agent 协作协议）。无代码实现，文档变更。

## Q2: 范围 — 正确的最简方案

做什么：
- docs/synova/coordination/TASK-ROUTING.md
- .claude/task-briefs/D374-routing-arbitration.md

不做什么：
- 不改 scripts/control-tower/pre-commit-check.sh（已归 Win）
- 不改 scripts/golden-scenarios/common/（D361 独立任务单独提交）
- 不改 scripts/audit/audit-check.py（K3 红线）

## Q3: 验收 — 入口 → 交互 → 结果
入口: 无（纯文档）。处理: 无。结果: 路由表三行与创始人仲裁一致，可被 K3 核对。

## 架构层: 基础设施
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: 无（文档任务）
- [ ] 链路走通: grep -n "归 Win" docs/synova/coordination/TASK-ROUTING.md 命中控制塔行
- [ ] 结果可见: grep -n "创始人仲裁 08-16" 命中 GS 行
- [ ] 门禁: bash scripts/pre-commit-check.sh 13 组全绿
