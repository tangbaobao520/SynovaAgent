# D1023 — commit-msg 门禁扩 `decisions/**`（契约 §9 的同批接手）

#CRITERIA: C

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
治理/门禁层（非五层架构内）。本任务改 `scripts/commit-msg-check.sh` 一处引用检查。
背景：`docs/synova/DOC-CONTRACT.md` §7 要 `memory/notes/` 迁往 `decisions/`，
而铁律 49/M7 的 commit-msg 门禁只认 `memory/notes/**` ⇒ 按契约做事反被拦。§9 定了过渡规则。
### b) 文件审计
grep `memory/notes/` 在 `scripts/commit-msg-check.sh`（唯一目标）；无其他消费者需同步。
复用现有脚本，无新建脚本。
### c) 决策
改既有脚本的一处判断 + 一处正则；不新建任何脚本。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 参考：Anthropic 工程基线（渐进式收紧、双通道兼容期）+ 第一性原理（先保迁移可行）
- memory 教训：D534/铁律 49（决策必须沉淀）；本次是"移出必与接手同批"的第一次真实落地
- 决策参考：本改动是 K3 R4 的**合并条件 P1-A**（它实测该改动未落地）

## Q2: 范围 — 正确的最简方案

做什么（**纯路径，一行一条** —— brief_parser --q2-include 按整行精确匹配）：
```
scripts/commit-msg-check.sh
memory/notes/implemented/process/2026-09-27-commit-msg-decisions.md
.claude/task-briefs/2026-09-26-D1023-commit-msg-decisions.md
.claude/bypass.log
```

不做什么（纯路径，一行一条）：
```
scripts/pre-commit-check.sh
scripts/control-tower/merge_writeset_gate.py
```

## Q3: 验收 — 入口 → 交互 → 结果
入口：`git commit`（commit-msg hook）
处理：检查 commit message 是否含 Note 引用（`memory/notes/` 或 `decisions/`）
结果：含则放行、不含则阻断并提示两种合法形式

## 架构层: N/A（治理层，非 L1–L5）

## Done 标准
- [ ] `grep -c 'decisions' scripts/commit-msg-check.sh` > 0（原为 0）—— verify: `grep -c decisions scripts/commit-msg-check.sh`
- [ ] commit message 含 `decisions/<lifecycle>/<date>-<topic>.md` 时 commit-msg 门禁放行 —— verify: 用本地 canary 提交验证，或 grep 证据
- [ ] CI 的 G12 / G12b / D708 三道均放行 —— verify: PR #859 的 check-runs 全绿

## 写集声明（单一事实源）
```
scripts/commit-msg-check.sh
memory/notes/implemented/process/2026-09-27-commit-msg-decisions.md
.claude/task-briefs/2026-09-27-D1023-commit-msg-decisions.md
.claude/bypass.log
```
