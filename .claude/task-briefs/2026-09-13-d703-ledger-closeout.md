# Task Brief: D703 收尾验收台账登记（CTO 簿记通道）

> 生成: 2026-09-13 16:45 | 分支: docs/ledger-d703 | as any: 0
> 类型: CTO 验收簿记（非编码卡）——把 D703 收尾链（验收 → 解阻 → 合并 → tag）登记进 `docs/synova/coordination/审计发现台账-DSH-CTO.md`

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
增长导航视角：台账是控制塔的「决策记忆」——验收结论、解阻机制、发现的系统性缺陷必须可检索，否则同类缺陷会以不同面貌复发（D328/D555/D707/D708 已有四次先例）。

### 三层解耦体系

纵向五层物理隔离：每层只与相邻层通信，失败/降级信号必须沿调用链向上传播（铁律 31）。
文件驱动扩展：新增能力靠文件不改代码。
数据安全分级：L0 公开摘要 → L1 聚合信号 → L2 脱敏证据 → L3 原始数据。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

本卡是 CTO 验收流程的簿记动作：D703（K3 W-1 证据命令机器化）已合并 main（8a9ed2dc，tag V5.2.8），需要把「验收结论 + 解阻三机制 + 4 条发现 + 3 项待派卡」写进台账。不新增任何产品代码，不改门禁。

### b) 文件审计

- 台账文件 `docs/synova/coordination/审计发现台账-DSH-CTO.md`（append-only，270+ 行历史行）——本次仅在末尾追加 1 行。
- 无 dev doc 变更（D703 spec 一个字不改：它自带的 `verify-d703.sh` DS7「分支改动 ⊆ 写集」会在 spec 变更时回放失败，实测 CI run 34748484140 —— 这是本轮的真实教训）。
- 无 src/、无 scripts/、无 .github/ 变更。

### c) 决策

台账登记走「当日 CTO 簿记 brief」声明写集（D708 合并级对账要求）；brief 自身用 `## 写集豁免` 显式豁免（D708 内置豁免只覆盖 `.claude/bypass.log`）。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链

① 另一 session 未处理 #506 阻塞（实测 head 未变、quality 仍红、Vitest/Golden 仍 skip）→ CTO 自行解阻；② 解阻需「暂移未开工卡 spec 出比对集」；③ 合并后必须回落 + tag；④ 全过程登记台账。

### b) 本任务执行约束

- 只追加台账行，不改任何既有行（append-only 纪律）。
- 不改 dev doc / 门禁 / src（铁律 0-5）。
- 提交走完整门禁，禁 `--no-verify`。

### c) 决策参考系

D594（跨日镜像 brief）、D328（认领门禁）、D555（verify-parallel 关闭信号）、D708（合并级写集对账）四条既有判例。

### d) 相关 Note 引用

无（簿记动作，非决策变更）。

## Q2: 范围 — 正确的最简方案是什么？

不做什么（排除项）：
- 不改 `docs/plans/codex/implementation/SYNOVA-IMPL-D703-evidence-command-mechanization-20260911.md`（改它会触发其自身回放 DS7 失败）
- 不改 `scripts/`（含 verify-parallel / merge_writeset_gate —— 铁律 0-5，系统性修复另立卡）
- 不改 `src/`（本卡零代码）
- 不改 `.github/`

做什么（写集 1 修改 + 1 新建）：
- docs/synova/coordination/审计发现台账-DSH-CTO.md
- .claude/task-briefs/2026-09-13-d703-ledger-closeout.md

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：CTO 验收流程（人工）。
处理（中间步骤）：追加台账行 → 过 G12（认领）/ D708（写集对账）/ 组6（brief 字段）→ PR CI 全绿。
结果（展示在哪）：台账文件新增 1 行（含 D703 收尾链证据 + 4 条发现）；PR CI job 级全绿。

## 架构层: L0 文档层（控制塔台账 + task brief）——不触任何运行时代码层；无跨层风险

#CRITERIA: A

## Done 标准

- [ ] DS1 台账追加: verify: `git diff --name-only origin/main...HEAD` 恰含台账 + 本 brief 两文件
- [ ] DS2 无代码变更: verify: `git diff origin/main...HEAD -- src/ scripts/ .github/` 零输出
- [ ] DS3 门禁通过: verify: `bash scripts/pre-commit-check.sh`（SYNO_CI=1）无新增硬阻断
- [ ] DS4 D708 对账: verify: `python scripts/control-tower/merge_writeset_gate.py --base origin/main --head HEAD --branch docs/ledger-d703` → pass

## 文档引用

- docs/synova/coordination/审计发现台账-DSH-CTO.md（登记目标）
- AGENTS.md 铁律 0-5（不改门禁）/ 铁律 49（决策沉淀）

## 接口审计

无新增接口（纯文档）。grep 实证：`git diff origin/main...HEAD --name-only` 仅两文件。

## 写集豁免

- .claude/task-briefs/2026-09-13-d703-ledger-closeout.md — 本卡 brief 自身：D296 认领制的门禁输入文件（非交付物）；D708 内置豁免只覆盖 .claude/bypass.log，故显式豁免
