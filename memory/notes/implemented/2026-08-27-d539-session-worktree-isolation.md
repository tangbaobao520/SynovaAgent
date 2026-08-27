---
状态: implemented
日期: 2026-08-27
决策: 主仓只读化（dev）— 任何 dev session 开工强制专属 worktree，任务启动写入会话专属 current-brief.<sid> 并废除全局。
理由: 并行 session 互踩（覆盖 current-brief / 抢写主树 index / 污染 db）是 db 损坏根因且已四次复发（D320→D330/D331→D394→D506）。软纪律挡不住物理互踩（git HEAD/index/工作区是进程间共享单例）。D507 已落地 worktree-manager + D515 开工阻断 + D537 提交端阻断 + D329 会话专属 brief，但留三缺口：task-start 仍写全局 current-brief（CT-42 写侧未闭环）、worktree-manager create 零程序化生产调用、主仓未被只读化。本单补三缺口（派单口径"主仓只读化"强于 D507 §六"单 session 例外"）。
---

# D539 会话 worktree 隔离（session-worktree-isolation）

> 相关 D#: D507 / D515 / D537 / D329 / D539
> 主题: 并行协作架构治理——根治 M8 共享暂存区竞争 + M13 测试沙箱污染

## 决策（CTO 派单 + spec 口径）

1. **主仓只读化（dev）**：主工作区不再作为 dev 工作区。task-start.sh `_assert_dev_worktree` 检测主树（git-dir 不含 `/.git/worktrees/`）→ 非 `SYNO_ALLOW_MAIN=1` 即 exit 1 阻断并引导建 worktree。**强度 A 全只读**（强于 D507 §六推荐的 B 单 session 例外——按派单"主仓只读化"口径；若创始人改选 B 仅需改 `_assert_dev_worktree` 触发条件，机制不返工）。
2. **开工强制 worktree + 程序化接线**：task-start 阻断消息程序化引用 `worktree-manager.py` 路径（grep ≥1 生产调用点，铁律 0-2——此前仅 echo 消息"建议"、零程序化调用）。`--create-worktree <sid>` 时实际派发 `worktree-manager.py create`。
3. **会话专属 brief（CT-42 写侧闭环）**：task-start 写 `current-brief.<sid>`（`--session-id` > `DSH_SESSION_ID` > `basename(git branch)` > `TASK_ID`），**废除全局** `current-brief`；仅当 session-id 不可解析才回退全局（legacy 单 session，不静默）。attach.py `_run_current_brief_snapshot` 加**不 clobber**：`current-brief.<sid>` 已存在则不覆盖（尊重 task-start 权威写方）。
4. **attach.py 可加载修复**：`from __future__ import annotations`——本机 Python 3.9 下 `str | None`（PEP 604）运行时求值 TypeError，此前 attach.py 全程无法加载（CT-42 的 current-brief.<sid> 写入从未真正执行）。延迟注解求值（PEP 563）兼容 3.9，3.10+ 语义不变。

## 事实教训（M8 深化）

- 主树"干净"（无未提交改动）时 D515 并行守卫不拦——主树仍会被周期性当 dev 工作区（`feat/d505-impl` 即主树上落后 origin/main 447 commit 的活样本）。只读化在"开工端"根治，与 D537 #2"提交端"互补。
- **基线 = origin/main**：本地 main/feat/d505-impl 落后 origin/main 447 commit（本任务实测）。编码 session 开工前必须 `git checkout origin/main`（或基于 origin/main 建 worktree），禁止在 stale 主树实现——claim-verifier 环境差异检查（M7/M9 防漂移）。

## 防线映射

- 门禁落点: scripts/workflow/task-start.sh（`_assert_dev_worktree` / `_resolve_session_id`）+ scripts/control-tower/attach.py（不 clobber）
- 测试: tests/control-tower/session-worktree-isolation.test.sh（26 断言，含物理隔离 sha256）+ attach.test.sh（8 断言）
- 接线: `grep worktree-manager.py create scripts/workflow/task-start.sh` ≥1（生产调用点）；`grep current-brief.\$SESSION_ID` 命中
- 参考系: 第一性原理（一个 session 一个 worktree 是根治，全局单文件是病因）+ Anthropic（fail-closed、隔离可测、接线物理验证、契约优先）+ DSH（每 session 独立持久化上下文）。收敛：各参考系指向一致，无分歧。
