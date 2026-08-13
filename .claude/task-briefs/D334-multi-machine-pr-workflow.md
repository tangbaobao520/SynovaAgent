# Task Brief: D334: 多机 PR 工作流 — 门禁 0 同步检查 + main 保护 + 协作规范落地

> 生成: 2026-08-14 | 分支: feat/multi-machine-pr-workflow | as any: 0
> #CRITERIA: A

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

**本任务层级**: 基础设施（控制塔）— 非 L1-L5 业务代码，是五层之外的工程治理层。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
2026-08-11~13 事故：创始人两台机器（Mac/Win）的 AI Agent 在同一分支 `feat/prompt-architecture`
上交替 push。Mac 机 4 天未全量 fetch，tracking ref 过期导致 `git status` 误报 "ahead 10"，
实际落后远端 11 个 commit。双机互不知情，险些互相覆盖对方成果。
创始人定案（2026-08-14）：采用业界标准 PR 工作流（方案 A，DeepSeek/OpenAI 同款）——
main 是唯一真相、一人一事一分支、合并走 PR。
本任务把该决策落地为：协作规范文档 + agent skill + 物理门禁（免疫细胞）。

### b) 文件审计
- `scripts/pre-push-check.sh` — 现有 7 道门禁（secrets/golden-case/vitest 改基/中间态/并行/基线/tag/bypass 对账）。门禁 3 硬编码 `origin/feat/prompt-architecture`，PR 工作流下失效。→ 扩展 + 修复。
- `scripts/install-hooks.sh` — D318 双机 hook 安装器。pre-push entry 不传 remote 参数。→ 扩展。
- `docs/synova/coordination/` — 已有 DECISION-REFERENCE.md（D333 注册）。→ 新增协作规范文档。
- `.claude/skills/` — 已有 brief-compose/claim-verifier/windows-compat。→ 新增 git-sync-pr。
- `tests/control-tower/` — 已有 tag-bypass-wiring.test.sh 等 bash 测试风格。→ 新增 push-sync-guard.test.sh。
- 冲突检查：无。全部为新增或独立扩展，不与其他模块重叠。

### c) 决策
无冲突。参考：Anthropic/DeepSeek/第一性原理 → 结论：PR 工作流 + 物理门禁（防呆靠 bash 不靠 agent 自律，
对齐铁律 35 自动化优先 + V3.9 教训"硬阻断 100% 有效，软机制 0% 有效"）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

### a) 业界最佳实践
DeepSeek 开源仓库（DeepSeek-V3/R1）与所有专业团队采用 GitHub Flow：main 稳定、
feature branch、PR + CI + review 后合并。核心：两台机器永不在同一分支直接 push。

### b) memory/ 历史教训
- `memory/bash32-compat.md` — Mac bash 3.2 兼容（本任务测试脚本避免 mapfile）
- V3.9 教训：硬阻断 100% 有效，软机制 0% 有效 → 门禁用 pre-push 硬阻断，不做"提醒"
- 铁律 0-3 禁 stash、铁律 11 静默降级禁止、铁律 48 测试非空壳（正常/降级/边界）
- D311 多会话协调是单机维度；本任务补双机维度（D328/D329 防并行劫持的姊妹防线）

### c) 决策参考系
参考：Anthropic/DeepSeek/第一性原理 + 结论：PR 工作流 + push 前强制 fetch 硬阻断 + main 分支保护。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/pre-push-check.sh — 新增门禁 0 多机同步检查（push 前 fetch 目标分支：落后/分叉硬阻断；main 直推硬阻断 + SYNO_ALLOW_MAIN_PUSH 逃生舱）；门禁 3 改基修复为动态 $PUSH_REMOTE/$PUSH_BRANCH
- scripts/install-hooks.sh — pre-push entry 传 "$1" "$2"（remote 名/url）
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md — 协作规范（创始人版+agent 版）
- .claude/skills/git-sync-pr/SKILL.md — Claude Code skill（开工 5 步/收工 5 步/冲突处理）
- tests/control-tower/push-sync-guard.test.sh — 9 用例（正常/降级/边界/接线）
- .codex/control-tower/VERSION.md — bump V4.7.6（PATCH：门禁行为变化）
- CLAUDE.md — 铁律区新增多机 PR 工作流条目 + 版本号同步 V4.7.6

不做什么：
- 不改 src/ 任何业务代码（本任务是控制塔基础设施）
- 不改 .github/workflows/ci.yml（CI 的 Architecture Check 红灯与 npm audit 红灯是存量问题，独立任务）
- 不改 scripts/control-tower/synova-commit（D319 tag 机制不动）
- 不做 GitHub branch protection 的 API 自动化（无 token；网页手工设置写进创始人指南）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：任何机器执行 `git push ssh <branch>`（pre-push hook 自动触发）
处理（中间步骤）：hook 调用 pre-push-check.sh → 门禁 0 先 fetch 目标分支 → 落后/分叉/main 直推 → 硬阻断并输出修复提示
结果（最终展示）：阻断时 agent 看到明确原因和修复命令；放行时看到 "✅ 门禁 0-1: 与远端同步"

## 架构层: 基础设施
控制塔/工程治理（五层之外，服务 L1-L5 的协作与门禁）

## Done 标准:
- [x] verify: `bash tests/control-tower/push-sync-guard.test.sh` 返回 exit 0（13 用例全过）
- [x] verify: `bash -n scripts/pre-push-check.sh && bash -n scripts/install-hooks.sh` 返回 exit 0
- [x] verify: `grep -c "check_push_sync" scripts/pre-push-check.sh` 输出 ≥ 3（函数定义 + 注入 + 主流程接线）
- [x] verify: `grep -c "MULTI-MACHINE-PR-WORKFLOW" CLAUDE.md` 输出 ≥ 1（铁律引用）
