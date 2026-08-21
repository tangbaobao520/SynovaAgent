---
status: implemented
date: 2026-08-21
task: D464
tags: [control-tower, quotepath, rebase, gate-fix, 减负]
---

# D464 — 控制塔门禁减负修复（中文名盲区 + rebase 提示改 merge）

## 决策
2026-08-21 创始人裁决：门禁 bug 是"减负"不是"加固"，不属于 08-21 冻结范围，必须修。

## 理由
codex（Win）PR #69 反馈两处门禁坑，均消耗执行带宽：
1. **G12c 中文文件名 quotepath 盲区**：`core.quotepath` 默认转义中文文件名 → 写集验证 `grep -F` 匹配不上 → 误报"零实际变更"。K3 早已上报，脚本归 DSH 地盘一直未修。修法：`check-dev-doc-write-set.sh` + `pre-commit-check.sh` 的 git diff 加 `-c core.quotepath=false`。
2. **D331 rebase 哈希对账断裂**：流程文档 + 门禁提示推荐 `git rebase`，rebase 改 hash → full-hash 对账必裂 → 反复补记。修法：`pre-push-check.sh`/`check-branch-sync.sh`/`MULTI-MACHINE-PR-WORKFLOW.md` 提示从「推荐 rebase」改「推荐 merge（不改 hash）」。

## 附带
- 4 脚本补 UTF-8 头块（D313 M5）
- `branch-sync-guard.test.sh` 重命名 `check-branch-sync.test.sh`（对齐 CT-40 配对规则）
- 存量发现（未修）：tag-bypass-wiring.test.sh 4 项失败（check-bypass-log base 解析 + staging-guard shim）
