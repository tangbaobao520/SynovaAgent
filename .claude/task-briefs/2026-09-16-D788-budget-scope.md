# Task Brief: D788 预算门禁口径修正（只计审查面）——派单

> 生成: 2026-09-16 | 分支: docs/d788-budget-scope | as any: 0
> 域: mac（协调文档 + task-state；单域）
> 主线贡献: infra:管道吞吐（解锁审计/治理批次落地）
> 触发: K3 批次四 51 文件被预算门禁拦（实测）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔：D734「PR 预算门禁」的口径修正。它自述保护对象是**审查面**（冲突概率 ∝ 改动大小），但当前实现按**总文件数**计 → 审计/治理批次（append-only 产物）被一律拦死。

### b) 文件审计（实测）
- `check-pr-budget.sh --files "<K3 批次四 51 文件>"` → ① 51 > 12 拦；② k3（audit-reports） vs mac（coordination）跨域拦
- 同族摩擦三例：`.claude/bypass.log` 自动登记也计 1 件（实际额度 11）；#536（批次三派单 24 文件）卡死至今；本次 51 文件
- 现有测试：`tests/control-tower/check-pr-budget.test.sh`（24 项）——本单在其上加 4 用例

### c) 决策
只改「什么算审查面」，**不放宽上限 12**、不做单次落地特例；口径变化必须显性打印（铁律 11）；门禁变更交 K3 审。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = 审查面计数准确 + 治理产物不计入且不参与域判定 + 输出显性 + 上限不变。
② 测试先行：4 个新用例（含反向验证"把 src/ 移出列表 → 上限用例变绿"）。
③ 实现 = 派单（执行方改 `check-pr-budget.sh` + 测试）。
④ 接线 = 门禁已在 pre-commit/CI 调用（既有链路）。
⑤ 验证 = 对 PR #572 的 51 文件跑 → PASS（本单目的）。

引用依据：铁律 35（能变 check 的不靠 review）· 铁律 11（口径变化不许静默）· M3（机制建成未接线）· D734 自述口径（保护审查面）

### b) 本任务执行约束
- rule: "上限未变" verify: "grep -n 'MAX_FILES=12' scripts/control-tower/check-pr-budget.sh → 命中"
- rule: "派单可过复核" verify: "bash scripts/control-tower/pre-dispatch-check.sh <派单文档> → 机械项全通过"

### c) 决策参考系
参考：第一性原理（门禁应拦"会冲突的改动"，而非"文件多"）+ Anthropic 基线（口径变化必须可测可见）→ 只改口径。

### d) 相关 Note 引用
无（本单只派；执行方需按 D534 写 Note）。

## Q2: 范围 — 正确的最简方案

做什么：
- docs/synova/coordination/派单-D788-预算门禁口径修正-20260916.md — 派单
- task-state/D788.json — 本派单台账

不做什么：
- 不改 scripts/control-tower/check-pr-budget.sh（执行方改）
- 不改 scripts/pre-commit-check.sh（接线不变）
- 不改上限（12 不变）
- 不改 scripts/audit/**（K3 红线）

## Q3: 验收 — 入口 → 交互 → 结果

入口：任何 PR 的预算门禁
处理：只统计审查面 → 治理产物显性列出不计入
结果：审计/治理批次可落地；代码 PR 上限不变；口径可见

## 架构层: scripts（治理层：协调文档 + task-state）；不触 L1-L5
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: verify: **在与 origin/main 同步的 worktree 中**跑 `bash scripts/control-tower/pre-dispatch-check.sh docs/synova/coordination/派单-D788-预算门禁口径修正-20260916.md` → 末行「✅ 机械项全通过」（工作树滞后会假红——F5）
- [ ] 链路走通: verify: `grep -c "只计审查面\|审查面路径" docs/synova/coordination/派单-D788-预算门禁口径修正-20260916.md` → ≥2
- [ ] 结果可见: verify: `grep -c "51" docs/synova/coordination/派单-D788-预算门禁口径修正-20260916.md` → ≥1（实测值具名）
- [ ] 红线未越: verify: `git -c core.quotepath=false diff --name-only origin/main...HEAD | grep -c "scripts/audit/"` → 0

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| .claude/bypass.log | builtin（hook 运行期产物，自动豁免） |
| .claude/task-briefs/2026-09-16-D788-budget-scope.md | task |
| docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md | task |
| docs/synova/coordination/批六-待派-20260916.md | task |
| docs/synova/coordination/派单-D788-预算门禁口径修正-20260916.md | task |
| task-state/D788.json | task |

