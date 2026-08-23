# D507 并行 session 物理隔离 — 三层防线决策记录

> 提取自: task-state/D502-D507（M8 第 4 次复发 D506）
> 主题: 并行 session 共享工作区互踩的根治路径

## 决策（创始人批准 2026-08-23）

1. **物理隔离优于软纪律**：M8 复发 4 次（D320/D330/D331/D394→D506）实证——git 的 HEAD/index/工作区文件是进程间共享单例，纪律挡不住物理互踩。解法 = 每 session 独立 worktree（git 原生，零拷贝，hooks 共享天然生效）。
2. **三层防线**：①worktree-manager 生命周期（Win D307 已建基础）②预设开工三步（四预设已注入）③synova-commit 硬阻断门禁（多活跃 session + 主区 → 拦截；单人/隔离区放行）。
3. **单人时段例外**（创始人裁决）：registry 只有本人活跃时主区可提交——并行根治与单人零摩擦不冲突。
4. **合并走 PR**（适配 D334 多机工作流，非 D307 原设计的直接 merge main）。

## 事实教训（M8 深化）

- 共享工作区的 checkout/push 会物理改写他人状态：D506 实证"我的提交被打进编码 session 的分支"+ 我的远程分支被重置——不是谁的错，是共享单例的必然。
- `git reset --hard` 会卷走未提交工作（本任务实现过程中实证一次，靠 dangling blob 恢复）——worktree 内工作也要勤提交。

## 防线映射

- 门禁落点: scripts/control-tower/synova-commit（D507 段）+ tests/control-tower/synova-commit.test.sh
- 文档: docs/synova/coordination/PARALLEL-DISCIPLINE.md（D507 落地声明）
