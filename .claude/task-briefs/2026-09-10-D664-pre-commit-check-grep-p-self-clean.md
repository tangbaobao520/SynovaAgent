# Task Brief: D664 pre-commit-check-grep-p-self-clean

> 生成: 2026-09-10 | 任务: D664 | 认领: 待派（编码 session，开工前必须加载 ctrl-tower-change + windows-compat 技能）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 上游: D661（PR #481，已修 workflow+control-tower 两目录 20 处）——本任务清剩余家族

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔门禁脚本跨平台兼容任务（非五层）。BSD grep（macOS）无 -P，含 `grep -P/-oP` 的门禁
脚本在 macOS 上静默失效或报错。D661 已清 scripts/workflow + scripts/control-tower 两目录；
本任务清剩余家族（基线于 2026-09-11 在 main `4d9776de` 实测修正，**以本节为准**）：
10 文件 28 处 = pre-commit-check.sh 8 / check-brief-vs-code.sh 8 / pre-doc-audit.sh 3（前单漏算）/
check-file-driven.sh 3 / check-integrity-startup.sh 1 / check-tech-debt.sh 1 / checker-review.sh 1 /
checks/check-test-quality.sh 1 / hooks/hook-check-memory.sh 1 / hooks/post-commit.sh 1。
### b) 文件审计
- `git grep -nE "grep +-[a-zA-Z]*P" -- scripts/` → 上列 10 文件 28 处（control-tower/PLATFORM-CHECKLIST.md 2 处为文档，不改）
- 前单声明"pre-commit-check.sh 自身 6 处"与实测不符（实为 8 处）——修正见派单文档基线复核表
- D661 先例：改法 = `grep -oP` → `grep -oE`（或 sed），每脚本配对 tests/control-tower/*.test.sh
### c) 决策
复用 D661 模式（-oE 替换 + 回归测试），不新造机制。语义等价性逐处人工核对
（PCRE 与 ERE 差异点：\d \b \s 等需转译为 [0-9] / [[:<:]] / [[:space:]]）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- memory 教训：M5 环境依赖门禁（本机绿≠全平台绿）；D313-D316 Windows 全程踩坑；
  ctrl-tower-change 模式 2（BSD sed 不支持 \+，grep -P 家族同型）；V3.9（静默失效的
  门禁=没有门禁）。
- 业界实证：POSIX ERE 无 \d/\b，跨平台脚本禁用 PCRE 方言（GNU grep 手册明示 -P 为
  实验特性）。
- 参考：第一性原理（门禁脚本必须在自己执法的所有平台上可运行）+ D661 实证复用
  → 结论：-oE 逐处替换 + 转译表 + 每文件回归断言。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh — grep -P 家族清零（实测 8 处，语义逐处核对）
- scripts/check-brief-vs-code.sh — grep -P 家族清零（实测 8 处）
- scripts/pre-doc-audit.sh — grep -P 家族清零（实测 3 处，前单漏算）
- scripts/check-file-driven.sh — grep -P 家族清零（实测 3 处）
- scripts/check-integrity-startup.sh — grep -P 家族清零
- scripts/check-tech-debt.sh — grep -P 家族清零
- scripts/checker-review.sh — grep -P 家族清零
- scripts/checks/check-test-quality.sh — grep -P 家族清零
- scripts/hooks/hook-check-memory.sh — grep -P 家族清零
- scripts/hooks/post-commit.sh — grep -P 家族清零
- tests/control-tower/grep-oP-regression.test.sh — 扩展覆盖至上述 10 文件 28 处（D661 已建，扩断言）
- .claude/task-briefs/2026-09-10-D664-pre-commit-check-grep-p-self-clean.md — 本 brief
- memory/notes/implemented/ — 四态 Note（铁律 49）
不做什么：
- 不改 scripts/workflow/resolve-commit-brief.sh（D661 已修，勿重复）
- 不改 scripts/control-tower/check-gitlinks.sh（D665 新建，无 -P）
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 src/server.ts（src/ 产品代码与本任务无关）
- 不删 tests/control-tower/ 下 D661 已交付测试（只扩展不重写）

## Q3: 验收 — 入口 → 交互 → 结果
入口：PR CI（Control Tower Gate Tests ubuntu+windows 双跑）
处理：10 文件 28 处 -P→-E 逐处替换 + PCRE→ERE 转译 + 回归测试扩展
结果：`git grep -E "grep -[a-z]*P" -- scripts/` 仅剩 PLATFORM-CHECKLIST.md（文档）；
      双平台 CI 绿；macOS 本机 `bash scripts/pre-commit-check.sh` 全过

## 架构层: 基础设施（控制塔，非五层）
控制塔门禁脚本跨平台兼容任务，不属于五层产品架构（不触 src/ L1-L5）

## Done 标准:
- [ ] git grep -E "grep -[a-z]*P" -- scripts/ | grep -v PLATFORM-CHECKLIST → 零输出
- [ ] bash tests/control-tower/grep-oP-regression.test.sh → exit 0（含 10 文件 28 处新断言）
- [ ] 反向验证：故意塞回一处 -oP → 回归测试必红（防假绿）
- [ ] PR CI Control Tower Gate Tests（ubuntu-latest 与 windows-latest）conclusion=success
