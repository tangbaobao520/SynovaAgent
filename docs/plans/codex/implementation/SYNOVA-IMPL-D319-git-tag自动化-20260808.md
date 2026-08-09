<!--
  SYNOVA-IMPL-D319: git tag 自动化 — synova-commit 自动 tag + pre-push tag 一致性 + 历史回填
  状态: dev doc | 2026-08-08 | 优先级 P1
  权威文档: VERSION.md 版本规则 (MAJOR.MINOR.PATCH) + AGENTS.md 铁律 35 + 双机规划 (2026-08-08)
  依赖: 无
  并行: D318/D320 写集零交集（D319: scripts/control-tower/synova-commit + scripts/pre-push-check.sh + tests/control-tower/tag-consistency.test.sh + **.codex/control-tower/VERSION.md**；D318: install-hooks/setup；D320: gen-task-board/DASHBOARD/coverage）；**版本编排由本任务独占：批次统一 V4.7.0 = D318+D319+D320**（各任务行为变化合并为一个 MINOR bump）
-->

# D319: git tag 自动化

> 一句话问题: 版本事实只写在 VERSION.md/version.log，git 里 0 个 tag（实测 `git tag` 空）——版本无法用 `git describe`/Release 关联，双机/看板无法以 git 为权威取版本。

## 1. 权威文档引用

**来源**: [VERSION.md 版本规则](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\VERSION.md)

> 版本号: MAJOR.MINOR.PATCH；任何门禁/工具行为变化必须 bump；bump 与代码同 commit。

**来源**: [AGENTS.md 铁律 35](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 自动化优先——能写 check-*.sh 的不靠 review。

## 2. 代码审计——现状 (2026-08-08 实测)

### 2.1 缺陷 A (P1): git 零 tag，版本事实孤立

实测 `git tag` 输出空（0 个）。VERSION.md 已有 V4.6.0/V4.6.1/V4.6.2 三个条目、version.log 有对应 3 条记录，但 git 无任何版本锚点 → `git describe` 不可用、Release/看板无法从 git 取版本、双机无法用 tag 对齐版本状态。

### 2.2 缺陷 B (P1): synova-commit 无版本/tag 步骤

实测 [synova-commit](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\synova-commit) 全文件 grep 无 `VERSION`/`tag`/`bump`（只有 staging/guard 相关）——每次 bump 靠人工改 VERSION.md + 手动跑 [control_tower_log.py version](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\control_tower_log.py:22)（`--version --changes` 命令已存在，L94 `log_version` 已实现），tag 完全缺席。

### 2.3 现状确认

- [control_tower_log.py L22/L94](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\control_tower_log.py:22)：`version --version <v> --changes <c>` 已实现，写入 version.log（schema v1）。
- [pre-push-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\pre-push-check.sh) 现有 3 项门禁（secrets + golden-case + vitest --changed），无版本/tag 检查。
- 历史 bump 提交：V4.6.0→c5d8d15、V4.6.1→fdad612、V4.6.2→5b93579（可从 git log 确认）。

## 3. 实现方案

### 3.1 写集 (3 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/synova-commit](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\synova-commit) | 修改 | 提交成功后：读 VERSION.md 最新 `## V4.x.y` → 若该版本无 tag 则 `git tag -a V4.x.y -m "bump <changes>"`（annotated）→ `control_tower_log.py version` 自动追加 → push 用 `--follow-tags` |
| [scripts/pre-push-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\pre-push-check.sh) | 修改 | 新增 tag 一致性检查（门禁组 6 附挂）：VERSION.md 最新版本必须存在对应 tag，否则硬阻断（提示"先 synova-commit 自动打 tag"） |
| [.codex/control-tower/VERSION.md](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\VERSION.md) | 修改 | 追加 **V4.7.0**（批次 D318+D319+D320 统一版本，MINOR）——本批次唯一版本编排任务 |
| [tests/control-tower/tag-consistency.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\tag-consistency.test.sh) | 新建 | tag 一致性 + 自动打 tag 测试（≥4 断言，见 §4） |
| [.codex/control-tower/logs/version.log](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\logs\version.log) | 新建 | 运行时产物（gitignore）：`control_tower_log.py version --version 4.7.0 --changes "D319 git tag 自动化"` |

### 3.2 修复模式

**synova-commit 提交后追加（commit → tag → push --follow-tags）**:

```bash
# ── D319: 自动 tag（VERSION.md 最新版本 → annotated tag）──
LATEST_VER=$(grep -oE '^## V[0-9]+\.[0-9]+\.[0-9]+' "$PROJECT_ROOT/.codex/control-tower/VERSION.md" | head -1 | awk '{print $2}')
if [ -n "$LATEST_VER" ] && ! git tag -l "$LATEST_VER" | grep -q "$LATEST_VER"; then
  git tag -a "$LATEST_VER" -m "bump $LATEST_VER (synova-commit auto-tag)"
  echo "  ✅ 自动打 tag: $LATEST_VER"
  python3 "$PROJECT_ROOT/scripts/control-tower/control_tower_log.py" version \
    --version "${LATEST_VER#V}" --changes "auto-tag $LATEST_VER" > /dev/null 2>&1 || true
fi
# push: 提交 + tags
git push --follow-tags origin "$CURRENT_BRANCH"
```

**pre-push-check.sh 新增检查（门禁组 6 附挂）**:

```bash
# D319: VERSION.md 最新版本必须有对应 tag（版本事实与 git 对齐）
LATEST_VER=$(grep -oE '^## V[0-9]+\.[0-9]+\.[0-9]+' "$ROOT/.codex/control-tower/VERSION.md" | head -1 | awk '{print $2}')
if [ -n "$LATEST_VER" ] && ! git tag -l "$LATEST_VER" | grep -q "$LATEST_VER"; then
  hard_check "D319: VERSION.md 最新版本缺少对应 tag" "$LATEST_VER 无 tag — 请先 synova-commit（自动打 tag）"
else
  soft_pass "D319: VERSION.md 最新版本已有对应 tag"
fi
```

**历史回填**（一次性，synova-commit 内或独立命令）:

```bash
git tag -a V4.6.0 -m "D314 独立化首发" c5d8d15
git tag -a V4.6.1 -m "D316 修复" fdad612
git tag -a V4.6.2 -m "D317 修复" 5b93579
```

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| GitHub Release 自动化 | Release 基于 tag 自动生成（Platform 能力），无需代码；D322 ruleset 后再议 |
| `git describe` 串写入产品代码 | 控制塔内部先用；产品接入单独任务 |
| 轻量 tag 替代 annotated | annotated 带作者/消息，审计可溯 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/tag-consistency.test.sh`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| 临时 repo：VERSION.md 有 V9.9.9 但无 tag → pre-push 检查 exit 1 | 检查不存在 → exit 0 断言失败 | exit 1 硬阻断 |
| 打 tag 后 exit 0 | 回归用例（修复前无检查恒 exit 0，非真 red） | exit 0 |
| synova-commit 提交后自动建 tag | 无 tag 逻辑 → 断言 tag 存在失败 | `git tag -l` 含 VERSION 最新版 |
| annotated tag 消息含 "auto-tag" | 同上 | `git for-each-ref refs/tags` 可读 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | shell 单元（新建） | ≥4 | 上述 4 用例（正常/降级/边界） |
| L1 | 手工验证 | 1 | 历史回填后 `git tag` 含 V4.6.0/4.6.1/4.6.2 |

> 临时 repo 用 `mktemp -d` + `git init` + 伪造 VERSION.md（`## V9.9.9`）隔离真实仓库；pre-push 检查函数化以便单测。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| synova-commit 自动 tag | 真实提交 + bump 后 `git tag -l` 含新版本（annotated） |
| tags 推送 | `git push --follow-tags` 后 `git ls-remote --tags origin` 含 tag |
| version.log 自动追加 | bump 后 version.log 尾行 = 新版本记录 |
| pre-push tag 检查 | VERSION.md 改版本不打 tag → push 被本地 hook 拒绝 |

## 6. 完成标准

1. DS1: `tests/control-tower/tag-consistency.test.sh` 全过（≥4 用例；修复前 red 已证）
2. DS2: 历史回填后 `git tag` 含 V4.6.0/V4.6.1/V4.6.2 且为 annotated（`git for-each-ref refs/tags --format='%(objecttype)'` = tag）
3. DS3: 新 bump（V4.7.0 批次）后 synova-commit 自动建 tag 并推送（`git ls-remote --tags origin` 含 V4.7.0）
4. DS4: VERSION.md 有版本无 tag 时 `bash scripts/pre-push-check.sh` 硬阻断（exit 1）
5. DS5: VERSION.md 含 **V4.7.0（批次 D318-D320）** + version.log 追加 4.7.0（同 commit）
6. DS6: 全量审计 `python scripts/audit/audit-check.py --full` 与基线一致（439 FAIL）+ as any=0
7. DS7: 干净检出模拟（临时 worktree）pre-push 检查对 tag 状态判定正确
8. DS8: 无 --no-verify、`git diff --name-only` 与写集一致

## 7. 自检清单

- [x] `git tag` 空（0 个）实测确认
- [x] synova-commit grep 无 VERSION/tag/bump 实测确认
- [x] control_tower_log.py version 命令已存在（L22/L94）实测确认
- [x] 历史 bump 提交定位（V4.6.0→c5d8d15/V4.6.1→fdad612/V4.6.2→5b93579）
- [x] 测试优先：4 用例 red→green 设计（§4 表）
- [x] 不是凭记忆
- [x] 不用 --no-verify
