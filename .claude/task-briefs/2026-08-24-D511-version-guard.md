# D511：版本守卫门禁（控制塔组 14，V4.10.0）

> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D511-version-guard-20260823.md（27d1ca5f）
> 权威: 版本管理规范-控制塔.md §一/§二/§四待办 + CT-42 + D331 fail-closed

## Q0:
a) 项目拼图: 控制塔门禁基础设施（非 src/ 五层）。pre-commit 现有 13 组，本任务新增组 14「版本守卫」——门禁文件变更 ⟹ VERSION.md 必须同 commit bump，否则硬阻断。不改 13 组既有判定逻辑。
b) 文件审计: scripts/control-tower/ 无 check-version-guard.sh（新建）；pre-commit-check.sh 有 STAGED_ALL（L183）/DOC_ONLY 早退（L189）/hard_check/soft_pass 惯例可复用；.codex/control-tower/VERSION.md 最新 V4.9.0；version.log 不存在（control_tower_log.py version 命令生成于 logs/version/v1/）；degraded 日志在 .codex/control-tower/logs/degraded-events.log（既有机制）。
c) 决策: 独立 check-version-guard.sh（铁律 35，可单测）+ pre-commit 组 14 一处接线。无冲突，纯新建+最小接线。

## Q1:
a) 业界最佳实践: semver 机器守卫（semantic-release 类 CI/pre-commit 物理检查，不靠记忆）。
b) Anthropic 基线: fail-closed（守卫自身失败=拦，D331）+ 最小机制（独立脚本+一行接线）+ 三路径测试。
c) memory 教训: CT-42（六批未 bump，第二次违反——物理强制唯一解）；D328（三态退出码，exit 2 不与通过混同）；D508（门禁要减负——只拦门禁文件，纯文档走 DOC_ONLY 天然豁免）。参考：Anthropic（fail-closed+可测）+ DeepSeek（最少机制不打扰）+ 第一性原理（版本可信=bump 可机器验证）。

## Q2:
做什么（写集，格式「路径 — 说明」）:
- scripts/control-tower/check-version-guard.sh — 新建版本守卫（三态退出 exit 0/1/2 + 逃生舱 + 检测面，契约 dev doc §3.5）
- tests/control-tower/check-version-guard.test.sh — 新建 15 用例 red→green（命名按 U7/CT-40 配对规则；dev doc §5.1 写 version-guard.test.sh 以物理门禁为准）
- scripts/pre-commit-check.sh — 组 14 接线（组 13 之后/CP3 之前）+ 收尾文案 13 组→14 组，既有组 1-13 判定逻辑零改动
- .codex/control-tower/VERSION.md — 顶部插 V4.10.0 条目（§5.3-B 决策，新增门禁组=MINOR，规范§二）
- .codex/control-tower/logs/version.log — control_tower_log.py version 追加 V4.10.0 行，git add -f 入库（§5.4-3 决策）
- .claude/task-briefs/D511.md — 本 brief

不做什么:
- 不改 scripts/pre-commit-check.sh 组 1-13 判定逻辑（仅追加组 14 块）
- 不改 electron/ 下 D510 领地文件
- 不改 scripts/golden-scenarios/ 下 D512 领地文件
- 不改 scripts/audit/ 下 K3 审计脚本（红线）
- 不改 src/ 下任何 .ts 文件（五层代码零触碰）
- 不修改 .gitignore/ 全局忽略规则与 .claude/settings.json（version.log 入库走 git add -f）
- 不自动代写版本号内容；不做 MAJOR 判定；不打 git tag（合并 main 后 CTO 打，规范§一铁律 3）

## Q3:
入口: 编码 session 改 scripts/control-tower/、scripts/pre-commit-check.sh 等门禁文件并 git commit → pre-commit 组 14 调 check-version-guard.sh。
处理: 暂存清单命中门禁检测面（GATE_FILES_RE）且无 .codex/control-tower/VERSION.md 同 commit 变更 → exit 1 硬阻断并给 bump 指引；带 bump/纯文档/非门禁文件 → 放行；SYNO_SKIP_VERSION_GUARD=1 → 跳过+记 degraded-events.log；VERSION.md 不可解析 → exit 2 fail-closed。
结果: tests/control-tower/version-guard.test.sh 全过；D511 自身提交（改 pre-commit-check.sh + VERSION.md V4.10.0 同 commit）通过组 14——吃自己的药。

## Q4 契约与测试:
契约（check-version-guard.sh）: @input STAGED（SYNO_STAGED_FILES 注入缝或 git diff --cached --name-only --diff-filter=ACMR）；@output exit 0=通过 / exit 1=门禁变更无 bump（硬阻断）/ exit 2=守卫自身降级（VERSION.md 缺失或无 `## V` 标题，fail-closed）；@degraded 逃生舱写 degraded-events.log（铁律 11 不静默）。
测试三路径: 拦（门禁文件无 bump）/ 放行（同 commit 带 bump、纯文档、非门禁文件）/ 跳过降级（逃生舱记日志、VERSION.md 不可解析 exit 2）+ 接线（grep pre-commit-check.sh 组 14）+ 边界（检测面命中 scripts/hooks/、scripts/check-*.sh；不命中 scripts/backup/ 等；仅 VERSION.md 无门禁文件不触发）。

## 本任务在哪一层: 控制塔门禁基础设施
scripts/control-tower/ + scripts/pre-commit-check.sh——Mac DSH 纯领地（TASK-ROUTING §一），零跨层，不涉 L1-L5。
#CRITERIA: A

## Done 标准
- [ ] verify: bash tests/control-tower/version-guard.test.sh 2>&1 | tail -3 | grep -q "FAIL=0"
- [ ] verify: grep -n "check-version-guard" scripts/pre-commit-check.sh | wc -l >= 1（铁律 0-2 WIRE CHECK）
- [ ] verify: head -20 .codex/control-tower/VERSION.md | grep -q "V4.10.0"
- [ ] verify: grep -q "4.10.0" .codex/control-tower/logs/version.log（control_tower_log.py 实际写入路径；git add -f 入库——§5.4-3 决策"入库"）
- [ ] verify: bash -n scripts/control-tower/check-version-guard.sh && echo OK
- [ ] verify: bash scripts/pre-commit-check.sh 2>&1 | grep -q "14"（组 14 接线且全过——吃自己的药）
- [ ] verify: git diff --name-only 与写集一致（6 文件：2 新建脚本/测试 + pre-commit + VERSION.md + version.log + 本 brief）
