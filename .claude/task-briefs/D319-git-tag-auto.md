# Task Brief: D319 git tag 自动化

> 生成: 2026-08-09 | 分支: feat/prompt-architecture | 优先级 P1
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D319-git-tag自动化-20260808.md
> 权威文档: .codex/control-tower/VERSION.md 版本规则 + AGENTS.md 铁律 35

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔（.codex/control-tower + scripts/control-tower）已独立化（V4.6.0 首发）。版本事实目前只写在 VERSION.md/version.log，git 仓库 0 个 tag（实测 `git tag` 空）→ 双机/看板无法以 git 为权威取版本，`git describe` 不可用。本任务补齐 git tag 层：synova-commit 提交成功后自动为 VERSION.md 最新版本打 annotated tag + version.log 自动追加 + pre-push 门禁新增 tag 一致性检查 + 历史回填 V4.6.0/V4.6.1/V4.6.2。版本编排由本任务独占：VERSION.md 追加 V4.7.0（批次 D318+D319+D320 统一 MINOR bump）。
### b) 文件审计
- scripts/control-tower/synova-commit：grep 全文件无 VERSION/tag/bump（实测确认），提交成功路径（L409-450）无 tag 步骤 → 扩展
- scripts/pre-push-check.sh：现有 6 道门禁（secrets/golden-case/vitest 改基/中间态/并行/基线），无版本/tag 检查 → 附挂门禁 6
- scripts/control-tower/control_tower_log.py：version 子命令已实现（L125-126/L94 log_version），写入 version.log，支持 SYNO_CT_DIR 注入 → 直接复用，不改
- .codex/control-tower/VERSION.md：追加 V4.7.0 条目（批次统一版本）
- .codex/control-tower/logs/version.log：gitignore 运行时产物（已确认），无需暂存
- tests/control-tower/：baseline-check.test.sh/resolve-commit-brief.test.sh 为临时 repo + 断言函数模式 → 新测试遵循
### c) 决策
版本权威 = VERSION.md 最新 `## V4.x.y` 标题 → 唯一 tag 来源。已有覆盖（log_version 命令）→ 复用。无冲突。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 0-2 测试先行：tests/control-tower/tag-consistency.test.sh 先 red（修复前失败）后 green
- 铁律 24+31 降级：pre-push 检查 VERSION.md 缺失/VERSION.md 无版本标题 → fail-open 不硬阻断，带提示
- 铁律 35 自动化优先：打 tag 进 synova-commit 代码，不靠人工 review 记忆
- 铁律 33 测试命名：*.test.sh 单元测试
- memory/2026-08-05：current-brief 须完整文件名；Q2 行禁全角括号紧贴路径
- memory/2026-08-06：subprocess 调 bash 须自包含环境——测试内调用 control_tower_log.py 用显式 python3 路径 + SYNO_CT_DIR 隔离
- annotated tag（git tag -a）带作者/消息，审计可溯（dev doc §3.3 不做轻量 tag）
- git push --follow-tags：一次推送提交 + 新 tag

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/synova-commit
- scripts/pre-push-check.sh
- .codex/control-tower/VERSION.md
- tests/control-tower/tag-consistency.test.sh
- .codex/control-tower/logs/version.log（运行时产物，gitignore 不暂存）
不做什么（含文件路径）：
- 不改 scripts/control-tower/control_tower_log.py（version 命令已存在，直接复用）
- 不改 scripts/install-hooks.sh（D318 独占）
- 不改 docs/synova/DASHBOARD.md（D320 独占）
- 不改 src/server.ts（src/ 全部归其他任务）

## Q3: 验收 — 入口 → 交互 → 结果
入口：synova-commit 提交成功路径（commit 成功后自动触发）| bash scripts/pre-push-check.sh（push 前）
处理：读 VERSION.md 最新 `## V4.x.y` → 无 tag 则 git tag -a + control_tower_log.py version 追加 → push --follow-tags；pre-push 校验 VERSION.md 最新版本有对应 tag
结果：bump 后 git tag -l 含新版本（annotated）；version.log 尾行 = 新版本记录；VERSION.md 改版本不打 tag → pre-push exit 1 硬阻断

## 架构层: 基础设施
控制塔脚本层（scripts/control-tower + scripts/pre-push-check.sh），不涉及 L1-L5 产品代码。

## Done 标准
- [ ] DS1: bash tests/control-tower/tag-consistency.test.sh 全过（≥4 用例）exit 0
- [ ] DS2: bash scripts/check-plan-integrity.sh 通过（排除项无被改文件）
- [ ] DS3: bash scripts/pre-commit-check.sh 全部 12 组通过 exit 0
- [ ] DS4: git tag -l 含 V4.6.0/V4.6.1/V4.6.2（历史回填）+ git for-each-ref refs/tags --format='%(objecttype)' 输出含 tag
- [ ] DS5: .codex/control-tower/VERSION.md 含 "## V4.7.0" 标题
- [ ] DS6: grep "git tag\|V4.7.0\|follow-tags" scripts/control-tower/synova-commit scripts/pre-push-check.sh 有结果（接线物理证明）
