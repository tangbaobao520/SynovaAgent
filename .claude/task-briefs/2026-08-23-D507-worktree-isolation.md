# Task Brief: D507 并行撞车根治 — session 专属 worktree 物理隔离方案

> 生成: 2026-08-23 | 任务: D507 | 认领: dsh-cto | 触发: D506 第 4 次 M8 复发
> 性质: 治理方案文档（本提交）+ 后续 worktree-manager 实现

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔治理层。M8（共享暂存区竞争）第 4 次复发（D320/D330/D331/D394→D506），PARALLEL-DISCIPLINE 早已认定 D307（session 级 worktree）是物理解法但未落地——CTO 责任。
### b) 文件审计
- docs/synova/coordination/PARALLEL-DISCIPLINE.md — 软纪律（已实证挡不住物理单例互踩）
- docs/plans/codex/implementation/SYNOVA-IMPL-D307-session级worktree隔离-20260812.md — 根治设计已完整（worktree-manager.py 规格），未实现
- 编码 session 实证反馈："D506 的提交一度被打进我的分支"（共享 HEAD 所致）
### c) 决策
方案文档先行（本次提交）：三层防线 = ①session 专属 worktree（D307 落地）②预设注入开工三步 ③synova-commit 物理检测硬阻断（单 session 放行不加摩擦）。止血规则即时生效。

## Q1: 调研
根因：git 的 HEAD/index/工作区文件是进程间共享单例，多 session 共用一个工作区必然互踩（4 次实证）。软纪律只能减害。worktree 是 git 原生物理隔离（独立 index/HEAD），共享 .git/hooks 门禁天然生效，零拷贝零漂移。
决策参考：第一性原理（物理单例必须物理隔离）+ PARALLEL-DISCIPLINE 已有结论 + D307 设计文档已评审过。

## Q2: 范围
做什么：
- docs/synova/coordination/并行撞车根治方案-D507-20260823.md — 三层防线方案（已先行提交 2256581f）
- scripts/control-tower/synova-commit — D507 硬阻断门禁（多活跃 session + 主区 → 拦截并指引 worktree；单人/worktree 内放行；registry 不可读显式降级）
- tests/control-tower/synova-commit.test.sh — 门禁配对测试（U7/CT-40 强制；7 用例：接线/阻断条件/单人放行/降级/JSON 判定语义）
- docs/synova/coordination/PARALLEL-DISCIPLINE.md — D507 落地声明（软纪律降级为补充）
- task-state/D507.json — 登记回填
不做什么：
- 不改 scripts/audit/（K3 红线）
- 不改 scripts/control-tower/worktree-manager.py（Win D307 已在 main 的既有产物，本任务只在其上加门禁；其 attach.py 的 Python 3.10 语法兼容问题另行登记）
- 不改 .github/workflows/ 内任何 yml 文件（CI 无关）

## Q3: 验收 — 入口 → 交互 → 结果
入口: 创始人审批方案
处理: 三层防线（物理隔离+启动强制+门禁兜底）+ 止血规则
结果: 并行 session 物理隔离，M8 不再可能复发；单人时段零摩擦

## 架构层:
治理层（文档+后续 scripts/control-tower），非产品五层

## Done 标准
- [x] verify: 方案文档落库（含根因分析/三层防线/落地计划/止血规则/创始人裁决点）
- [x] verify: 本提交在独立 worktree（synova-wt-D507）完成——立即以身作则
- [x] verify: bash tests/control-tower/synova-commit.test.sh 7/7 全绿
- [x] verify: 主区 check in_worktree=false / worktree 内=true（worktree-manager check 实测）
- [x] verify: 预设注入 grep D507 ~/.dsh/.agent-presets/{synova-dsh,synova-devdoc,synova-k3-audit,synova-cto}/agent.cordis.yml 各命中
