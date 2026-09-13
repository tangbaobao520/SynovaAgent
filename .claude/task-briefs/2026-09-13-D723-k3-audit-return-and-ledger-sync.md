# Task Brief: D723 k3-audit-return-and-ledger-sync

> 生成: 2026-09-13 | 任务: D723 | 认领: 主 CTO（synova-cto）
> 参考: K3 D715 审计报告 docs/synova/audit-reports/2026-09-13-D715.md（§五 新缺陷 + §十 结论）

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
审计回流与台账维护（非五层）。K3 D715 审计回报四项 P1，其中 **P1-2 是 CTO 自己的文档失实**
（派单文档称「D712 双侧重验证据(#510/#511)」而 #511 未合并）；另 K3 点名要求 CTO 更新过期的
`K3审计清单-20260822.md`，并要求把 P2-7（M9 未入账）收口。
### b) 文件审计（逐项独立复核，非采信）
- 派单文档:5 原文含「#510/#511」→ 实测 #511 `state=open`、main 上 `D712-win-20260913/` 目录数 0 → **失实成立**
- `AUDIT-FINDINGS-LEDGER.md` §二 M 表止于 M8（grep -c "| M9 |" = 0）→ 补录成立
- `K3审计清单-20260822.md` 末次更新 2026-08-29，不含 D715 批 → 过期成立
- K3 P1-1/P1-3/P1-4 已由 CTO 独立复核（merge-tree 4 冲突 / calc-progress:83+sorted(:213)max / main.cjs 有码无证）
### c) 决策
订正失实表述（不删痕，写明订正与依据）；补 M9；更新台账并排下批派审；P1×3 登记 backlog（P1-2 属本单自身订正，不另立条目）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 0/0-2：协作对齐前置——派单的「前置已完成」是执行方读到的**唯一事实源**，写错即误导（Win 侧曾因类似 G0 读不到文档而空转）
- 铁律 47 同构：声称必须由物理证据支撑（此处「双侧齐」应为 `main 上目录存在`，不是「分支已推」）
- 历史教训：D712 派单未先入 main → 执行方在净仓库态读不到（G0）；本次是反向同型（声称已合实际未合）
### 参考：铁律 0/47 + D712 G0 教训 → 前置声明必须由 main 物理状态证明，失实即订正并留依据

## Q2: 范围 — 正确的最简方案
做什么：
- docs/synova/coordination/派单-下一批四线并行-20260913.md — 订正:5 前置声明（写明失实 + 原因 + 依据）
- .claude/task-briefs/2026-09-13-D715-k3-audit-ctl-slice-and-line1.md — 材料清单标注 Win 证据不在 main、须从分支读证
- docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md — 补 M9 行（记录 D708 自称 + K3 2026-09-13 确认，不新造模式）
- docs/synova/coordination/K3审计清单-20260822.md — 新增 2026-09-13 一节（本批 verdict + 下批派审 + 阻塞项）
- docs/synova/coordination/board-backlog.json — 登记 K3 P1-1/P1-3/P1-4 三条
- .claude/task-briefs/2026-09-13-D723-k3-audit-return-and-ledger-sync.md、task-state/D723.json — 本单
不做什么：
- 不改 scripts/audit/ 任何文件、不写审计标准、不改 K3 报告本体（审计结论只认 K3）
- 不修 K3 P1-1/P1-3/P1-4 的实现（登记后另行派单，避免与执行方撞车）
- 不改 tests/control-tower/ 下既有测试（本单非代码变更）

## Q3: 验收 — 入口 → 交互 → 结果
入口：创始人/K3 读派单文档与台账
处理：订正失实 + 补账 + 排下批派审
结果：派单前置声明与 main 物理状态一致；台账 M9 可检索；K3 下批有明确清单

## 架构层: 基础设施（审计回流与台账维护，非五层）
变更面限 docs/synova/coordination/ 三份台账/派单文档 + 一份 brief + board-backlog 登记

## Done 标准:
- [ ] 失实已订正且留依据：grep -c 失实 docs/synova/coordination/派单-下一批四线并行-20260913.md → ≥1
- [ ] M9 可检索：grep -c '| M9 |' docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md → 1
- [ ] K3 台账含本批与下批：grep -c '2026-09-13 更新' docs/synova/coordination/K3审计清单-20260822.md → 1
- [ ] 三条 P1 已登记：python3 -c "import json;b=json.load(open('docs/synova/coordination/board-backlog.json'))['backlog'];print(len([e for e in b if e['id'] in ('PLAN-evidence-writer-cross-host-collision','PLAN-calc-progress-machine-tiebreak','PLAN-d714-evidence-not-in-git')]))" → 3
