# Task Brief: D339: Mac 中文文件名门禁修复 — core.quotepath=false 三处接线

> 生成: 2026-08-14 | 分支: feat/d338-l4-contract-design | as any: 0
> #CRITERIA: A

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

**本任务层级**: 基础设施（控制塔）— 非 L1-L5 业务代码。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
D338 提交中文文件名 dev doc 时暴露控制塔盲区：git 默认把非 ASCII 文件名转义为
`\346\...` 带引号输出，导致三处消费者拿转义路径 → 认领判定/路径匹配全部落空 →
误报"并行劫持"阻断提交。修复：三处 STAGED_LIST/pathspec 生成统一加
`-c core.quotepath=false`。

### b) 文件审计
- `scripts/control-tower/synova-commit` — 2 处（staging-guard 的 STAGED_LIST + git commit pathspec）
- `scripts/commit-msg-check.sh` — 1 处（D328 认领判定的 STAGED_LIST）
- 冲突检查：synova-commit 被 D311 brief 历史认领——本任务 brief 显式认领（Q2 include），
  按 resolver 规则 1（current-brief 优先）覆盖历史认领。

### c) 决策
无冲突。参考：Anthropic/DeepSeek/第一性原理 + 结论：修复三处 quotepath 接线，一次性根治。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

### a) 业界最佳实践
git 处理非 ASCII 路径的标准做法：脚本消费文件名清单时统一 `-c core.quotepath=false`，
或全局配置 `git config core.quotepath false`（本任务选前者——局部显式，不碰全局配置）。

### b) memory/ 历史教训
- memory/bash32-compat.md 同族：Mac 环境差异（BSD grep 无 -P、bash 3.2）→ 本次是 git quotepath 差异
- D321 教训：修一处 bug 要 grep 全仓库同类（三处 STAGED_LIST 全部排查）
- 铁律 35 自动化优先：三处都是"git diff --cached --name-only"消费方，全部加 quotepath=false

### c) 决策参考系
参考：Anthropic/DeepSeek/第一性原理 + 结论：三处 quotepath=false 显式接线。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/synova-commit — STAGED_LIST 与 git commit pathspec 加 -c core.quotepath=false
- scripts/commit-msg-check.sh — STAGED_LIST 加 -c core.quotepath=false

不做什么：
- 不改 src/ 任何业务代码（本任务是控制塔）
- 不改 scripts/audit/ 审计脚本（铁律 0-5 红线）
- 不改全局 git config（只改仓库内脚本，不碰用户机器全局配置）
- 不改 docs/plans/codex/strategy/SYNOVA-DESIGN-L4数据契约收敛-20260814.md（D338 已提交）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：任何含中文文件名的提交（synova-commit / commit-msg hook 自动触发）
处理（中间步骤）：STAGED_LIST/pathspec 以真实 UTF-8 文件名生成 → 认领判定正确命中
结果（最终展示）：中文文件名提交不再误报"并行劫持"；D338 已实证（abf62f61 提交成功）

## 架构层: 基础设施
控制塔/工程治理（五层之外，服务提交门禁链）

## Done 标准:
- [x] verify: `grep -c "core.quotepath=false" scripts/control-tower/synova-commit` 输出 ≥ 2（两处接线）
- [x] verify: `grep -c "core.quotepath=false" scripts/commit-msg-check.sh` 输出 ≥ 1（一处接线）
- [x] verify: `bash -n scripts/control-tower/synova-commit && bash -n scripts/commit-msg-check.sh` 返回 exit 0
- [x] verify: 本任务含中文文件名的 brief（D339）经 synova-commit 提交成功（实证）
