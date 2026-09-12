#CRITERIA: A

# Task Brief: D664 pre-commit-check-grep-p-self-clean

> 生成: 2026-09-10 | 任务: D664 | 认领: 🧭 并行 CTO session（synova-cto 预设）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 上游: D661（PR #481，已修 workflow+control-tower 两目录 20 处）——本任务清剩余家族
> 派单: docs/synova/coordination/派单-并行CTO-控制塔收口批次-20260911.md §D664

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔门禁脚本跨平台兼容（非五层）。BSD grep（macOS）无 `-P`，含 `grep -P/-oP` 的门禁脚本
在 macOS 上静默失效或报错。D661 已清 workflow/ + control-tower/ 两目录；本任务清剩余家族。

### b) 文件审计
基线（本单实测修正，以此为准）：`git grep -nE "grep +-[a-zA-Z]*P" -- scripts/` = **10 文件 28 处**
= pre-commit-check.sh 8 / check-brief-vs-code.sh 8 / pre-doc-audit.sh 3（旧 brief 漏算）/
check-file-driven.sh 3 / check-integrity-startup.sh 1 / check-tech-debt.sh 1 / checker-review.sh 1 /
checks/check-test-quality.sh 1 / hooks/hook-check-memory.sh 1 / hooks/post-commit.sh 1（注释）+
control-tower/PLATFORM-CHECKLIST.md 2（文档，不改）。
**实际转换 27 处**（post-commit.sh 那处是描述该问题的注释、不执行；pre-commit-check.sh:1374 是
检测器自身的模式字面量）。
回归网现状（旧版是纸老虎）: `tests/control-tower/grep-oP-regression.test.sh` 只扫 2 个目录，
且**不在 ci.yml 密封清单** → 从未在 CI 跑过（M3 机制建成未接线）。

### c) 决策
复用 D661 范式（`-oP` → `-oE` + 逐处转译 + 回归网），不新造机制。三处 `\K` 无 ERE 等价物 →
`grep -oE` 取全匹配 + `sed -E` 剥前缀（语义等价）。回归网扩容到 scripts/ 全目录 + 语义金值断言。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- memory 教训：M5 环境依赖门禁（本机绿 ≠ 全平台绿）；V3.9（静默失效的门禁 = 没有门禁）；
  ctrl-tower-change 模式 2（BSD 与 GNU 工具差异：`\+`、`-P` 同型）。
- 业界实证：POSIX ERE 无 `\d`/`\b`/`\s`/`\S`/`\K`（GNU grep 手册明示 `-P` 为实验特性）。
- 参考：第一性原理（门禁脚本必须在自己执法的所有平台上可运行）+ D661 实证复用
  → 结论：`-oE` 逐处替换 + 转译对照表 + 语义等价金值断言 + 回归网接入 CI。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh — 6 处转译（+ 检测器行加 `grep-P-scan-ok` 哨兵）
- scripts/check-brief-vs-code.sh — 8 处转译
- scripts/pre-doc-audit.sh — 3 处转译
- scripts/check-file-driven.sh — 3 处转译
- scripts/check-integrity-startup.sh — 1 处转译（+ 既有 `2>/dev/null` 补 `swallow-ok` 豁免）
- scripts/check-tech-debt.sh — 1 处转译
- scripts/checker-review.sh — 1 处转译
- scripts/checks/check-test-quality.sh — 1 处转译
- scripts/hooks/hook-check-memory.sh — 1 处转译
- tests/control-tower/grep-oP-regression.test.sh — 扩容（scripts/ 全目录 + 语义金值 + 反向哨兵）
- .github/workflows/ci.yml — 密封清单**末尾新增 1 行**（回归网入 CI；与 D703/D704 预期一次 merge 冲突，union 解）
- memory/notes/implemented/2026-09-12-D664-grep-p-family-cleanup.md — 四态 Note（铁律 49）
- .claude/task-briefs/2026-09-10-D664-pre-commit-check-grep-p-self-clean.md — 本 brief
不做什么：
- 不改 scripts/hooks/post-commit.sh（该行是描述此问题的注释，不执行）
- 不改 scripts/control-tower/PLATFORM-CHECKLIST.md（文档，记录现象）
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 src/server.ts（产品代码属编码/Win 线）
- 不改 scripts/ci/branch-coverage-gate.sh（Win 线 D704 在写）
- 不改 vitest.config.ts（Win 线 D704 在写）

## Q3: 验收 — 入口 → 交互 → 结果
入口：PR CI（Control Tower Gate Tests ubuntu+windows 双跑）+ macOS 本机 `bash scripts/pre-commit-check.sh`
处理：27 处 `-P` → `-E` 逐处转译（`\d`/`\s`/`\S`/`\K` 分类转译）+ 回归网扩容并接入 CI
结果：`git grep -E "grep -[a-z]*P" -- scripts/` 仅剩注释与检测器哨兵；双平台 CI 绿；13 组门禁过

## 架构层: scripts（控制塔域，非 L1-L5 产品架构）

## Done 标准
- [x] verify: git grep -nE "grep +-[a-zA-Z]*P" -- scripts/ 排除注释与哨兵后零真实调用
- [x] verify: bash tests/control-tower/grep-oP-regression.test.sh → exit 0（33 断言）
- [x] verify: 反向验证——塞回一处 -oP → 回归网必红（哨兵断言）
- [x] verify: macOS 本机 bash scripts/pre-commit-check.sh → rc=0（13 组）
- [x] verify: CI Control Tower Gate Tests（ubuntu/windows）conclusion=success
