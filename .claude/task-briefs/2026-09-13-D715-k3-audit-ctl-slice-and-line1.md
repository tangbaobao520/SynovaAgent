# Task Brief: D715 k3-audit-ctl-slice-and-line1

> 生成: 2026-09-13 | 任务: D715 | 认领: 🔍 K3 审计（synova-k3-audit）
> 参考: 派单文档 docs/synova/coordination/派单-下一批四线并行-20260913.md §D715
> 说明: 本 brief 由 CTO 起草「范围/材料/写集/红线」四节；**审计方法、判据、结论一律由 K3 自主决定**（CTO 不写审计标准，红线）

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
独立审计批（非五层）。当前瓶颈：`product-progress` 显示 35 个点卡 `pending_k3`——机器证据按状态机只能到 `pending_k3`，
转 `verified` 必须经 K3 裁决或创始人演示，审计是体系吞吐瓶颈。本单清两个切片。
### b) 文件审计（材料清单，已实测存在）
- 切片 1 控制塔收口：`task-state/D706.json` / `D707.json` / `D664.json` / `D708.json`；对应 PR #501/#502/#504/#505 与 main 上 squash 提交
- 切片 2 线 1 证据：`docs/synova/product-lines/evidence/D712-mac-20260913/`（9 文件）+ `D712-win-20260913/` + `scenario-2026-09-13*.json`（5 条）
- 状态机参考：`scripts/product-lines/calc-progress.py`（机器证据封顶 `pending_k3`；`k3_only` 点需 K3 pass）
### c) 决策
只读审计 + 出报告；不改被审对象（否则失独立性）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 派单 SOP（cto-handover §〇b）：写前核实 6 项 → 交付前物理复核 5 项
- 历史教训：D316 codex dev doc「实测」2 处不实 + 1 遗漏；D603 铁律 40/41/44 无自动执法被拉平 —— 声明必须能被物理复现
- 本项目审计惯例：结论须带 `file:line`，判定须贴可复现命令
### 参考：K3 独立审计协议（K3 自持）+ 派单范围 → 方法论由 K3 定，CTO 只给材料与边界

## Q2: 范围 — 正确的最简方案
做什么：
- 审计切片 1：D706 提交链（索引精确提交/提交树不变量/失败回滚）、D707 brief 单解析器收敛、D664 grep -P 家族清零、D708 合并级写集 gate（T3 实证 + fail-closed 三态）
- 审计切片 2：线 1 各点是否真为实测；Win 侧 1-2/1-4/1-6 三个 failed 的「环境阻塞 vs 产品缺陷」判定是否成立；D714 修复后 1-4 能否重判
- 输出：`docs/synova/audit-reports/**`、`task-state/D*.json` 的 audit 段、`docs/synova/coordination/AUDIT-FINDINGS-LEDGER*.md`
不做什么：
- 不改 `scripts/audit/audit-rules.sh`（审计域自持，CTO 亦不得代笔）
- 不改 `scripts/control-tower/`、`scripts/workflow/`、`scripts/pre-commit-check.sh`（被审对象，改了就失独立性）
- 不改 `src/**`、`electron/**`（产品代码非本单范围）
- 不替创始人下业务结论（产品方向归创始人）

## Q3: 验收 — 入口 → 交互 → 结果
入口：创始人复制派单说明给 🔍 K3 审计 session
处理：物理复现被审对象 + 逐点裁决
结果：审计报告（含 file:line + 复现命令）+ 线 1 各点应有状态结论 + 新发现缺陷

## 架构层: 基础设施（独立审计，非五层）
本单不改代码；被审对象跨 scripts/（切片 1）与 electron/ 证据链（切片 2）

## Done 标准:
- [ ] 审计报告落盘且被 git 跟踪：`ls docs/synova/audit-reports/ | grep -q . ` → 有输出
- [ ] 报告含物理定位：`grep -cE ':[0-9]+' docs/synova/audit-reports/*.md` → ≥1（file:line 证据）
- [ ] 四个控制塔切片各有明确结论（verified/failed）：`for d in D706 D707 D664 D708; do python3 -c "import json;d=json.load(open('task-state/$d.json'));assert d.get('audit') is not None,'$d 无 audit 段'"; done` → 零断言失败
