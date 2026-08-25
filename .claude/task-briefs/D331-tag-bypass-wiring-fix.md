#CRITERIA: A
## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent + 控制塔治理体系（增长导航系统：诊断是手段，增长是目的）。本任务 = KIMI K3 对 D329（dc369fd）审计的 P1 修复（D331，dev doc SYNOVA-IMPL-D331）。
审计发现 5 缺陷：P1-1 tag V4.7.1 指向孤儿提交 f685fa0（amend 前身，非 dc369fd 祖先）；P1-2 dc369fd 无 bypass.log 记录（amend 绕过 synova-commit 的 COMMITTED 记录，无对账机制）；P2-5→P1 synova-commit L367 裸 python3 + `|| true` 吞 guard 崩溃；P2-2 resolver --session 零生产调用方；P2-1 write-set 条目无 task_id（dev doc 声称未实现）。
### b) 文件审计
- pre-push-check.sh 已有 D319 check_tag_consistency（SYNO_TAG_ONLY 注入缝）→ 同构新增 D331 tag-祖先校验
- post-commit.sh 只做 bypass 检测不写 COMMITTED 记录（记录由 synova-commit 写）→ 对账脚本补位
- synova-commit L367 guard 调用、无 resolver 直接调用（生产 resolver 调用方 = staging_guard.py + commit-msg-check.sh）
- session_registry.py register 已有 task_id，write_set.add 未带
- 复用 D329 的 PYBIN 模式（resolve-commit-brief.sh / commit-msg-check.sh）
### c) 决策
按 dev doc §3.1 写集 6 修改 + 2 新建 + 1 操作执行。D330（V4.7.2）未落地 → V4.7.3 条目置于当前顶部，D330 落地后由其后继任务补序。

## 文档引用
- SYNOVA-IMPL-D331-D329审计P1修复-20260812.md：权威 dev doc（写集 §3.1 / 修复模式 §3.2 / 测试表 §4 / DS1-DS12 §6）
- SYNOVA-IMPL-D329-session身份与暂存归属根治-20260810.md：本任务 §5 接线升级目标
- AUDIT-PROTOCOL.md：L3 执行审计 / L4 缺口收割（tag-祖先 / bypass 对账 / WIRE CHECK）
- AGENTS.md：铁律 24/31（降级显式）、铁律 4（接线）

## 接口审计
- scripts/pre-push-check.sh：check_tag_consistency 函数（D319，SYNO_TAG_ONLY 注入缝）— 同构新增 D331 tag-祖先检查
- scripts/control-tower/synova-commit L367：`GUARD_OUT=$(python3 "$STAGING_GUARD" --session-id ... --staged $STAGED_LIST 2>&1 || true)` — 替换为 PYBIN + rc 捕获
- scripts/control-tower/session_registry.py write_set() L252-280：add 分支无 task_id — 携带 session 的 task_id
- scripts/control-tower/staging_guard.py check_staging() L64-98：subprocess resolver 调用无 --session — 传 session_id；L112-152 registry 归属判定用 session_id — 改 task_id
- scripts/workflow/resolve-commit-brief.sh L35-42：--session <sid> 已实现（D329）— 生产调用方补齐
- .claude/bypass.log：COMMITTED 记录格式 `COMMITTED | pre-commit PASS | TASK_ID=.. | AGENT=.. | HASH=<40>`

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 24/31：异常处理必有 log/degraded，绝不静默；`|| true` 吞崩溃 = 静默降级（D328 P1-1 同型，本次升级 P1 根治）
- 铁律 4/5：机制建成必须接线到生产调用方（L4-3 WIRE CHECK 升级：grep 验证 ≥1 真实调用点，测试调用不计）
- memory 教训：synova-commit 用 pathspec 提交（`-- "${FILES[@]}"`），amend 会绕过 synova-commit 的 tag 自动创建与 COMMITTED 记录 → 版本锚点断裂 + 证据链缺失；改完 tag/记录必须显式同步
- 测试优先（铁律 0-2/48）：≥8 用例 red→green；SYNO_ 注入缝隔离

## Q2: 范围 — 正确的最简方案是什么？

MVP 边界: 只做 dev doc §3.1 写集 6 修改 + 2 新建 + 1 操作 + version.log 运行时追加。

做什么（严格按 dev doc §3.1 写集）：
- scripts/control-tower/check-bypass-log.sh：新建。bypass.log 对账（对比 base..HEAD 提交与 bypass.log HASH 条目，缺失 → 列出 + exit 1；SYNO_BASE_REF 注入缝）
- scripts/pre-push-check.sh：修改。新增 D331 tag-祖先校验（所有 V\d+\.\d+\.\d+ tag 须为 HEAD 祖先 + VERSION.md 最新版本 tag 存在且为祖先）+ bypass 对账门禁调用
- scripts/control-tower/synova-commit：修改。guard 调用 PYBIN 回退 + 捕获 rc（block JSON 按 block 处理；崩溃 → 显式 degraded，不 `|| true` 吞）
- scripts/control-tower/session_registry.py：修改。write-set 条目携带 task_id（继承 session 的 task_id）
- scripts/control-tower/staging_guard.py：修改。认领制判定调 resolver 传 --session（对齐生产调用）；write-set 归属判定用 task_id
- docs/plans/codex/implementation/SYNOVA-IMPL-D329-session身份与暂存归属根治-20260810.md：修改。§5 接线升级（生产调用方必须传 --session，grep ≥1 真实调用点；记录 D331 修复）
- tests/control-tower/tag-bypass-wiring.test.sh：新建。tag-祖先 + bypass 对账 + --session 接线 + write-set task_id 四合一 ≥8 用例
- .codex/control-tower/VERSION.md：修改。追加 V4.7.3（PATCH，D329 审计 P1 修复）
- 操作：git tag -f V4.7.1 dc369fd（tag 重指）；version.log 追加 4.7.3

不做什么（含文件路径）：
- 不改 scripts/control-tower/commit-msg-check.sh（D330 独占 V4.7.2 内容；本次不改其 resolver 调用——commit-msg hook 无 session 上下文）
- 不改 scripts/hooks/post-commit.sh（对账机制以独立脚本 + pre-push 门禁落地）
- 不重写已推送历史（D317 前提交不回改）
- 不改 scripts/control-tower/control_tower_log.py（只运行 version 子命令）
- 不改 .claude/current-brief 内容本身（运行时产物，去跟踪状态保持）

## Q3: 验收 — 入口 → 交互 → 结果
入口（从哪触发）：pre-push 提交推送（tag-祖先 + bypass 对账门禁）；synova-commit 提交（guard PYBIN）；staging_guard.py 认领判定（--session 传递）；session_registry write-set 登记（task_id）
处理（中间步骤）：tag 重指 V4.7.1 → dc369fd；check-bypass-log.sh 对比 base..HEAD；guard 崩溃 → 显式 degraded 提示
结果（最终展示）：DS1-DS12 全过；`git rev-parse V4.7.1^{}` == dc369fd；`rg -n "resolve-commit-brief.sh.*--session" scripts/` ≥1 命中；registry write-set 条目含 task_id；12 组 pre-commit 全过无 --no-verify；推送后 `git log origin/feat/prompt-architecture..HEAD` 为空

## 架构层: 基础设施
（pre-push/synova-commit 门禁修复，L1-L5 之外；五层架构无涉）
## Done 标准
- [ ] DS1: tests/control-tower/tag-bypass-wiring.test.sh 全过（≥8 用例；red 已证）
- [ ] DS2: git rev-parse V4.7.1^{} == dc369fd（tag 重指生效）
- [ ] DS3: pre-push tag-祖先校验：孤儿 tag / 版本 tag 非祖先 → 硬阻断 exit 1
- [ ] DS4: bash scripts/control-tower/check-bypass-log.sh 对新提交缺失列出 + exit 1；正常提交 exit 0
- [ ] DS5: synova-commit guard 用 PYBIN（python3 缺失回退）+ 执行失败显式 degraded（不静默）
- [ ] DS6: rg -n "resolve-commit-brief.sh.*--session" scripts/ 命中 ≥1 生产调用点
- [ ] DS7: registry write-set 条目含 task_id（对齐 D329 dev doc §3.1）
- [ ] DS8: D329 dev doc §5 接线升级已记录（生产调用点要求）
- [ ] DS9: VERSION.md 含 V4.7.3 + version.log 追加（同 commit）
- [ ] DS10: 全量审计 python scripts/audit/audit-check.py --full 与基线一致（439 FAIL）+ as any=0
- [ ] DS11: 真实提交环境 12 组 pre-commit 全过、无 --no-verify、git diff --name-only 与写集一致
- [ ] DS12: 推送 + CI 验证（D328/D329/D330 与本任务提交推送后 git log origin..HEAD 为空；CI 相关 job 全绿；tag V4.7.1 随推送同步指向 dc369fd）
