# Task Brief: D534 Stage1-D2-agent-notes

> 生成: 2026-08-26 | 任务: D534 | 认领: dsh | 切片: stage1-cont
> 参考: 编码指令-Stage1续-D534-D535-20260826.md + SYNOVA-IMPL-DSH-D534-notes-four-state-mechanism-20260826.md

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属 L0 工程治理层（开发侧工具链）：memory/notes/ 四态知识库 + commit-msg hook。现有 D395-a（四态目录+引用门禁，仅 control-tower/orchestrator 触发）、D472（迁移门禁+注入过滤）。本任务补：非平凡变更强制 Note 触发面扩展 + 四态迁移语义文档化 + AGENTS.md 铁律 49 + D472 僵尸 Note 存量规整。
### b) 文件审计
- scripts/commit-msg-check.sh:127 — CT_ORCH_TOUCHED 正则仅 `^(scripts/control-tower/|src/orchestrator/)`（grep 实测）
- memory/notes/README.md:14-18 — 迁移规则仅一行 git mv（无门槛/触发/否决语义）
- AGENTS.md 铁律速览 — 无 memory/notes 引用、无铁律 49（grep 实测零命中）
- memory/notes/proposed/2026-08-22-d472-notes-lifecycle.md — 头 proposed 但 D472 task-state=audited（僵尸）
- tests/control-tower/commit-msg-consistency.test.sh — 断言 CT_ORCH_TOUCHED 变量名（改名会断裂）
### c) 决策
已有覆盖→扩展复用：不改 check-notes-lifecycle.sh（D472 已审计）、不改 pre-commit-check.sh（commit-msg hook 已承载）、不自动 git mv（迁移是人的决策）。新建 tests/control-tower/commit-msg-note-mandatory.test.sh（触发面扩展测试）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 35（自动化优先）：非平凡变更强制 Note = 把"靠自觉"变"物理 grep 检查"
- 铁律 0-2/48（测试先行 + 非空壳）：red→green，10 用例含正常/降级/边界/回归/排除
- DSH 范式（state.d.ts）：状态机 + 迁移语义（实现落地迁 implemented/ 的路径纪律），不引代码（Stage 3 前零依赖）
- memory 教训：D472（不改 commit-msg 门禁）——本任务在 D472 之上阶段化扩展触发面，不违反
参考：Anthropic（fail-closed 物理门禁）+ DSH（四态状态机理念）+ 第一性原理（决策沉淀的最小物理机制 = commit-msg hook）+ 结论：触发面扩到治理脚本区+规则文档区，排除测试文件与纯文档

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/commit-msg-check.sh — 触发面正则扩展（L127）
- memory/notes/README.md — 四态迁移语义节
- AGENTS.md — 铁律速览追加铁律 49 引用行（合并非替代）
- memory/notes/implemented/2026-08-22-d472-notes-lifecycle.md — git mv + 头字段 implemented
- tests/control-tower/commit-msg-note-mandatory.test.sh — 新建（≥10 用例）
不做什么：
- 不改 scripts/control-tower/check-notes-lifecycle.sh（D472 已审计）
- 不改 scripts/pre-commit-check.sh / 不新增门禁组（防膨胀）
- 不改 src/ 任何文件（零 src 需求）
- 不改 scripts/audit/（K3 红线）
- 不修改现有铁律条目内容（只追加 49）

## Q3: 验收 — 入口 → 交互 → 结果
入口：改 scripts/workflow/ 或 scripts/hooks/ 或 AGENTS.md 的 commit → commit-msg hook
处理：commit-msg-check.sh 触发面正则匹配 → message 无 Note 引用 → 阻断
结果：exit 1（grep 可查）+ tests/control-tower/commit-msg-note-mandatory.test.sh 10/10 全绿 + README 迁移语义节存在 + AGENTS.md 铁律 49 存在 + proposed/ 僵尸清零

## 架构层: L0（工程治理/开发侧）+ hooks 注入层（不触碰 L1-L5 业务代码）

## Done 标准
- [ ] verify: bash tests/control-tower/commit-msg-note-mandatory.test.sh — 10 用例全绿（PASS=10 FAIL=0）
- [ ] verify: grep -n "control-tower|workflow|hooks" scripts/commit-msg-check.sh — 命中触发面正则
- [ ] verify: grep -n "铁律 49" AGENTS.md — 命中
- [ ] verify: grep -n "四态迁移语义" memory/notes/README.md — 命中
- [ ] verify: ls memory/notes/implemented/ | grep d472 — 命中（存量规整完成）
- [ ] verify: git diff --name-only — 与写集一致（5 文件）
