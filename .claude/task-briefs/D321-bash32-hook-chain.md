# Task Brief: D321: pre-push 门禁 Mac 兼容修复 — verify-parallel mapfile + configure/verify-hooks 全角括号 + check-plan-integrity python（bash 3.2 + python3，4 脚本 + 1 免疫细胞）

> 生成: 2026-08-11 17:03:30 | 分支: main | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
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
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）— 具体是控制塔基础设施脚本，不在五层产品代码内，属于支撑层

本任务属于哪个系统（GA诊断/哨兵/基础设施）？触及哪层？该层现有模块？新增/替换/扩展？
**基础设施（控制塔 hooks 门禁链）。** 本项目以"双机可移植"为目标（D318），要求 hooks 门禁链在 Windows Git Bash 与 macOS 默认 bash 3.2 上都可运行。本任务修复 3 个 bash 脚本在 macOS bash 3.2 下的兼容 bug，属于**修复既有模块**，不改动产品五层代码，不影响 GA诊断/哨兵数据流。涉及模块：pre-push 门禁 `verify-parallel.sh`（dev doc 并行比对）、机器配置 `configure-machine.sh`、hooks 自检 `verify-hooks-installed.sh`。

### b) 文件审计
grep 本任务关键词在 expert/ sentinel/ extensions/ knowledge/ theory/ skills/ 中。列出已有文件驱动模块。关系: 复用 / 扩展 / 新建 / 冲突
本任务关键词是 `mapfile`、`-newermt`、`$NAME（`、`$CHP（`——grep 确认：
- `grep -rn "mapfile" scripts/` → 仅 `scripts/control-tower/verify-parallel.sh:148` 一处
- `grep -rn "newermt" scripts/` → 4 处（pre-commit G12 / pre-push 门禁 5 / PreToolUse scope 检查 / brief 解析），实测 macOS `/usr/bin/find` 支持 `-newermt`（exit 0），**无需修改**
- `grep -rn '$\w*（' scripts/setup/` → `configure-machine.sh:45,69` + `verify-hooks-installed.sh:59` 全角括号紧贴变量名
- expert/ sentinel/ extensions/ 零命中（本任务纯基础设施，不触文件驱动模块）
关系: 修复既有文件，不新建。无冲突。

### c) 决策
已有覆盖→复用，不准新建硬编码。无覆盖→新建走文件驱动（属扩展解耦）。冲突→取消任务，复用已有。
**修复既有文件，不新建任何模块。** 3 个 bug 均属 D318 "双机可移植" 声明未兑现的遗留（D318 声称兼容 bash 3.2 但 `mapfile`/全角括号漏网）。修复方式为最小改动：`mapfile` → `while read` 循环（bash 3.2 原生），`$VAR（` → `${VAR}（`（花括号隔断全角括号）。已在 bash 3.2 实测复现 + 验证通过。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — 定义「怎么算做完」
  ② 测试 — 先写测试，测试 = 产品的一部分
  ③ 实现 — 刚好满足以下全部条件：
     - Done 标准中列出的所有完成项
     - 测试全部通过
     - 接线完整（新 export 有引用）
     - 错误路径有 log + degraded
     - tsc + vitest 零失败
  ④ 接线 — 端到端走通（入口可触达 + 链路完整 + 结果可见）
  ⑤ 验证 — 自检 6 问（接线/异常/类型/测试/残留/文件驱动）

引用依据（至少引用两项）：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
  - 铁律 24+31: 错误处理 + 降级信号
  - 铁律 33: 测试命名约定
  - memory/ 中的历史教训文件

**具体调研结论：**
- 铁律 35（自动化优先）: 本任务把"门禁脚本在 Mac 上静默 fail-open / 硬阻断"从运行时事故变成可修复缺陷，修复后 `configure-machine.sh --role mac` 与 pre-push 在 bash 3.2 上自检通过
- 铁律 11（静默降级禁止）: `verify-parallel.sh --scan-today` 在 Mac 上 `find -newermt` 假通过、`mapfile` 真崩溃，两者都是 D318 声称"兼容 bash 3.2"但实际未测的漏洞——本任务根治
- memory/ 历史教训: D313-D316 全程 Windows/bash 兼容踩坑（`windows-compat` skill 记录：subprocess 调 bash 的自包含环境、UTF-8 强制、静默吞错门禁）。本任务同一族：bash 3.2 多字节解析 bug + bash 4+ 专属命令漏网
- 业界实践: bash 3.2 兼容三原则——① 禁 bash 4+ 专属内建（mapfile/readarray/declare -A）；② 变量名紧贴非 ASCII 字符必须花括号；③ GNU 专属 find 选项（-newermt）在 Mac BSD find 上需实测而非假设。本任务全部实测验证

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
根据决策链和本任务特点，提炼 2-3 条必须遵守的规则。每条 rule 必须包含 verify 命令。
例如:
  - rule: "修改 manifest.json 后必须验证 sentinel-loader.ts 能正确解析"
    verify: "grep -rn '新字段名' src/sentinel/sentinel-loader.ts"
  - rule: "新增 export 必须在 pre-commit 组 4 有引用"
    verify: "grep -rn '新函数名' src/"

**本任务执行约束：**
- rule: "修复后 `mapfile` 在 scripts/ 下必须零残留（bash 3.2 硬阻断已清除）"
  verify: "grep -rn 'mapfile' scripts/ | grep -v node_modules | wc -l"
- rule: "全角括号不得紧贴未加花括号的变量名（$X（ → ${X}（）"
  verify: "grep -rnE '\\$[A-Za-z_][A-Za-z0-9_]*（' scripts/setup/ scripts/control-tower/ | wc -l"
- rule: "修复后必须在 bash 3.2 上实测 configure-machine --role mac 与 verify-hooks-installed 自检 exit 0"
  verify: "bash -c 'set -u; X=test; echo \"${X}（\"'" 

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- scripts/control-tower/verify-parallel.sh — :148 mapfile（bash 4.0+ 专属）→ while IFS= read 循环（bash 3.2 原生，DOC_ARR 逐行 append）
- scripts/setup/configure-machine.sh — :45,69 $NAME（→${NAME}（两处全角括号 bug，修 45 不修 69 会接着炸）
- scripts/setup/verify-hooks-installed.sh — :59 $CHP（→${CHP}（
- scripts/check-plan-integrity.sh — 3 处 python → python3（macOS 无 python 命令，plan.json 解析全空 → 每次 Mac 提交硬阻断；D321 提交门禁实测暴露）
- memory/bash32-compat.md — D321 教训免疫细胞（bash 3.2 三原则 + Mac python3/BSD grep -P 记录）
- .claude/task-briefs/D321-bash32-hook-chain.md — 本 brief
- .claude/current-brief — 指向 D321
- .claude/plan.json — 更新为 D321 principles（含 python3 门禁链原则）
- verify: bash scripts/setup/configure-machine.sh --role mac 全链路自检通过

不做什么：
- 4 处 `-newermt` 实测 macOS `/usr/bin/find` 支持（exit 0）——D321 早期假设"BSD find 不支持"是错的，改它们属于范围蔓延（`grep -rn newermt scripts/` 证据）
- 不改 `check-brief-vs-code.sh`/`deploy/*` 的 `declare -A`（bash 4+）：不在 hook 链路（评分/服务器侧，服务器 Linux bash 4 无碍），改它属于范围蔓延
- 不改 `scripts/workflow/hook-check-task-scope.sh`（虽有同源 `-newermt`，但实测支持，无需改）
- 不改 src/ 任何产品代码（L1-L5 五层不动）
- 不改 package.json / tsconfig.json / vitest.config.ts
- 不 bump VERSION.md（D319 编排 V4.7.0 已锁定，本任务不涉及版本）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：本机 macOS 用户执行 `bash scripts/setup/configure-machine.sh --role mac`（D318 一键配置）或 `git push` 触发 pre-push 门禁
处理（中间经过哪些步骤）：configure-machine 设身份 → 跑 install-hooks → 跑 verify-hooks-installed 自检 → 推送时 verify-parallel 对今日 dev doc 两两比对
结果（最终展示在哪）：`--role mac` 自检 4 项全过 exit 0（不再 line 45 崩）；`verify-parallel.sh --scan-today` 正常比对（不再 `mapfile: command not found`）；`verify-hooks-installed.sh` core.hooksPath 检查正常输出（不再 `CHP: unbound variable`）

## 架构层: 基础设施
L1/L2/L3/L4/L5
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] verify: `grep -rn 'mapfile' scripts/ | grep -v node_modules` 零结果
- [ ] verify: `grep -rnE '\$[A-Za-z_][A-Za-z0-9_]*（' scripts/setup/ scripts/control-tower/` 零结果
- [ ] verify: `bash -c 'set -u; X=test; echo "${X}（" && echo "OK"'` 输出 OK
- [ ] verify: `bash scripts/setup/verify-hooks-installed.sh` exit 0（当前机器已装 hooks，自检全过）
- [ ] verify: `bash scripts/control-tower/verify-parallel.sh --scan-today` exit 0（今日无 doc 跳过；有 doc 正常比对）
- [ ] verify: `git diff --name-only` 与 Q2 写集一致；pre-commit 12 组全过无 --no-verify
- [ ] verify: `bash scripts/check-plan-integrity.sh` 全过无硬阻断（python3 解析 plan.json；memory_refs 指向 memory/bash32-compat.md 真实文件）
- [ ] verify: `grep -rn 'python ' scripts/check-plan-integrity.sh` 零结果（python→python3）
