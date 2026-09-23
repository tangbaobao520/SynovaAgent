# 决策 Note — D920 合并队列推进器入库（两个卡死根因机器化）

- 状态: proposed（待 K3 审计 + 创始人确认后 git mv 到 implemented/）
- 日期: 2026-09-23
- 责任方: synova-cto（dsh-cto）
- 触发: 2026-09-22 串行合并流水线在 PR #712 上**卡死 22 轮**（每轮 ~70s，累计 25 分钟空转），随后会话结束、队列积压（#712/#713/#706/#704 + 30 个开放 PR）。本次接手实测定位两条根因。

## 决策

把合并纪律从 `/tmp` 一次性脚本演进为**受审计工具** `scripts/control-tower/merge-pr-queue.py`，
两个根因各自转成**可注入夹具的纯函数**并配密封测试（根因不入库 = 必然复发）。

## 依据（参考系，K3 可核）

- **Anthropic 工程基线**（DECISION-REFERENCE.md:19 适用域「门禁/fail-closed、脚本化验证」）：卡死源于判据不可复现 → 修正为「本地 git 事实优先于平台缓存状态」。
- **DeepSeek 第一性原理**（同文件）：机制为减少摩擦而存在 → 不做「加重试次数」这类治标，而是删掉"等"这个动作（DIRTY 必有确定处置）。
- **DSH 范式**（原会话结论，本次沿用）：违规/异常必须可归因 → 脚本状态词汇显式（`DIRTY_CONFLICT` vs `DIRTY_STALE`，不再是一个模糊的 DIRTY）。

## 根因（逐条实测）

### 根因1 — 工作树参数缺失/为空 → 空转
`/tmp/serialmerge.py` 的 `process(n, wt)` 用 `os.path.join(REPO, wt)`；#712 的调用**没给工作树**（日志物证 `#712 === 开始（工作树 ）===`）→ `cwd = REPO`（主工作区）→ 对 main 反复 `git merge origin/main` 永远 "Already up to date" → 判成「等 GitHub 重算」。
**修正**: `resolve_worktree()` 强校验 —— 空分支名直接返回 error（调用方中止），**绝不回落主工作区**；未命中已有工作树则显式新建并留痕。

### 根因2 — DIRTY 二义（真冲突 vs 平台缓存过期）
原脚本对 `mergeable=false` 一律"等"，且不验证。实测 #704：GitHub 判 `dirty`（`base.sha` 停在旧 main `08af2a65`），而本地 `git merge origin/main` **rc=0 干净** —— 是**合并性缓存过期**，不是冲突。
**修正**: DIRTY 触发本地 `git merge-tree` 复验 ——
- 有冲突 → `DIRTY_CONFLICT` + 点名冲突文件 + 停（交 CTO union 裁定）
- 无冲突 → `DIRTY_STALE` → **推一次 re-merge 强制 GitHub 重算**（实测 #704 dirty→clean 生效）
「等」这个动作被删除。

### 附带（同一主题）— 失败 job 自动重跑
在途 PR 的 check 跑在 merge ref 上；基线修复落地后，`rerun-failed-jobs` 即含新 main。**但实测有延迟**（#712 重跑仍红：merge ref 未及时重算）→ 更确定的手段是**推 re-merge 换 head sha**（本次对 #712 即用此法）。工具两者都支持。

## 验收证据

- `bash tests/control-tower/merge-pr-queue.test.sh` → **11 通过 0 失败**（含根因1 空参数防线、根因2 二义分流两条具名回归）
- 实战场次（本次接手，全部物理复现）: #715 合并（日期炸弹修复）→ #704 re-merge 强制重算（dirty→clean）→ #712 re-merge 换 head 重跑
- 契约: 脚本头含 @input/@output/@exit/@degraded（0/1/2 三态）

## 影响面

- 后续 CTO 合并批走 `merge-pr-queue.py --prs ... [--wait-merged N] [--dry-run]`；`/tmp` 原型退役。
- 不碰 `scripts/audit/**`；本工具受 K3 独立审计（无豁免）。
