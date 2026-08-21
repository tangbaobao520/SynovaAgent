# 多机协作规范 — PR 工作流（D334, 2026-08-14 创始人定）

> 一句话原则：**main 是唯一真相。一台机器一件事一个分支。合并必须走 PR。**
>
> 本规范解决：多台电脑（Mac/Win）上的 AI Agent 共同维护一个 GitHub 仓库时的"互相覆盖"事故。
> 事故原型：2026-08-11~13，两台机器在同一分支上交替 push，Mac 机 4 天不知道 Win 机推了 11 个 commit，
> `git status` 误报 "ahead 10"，实际落后 11——差点互相覆盖对方的成果。

---

## 一、给创始人（你只需要做 2 件事）

### 开工：给 agent 派活时说一句话

> "任务：xxx。遵守 docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md 的 PR 工作流。"

### 完工：在 GitHub 网页点两个按钮

1. agent 完成后会给你一个链接（形如 `https://github.com/tangbaobao520/SynovaAgent/pull/新编号`）
2. 打开链接 → 看绿色勾勾（CI 通过）→ 点 **Merge pull request** → 点 **Confirm merge**
3. 完事。合并后 agent 会继续干活。

> ⚠️ 如果看到红色叉叉，先别点 Merge，让 agent 看 CI 日志修复。

---

## 二、给 Agent（开工 5 步 / 收工 5 步）

### 开工（每次会话接到任务，先执行）

```bash
# 1. 拿到最新真相
git fetch --all --prune
# 2. 检查当前分支是否已同步（禁止在过期基础上开工）
git status -sb
# 3. 切到 main 并拉平
git checkout main && git pull --ff-only
# 4. 从 main 开自己的任务分支（命名: feat/机器名-任务 / fix/机器名-任务）
git checkout -b feat/<mac|win>-<任务简称>
# 5. 确认分支干净、基于最新 main
git log --oneline -3
```

### 收工（任务完成，准备交付）

```bash
# 1. 提交（走 synova-commit，自动跑 13 组门禁 + 打 tag）
synova-commit "feat(Dxxx): 任务描述"
# 2. 推送自己的分支（pre-push 门禁 0 会自动 fetch 检查同步状态）
git push ssh feat/<mac|win>-<任务简称>
# 3. 给创始人 PR 链接
echo "https://github.com/tangbaobao520/SynovaAgent/compare/main...feat/<分支名>"
# 4. 等创始人点 Merge 后，拉平本地
git fetch --all && git checkout main && git pull --ff-only
# 5. 删除已合并的分支
git branch -d feat/<分支名>
```

### 冲突处理（push 被拒或门禁 0 阻断时）

```bash
git fetch ssh
git merge main          # 推荐（不改 hash，bypass.log 对账不裂）
# 或 git rebase main（会改 hash → bypass 对账断裂，需按 D451 补记新 hash）
# 禁止 git stash（铁律 0-3）
# 解决冲突后重新 push
```

---

## 三、物理门禁（免疫细胞，零自律依赖）

| 门禁 | 位置 | 行为 |
|------|------|------|
| **门禁 0-1 push 前同步检查** | `scripts/pre-push-check.sh` | push 前强制 fetch 目标分支：落后（远端有新 commit）→ 🔴 硬阻断；分叉 → 🔴 硬阻断提示 merge（rebase 改 hash 会裂 bypass 对账） |
| **门禁 0-2 main 分支保护** | `scripts/pre-push-check.sh` | 直接 push 到 `refs/heads/main` → 🔴 硬阻断（"main 只进 PR"）。紧急逃生舱 `SYNO_ALLOW_MAIN_PUSH=1`（会记 bypass.log） |
| CI（GitHub Actions） | `.github/workflows/ci.yml` | PR 到 main 自动跑：tsc + 铁律 + vitest 双分片 + 架构 + golden-case + 集成 + checker-review |

---

## 四、规则明细

1. **main 是唯一真相**。任何机器开工前必须先 `fetch + pull --ff-only`，禁止在过期的 main 上开分支。
2. **一人一事一分支**。每台机器每个任务一个独立分支（`feat/mac-xxx` / `feat/win-xxx`），禁止两台机器共用同一分支并行工作。
3. **合并走 PR**。所有代码进 main 必须经过 GitHub Pull Request。PR 是"显式的、有记录的合并点"。
4. **禁止 `git stash`**（铁律 0-3，D312 事故）。保存进度用 commit 或 worktree。
5. **禁止 force push 共享分支**。`git push -f` 只允许在自己的私人分支上使用；对 main 和他人分支的 force push 是事故级操作。
6. **tag 只由 synova-commit 自动创建**（D319）。手动打 tag 会与 D331 锚点校验冲突。
7. **同步降频（D468, 2026-08-21）**：提交前同步检查（D335 check-branch-sync）已砍——提交时不再强制"基于最新 main"。**开工前拉平（第 1 条）+ push 前防覆盖（门禁 0-1）保留**，防双机互相覆盖的物理保障不丢。

## 五、应急联系

- 门禁误阻断需要绕过：找创始人批准，用 `--no-verify`（会被 bypass.log 记录审计，3 次/24h 硬阻断）
- 分叉无法判断取舍：**停下，问创始人**，不要自行 force push 或 reset。

---

## 六、数据资产备份（D335 追加）

- **代码**: 三地备份（GitHub + Mac + Win），git 分布式天然冗余
- **数据**: `data/synova.db` 每日 03:30 由 launchd 自动备份到 iCloud Drive
  （`scripts/backup/backup-db.sh`：sqlite3 .backup 一致性快照 + 完整性校验 + 保留 14 份）
- **新机器开工前验证备份**: `launchctl list | grep synova.backup`
- **手动备份一次**: `bash scripts/backup/backup-db.sh`
- **安装/重装**: `bash scripts/backup/install-backup-launchd.sh`
- **禁止直接 cp 数据库**（可能拷到写一半的库）——只准用 backup-db.sh
