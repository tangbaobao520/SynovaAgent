---
name: git-sync-pr
description: 多机协作 git 同步与 PR 流程（D334）。任何涉及 git commit/push/分支操作、或接到任务准备开工时使用。防双机互相覆盖。规范全文: docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md
---

# git-sync-pr — 多机 PR 工作流

## 使用时机
- 会话开始时准备写代码 → 跑"开工 5 步"
- 任务完成准备交付 → 跑"收工 5 步"
- push 被拒 / pre-push 门禁 0 阻断 → 跑"冲突处理"

## 开工 5 步（物理命令，逐条执行并确认 exit 0）

```bash
git fetch --all --prune
git status -sb          # 必须显示 clean 且与 main 无 behind
git checkout main && git pull --ff-only
git checkout -b feat/<mac|win>-<任务简称>
git log --oneline -3
```

关键判断：`git status -sb` 若显示 `[behind N]` 或 `[ahead N, behind M]` → **禁止开工**，先拉平再开分支。

## 收工 5 步

```bash
synova-commit "feat(Dxxx): 任务描述"        # 跑 12 组 pre-commit + 自动 tag
git push ssh feat/<mac|win>-<任务简称>       # pre-push 门禁 0 自动 fetch 检查
# 完成后给创始人 PR 链接:
# https://github.com/tangbaobao520/SynovaAgent/compare/main...<分支名>
```

创始人点 Merge 后：

```bash
git fetch --all && git checkout main && git pull --ff-only
git branch -d feat/<分支名>
```

## 冲突处理

```bash
git fetch ssh
git rebase main
# 解冲突 → git add → git rebase --continue → 重新 push
```

## 硬规则（违反 = 事故）

1. 禁止 `git stash`（铁律 0-3）
2. 禁止 push 到 main（门禁 0-2 硬阻断；合并只走 PR）
3. 禁止 force push 到任何共享分支
4. 禁止在 `[behind N]` 状态下开工或 push
5. 禁止两台机器共用同一分支并行工作

## 历史事故
2026-08-11~13: Mac/Win 双机在 feat/prompt-architecture 上交替 push，Mac 4 天未 fetch，
tracking ref 过期导致 git status 误报 ahead，真实落后 11 commit。教训：git status 的
ahead/behind 是相对**本机缓存的远端引用**，不是远端真身——判断同步状态前必须先 fetch。
