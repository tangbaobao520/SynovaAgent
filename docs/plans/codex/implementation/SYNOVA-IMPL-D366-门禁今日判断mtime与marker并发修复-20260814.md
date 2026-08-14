<!--
  SYNOVA-IMPL-D366: 门禁"今日/本次"判断机制修复 — mtime 误判 + marker 并发缺陷
  状态: dev doc | 2026-08-14 | 优先级 P1（并行开发收尾；今日文档拉平 D362 死锁实证）
  权威文档: AGENTS.md 铁律 0-3/35 + AUDIT-FINDINGS-LEDGER.md CT-28/CT-29 + D296 认领制教训
  依赖: 无（纯门禁脚本修复；不得与 D307 worktree 隔离并行——两者都改 scripts/control-tower 与 hooks）
  并行: 无（独占 V4.7.9 版本编排）
-->

# D366: 门禁"今日/本次"判断机制修复

> 一句话问题：控制塔门禁用两种不可靠机制判断"今日/本次"——① `find -newermt "$TODAY 00:00:00"`（文件 mtime）判断"今日 brief/dev doc"；② 全局单例 `.claude/last-precommit-success` marker 判断"本次提交是否走门禁"。二者在 git pull/checkout 刷 mtime、多 session 并发 commit 时全部失效，直接后果是 2026-08-14 文档拉平 D362 反复卡死（门禁 900s+ 超时）与 GATEKEEPER 死锁。

## 1. 权威文档引用

**来源**: [AGENTS.md 铁律 35](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 35. 自动化优先。能变 tsc/oxlint/ESLint 规则的不靠文档，能写 check-*.sh 的不靠 review。

**来源**: [AUDIT-FINDINGS-LEDGER.md CT-28](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\coordination\AUDIT-FINDINGS-LEDGER.md)

> CT-28: verify-parallel --scan-today 只按当天 mtime 圈 doc 两两比对，不理解「依赖/接力顺序」……K3 审计仅验「门禁 5 存在+接线」，未覆盖判定语义。

**来源**: [AUDIT-FINDINGS-LEDGER.md CT-29](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\coordination\AUDIT-FINDINGS-LEDGER.md)

> CT-29: post-commit 靠全局单例 `.claude/last-precommit-success` 检测 --no-verify 绕过，多 session 并发时一个 session 的 post-commit rm 掉 marker，导致另一个 session 的正常提交被误判 detected-bypass。

**来源**: [D296 认领制教训](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D296-跨session污染根治v2-20260802.md)（若不存在则引用 AGENTS.md 铁律 0-3）

> 归纳（非原文）：D296 已用"认领制 current-brief"替代"按 mtime 找最新 brief"，但 G12/resolve-commit-brief 仍残留 `find -newermt` 按 mtime 圈"今日 brief"。

## 2. 代码审计——现状 (2026-08-14 实测)

### 2.1 缺陷 A (P1): 4 处 `find -newermt` 按 mtime 判断"今日" — git pull 刷 mtime 后误扫全部历史文件

实测（`rg -n "newermt" scripts/`）：

| 文件 | 行 | 用途 | 失效场景 |
|------|:---:|------|---------|
| [scripts/pre-commit-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\pre-commit-check.sh) | 813 | 组 12 G12 认领制的 ALL_TODAY_BRIEFS | `git pull` 把 346 个 brief 的 mtime 刷成今天 → G12 循环 346 次起 python 进程 → 门禁 900s+ 超时（D362 实证） |
| [scripts/workflow/hook-check-task-scope.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\hook-check-task-scope.sh) | 74 | PreToolUse task scope 的 ALL_TODAY_BRIEFS | 同上 |
| [scripts/workflow/resolve-commit-brief.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh) | 69 | brief 认领的 ALL_TODAY | 同上（组 6/12 调它） |
| [scripts/control-tower/verify-parallel.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\verify-parallel.sh) | 143 | --scan-today 的 DOCS | `git pull` 把 204 个 dev doc 的 mtime 刷成今天 → pre-push 门禁 5 扫全部 dev doc（D362 实证） |

缺陷 A 的根因：`find ... -newermt "$TODAY 00:00:00"` 依赖文件系统 mtime，而 `git pull`/`git checkout` 会把所有受影响的文件 mtime 刷新为操作时刻——"今日修改"与"今日创建"无法区分，历史文件全部误判为"今日"。

### 2.2 缺陷 B (P1): 全局单例 marker 多 session 并发误判

实测（`rg -n "last-precommit-success" scripts/`）：

| 文件 | 行 | 操作 |
|------|:---:|------|
| [scripts/install-hooks.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\install-hooks.sh) | 51 | pre-commit 成功写 `date +%s > .claude/last-precommit-success` |
| [scripts/hooks/post-commit.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\hooks\post-commit.sh) | 9,19 | post-commit 读 marker；检测后 `rm -f "$MARKER"` |

缺陷 B 的根因：marker 是**全局单例文件**。session A 的 pre-commit 写 marker → session B 的 pre-commit 覆盖 → session A 的 post-commit 读时 marker 已被 B 的 post-commit `rm`（或读到 B 的）→ A 的正常提交被误写 `detected-bypass no-precommit-marker`。3 条误判记录触发 GATEKEEPER `BYPASS_COUNT > 0` 硬阻断（pre-commit-check.sh:103），死锁（D362 实证）。

### 2.3 现状确认（供方案引用）

- D331 已交付 [check-bypass-log.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\check-bypass-log.sh)（pre-push 门禁 7）——按 `git log` commit hash 与 bypass.log 对账，这是**可靠的"本次提交"判断**（不依赖 marker）。
- brief 文件名含日期前缀 `YYYY-MM-DD-xxx.md`（如 `2026-08-14-auto.md`）或任务前缀 `DXXX-xxx.md`（如 `D362-docs-sync.md`）；dev doc 文件名含日期后缀 `-YYYYMMDD.md`。
- `current-brief` 机制（D296）已存在：`.claude/current-brief` 记录当前 session 认领的 brief 文件名。

## 3. 实现方案

### 3.1 写集 (5 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/verify-parallel.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\verify-parallel.sh) | 修改 | `--scan-today` 的 `find -newermt` 改为按文件名日期后缀 `-YYYYMMDD.md` 匹配今天 |
| [scripts/pre-commit-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\pre-commit-check.sh) | 修改 | 组 12 ALL_TODAY_BRIEFS 改为：current-brief 优先 + 文件名日期前缀匹配今天 |
| [scripts/workflow/resolve-commit-brief.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh) | 修改 | ALL_TODAY 同上（current-brief 优先 + 文件名日期） |
| [scripts/workflow/hook-check-task-scope.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\hook-check-task-scope.sh) | 修改 | ALL_TODAY_BRIEFS 同上 |
| [scripts/hooks/post-commit.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\hooks\post-commit.sh) | 修改 | 去掉 `rm -f "$MARKER"`；marker 改为"只覆盖不删除"，并记录 `git rev-parse HEAD`（commit 前 HEAD），post-commit 对比 `HEAD^` 判定 |
| [scripts/install-hooks.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\install-hooks.sh) | 修改 | pre-commit 写 marker 内容改为 `$(git rev-parse HEAD)|$(date +%s)`（head hash + 时间戳） |
| [.codex/control-tower/VERSION.md](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\VERSION.md) | 修改 | 追加 **V4.7.9**（PATCH，门禁判定机制 bug 修复）——本任务独占版本编排 |
| [tests/control-tower/today-by-name.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\today-by-name.test.sh) | 新建 | 文件名日期筛选函数单测（正常/边界/无今日） |
| [tests/control-tower/post-commit-marker.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\post-commit-marker.test.sh) | 新建 | marker 并发/绕过判定单测（并发写/无 marker/超时） |

> **共享资源标注**（S-8）：`.claude/current-brief`、`.claude/bypass.log`、`.claude/last-precommit-success`、`.codex/control-tower/VERSION.md` 为共享资源，串行触碰；本任务与 D307（worktree 隔离）都改 hooks/control-tower，**不得并行派发**。

### 3.2 修复模式（关键代码）

**公共"按文件名日期判断今日"函数**（新增到各脚本，或抽到 `scripts/control-tower/common-today.sh` 供 4 处 source）：

```bash
# 按文件名日期判断"今日"（替代 find -newermt，git pull 会刷 mtime 不可靠）
# 用法: today_files_by_suffix <dir> <glob> <date_regex>   # dev doc: -YYYYMMDD.md
# 用法: today_files_by_prefix <dir> <glob> <date_regex>   # brief: YYYY-MM-DD 前缀
TODAY_COMPACT=$(date +%Y%m%d)   # 20260814
TODAY_DASH=$(date +%Y-%m-%d)    # 2026-08-14
today_files_by_suffix() {
  local dir="$1" glob="$2"
  find "$dir" -maxdepth 1 -name "$glob" 2>/dev/null \
    | while IFS= read -r f; do
        local b=$(basename "$f")
        local d=$(echo "$b" | grep -oE '[0-9]{8}' | tail -1)
        [ "$d" = "$TODAY_COMPACT" ] && echo "$f"
      done
}
today_files_by_prefix() {
  local dir="$1" glob="$2"
  find "$dir" -maxdepth 1 -name "$glob" 2>/dev/null \
    | while IFS= read -r f; do
        local b=$(basename "$f")
        local d=$(echo "$b" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
        [ "$d" = "$TODAY_DASH" ] && echo "$f"
      done
}
```

> §3.2 最终实现同 commit 回填（S-6）：若实现改为"抽公共脚本 source"或"current-brief 唯一优先"，须在同一提交把本节更新为最终形态，不留方案漂移。

**marker 修复（post-commit 去掉 rm，改为 head hash 校验）**：

pre-commit（install-hooks.sh:51）改为写 `head|timestamp`：
```bash
echo "$(git rev-parse HEAD 2>/dev/null)|$(date +%s)" > "$ROOT/.claude/last-precommit-success"
```
post-commit 改为：读 marker 的 head hash 对比 `git rev-parse HEAD^`（本次 commit 的 parent），匹配则通过，不匹配/无 marker 则 detected-bypass；**不再 `rm`**（marker 只覆盖，避免并发 session 互相删）。

### 3.3 不做的事

| 项 | 理由 |
|----|------|
| 不做 D307 worktree 隔离 | 独立任务（V4.8.0），本任务只修门禁判定机制 |
| 不重构 D331 bypass.log 对账 | 它已是可靠的 commit-hash 对账，保留为 pre-push 主防线 |
| 不新增"今日 brief"的分布式判定 | 单机双 session 场景，文件名日期 + current-brief 足够 |

## 4. 测试要求 (测试优先)

> 第一步写测试（red）→ 第二步实现（green）。

| 层 | 类型 | 数量 | 覆盖 |
|----|------|:---:|------|
| 单测 | today-by-name.test.sh | ≥6 断言 | 文件名日期筛选：正常（今日命中）/ 边界（昨日不命中、mtime 今日但文件名旧不命中）/ 无今日（空）|
| 单测 | post-commit-marker.test.sh | ≥6 断言 | marker：并发写不互相删（red=误判 detected-bypass）/ 无 marker=detected-bypass / head 匹配=pass / head 不匹配=detected-bypass / 超时=possible-bypass |

**RED 必须覆盖失败模式**（S-5）：
- 场景 1（D362 死锁复现）：把 346 个 brief 的 mtime 刷成今天 → 旧逻辑 `find -newermt` 返回 346 → 修复后按文件名日期返回 1（D362）——"修复前 346 个 → 修复后 1 个"。
- 场景 2（CT-29 复现）：两个 session 交错 pre-commit/post-commit → 旧逻辑 A 的 post-commit 因 B rm marker 误写 detected-bypass → 修复后 A/B 均 pass。

## 4.5 决策参考

**决策点**：marker 并发修复选"只覆盖不删除 + head hash 校验"而非"per-session marker 文件"。

**参考系**：第一性原理——marker 的语义是"本次 commit 是否走了 pre-commit"，最可靠的对齐方式是"记录 commit 前的 HEAD，post-commit 对比 parent"，这天然不依赖 session 身份（git commit 本身不携带 session 概念）；Anthropic 工程基线——D331 已用 commit-hash 对账证明"hash 对账 > 时间戳单例"。

**结论**：marker 内容含 head hash，post-commit 对比 `HEAD^`，去掉 rm（只覆盖）。完成报告须含"决策记录"（决策点 + 参考系 + 理由）。

## 5. 接线要求

| 新函数/机制 | 调用方 | 确认方式 |
|------|------|---------|
| today_files_by_suffix / today_files_by_prefix | verify-parallel.sh / pre-commit-check.sh / resolve-commit-brief.sh / hook-check-task-scope.sh | `grep -rn "today_files_by" scripts/` ≥4 处生产调用 |
| marker 新内容 `head\|timestamp` | install-hooks.sh 写、post-commit.sh 读 | `grep -n "rev-parse HEAD\|last-precommit-success" scripts/install-hooks.sh scripts/hooks/post-commit.sh` |

> 生产调用点必须（S-3）：4 处 `find -newermt` 全部替换为 `today_files_by_*` 的生产调用，grep 验证；测试调用不计入。

## 6. 完成标准

- DS1: `rg -n "newermt" scripts/` 返回 0（4 处全部消除，mtime 判断彻底移除）
- DS2: `rg -n "today_files_by" scripts/` ≥4 处生产调用（verify-parallel/pre-commit/resolve-commit-brief/hook-check-task-scope）
- DS3: `grep -n "rm -f.*last-precommit-success" scripts/hooks/post-commit.sh` 返回 0（不再删 marker）
- DS4: `bash tests/control-tower/today-by-name.test.sh` 全绿（≥6 断言，red 阶段已证：mtime 今日但文件名旧 → 修复前误判）
- DS5: `bash tests/control-tower/post-commit-marker.test.sh` 全绿（并发写/无 marker/head 匹配/不匹配/超时）
- DS6: `bash scripts/control-tower/baseline-check.sh --tsc` 显示新增 0（存量 28 不变）
- DS7: VERSION.md 含 V4.7.9 + version.log 追加 4.7.9（与代码同 commit）
- DS8: `git diff --name-only HEAD~1..HEAD` 恰为写集 5 修改 + 2 新建（无越界）
- DS9: 真实 push 验证：`git log origin/feat/prompt-architecture..HEAD` 为空（已推送）+ CI task-relevant jobs 绿（vitest/golden-case/checker-review 等；npm audit/Architecture 预存失败单独标注）

## 7. 自检清单

- [ ] 代码审计 4 处 find -newermt + marker 3 处均已 grep 实测（file:line），不是凭记忆
- [ ] 写集表格式符合契约（`### 3.1 写集` 标题后紧跟表格，无空行）
- [ ] 测试 red→green 覆盖失败模式（mtime 346→1、marker 并发误判）
- [ ] DS 每项可机器验证（grep/bash/baseline/git diff）
- [ ] §5 接线要求 ≥1 生产调用点（4 处 find -newermt 替换）
- [ ] V4.7.9 版本 bump 已记录（PATCH）
- [ ] 自检清单以"不是凭记忆"和"不用 --no-verify"收尾
- [ ] 交付声明 DS 须与本 dev doc DS1..DS9 一一对应，缺项显式 descope
- [ ] 派发说明：不得与 D307（worktree 隔离）并行开 session（两者都改 hooks/control-tower），若必须并行先 git worktree 隔离
