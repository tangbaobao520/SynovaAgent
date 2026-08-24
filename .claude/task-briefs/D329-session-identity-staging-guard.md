# Task Brief: D329: session 身份独立化 + staging-guard 认领制 + current-brief 独立化（RC-2/RC-3 根治）

> 生成: 2026-08-11 13:39:40 | 分支: main | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统（组织数字孪生诊断 + 持续增长导航系统）。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.5.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
D320 劫持事故（8 文件被并行 D318 session 提交吞走）的第二层根因根治。基础设施（控制塔）三处缺陷：
- 缺陷 A (P0): synova-commit L297-305 SESSION_ID 缺省时自动采用认领文件的 brief 身份 → staging_guard 把被偷文件当"自己的"→ pass。guard 机制上无法识别劫持。
- 缺陷 B (P1): 写集登记在提交时才发生（staging→commit 窗口盲区），且 staging_guard 自身异常 fail-open 静默。
- 缺陷 C (P1): .claude/current-brief 全局单文件，三并行 session 互相覆盖（实测 M 状态）。
- 缺陷 D (P2, D328 审计折入): commit-msg-check.sh L58 GENUINE 判定用裸 python3，无 PYBIN 回退 → 无 python3 机器上门禁静默失效。
本任务：session 身份独立化 + staging-guard 认领制 + current-brief 独立化 + PYBIN 加固。控制塔脚本（基础设施层），不触五层架构代码。

### b) 文件审计
- scripts/control-tower/synova-commit：L297-305 身份自动采用（缺陷 A 所在）；write-set 登记在 guard 之前（预登记洗白）。
- scripts/control-tower/staging_guard.py：L86-87 own_set 放行 + L112-116 fail-open；无认领制判定。
- scripts/control-tower/session_registry.py：register 无 --task-id 绑定。
- scripts/workflow/resolve-commit-brief.sh：无 --session 支持（D317 已标准化 PYBIN 回退，本任务对齐）。
- scripts/control-tower/attach.py：SessionStart 写入方，未写 session 专属 current-brief。
- scripts/commit-msg-check.sh：L58 裸 python3（D328 交付，D328 审计 P2）。
- .claude/current-brief：全局单文件已跟踪（M 状态，多 session 覆盖实测）。
- .codex/control-tower/VERSION.md：V4.7.0（D319 编排），本任务追加 V4.7.1。
- .gitignore：无 current-brief* 忽略规则。

### c) 决策
D328 已交付 commit 声明-内容一致性门禁（ea1cb71），本任务折入其审计 P2（commit-msg-check PYBIN）。G12 范围校验改造已在 D328 覆盖 → 不做。hook 双重执行 → D331 独立任务 → 不做。改前 grep-refs.sh 前置（铁律 9）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC — dev doc SYNOVA-IMPL-D329 §3-§6（写集/修复模式/测试要求/完成标准已批准）
② 测试 — tests/control-tower/staging-guard-session.test.py 新建（≥5 用例，劫持复现 red 基准先行）
③ 实现 — synova-commit（身份=TASK_ID + 登记后移）→ staging_guard.py（认领制）→ session_registry.py（--task-id）→ resolve-commit-brief.sh（--session）→ attach.py（写 current-brief.<sid>）→ commit-msg-check.sh（PYBIN）→ .gitignore + git rm --cached → VERSION.md/version.log V4.7.1
④ 接线 — 真实仓库验证：synova-commit 无显式 --session-id 时身份不自动采用；staging-guard 认领制拦截劫持；current-brief.<sid> 优先
⑤ 验证 — DS1-DS9 全链 + 自检 6 问
#CRITERIA: A

### c) 文档引用
权威文档: docs/plans/codex/implementation/SYNOVA-IMPL-D329-session身份与暂存归属根治-20260810.md（§2 代码审计/§3 实现方案/§4 测试/§6 完成标准）
来源设计: docs/plans/codex/strategy/SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md（M1b 暂存区隔离）
依赖交付: D328 commit ea1cb71（commit-msg-check.sh，本任务折入其审计 P2: 裸 python3 → PYBIN 回退）
历史教训: memory/parallel-session-commit-hijack.md（D320 劫持 — 写集被并行 D318 commit 吞走 8 文件）、memory/2026-08-10-D328-commit-consistency-gate.md（门禁 fail-open 须显式 degraded）

### d) 接口审计（从代码 grep，不凭记忆）
- scripts/control-tower/synova-commit:SESSION_ID 解析块 L297-305（RESOLVED_BRIEF → SESSION_ID 赋值，缺陷 A 所在）
- scripts/control-tower/synova-commit:register --brief ".claude/task-briefs/${SESSION_ID}.md"（L340，与 TASK_ID 前缀匹配改造）
- scripts/control-tower/synova-commit:write-set --add（L343，移到 staging-guard 通过之后）
- scripts/control-tower/staging_guard.py:check_staging（L39-117；own_set 放行 L86-87；fail-open L112-116）
- scripts/control-tower/staging_guard.py:main --session-id/--staged（L128-140）
- scripts/control-tower/session_registry.py:register（L213-231，加 --task-id）；write_set（L245-267）
- scripts/workflow/resolve-commit-brief.sh:STAGED="${1:-}" + CUR 解析（加 --session）
- scripts/control-tower/attach.py:main --session-id（L160-175，写 current-brief.<sid>）
- scripts/commit-msg-check.sh:GENUINE=$(echo ... | python3 -c ...)（L58，裸 python3 → PYBIN 回退）
- scripts/control-tower/brief_parser.py:parse_q2/match_path（L42-79/L109-111，认领制判定复用）
- .codex/control-tower/VERSION.md（V4.7.0 顶部追加 V4.7.1）；control_tower_log.py version 子命令

### b) 本任务执行约束
- rule: "synova-commit 不得再出现 resolver 结果赋给 SESSION_ID（身份=TASK_ID）"
  verify: "grep -n 'SESSION_ID=' scripts/control-tower/synova-commit && grep -n 'RESOLVED_BRIEF' scripts/control-tower/synova-commit | wc -l"
- rule: "staging_guard 认领制判定必须在 own_set 放行之前（D# 精确相等）"
  verify: "grep -n 'resolve-commit-brief.sh' scripts/control-tower/staging_guard.py && grep -n 'own_set' scripts/control-tower/staging_guard.py | head -1"
- rule: "commit-msg-check.sh GENUINE 判定必须 PYBIN 回退（python3→python→py），无 python 显式 degraded"
  verify: "grep -n 'PYBIN' scripts/commit-msg-check.sh"
- rule: "改前 grep-refs（铁律 9）— 改 synova-commit/staging_guard 前跑 grep-refs.sh"
  verify: ".claude/grep-verified 存在"

## Q2: 范围 — 正确的最简方案是什么？

MVP 边界: 只做 dev doc §3.1 写集 8 修改 + 1 新建；§3.3 排除项一律不做（不在本任务范围）。

做什么（严格按 dev doc §3.1 写集）：
- scripts/control-tower/synova-commit：修改。删除 SESSION_ID 自动采用认领 brief（L297-305 → SESSION_ID="$TASK_ID"）；显式 --session-id 优先；write-set 登记移到 staging-guard 通过之后；register 的 brief 路径按 TASK_ID 前缀查找（ls task-briefs/${TASK_ID}-*.md 首个，找不到空 fail-open）
- scripts/control-tower/staging_guard.py：修改。认领制判定放 own_set 之前；D# 正则提取后精确相等（禁 startswith）；resolver 无真实认领 → 不比较（防假阳性）；fail-open 保留但 degraded 必记录
- scripts/control-tower/session_registry.py：修改。register 增加 --task-id；write-set 记录含 task_id
- scripts/workflow/resolve-commit-brief.sh：修改。支持 --session <sid>（读 .claude/current-brief.<sid>，无则回退全局）
- scripts/control-tower/attach.py：修改。SessionStart 写 .claude/current-brief.<session-id>
- scripts/commit-msg-check.sh：修改。GENUINE python3 → PYBIN 回退（python3→python→py；全无 → 显式 degraded 后 fail-open skip）
- .gitignore：修改。新增 .claude/current-brief*
- tests/control-tower/staging-guard-session.test.py：新建。session 身份 + 认领制 ≥5 用例（§4 表）
- .codex/control-tower/VERSION.md：修改。追加 V4.7.1（批次 D328+D329）
- 配套：git rm --cached .claude/current-brief（保留工作区文件）；version.log 追加 4.7.1

不做什么（含文件路径）：
- 不重写已推送历史（c576e2b 拆分）— 重写历史禁止
- 不改 scripts/pre-commit-check.sh 组 12 范围校验（D328 已覆盖）
- 不改 scripts/hooks/hook-git-detect.sh 双重执行排查（D331 独立任务）
- 不改 scripts/control-tower/control_tower_log.py（只运行 version 子命令）
- 不改 .claude/current-brief 内容本身（去跟踪 + 回退语义，不删除）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：session 启动（attach.py SessionStart 写 current-brief.<sid>）→ 提交时（synova-commit → staging_guard.py 认领制拦截）→ commit-msg-check.sh（PYBIN 回退）
处理（中间经过哪些步骤）：SESSION_ID=TASK_ID（不再自动采用认领 brief）→ 每个暂存文件先查"被真实认领 brief（Q2 include 命中）的 D# ≠ 本 session 任务 D#"→ block；own_set 仅用于无认领冲突文件；write-set 登记在 guard 通过之后 → current-brief.<sid> 优先于全局
结果（最终展示在哪）：劫持场景（session=D318 + D320 文件）→ staging-guard exit 1 拦截；D329 写集不被他人身份提交；commit-msg 一致性检查在无 python3 环境显式 degraded 而非静默失效

## 架构层: 基础设施
（控制塔脚本，L1-L5 之外；五层架构无涉）

## Done 标准
- [ ] DS1 测试全过（≥5 用例；劫持复现 red→green 已证）— verify: python tests/control-tower/staging-guard-session.test.py
- [ ] DS2 synova-commit 无显式 --session-id 时 SESSION_ID=TASK_ID（grep 确认无 resolver 结果赋值）— verify: grep -n "SESSION_ID=" scripts/control-tower/synova-commit
- [ ] DS3 劫持场景（session=D318 + D320 文件）→ staging-guard exit 1 — verify: python tests/control-tower/staging-guard-session.test.py
- [ ] DS4 自己任务文件不被误伤（正常提交回归）— verify: python tests/control-tower/staging-guard-session.test.py
- [ ] DS5 current-brief.<sid> 生效（attach.py 写入 + resolver --session 优先）+ 全局去跟踪（git rm --cached + .gitignore）— verify: git ls-files .claude/current-brief（空）
- [ ] DS6 VERSION.md 含 V4.7.1（批次 D328+D329）+ version.log 追加 4.7.1 — verify: grep -n "V4.7.1" .codex/control-tower/VERSION.md
- [ ] DS7 全量审计与基线一致（PASS:3 WARN:886 FAIL:439）+ as any=0 — verify: python scripts/audit/audit-check.py --full
- [ ] DS8 12 组 pre-commit 全过、无 --no-verify、git diff --name-only 与写集一致 — verify: git diff --name-only --cached
- [ ] DS9 commit-msg-check.sh PYBIN 回退（PATH 注入验证）；无 python 时显式 degraded 而非静默 — verify: PATH=/usr/bin:/bin bash scripts/commit-msg-check.sh --self-test
