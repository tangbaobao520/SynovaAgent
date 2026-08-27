# Task Brief: D540 clone-pilot-shadow-commit

> 生成: 2026-08-27 | 任务: D540 | 认领: DeepSeek Harness（编码 session）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D540-clone-pilot-shadow-commit-20260827.md（唯一契约）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
本任务属控制塔（scripts/control-tower + scripts/hooks + scripts/workflow + CI，L0 工具层，非五层产品）。该层已有 D521（提交链收敛）、D537（并行污染 + 提交链摩擦）、D539（worktree 隔离）、D515/D516（门禁瘦身 + CI strict）。本任务把隔离机制从 worktree 升格为独立 clone + 影子提交 clone 环境验证 + verify-parallel 移 CI/PR。零新增组件（复用 install-hooks.sh / verify-parallel.sh）。
### b) 文件审计
- scripts/install-hooks.sh — 加 `_ensure_clone_git_config`（幂等 identity/quotepath/credential-helper，clone 后一次）——影子提交前置。
- scripts/control-tower/verify-parallel.sh — 加 `--ci-pr <base>` 模式（base..head 写集 × 已合写集比对）。
- scripts/pre-push-check.sh — 门禁5 去 `--scan-today` 强阻断 → 软提示「已移 CI/PR」。
- .github/workflows/ci.yml — quality job 加 verify-parallel `--ci-pr` 步骤（fetch-depth:0 已确认）。
- scripts/workflow/post-merge-cleanup.sh — 删除（铁律 37 死代码 + 影子提交已覆盖）。
- tests/control-tower/clone-config-init.test.sh — 新建（L1 沙箱：配置初始化幂等/缺失才写/env/覆盖未动/降级）。
- tests/control-tower/clone-shadow-commit.test.sh — 新建（影子提交 clone 集成 harness，真实沙箱 git + 真实 hook 链）。
- tests/control-tower/verify-parallel-ci.test.sh — 新建（L1 沙箱：--ci-pr block/pass/degraded + 接线）。
### c) 决策
影子提交机制已恢复（D537 #4，post-commit.sh L69-84）→ 不改 post-commit.sh/synova-commit（D530 二次覆盖风险）；clone 配置初始化放 install-hooks.sh（clone 后一次，幂等）；verify-parallel 迁移改 pre-push + ci.yml + verify-parallel.sh 三处；删除 post-merge-cleanup.sh（loop-score 检查存在项自然计 0）。无冲突，直接接线。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界：`git clone` 是 git 官方「完全隔离工作区」最小原生机制（独立 .git 对象库 + index + HEAD + 提交历史）。clone 后标准初始化 = user.name/email（或 global）+ core.quotepath=false + credential helper —— 三步缺一不可。
b) 顶级团队做法（DSH 借鉴理念级，不 copy 代码）：DSH per-session 独立持久化存储，对应我们每 session 独立 clone（独立 .git/index）与 per-clone current-brief/session-registry。无 DSH 源码移植、无 npm install。
c) memory/ 教训：M8 共享暂存区竞争（4 次复发）、M13 测试沙箱污染真实仓库（本任务所有测试走 mktemp + SYNO_* 注入）、D537「改共享 hook 先看全历史段落」（本任务不改 post-commit 的依据）、claim-verifier「必须 git show origin/main 读权威版」（本任务基线 origin/main，禁凭 stale feat/d505-impl 记忆）、D530 重写 post-commit 丢影子提交段（本任务不改机制本体）。
参考：Anthropic（fail-closed + 隔离可测 + 接线物理验证 + 契约优先 + 幂等配置）+ 第一性原理（独立 clone 是共享 .git 的根治；影子提交是身份缺失降级，幂等配置前置是治本）+ DeepSeek（最少机制/零新组件）+ DSH（每 session 独立持久化上下文）。收敛：各参考系指向一致，本任务五必答题依赖序一致，无分歧。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/install-hooks.sh — `_ensure_clone_git_config`（幂等：local 未设才写默认，已设不覆盖；env 可覆盖；配置失败 degraded 不阻断 hooks 安装）
- scripts/control-tower/verify-parallel.sh — `--ci-pr <base>`：base..HEAD 写集 × origin/main 已合写集比对（排除 PR 自身 doc），exit 1=重叠 / 0=无交集 / 2=内核异常 degraded
- scripts/pre-push-check.sh — 门禁5 去 `--scan-today` 强阻断（不再 exit 1 拦推送），改软提示 + 脚本缺失探针
- .github/workflows/ci.yml — quality job 加 verify-parallel `--ci-pr`（docs-only 跳过）
- scripts/workflow/post-merge-cleanup.sh — 删除（铁律 37）
- tests/control-tower/clone-config-init.test.sh — 新建（配置初始化幂等/缺失才写/env/覆盖未动/降级）
- tests/control-tower/clone-shadow-commit.test.sh — 新建（影子提交 clone 集成 harness，物理断言 C1-C4）
- tests/control-tower/verify-parallel-ci.test.sh — 新建（--ci-pr block/pass/degraded + 接线）
- .claude/task-briefs/2026-08-27-D540-clone-pilot-shadow-commit.md — 本任务 brief（Gate 0）

不做什么：
- 不改 src/（产品代码，铁律红线；src/server.ts src/store/ src/sentinel/ src/routes/ 均只读）
- 不改 scripts/audit/（K3 专属红线，违反 = 事故）
- 不改 scripts/pre-commit-check.sh（13 组门禁本体，D515/D516/D537 锁定）
- 不改 scripts/hooks/post-commit.sh / scripts/control-tower/synova-commit（机制已恢复，改动有 D530 二次覆盖风险——只验证不动机制）
- 不改 scripts/control-tower/worktree-manager.py（D307 已交付、试点期保留）
- 不改 scripts/workflow/task-start.sh（D539 主树阻断已在；引导目标转 clone 是文档化，若 K3 判定需改引导文本 → 单列 CTO 审）
- 不改 scripts/workflow/loop-score.sh（引用 post-merge-cleanup.sh 检查存在项，删除后计 0 合理）
- 不新增独立守护进程/服务/launchd/DSH 依赖（派单红线：零新组件）

## Q3: 验收 — 入口 → 交互 → 结果
入口：编码 session 在独立 clone 中跑真实 `git commit`/`synova-commit`。
处理：install-hooks.sh 配置初始化把 identity/quotepath/credential 配好 → commit 走真实 hook 链（pre-commit 写 marker → PASS_WAY≠0 → post-commit 追加 COMMITTED + 生成影子提交）→ bypass.log 含 COMMITTED + 影子提交随 PR 进 main（union 合并）。
结果：影子提交在 clone 环境照常（identity 前置，L87 降级路径被堵）；verify-parallel 移到 CI（本地不再强阻断，CI 权威物理拦截）；主工作区单写者（编码一律 clone）；协调文件 git 同步边界清晰；post-merge-cleanup.sh 删除后 grep 零引用。

## 架构层:
L0（控制塔工具层，脚本/钩子 + CI + 文档）

## Done 标准
- [x] verify: bash tests/control-tower/clone-config-init.test.sh — 全过（幂等/缺失才写/env 覆盖/已有不覆盖/降级 5 断言物理可复现）
- [x] verify: bash tests/control-tower/clone-shadow-commit.test.sh — 全过（identity 配置→真实 commit→COMMITTED+影子提交+树干净；无 identity→L87 降级消息断言；防递归；隔离指纹）
- [x] verify: bash tests/control-tower/verify-parallel-ci.test.sh — 全过（--ci-pr block/pass/degraded + 接线 grep）
- [x] verify: grep -rn "_ensure_clone_git_config" scripts/install-hooks.sh — 命中（生产调用，非测试）
- [x] verify: grep -rn "\-\-ci-pr" .github/workflows/ci.yml — 命中（CI 生产调用点）
- [x] verify: grep -rn "\-\-scan-today" scripts/pre-push-check.sh — 不再 exit 1（门禁5 软提示）
- [x] verify: ls scripts/workflow/post-merge-cleanup.sh — 不存在（git rm）+ grep 零引用
- [x] verify: bash -n scripts/install-hooks.sh scripts/control-tower/verify-parallel.sh scripts/pre-push-check.sh — 语法过
