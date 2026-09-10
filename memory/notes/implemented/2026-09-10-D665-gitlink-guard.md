---
状态: implemented
日期: 2026-09-10
决策: D665 gitlink 树级守门三件套——① 摘除存量：10 个运行时目录 gitlink（9 个 .synova-wt-* + .sessions/d595-mcp-auth/repo）git rm --cached 出树，磁盘 worktree 原样保留；② .gitignore 防再入（.synova-wt-* 与 .sessions/）；③ 新建 scripts/control-tower/check-gitlinks.sh 树级守门（git ls-tree -r 扫 160000，三态退出 0/1/2，D328 惯例）+ tests/control-tower/check-gitlinks.test.sh 密封测试（mktemp 沙箱四覆盖：正常/注入 gitlink/降级×2/接线）入 ci.yml Control Tower Gate Tests 显式列表。
理由: D595 PR #459 把运行时 worktree/session 目录以 gitlink(160000) 形式带进 git 树且无 .gitmodules，actions/checkout 报 "No url found for submodule path '.sessions/d595-mcp-auth/repo'" exit 128 → main build job 常红（红=零信号，V3.9）。防线三缺：无 .gitignore 覆盖、无门禁检查、K3 三次提 gitlink（D593-FIX/FIX2 复审）仅修自身——M1 fail-open 同型（无检查=静默通过）。守门放 CI canary 层而非 pre-commit 组：树级事实全量扫描成本低、且密封测试列表扩一项即可（M3：建了必须接线）。
---

## 背景

main build job 常红，根因 `git ls-tree -r HEAD | grep "^160000"` 命中 10 条：
运行时隔离目录（`.synova-wt-*` 任务 worktree、`.sessions/*/repo` session clone）
被当作子模块指针提交进树。CI 在 checkout 阶段尝试解析 submodule 失败，
build job 自 #459 起无法转绿——期间的"红态合并"争议（CT-47）部分源于此噪音源。

## 决策

- **摘除存量**：`git rm --cached` 仅摘索引，磁盘目录原样保留（各任务 worktree 不受影响）。
- **防再入**：`.gitignore` 增 `.synova-wt-*` 与 `.sessions/`（`git add .` 不再卷入）。
- **树级守门**：`check-gitlinks.sh [tree-ish]`——gitlink 是"指向外部 commit 的指针"，
  运行时目录不属于版本库（第一性原理）；三态退出（0 干净 / 1 发现 gitlink / 2 检查自身失败，
  绝不混同，D328）。
- **密封测试**：沙箱内 `git update-index --cacheinfo 160000,<sha>,<path>` 注入真实 gitlink
  验证 exit 1；非 git 目录与坏 tree-ish 验证 exit 2；接线断言 ci.yml 列表 + .gitignore 覆盖
  （铁律 0-2 WIRE CHECK 内置于测试）。

## 边界

- 不扩 pre-commit 组（树级全量事实属 CI canary 层，本地增量提交无 gitlink 新增面）。
- 不碰 `scripts/audit/`（K3 红线）；不删磁盘 worktree（改 A 不断 B）。
- 后续任何新 worktree 目录命名若脱离 `.synova-wt-*` / `.sessions/` 前缀，需同步本 note 与 .gitignore。
