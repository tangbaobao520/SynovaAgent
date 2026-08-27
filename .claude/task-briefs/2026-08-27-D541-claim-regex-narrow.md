# Task Brief: D541 claim-regex-narrow

> 生成: 2026-08-27 | 任务: D541 | 认领: DeepSeek Harness（编码 session）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> spec: 本单为 CTO 内联指令（无独立 dev doc）；依据 = 用户派单（D541 正则收窄 + 配对测试）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
本任务属控制塔门禁（scripts/pre-commit-check.sh，L0 工具层）。铁律47「声称完成须 grep 物理证明」(L750) 的判定正则有过宽匹配：把 bare 的字形（非完成声称语义）也当成声称，导致 brief 里的工作描述措辞误触发 → CI strict 硬阻断（D540 实测 CI 红）。本任务把该正则收窄至只认完成语义，根治误伤。
### b) 文件审计
- scripts/pre-commit-check.sh L750 — 铁律47 的判定正则（grep -qi ... "$BRIEF"）。本任务只改此处正则（一行 + 同行 swallow-ok 注释），不动其他门禁逻辑。
- tests/control-tower/claim-regex-narrow.test.sh — 新建配对测试（正常/降级/边界/接线）。
- task-state/D541.json — 回填 impl 段 + status=impl_done。
### c) 决策
把 L750 正则从「bare 字形也算完成声称」收窄为「只认完成语义」。三类完成语义：『已X』（动作词前置『已』）、『X…完成』（动作词后跟完成）、『完成…X』（完成在前动作词在后）。去掉 bare 字形本身。用户给定正则可覆盖前两类，但缺『完成…X』方向（该方向对『动作词在完成之后』的措辞是必需的），故补充，使正则与用户测试用例一致。零新组件。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界：正则收窄避免「bare 字形」误伤——匹配需带完成语义锚点，不匹配单个动作词。
b) Anthropic（fail-closed + 物理验证 + 测试配对）：正则变更需配对测试覆盖正常/降级/边界（铁律 0-2/48）。用户测试是最具体的规范（含『完成在前』方向的用例必须触发）——与用户给定正则的缺角冲突时，以测试为准延伸实现。
c) memory/ 教训：D537「改共享 hook 先看全历史段落」（pre-commit-check.sh 是最高风险门禁，改动须一行到位、配测试）；M4/M2「本地过=全过」（必须用 SYNO_CI=1 strict 复验，不能靠本地软提示——尤其注意说明类措辞也可能命中）。
参考：第一性原理（bare 字形过宽 → 收紧触发条件到完成语义）+ Anthropic（正则变更配三路径测试）+ DeepSeek（最小改动：只动一行正则）。收敛：指向一致。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh — 正则改为只认『已X / X.*完成 / 完成.*X』三类完成语义，去掉 bare 字形匹配
- tests/control-tower/claim-regex-narrow.test.sh — 新建配对测试
- task-state/D541.json — impl 段 + status=impl_done
- .claude/task-briefs/2026-08-27-D541-claim-regex-narrow.md — 本任务 brief

不做什么：
- 不改 src/（产品代码，红线）
- 不改 scripts/audit/（K3 专属红线）
- 不改 pre-commit-check.sh 其他门禁逻辑（只动 L750 一行正则 + 同行 swallow-ok）
- 不碰 hooks/post-commit.sh / synova-commit / install-hooks.sh 等（D540 已交付）
- 不新增守护进程/服务/依赖

## Q3: 验收 — 入口 → 交互 → 结果
入口：brief 含 bare 动作字形的过渡措辞（如 verify-parallel 三处改动）→ pre-commit 铁律47。
处理：收窄后正则只认完成语义 → bare 工作描述不触发；完成声称（动作词前置『已』/ 动作词后跟完成 / 完成在前的反向措辞）触发。
结果：D540 等含 bare 动作字形的工作描述不再误伤 CI；配对测试全绿；SYNO_CI=1 全量通过。

## 架构层:
L0（控制塔工具层，门禁脚本）

## Done 标准
- [x] verify: bash tests/control-tower/claim-regex-narrow.test.sh — 全过（9 断言：接线/正常/降级/边界）
- [x] verify: bash -n scripts/pre-commit-check.sh — 语法过
- [x] verify: SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash scripts/pre-commit-check.sh — 13 组全绿（退出 0）
- [x] verify: grep -cF '迁移' scripts/pre-commit-check.sh — L750 正则行存在（三类方向由上方 claim-regex-narrow.test.sh 断言）
