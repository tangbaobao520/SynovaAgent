# 控制塔 VERSION — 版本与变更记录

> 控制塔产品契约（设计文档 §2.6/§2.7）。版本只增不减；任何门禁/工具行为变化必须 bump（PATCH 起步）；bump 与代码同 commit。

## 版本规则

```
版本号: MAJOR.MINOR.PATCH
- PATCH (第三位): 小升级 — bug 修复/门禁微调 → 4.6.0 → 4.6.1
- MINOR (第二位): 中升级 — 新机制/新组件/新门禁组 → 4.6.0 → 4.7.0
- MAJOR (第一位): 大改版 — 架构重构/产品化里程碑 → 4.6.0 → 5.0.0
```

## V4.7.7 (2026-08-14) — D335 批次（防线闭环：提交端同步门禁 + synova.db 异地自动备份）

> PATCH bump — 门禁行为变化（新增提交端门禁）。创始人复核 D334 指出两个漏洞：
> ① 开工端仍是软机制（物理强制只在 push 端）② synova.db 数据无异地备份。
> 本批次: synova-commit 前置分支同步硬阻断 + launchd 每日 iCloud 备份。

- **变更**: PATCH bump — synova-commit 新增提交端同步门禁（过期基线禁止提交）；新增数据异地备份体系
- **D335 (防线闭环)**:
  - `scripts/control-tower/check-branch-sync.sh` — 提交端门禁：main 落后/分支基线过期/分叉 → 硬阻断并给修复命令；SYNO_SKIP_BRANCH_SYNC=1 逃生舱（记 degraded）；fetch 失败 fail-open 显式提示
  - `scripts/control-tower/synova-commit` — 挂载 check-branch-sync.sh（pre-commit 之前）——提交端与 push 端（D334 门禁 0）构成两端闭环
  - `scripts/backup/backup-db.sh` — sqlite3 .backup 一致性快照 + 原子落盘 + integrity_check + 14 份轮转 + 日志；默认目标 iCloud Drive
  - `scripts/backup/install-backup-launchd.sh` — launchd 每日 03:30 自动备份（crontab 在 Mac 被 TCC 拦，launchd 原生无需 root）
  - `CLAUDE.md` — 铁律 0-4 数据资产备份
- **测试**: branch-sync-guard.test.sh 11 用例 + backup-db.test.sh 9 用例（正常/降级/边界/接线，red→green 已证）
- **验证**: pre-commit 12 组 | as any = 0
- **作者**: DeepSeek Harness (D335)

## V4.7.6 (2026-08-14) — D334 批次（多机 PR 工作流：门禁 0 同步检查 + main 保护 + 协作规范落地）

> PATCH bump — 门禁行为变化（新增门禁 0）。事故驱动：2026-08-11~13 双机同分支交替 push，
> Mac tracking ref 过期 4 天误报 ahead、实际落后 11 commit，险些互相覆盖。创始人 2026-08-14
> 定案 PR 工作流（方案 A），本批次落地规范 + skill + 物理门禁。

- **变更**: PATCH bump — pre-push 新增门禁 0（push 前强制 fetch + 落后/分叉硬阻断 + main 直推保护）；门禁 3 改基从硬编码改为动态
- **D334 (多机 PR 工作流)**:
  - `pre-push-check.sh` — 门禁 0-1 同步检查（fetch 目标分支，落后/分叉 → 硬阻断并给修复命令）；门禁 0-2 main 直推保护（SYNO_ALLOW_MAIN_PUSH=1 逃生舱）；门禁 3 改基动态化（$PUSH_REMOTE/$PUSH_BRANCH 替代硬编码 origin/feat/prompt-architecture）
  - `install-hooks.sh` — pre-push entry 传 "$1" "$2"（remote 名/url，门禁 0 fetch 需要）
  - `docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md` — 协作规范（创始人 2 件事 + agent 开工/收工 5 步）
  - `.claude/skills/git-sync-pr/SKILL.md` — Claude Code skill
  - `CLAUDE.md` — 铁律 0-3 多机 PR 工作流
- **测试**: push-sync-guard.test.sh 13 用例（main 阻断/逃生舱/落后/分叉/同步/fail-open×2/接线×2，red→green 已证）
- **验证**: pre-commit 12 组 | as any = 0
- **作者**: DeepSeek Harness (D334)

## V4.7.5 (2026-08-13) — D333 批次（决策参考四步框架落地：brief 模板 Q1c + 注入器全文注入 + CLAUDE.md 引用）

> PATCH bump — 门禁行为变化（模板新增字段）。决策参考框架（创始人 2026-08-13 定，docs/synova/coordination/DECISION-REFERENCE.md）落地到任务启动流程：所有新 session 的 task brief 自动含 Q1c 决策参考系 + 注入器全文注入框架内容。D332 批次 V4.7.4 声明独占（未落地），本条目置顶为其补序（接力模式，D332 落地后由其后继补序）。

- **变更**: PATCH bump — 决策参考框架落地（模板/注入器/文档引用）
- **D333 (决策参考框架落地)**:
  - `generate-task-brief.py` — Q0 c) 决策 追加"冲突取舍 → 走 DECISION-REFERENCE 四步，结论写入 Q1c"；Q1 新增 `### c) 决策参考系`（四步框架 + 决策记录格式 `参考：Anthropic/DeepSeek + 结论`）
  - `inject-context.py` — parse_brief 增加 DECISION-REFERENCE 模式；该文档全文注入（无 E-XX/src 路径时不生成空壳块）
  - `doc-registry.json` — 注册 DECISION-REFERENCE → docs/synova/coordination/DECISION-REFERENCE.md
  - `CLAUDE.md` — 流程约束追加决策参考四步框架引用（新 session 必读）
- **测试**: brief-template-decision.test.sh 8 用例（red 11 失败 → green；模板/注入器/注册表/CLAUDE.md/版本五处物理验证）
- **验证**: pre-commit 12 组 | as any = 0
- **作者**: Claude (D333)

## V4.7.3 (2026-08-12) — D331 批次（D329 审计 P1 修复：tag 重指 + 防线补齐 + 接线落地）

> PATCH bump — 门禁行为变化（bug 修复）。D331 独占版本编排；D330 批次 V4.7.2 已落地（6c00e46+407ff1f），本条目置顶为其补序（D330 委托后继执行，内容零改动）。

- **变更**: PATCH bump — KIMI K3 D329 审计（2026-08-12，P1×2 + 关键 P2）修复
- **P1-1 (tag V4.7.1 孤儿)**: `git tag -f -a V4.7.1 dc369fd` 重指（amend 前身 f685fa0 不再指向，版本锚点恢复）+ pre-push 新增 **tag-祖先校验**（所有 `V\d+\.\d+\.\d+` tag 须为 HEAD 祖先，VERSION.md 最新版本 tag 存在且为祖先；孤儿/断裂 → 硬阻断）
- **P1-2 (dc369fd 无 bypass.log 记录)**: 新建 **check-bypass-log.sh** 对账（base..HEAD 提交 vs bypass.log HASH 条目；缺失 → 列出 + exit 1；SYNO_BASE_REF 注入缝）+ pre-push 门禁 7 接入 + ea1cb71/dc369fd 一次性补记
- **P2-5→P1 (guard 裸 python3 + `|| true` 吞崩溃)**: synova-commit staging-guard 调用改 **PYBIN 回退 + rc 捕获**（rc≠0 且 JSON status=block → 硬阻断；非 JSON → 显式 degraded 提示；python 不可用 → fail-open 显式提示）
- **P2-2 (resolver --session 零生产调用方)**: staging_guard 认领判定传 `--session`（生产唯一调用点，DS6 grep 物理证据）；D329 dev doc §5 接线升级（WIRE CHECK：测试调用不计入）
- **P2-1 (write-set 无 task_id)**: session_registry write-set 条目携带 task_id（继承 session）+ staging_guard 归属判定同任务互认（对齐 D329 dev doc §3.1 声称）

## V4.7.2 (2026-08-12) — D330 批次（D328 审计 P1 修复：python 损坏探测 + 豁免测试补全 + 文档回填）

> PATCH bump — 门禁行为变化（bug 修复）。D330 独占版本编排；D331 批次 V4.7.3 落地后由其补序（已由 D331 后继补序完成）。

- **变更**: PATCH bump — commit-msg 一致性门禁修复（KIMI K3 首审 2026-08-12，P1-1/P1-2 物理复现）
- **P1-1 (python 损坏静默漏拦)**: commit-msg-check.sh PYBIN 探测加**可用性验证**（`command -v` 只验存在性，Windows Store stub/损坏 shim 存在但执行即败 → GENUINE 静默归 0 → 劫持漏拦，当前树 shim 实测 2/6 败）；GENUINE 三态（0=无认领 / 1=有认领 / rc≠0=显式 degraded 提示）；resolver 失败 rc 捕获（broken-shim 下 resolver 内部 PYBIN 无可用性验证 → exit 1，此前静默跳过）
- **P1-2 (DS4 声称过度)**: Revert/无暂存补测试用例（原声称"四条豁免全部测试覆盖"仅 Merge/无 D# 有用例）
- **P2-2**: 用例 1 stage 8 文件（补 `.claude/task-briefs/D320-dashboard-gitify.md`，与 commit message 声明一致）
- **P2-1/P2-5**: D328 dev doc §3.2 回填 PYBIN 最终实现 + DS4 措辞修正；brief 路径笔误 `synova-commit.sh` → `synova-commit`
- **测试**: commit-msg-consistency.test.sh 10 用例（原 6 + Revert + 无暂存 + broken-shim degraded + broken-shim 劫持可追溯），red 10 过 2 败 → green 13/13
- **验证**: pre-commit 12 组 | audit 基线 439 FAIL 不变 | as any = 0
- **作者**: Claude (D330)

## V4.7.1 (2026-08-11) — D328+D329 批次（commit 一致性门禁 + session 身份独立化）

> 批次统一 MINOR bump——D328/D329 两个任务的行为变化合并为一个版本。版本编排由 D329 独占（D328 提交时未 bump）。

- **变更**: MINOR bump — 新机制（提交声明-内容一致性门禁 + session 身份独立化 + 认领制暂存区隔离 + current-brief 独立化）
- **D328 (commit 声明-内容一致性门禁)**: commit-msg-check 绑定"消息声明的 D#"与"暂存文件真实认领 brief 的 D#"——不一致 → 硬阻断（防 D320 式并行劫持，已随 ea1cb71 上线）
- **D329 (session 身份与暂存归属根治)**:
  - `synova-commit` — 删除 SESSION_ID 自动采用认领 brief（D320 劫持根因），缺省 `SESSION_ID=TASK_ID`（显式 --session-id 优先）；write-set 登记移到 staging-guard 通过之后（防 --files 预登记"洗白"他人文件）；register 的 brief 路径按 TASK_ID 前缀查找
  - `staging_guard.py` — 认领制硬校验：暂存文件被"真实认领 brief（Q2 include 命中）的 D# ≠ 本 session 任务 D#"认领 → block（own_set 判定之前，不依赖 registry 登记时序；精确 D# 相等，禁 startswith）
  - `session_registry.py` — register --task-id 绑定（session ↔ 任务 D#）
  - `resolve-commit-brief.sh` — 支持 `--session <sid>`（session 专属 current-brief 优先，无则回退全局）；内联 fallback 契约修复（parse_q2 返回 dict）
  - `attach.py` — SessionStart 写 `.claude/current-brief.<sid>`（session 专属 current-brief 的写入方）
  - `commit-msg-check.sh` — PYBIN 回退（D328 P2 折入: python3→python→py，全无 → 显式 degraded 提示）
  - `.claude/current-brief*` 去跟踪（.gitignore + git rm --cached，运行时产物）
- **测试**: staging-guard-session.test.py 10/10（劫持窗口/预登记绕过/精确匹配/resolver --session/PYBIN 回退/无 python 显式降级）
- **验证**: pre-commit 12 组 | audit 基线 439 FAIL 不变 | as any = 0
- **作者**: Claude (D329)

## V4.7.0 (2026-08-09) — D318+D319+D320 批次（git tag 自动化 + 双机身份 + 仪表盘 git 化）

> 批次统一 MINOR bump——D318/D319/D320 三个任务的行为变化合并为一个版本。版本编排由 D319 独占。

- **变更**: MINOR bump — 新机制（git tag 层 + 双机身份 + 仪表盘 git 化）
- **D319 (git tag 自动化)**: synova-commit 提交成功后自动为 VERSION.md 最新版本打 annotated tag + version.log 自动追加 + push --follow-tags；pre-push 新增门禁 6 附挂 tag 一致性检查（VERSION.md 最新版本必须已有对应 tag，否则硬阻断）；历史回填 V4.6.0/V4.6.1/V4.6.2 三个 annotated tags（c5d8d15/fdad612/5b93579）
- **测试**: tag-consistency.test.sh 12/12（red 10 失败 → green；V9.9.9 临时 repo 隔离 + SYNO_ 注入缝）
- **验证**: pre-commit 12 组 | audit 基线 439 FAIL 不变 | git ls-remote --tags origin 含新 tag
- **作者**: Claude (D319)

## V4.6.2 (2026-08-07) — D317 修复（G12b/brief 解析 CI 红）

> Codex 审计（SYNOVA-IMPL-D317）发现 D316 push 后 CI Iron Laws 红（run 31067628720）。缺陷 A 用 worktree 模拟 CI 干净检出完整复现。

- **变更**: PATCH bump — 门禁行为变化（回退过滤）
- **缺陷 A (P0)**: CI 干净检出（无 staged）时 resolver 最终回退按文件名日期前缀选最新 = D286（旧格式 criteria=null）→ G12b 硬阻断 → Iron Laws 红
  - resolver 最终回退改"最新日期→最早逐个 brief_parser 验证 criteria A-D，选第一个可解析"
  - 全部不可解析 / python 不可用 → exit 1（fail-open → G12b 跳过），绝不静默返回坏 brief
  - brief_parser 定位改脚本相对路径（$ROOT 指向临时 repo 时无解析器——测试隔离暴露）
- **缺陷 B (P1)**: PYBIN 跨平台回退（python3→python→py，全无 fail-open skip + degraded）——本机实测 python3 可用（WindowsApps shim），按防御性增强修复
- **测试**: resolve-commit-brief.test.sh 新建 11/11（red 5 失败 → green）；brief-parseable.test.sh 12/12（+4 断言）
- **验证**: worktree 模拟 CI 干净检出 pre-commit exit 0（修复前 exit 1）；audit 基线 439 FAIL 不变
- **作者**: Claude (D317)
- **关联 incident**: INC-20260802-stash（历史闭环案例）

## V4.6.1 (2026-08-05) — D316 修复（incident-loop 跨平台 + version.log 补写）

> Codex 审计（SYNOVA-IMPL-D316）发现 3 缺陷，逐一实测核实后修复。

- **变更**: PATCH bump — bug 修复（行为变化必须 bump）
- **缺陷 A (P1)**: incident-loop.py verify() 硬编码 `["bash",` — 纯系统 PATH（CI/任务计划/非 Git Bash 启动的 python）下 WinError 2 → verify 恒 degraded，学习闭环不可用
  - `_find_bash()` — shutil.which → Git 安装显式路径 → None（fail-open degraded）
  - `_bash_env()` — 自包含 subprocess 环境（Git bins + sys.executable 目录 + WindowsApps），hook 依赖链 bash/cat/python3 全部显式可达
  - 同款修复 attach.py `_run_parseable`（dev doc 遗漏，审计补漏）
  - 测试: 受限 PATH 断言（red degraded → green closed，8/8）
- **缺陷 B (P1)**: version.log 缺失 — 补写 4.6.0 首发 + 4.6.1 两条，五件套齐全
- **缺陷 C (P1)**: D313-D315 共 4 提交未推送 — 随本版本推送落库
- **P2-1**: hook-git-detect.test.sh EXIT trap 清窗（中断残留 → 下次首测失败）
- **关联 incident**: INC-20260802-stash（verify 闭环案例）
- **作者**: Claude (D316)
- **验证**: incident-loop 8/8 | hook-git-detect 13/13 | pre-commit 12 组 | 推送后 origin..HEAD 空

## V4.6.0 (2026-08-04) — 控制塔独立化正式首发

> M1-M5 全部落地 + 独立化底座 + 日志五件套 + 学习闭环。控制塔从"session 触发的脚本集合"升级为**独立常驻系统**（hook 轻量触发，不真常驻——常驻 daemon 延后到产品化阶段）。

- **变更**: 控制塔 V4.6.0 独立化完成（D311-D314 全部交付）
- **D313 (M3 brief 契约 + M5 编码)**:
  - `brief_parser.py` — 同源解析器库（Q2 include/exclude + #CRITERIA + 架构层 + Done；消灭 G12 awk vs resolve-commit-brief python 双副本，4 方共用）
  - `check-brief-parseable.sh` — 填完 brief 立即验证（#CRITERIA 必填/架构层/Done/模板自检）
  - `devdoc_writeset.py` + `check-dev-doc-write-set.sh` — 写集声明 vs 代码 grep（M3b）
  - `generate-task-brief.py` — 模板同源（`## 架构层:` 标题 + `#CRITERIA: A` 字段 + V4.6.0）
  - `check-silent-swallow.sh` — 静默吞错扫描器（level-0/1/2 + --strict/--utf8/--diff）
  - UTF-8 强制 — 47 个 .sh 头块 + 21 个 .py reconfigure + settings.json env 兜底
- **D314 (M4 基线豁免 + 独立化底座)**:
  - `verify-incremental.sh` L2 — tsc 基线豁免（baseline-check.sh --tsc，存量 28 不阻断新增阻断）
  - `verification-state.json` — M4b（全量 vitest ≤1 次/任务）
  - `control_tower_log.py` — 日志五件套写入器（runtime/gate/incident/degraded/version）
  - `attach.py` — SessionStart 轻量 attach（register + 日志 + self-health + parseable；<2s fail-open）
  - `self-health.py` — 控制塔自身健康五维（组件/信号/版本一致性/日志/资源）
  - `incident-loop.py` — 学习闭环（record/suggest/verify；INC-20260802-stash 已闭环可追溯）
  - settings.json — SessionStart + PostToolUse verify-incremental + env 块
- **验收**: §四 17 条全过（测试先行 6 套 48 断言 red→green；fail-open 实测；版本一致性实测；vitest ≤1；日志五件套；pre-commit 12 组无 --no-verify）
- **关联 incident**: INC-20260802-stash（D312 闭环）、INC-20260802-D300/D292/D286（D311 闭环）
- **作者**: Claude (D313+D314)
- **路线图（延后项）**: 常驻 daemon（产品化阶段）；CI 基线判定接线（ci-failures.json 只登记）；D309/D310 存量清理（_extinct 25 + admin-knowledge）；npm audit 决策；loop-score.sh 预存乱码修复

## 变更记录

### V4.6.0-WIP (2026-08-02) — D311 M1 多会话协调

- **变更**: 控制塔 V4.6.0 独立化第一阶段（M1 多会话协调）
- **关联 incident**: INC-20260802-D300（并行 session 覆盖 brief/暂存被卷走/中间态污染/空等 7h）、INC-20260802-D292（并行声明与实际写集不符）、INC-20260802-D286（"零共享"实为 15 个 src/ 文件重叠）
- **新增机制**:
  - `session_registry.py` — 会话注册表（register/write-set/claimants/attribution/gc/phase + fail-open + 损坏自愈 + 双层互斥）
  - `verify-parallel.sh` — 并行声明物理验证（dev doc 写集表解析/4 形态清洗/两两比对/fail-open）
  - `staging_guard.py` — 暂存区隔离（他人写集 → block；committed 忽略；杂散 → warn；fail-open）
  - `wait_manager.py` — 并行等待管理（CP1-CP4 阶段/错峰提示/依赖提示/等待显式化）
  - `pre-push-check.sh` — 门禁 3 改基（`origin/feat/prompt-architecture..HEAD`）+ 门禁 4 中间态警告 + 门禁 5 并行声明验证
  - `synova-commit` — 新增 `--session-id` + staging-guard 硬阻断 + 显式路径 commit + 写集 committed + 阶段 CP4
  - `VERSION.md` — 本文件（控制塔产品契约起点；正式首发在 D314）
- **写集表格式契约**（verify-parallel 依赖，未来 dev doc 必须遵守）:
  - 写集表标题: `### N.N 写集 (N 修改 + M 新建)`（正则 `^#{2,4}\s*\d+(\.\d+)*\s*写集`）
  - 表头: `| 文件 | 操作 | 说明 |`，第一列支持: 纯路径 / `[text](url)` 链接 / 行号后缀 `L750` / 计数 `(N 个)` / 目录级（`/` 结尾）
- **验证**: session-registry 12/12 | verify-parallel 13/13 | staging-guard 8/8 | wait-manager 7/7 测试通过
- **作者**: Claude (D311)

### V4.6.0-WIP (2026-08-03) — D312 M2 hook×git 兼容 + 官方基线工具 + U4

- **变更**: 控制塔 V4.6.0 独立化第二阶段（M2 + U4 脚本清理）
- **关联 incident**: INC-20260802-stash（git stash/pop 间隙被 hook 写文件 → pop 冲突，39 tracked + 615 untracked 卷入）
- **新增机制**:
  - `hook-git-guard.sh` — git 操作写窗口守卫库（git_op_window_active/enter/exit + TTL 300s + 标记文件 + fail-open）
  - `hook-git-detect.sh` — PreToolUse(Bash)+PostToolUse(Bash) hook（classify_command → stash/gitop/none；ban-stash 提示；写/清窗口；exit 0 永不阻断）
  - `baseline-check.sh` — 官方基线工具（tsc/测试失败/审计三基线；快照基线法存量 vs 新增；--seed/--update-baseline/--json；SYNO_ 注入缝；fail-open）
  - `settings.json` + `.codex/hooks.json` — 新增 Bash matcher（Claude + Codex 双侧防护）
  - `hook-block-write.sh` / `hook-check-memory.sh` — source guard + SKIP_HOOK_WRITES 包裹仓库内写点（L37/L39/L323/L118/L136-144；/tmp 证据保留）
  - AGENTS.md — 铁律 0-3 禁止 git stash（替代方案: baseline-check / worktree / synova-commit）
- **修复**: U4 — pre-commit-check.sh 分母统一 /12（10 处）+ 头部注释 9→12 组
- **验证**: baseline-check 13/13 | hook-git-detect 13/13 | ban-stash 6/6 测试通过；真实 seed 28 条 tsc 存量 → "存量 28 + 新增 0"
- **作者**: Claude (D312)
- **正式首发**: D314（含日志五件套/自身健康/daemon 轻量触发）
