# Task Brief: D539 session-worktree-isolation

> 生成: 2026-08-27 | 任务: D539 | 认领: DeepSeek Harness（编码 session）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
本任务属控制塔（scripts/control-tower + scripts/workflow，L0 工具层，非五层产品）。该层已有 D307/SessionRegistry 基线。本任务加固/接线现有机制（主仓只读化 → 强制 worktree → 会话专属 brief），不新增组件。
### b) 文件审计
- scripts/workflow/task-start.sh — D515 并行阻断 + D513 全局 current-brief 写（write set 主改）。
- scripts/control-tower/attach.py — D329 `_run_current_brief_snapshot` 写 current-brief.<sid>（write set 兼容）。
- scripts/control-tower/worktree-manager.py — D307 create/finish/list/status，零程序化调用（接线点）。
- scripts/workflow/resolve-commit-brief.sh + scripts/control-tower/session_registry.py — 读侧/信号源（复用不改）。
### c) 决策
主树只读化用 task-start 内检测（最少机制，hook-block-write.sh 语义是"brief 未填拒写代码文件"，不同层）。直接接线 D307 worktree-manager.py。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界：git worktree 是 git 官方"并行开发物理隔离"最小原生机制（独立 HEAD/index/工作区，零拷贝）。
b) DSH 借鉴（理念级，不 copy 代码）：@deepseek-ai/dsh-session 每 session 独立 id + 独立持久化存储，对应我们 current-brief.<sid> 每 session 独立文件。
c) memory/ 教训：M8 共享暂存区竞争（4 次复发）、M13 测试沙箱污染真实仓库（本任务所有测试走 mktemp + SYNO_* 注入）、CT-42 current-brief 会话专属接线（写侧未闭环）、D307 "已落地"零程序化调用（铁律 0-2 接线失败活例）。
参考：Anthropic（fail-closed + 隔离可测 + 接线物理验证 + 契约优先）+ 第一性原理（一个 session 一个 worktree 是根治，全局单文件是病因）+ DSH（每 session 独立持久化上下文）。收敛：各参考系指向一致，无分歧。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/workflow/task-start.sh — 新增 _resolve_session_id/_assert_dev_worktree，写 current-brief.<sid> + 废除全局，程序化引用 worktree-manager.py create
- scripts/control-tower/attach.py — `_run_current_brief_snapshot` 加"已存在则不 clobber"，加 from __future__ import annotations（Python 3.9 可加载）
- tests/control-tower/session-worktree-isolation.test.sh — 新建 L1 沙箱测试（session-id 解析/废除全局/主树阻断/放行/豁免/物理隔离 sha256）
- tests/control-tower/attach.test.sh — 新建 attach.py 配对测试（不 clobber/可加载）
- tests/control-tower/task-start-parallel.test.sh — 场景B 加 SYNO_ALLOW_MAIN=1（D539 主仓只读化下仍测 D515 并行守卫语义）

不做什么：
- 不改 src/（产品代码，铁律红线；src/store/、src/sentinel/、src/server.ts 均只读）
- 不改 scripts/audit/（K3 专属，红线）
- 不改 scripts/pre-commit-check.sh（门禁本体已由 D537 #2 拦提交端；除非 CTO 单独审）
- 不改 scripts/workflow/hook-block-write.sh（PreToolUse 写文件阻断，与"必须在 worktree 开工"不同层）
- 不改 scripts/control-tower/worktree-manager.py 的 create/finish 逻辑（D307 已交付，本单只接线）

## Q3: 验收 — 入口 → 交互 → 结果
入口：session 在仓库开工（bash scripts/workflow/task-start.sh "..."）或提交（git commit）。
处理：task-start 检测当前 worktree → 主树 = 阻断 + 引导建 worktree；session 专属 brief 写 current-brief.<sid>；worktree 内提交放行。
结果：主树不再被当 dev 工作区；并行 session 各自独立 worktree 互不覆盖；session 专属 brief 不被全局冲掉。

## 架构层:
L0（控制塔工具层，脚本/钩子）

## Done 标准
- [x] verify: bash tests/control-tower/session-worktree-isolation.test.sh — 全过（隔离/阻断/接线 三断言物理可复现，含 sha256 指纹）
- [x] verify: bash tests/control-tower/attach.test.sh — 全过（不 clobber + 可加载）
- [x] verify: grep -c "worktree-manager.py create" scripts/workflow/task-start.sh — ≥1（接线生产调用点）
- [x] verify: grep 'current-brief\.\$SESSION_ID' scripts/workflow/task-start.sh — 命中（会话专属写，CT-42 闭环）
- [x] verify: bash -n scripts/workflow/task-start.sh && python3 -c "import ast;ast.parse(open('scripts/control-tower/attach.py').read())" — 语法过
