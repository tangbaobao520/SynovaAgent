---
status: implemented
date: 2026-08-18
task: D457
tags: [bypass-log, merge-union, gitattributes, CT-47]
---

# D457 — bypass.log 多 PR 合并冲突根治（merge=union）

## 决策
CT-47：.claude/bypass.log 是 append-only 证据日志，每个 session 的 synova-commit 都追加一行。D357/D358/D354 三个分支都改它，合并必然冲突。

修复：.gitattributes 声明 `.claude/bypass.log merge=union`，install-hooks.sh 注册 `merge.union.driver = git merge-file --union %A %O %B`。union 驱动合并 = 取并集（保留双方所有行），每行含唯一 HASH 不会重复，正好适用。

## 理由
- 第一性原理：append-only 日志合并 = 取并集，这是 git 原生机制（union driver）
- 最少机制：不改 synova-commit 写集逻辑（方向③），不用把运行时产物转 untracked（方向②）
- 测试证明：两分支各追加 → 合并后 3 行全在，无冲突
