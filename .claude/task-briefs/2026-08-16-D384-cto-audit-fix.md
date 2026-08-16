# Task Brief: D384: D383 审计 P1 修复批次（分配器/幂等/写集对账/编号规范）

> 生成: 2026-08-16 | 分支: feat/d383-cto-batch | 分配: alloc-task-id.sh (D384)
> 性质: K3 审 D383 后按审计闭环铁律另起的 FIX 任务（禁改原任务 98b0d4d1）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
K3 审 D383 出 P1×4 + L4 缺口 4 项。本任务修复：编号撞车（分配器）、CTO-HEALTH 幂等/无源、写集漂移对账、新脚本测试。

### b) 文件审计
- 分配器: scripts/control-tower/alloc-task-id.sh+ tests/control-tower/alloc-task-id.test.sh
- 幂等: scripts/control-tower/gen-cto-health.py（指纹判定）+ tests/control-tower/gen-cto-health.test.sh+ docs/synova/CTO-HEALTH.md（重生成）
- 对账/登记: docs/synova/coordination/TASK-ROUTING.md（认领表补交）、审计发现台账-DSH-CTO.md（D383 审计 + CT-35~38）、task-state/D383.json（audited）、task-state/D384.json
- 编号规范: cto-handover SKILL.md（.claude/.dsh/dsh-cto-draft）+ dsh-devdoc-draft + dsh-preset-draft persona（取号纪律）

### c) 决策
P1 修复按铁律另起 FIX 任务（本任务），不直接改 98b0d4d1。参考：第一性原理（唯一入口防撞）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 审报告（K3 14 项）→ ② 编号机制（alloc + 测试 12/12）→ ③ 幂等（指纹 + 测试 5/5）→ ④ 对账登记 → ⑤ 提交 → ⑥ K3 复审。
引用 M2（声称=实现）、CT-36/37/38、铁律 48（新代码有测试）。

### b) 执行约束
- rule: "新脚本必须带测试（alloc/gen-cto-health 均有）"
  verify: "tests/control-tower/alloc-task-id.test.sh + gen-cto-health.test.sh 全绿"
- rule: "幂等: 连续两次运行不写文件"
  verify: "python3 gen-cto-health.py 两次，第二次输出幂等"

### c) 决策参考系
参考：第一性原理。收敛。

## Q2: 范围 — 正确的最简方案

做什么（14 文件）：
- scripts/control-tower/alloc-task-id.sh
- scripts/control-tower/gen-cto-health.py
- tests/control-tower/alloc-task-id.test.sh
- tests/control-tower/gen-cto-health.test.sh
- docs/synova/CTO-HEALTH.md
- docs/synova/coordination/TASK-ROUTING.md
- docs/synova/coordination/审计发现台账-DSH-CTO.md
- task-state/D383.json
- task-state/D384.json
- .claude/skills/cto-handover/SKILL.md
- .dsh/skills/cto-handover/SKILL.md
- docs/synova/coordination/dsh-cto-draft/cto-handover-SKILL.md
- docs/synova/coordination/dsh-devdoc-draft/persona.md
- docs/synova/coordination/dsh-devdoc-draft/persona-block.yml
- docs/synova/coordination/dsh-preset-draft/persona.md
- docs/synova/coordination/dsh-preset-draft/persona-block.yml

不做什么：
- 不改 scripts/control-tower/dev-doc-gatekeeper.sh（C6 已审计通过）
- 不改 extensions/sentinels/path-dependency/manifest.json（D379 编码线任务）
- 不改 .claude/task-briefs/D383-cto-batch.md 原 brief 内容（原任务不动，对账走台账）

## Q3: 验收 — 入口 → 交互 → 结果

入口：git commit（synova-commit）
处理：16 文件入提交，新脚本带测试，幂等修复
结果：提交推送 + K3 复审；编号撞车物理防住；CTO-HEALTH 可复现

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] tests/control-tower/alloc-task-id.test.sh 12/12 + gen-cto-health.test.sh 5/5 全绿
- [ ] gen-cto-health.py 连续两次运行第二次输出"幂等"
- [ ] 台账 CT-36 标记已实现；D383.json audit 段 = CONDITIONAL_PASS + fix_task_id=D384
