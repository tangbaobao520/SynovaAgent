<!--
  SYNOVA-IMPL-D307: session 级 worktree 隔离 — 并行根治（独立 index / 独立暂存区 / 完成合并清理）
  状态: dev doc | 2026-08-12 | 优先级 P0 (M8 共享暂存区竞争物理根治; D320 劫持/D330-D331 拉锯均根因于此)
  权威文档: PARALLEL-DISCIPLINE.md + AGENTS.md 铁律 0-3 + D311 session_registry + D332 软加固
  依赖: 无（D332 的 attach register 从"前置"降为"可选增强"——worktree 隔离核心不依赖 attach 强制 register；attach 并行模式检测是提示层增强，可独立于 D332 执行）
  并行: 无（独占 V4.8.0 版本编排）
-->

# D307: session 级 worktree 隔离

> 一句话问题: 并行 session 共用一个 worktree → 共享单一 git index（暂存区）→ 必然竞争（D330/D331 拉锯、D320 劫持）。staging-guard/认领制/一致性门禁只能"拒绝"，不能"隔离"。**唯一物理解法：每个并行 session 一个独立 worktree（独立 index + 独立暂存区 + 独立 current-brief）**。

## 1. 权威文档引用

**来源**: [PARALLEL-DISCIPLINE.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\coordination\PARALLEL-DISCIPLINE.md)

> 软加固（D332）是减害，非根治；D307 是物理解法。

**来源**: [AGENTS.md 铁律 0-3](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 隔离工作区: `git worktree add ../synova-wt-<任务名> <branch>`（stash 替代方案已指明方向）。

## 2. 代码审计——现状 (2026-08-12 实测)

### 2.1 缺陷 A (P0): 并行 session 共用主 worktree 单一 index

实测：D330/D331 同时在主 worktree（`D:/novis-backup.../synova-agent`，feat/prompt-architecture）执行——同一 `git index`，D331 `git add` 后 D330 unstage → D331 re-add → 拉锯。现有 worktree 列表只有旧 session（session/01-04 等，非当前并行模式）。

### 2.2 现状确认

- `git worktree` 机制可用（实测列表 6 个 worktree）；hooks 共享 `.git/hooks`（worktree 内提交触发同一套 12 组门禁）。
- session_registry（D311）已有 session/brief/write_set/phase；D332（CT-11）将让 attach.py 强制 register——本任务在其上加 worktree 字段。
- synova-commit 用 `git rev-parse --show-toplevel` 定位（天然兼容 worktree 内执行）。
- **git worktree 分支约束**：两个 worktree 不能 checkout 同一分支 → session worktree 必须用独立分支（`session/<id>`），完成后 merge 回 feat/prompt-architecture。

## 3. 实现方案

### 3.1 写集 (4 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/control-tower/worktree-manager.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\worktree-manager.py) | 新建 | worktree 生命周期：`create <sid>`（`git worktree add ../synova-wt-<sid> -b session/<sid>`）→ `finish <sid>`（主 worktree pull/rebase session 分支 → merge → `worktree remove`）→ `list`/`status` |
| [scripts/control-tower/attach.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\attach.py) | 修改 | SessionStart **检测**并行模式（registry 有活跃 session 或 `--parallel`）→ 若应隔离且当前非 worktree → **degraded 提示"请到 task-start 创建的 worktree 目录启动"**（hook 无法改变宿主进程 cwd，不能 os.chdir）；写 current-brief.\<sid\> |
| [scripts/control-tower/session_registry.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\session_registry.py) | 修改 | session 记录加 `worktree_path` / `worktree_branch` 字段；finish 后标记清理 |
| [scripts/control-tower/synova-commit](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\synova-commit) | 修改 | worktree 内提交后提示 `worktree-manager finish`（或 --finish 自动合并清理）；push 前检查当前 worktree 分支推送目标 |
| [.codex/control-tower/VERSION.md](D:\novis-backup-20260526\Novis\synova-agent\.codex\control-tower\VERSION.md) | 修改 | 追加 **V4.8.0**（MINOR，新机制 worktree 隔离）——本任务独占版本编排 |
| [tests/control-tower/worktree-manager.test.py](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\worktree-manager.test.py) | 新建 | worktree 生命周期 + 并行隔离测试（≥6 用例，见 §4） |

> version.log 运行时（gitignore）：`control_tower_log.py version --version 4.8.0 --changes "D307 worktree 隔离"`。
> **写集说明**：attach.py 的 register 部分由 D332 负责；D307 只加"并行模式检测提示"（detect-only，不依赖 D332，可独立执行）。若 D332 已先行，attach register 与本任务的并行检测在 attach.py 内叠加，无冲突。
> **共享资源标注**（S-8）：`.codex/control-tower/VERSION.md`、`.claude/current-brief`、`.claude/task-briefs/`、暂存区本身为共享资源，串行触碰；本任务与 D332（改 attach.py）若并行，须先 worktree 隔离或串行执行。

### 3.2 修复模式

**worktree-manager.py 核心**:

```python
def create(sid: str, base_branch: str = "feat/prompt-architecture") -> Path:
    """创建独立 worktree + session 分支（独立 index/暂存区）。"""
    wt = REPO_ROOT.parent / f"synova-wt-{sid}"
    run(["git", "worktree", "add", str(wt), "-b", f"session/{sid}", base_branch])
    return wt

def finish(sid: str) -> None:
    """主 worktree 合并 session 分支 + 清理。"""
    # 主 worktree: git fetch/merge session/<sid> → 删除分支 + worktree remove
    run(["git", "merge", f"session/{sid}"], cwd=MAIN_WT)
    run(["git", "worktree", "remove", str(wt)])
    run(["git", "branch", "-d", f"session/{sid}"])
```

**attach.py 并行模式检测（只检测提示，不切目录）**:

```python
# SessionStart: 检测并行模式 —— hook 无法改变宿主进程 cwd，只能提示
if parallel_mode and not in_worktree():
    log_degraded("attach.parallel", "应隔离未隔离 — 请到 task-start 创建的 worktree 目录启动 session")
```

**hooks 在 worktree 内生效**：worktree 共享 `.git/hooks`（实测机制），12 组门禁自动覆盖——无需额外接线。

**worktree base 来源**：`worktree-manager create` 从**本地 feat/prompt-architecture tip** 创建（含未推送提交，如当前 D328/D329）——并行 session 共享同一基础；finish 时 rebase 到最新主分支再 merge（冲突按标准 git rebase 处理）。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 修改 pre-commit/pre-push 门禁本体 | D332 已覆盖软加固；worktree 隔离后门禁按现有逻辑工作 |
| 主 worktree 强制只读 | 用户可能单 session 直接用主 worktree；仅并行模式启用隔离 |
| CI/部署路径改造 | worktree 是本地开发隔离，CI 仍是干净检出 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/worktree-manager.test.py`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| create 生成独立 worktree（git worktree list 含 session/<sid> 分支） | 无此功能 | 生成成功 |
| 双 worktree 独立 index：A 在 wt-A add 文件 → B 在 wt-B 的 index 不可见 | 共享 index（可见）→ 断言失败 | 互不可见 |
| A/B 各自 commit 互不干扰（无拉锯） | 共享 index 竞争 | 各自提交成功 |
| finish 合并回主分支 + worktree 清理 | 无 | merge 成功 + worktree list 清空 |
| hooks 在 worktree 内生效（pre-commit 12 组） | 回归确认（既有机制，非 D307 修复） | 提交触发门禁 |
| registry 记录 worktree_path/branch | 无字段 | 有 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L2 | Python 单元（新建） | ≥6 | 上述 6 用例（正常/隔离/合并/清理/降级） |
| L1 | 端到端 | 1 | 模拟双 session 并行提交 → 主分支合并无冲突 |

## 4.5 决策参考

**决策点 1**：worktree 隔离选"session 分支 + finish merge 回主分支"，而非"直接在主 worktree 双 checkout"。

**参考系**：第一性原理——git worktree 硬约束"两个 worktree 不能 checkout 同一分支"，故并行 session 必须用独立分支（`session/<sid>`），finish 时 merge 回主分支；DeepSeek 开源实证——git 官方 worktree 设计的标准用法即是"分支级隔离 + 合并回主"。

**结论**：create 时 `git worktree add -b session/<sid>`，finish 时主 worktree merge session 分支并清理。完成报告须含"决策记录"（决策点 + 参考系 + 理由）。

**决策点 2**：attach.py 并行模式是"检测提示"而非"自动 create worktree"。

**参考系**：Anthropic 工程基线——PreToolUse/SessionStart hook 无法改变宿主进程的 cwd（不能 `os.chdir` 到 worktree 目录），只能输出 degraded 提示，由 task-start 在目标 worktree 目录启动。

**结论**：attach 只 detect + log_degraded 提示，不自动 create。完成报告须含"决策记录"。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| worktree-manager create/finish | `python worktree-manager.py create test` → worktree 存在 + session/test 分支；finish → 清理 |
| attach 并行模式 | registry 有活跃 session 且当前非 worktree 时 SessionStart 输出 degraded 提示（不自动 create，hook 无法切 cwd） |
| registry worktree 字段 | session 记录含 worktree_path/branch |
| synova-commit 提示 | worktree 内提交后输出 finish 指引 |

## 6. 完成标准

1. DS1: `tests/control-tower/worktree-manager.test.py` 全过（≥6 用例；red 已证）
2. DS2: `git worktree list` 含独立 worktree（session/<sid> 分支），独立 index 实测互不可见
3. DS3: 双 session 并行提交互不干扰（端到端模拟通过）
4. DS4: finish 后合并回 feat/prompt-architecture + worktree 清理（list 清空）
5. DS5: worktree 内提交触发 12 组 pre-commit（hooks 共享生效）
6. DS6: registry 记录 worktree_path/branch
7. DS7: VERSION.md 含 **V4.8.0** + version.log 追加（同 commit）
8. DS8: 全量审计与当前 HEAD 基线一致（**439 FAIL**；若已合并 Mac 清理 ba653c3 则为 434）+ as any=0
9. DS9: 真实提交环境 12 组 pre-commit 全过、无 --no-verify、`git diff --name-only` 与写集一致
10. DS10: **推送 + CI 验证**：`git log @{upstream}..HEAD` 为空（用实际推送分支的 upstream，PR 工作流下分支名可变）+ CI 任务相关 job 逐 job 全绿（预存 npm audit/Architecture 单独标注）

## 7. 自检清单

- [x] 2026-08-12 拉锯事件：共享 index 根因实测确认（D330 unstage ↔ D331 re-add）
- [x] git worktree 机制可用（列表 6 个旧 worktree）+ 分支约束确认（同分支不可双 worktree）
- [x] hooks 共享 .git/hooks、synova-commit 用 show-toplevel——worktree 兼容性确认
- [x] D307 backlog 长期"P0 待写 dev doc"未落地——本次补齐（2026-08-12）
- [x] 测试优先：6 用例 red 设计（§4 表）
- [x] 不是凭记忆
- [x] 不用 --no-verify
