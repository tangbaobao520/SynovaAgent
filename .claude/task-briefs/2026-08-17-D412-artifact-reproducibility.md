# Task Brief: D412 生成器产物可复现校验（U3 — phantom 假数据根治）

> 生成: 2026-08-17 | 分支: feat/u3-artifact-reproducibility | as any: 0

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属控制塔/工程基建（DSH 领地），对象 `scripts/control-tower/gen-cto-health.py`（CTO 健康仪表盘第③面生成器）。不改产品代码（src/ L1-L5）。是"创始人零信任控制台"（FOUNDER-CONSOLE 设计）的 L1 物理事实层地基。

### b) 文件审计
grep 实证：`gen-cto-health.py:225-228` `has_spec` 与 `:231` audit 判定只做工作区 `.exists()`/glob，**不做 git 仓库态校验**；`:186` `git log` 是唯一 git 调用；`has_impl`(:229) 用 git log 可信，spec/audit 用工作区文件不可信。phantom 实证：D399/D394 审计两次发现"仪表盘显示 spec_done ✅ 但 main 树无此文件"。

### c) 决策
已有 `git ls-files`/`git cat-file` 物理原语 → 复用（新增 `_head_tracked_files()` 一次性取 HEAD 已提交文件集，进程内匹配，不逐文件起子进程——延续 D393 性能哲学）。无冲突。

## Q1: 调研 — 业界最佳实践 / 决策链 / memory 教训

- 铁律 35（自动化优先——能机器校验不靠 review）；铁律 24/31（catch 带 log + degraded 标记）。
- M2（声称 vs 事实）/ M1（fail-open）模式：phantom = 工作区存在冒充已交付。
- 决策参考：第一性原理（仪表盘数据源必须可复现 = 已提交 git）+ Anthropic（fail-closed + 机器可验契约）。
- K3 D399/D394 审计发现：生成器对未提交/未合并源无告警是 phantom 复发根因。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/gen-cto-health.py
- tests/control-tower/gen-cto-health-repro.test.sh
- task-state/D412.json
- .claude/task-briefs/2026-08-17-D412-artifact-reproducibility.md

不做什么（含文件路径）：
- 不改 `generate-dashboard.py` / `gen-task-board.py`（同款 phantom，留后续任务，避免一次改太大）
- 不改 `src/`（产品代码，越界）
- 不改渲染 HTML 结构（只改"是否渲染为 ✅"的判定 + degraded 标记）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`bash scripts/control-tower/gen-cto-health.py`（刷新 CTO 健康仪表盘）
处理：生成时对每个 spec/audit 源文件做 `git ls-tree -r HEAD` 仓库态校验；工作区有但未提交 → 标 degraded 而非 ✅
结果：CTO-HEALTH.md 中 phantom 条目显示 "⚠ degraded: 源未入库" 而非 ✅；`--strict` 模式 phantom → exit 1

## 架构层: 控制塔/工程基建（非 L1-L5 产品层）
#CRITERIA: A

## Done 标准
- [ ] 制造 phantom：新建一个未提交的 dev doc 引用进 task-state → 生成 CTO-HEALTH 该条目显示 degraded 而非 ✅（物理复现）
- [ ] `bash tests/control-tower/gen-cto-health-repro.test.sh` 全绿（正常/降级/边界三路径）
- [ ] git 不可用 → exit 2 degraded（不静默）
- [ ] `grep -n "_head_tracked_files\|ls-tree" gen-cto-health.py` 命中真实调用
