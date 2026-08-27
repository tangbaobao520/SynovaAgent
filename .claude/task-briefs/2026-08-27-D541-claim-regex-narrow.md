# Task Brief: D541 claim-regex-narrow

> 生成: 2026-08-27 | 任务: D541 | 认领: DeepSeek Harness（编码 session）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> spec: 本单为 CTO 内联指令（无独立 dev doc）；依据 = 用户派单（D541 正则收窄 + 配对测试）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
本任务属控制塔门禁（scripts/pre-commit-check.sh，L0 工具层）。铁律47「声称完成须 grep 物理证明」(L750) 的判定正则误伤——把 bug 的 bare 词「拆分/迁移」当完成声称，导致 brief 里工作描述（如"verify-parallel 迁移改三处"）误触发 → CI strict 硬阻断（D540 实测 CI 红）。本任务收窄该正则至只认完成语义，根治误伤。
### b) 文件审计
- scripts/pre-commit-check.sh L750 — 铁律47 的正则判定（grep -qi ... "$BRIEF"）。本任务改此处正则（只改一行，不动其他门禁逻辑）。
- tests/control-tower/claim-regex-narrow.test.sh — 新建配对测试（正常/降级/边界/接线）。
- task-state/D541.json — 回填 impl 段 + status=impl_done。
### c) 决策
收窄正则至完成语义（已拆/已迁移/已清理 + 拆分/迁移/清理.*完成 + 完成.*拆分/迁移/清理），去掉 bare 词「拆分/迁移」。用户给定正则 `已拆|已迁移|已清理|拆分.*完成|迁移.*完成|清理.*完成` 有缺陷——捕不到「已完成迁移」（完成在迁移前，顺序相反），而用户测试明确要求「已完成迁移」触发，故补充 `完成.*拆分|完成.*迁移|完成.*清理` 三个正序（完成在前）分支，使正则与测试一致。零新组件。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界：正则收窄避免「裸词」误伤——匹配需带完成语义锚点（已X / X.*完成 / 完成.*X），不匹配独立动作词。
b) Anthropic（fail-closed + 物理验证 + 测试配对）：正则变更需配对测试覆盖正常/降级/边界（铁律 0-2/48）。用户测试是最具体的规范（「已完成迁移」必须触发）——与用户给定正则的缺陷冲突时，以测试为准延伸实现。
c) memory/ 教训：D537「改共享 hook 先看全历史段落」（pre-commit-check.sh 是最高风险门禁，改动须一行到位、配测试）；M4/M2「本地过=全过」（必须用 SYNO_CI=1 strict 复验，不能靠本地软提示）。本任务用 SYNO_CI=1 全量复验。
参考：第一性原理（bare 词误伤 → 收紧触发条件到完成语义）+ Anthropic（正则变更配三路径测试）+ DeepSeek（最小改动：只动一行正则）。收敛：指向一致。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh L750 — 正则从 `拆分\|迁移\|清理.*完成\|已拆\|已迁移\|已清理` 收窄为 `已拆\|已迁移\|已清理\|拆分.*完成\|迁移.*完成\|清理.*完成\|完成.*拆分\|完成.*迁移\|完成.*清理`
- tests/control-tower/claim-regex-narrow.test.sh — 新建配对测试
- task-state/D541.json — impl 段 + status=impl_done
- .claude/task-briefs/2026-08-27-D541-claim-regex-narrow.md — 本任务 brief

不做什么：
- 不改 src/（产品代码，红线）
- 不改 scripts/audit/（K3 专属红线）
- 不改 pre-commit-check.sh 其他门禁逻辑（只动 L750 一行正则 + 同行 swallow-ok 注释）
- 不碰 hooks/post-commit.sh / synova-commit / install-hooks.sh 等（D540 已交付）
- 不新增守护进程/服务/依赖

## Q3: 验收 — 入口 → 交互 → 结果
入口：brief 含 bare 词「迁移/拆分」的工作描述（如 verify-parallel 迁移改三处）→ pre-commit 铁律47。
处理：收窄后正则只认完成语义 → bare 工作描述不触发；完成声称（已迁移/迁移完成/已完成迁移/已拆）触发。
结果：D540 brief 等含「迁移」工作描述不再误伤 CI；配对测试全绿；SYNO_CI=1 全量通过。

## 架构层:
L0（控制塔工具层，门禁脚本）

## Done 标准
- [x] verify: bash tests/control-tower/claim-regex-narrow.test.sh — 全过（9 断言：接线/正常/降级/边界）
- [x] verify: bash -n scripts/pre-commit-check.sh — 语法过
- [x] verify: SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash scripts/pre-commit-check.sh — 13 组全绿（退出 0）
- [x] verify: grep -qn "完成.*迁移" scripts/pre-commit-check.sh — L750 正则为收窄后完成语义
