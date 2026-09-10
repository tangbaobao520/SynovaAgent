# Task Brief: D663 ct-ci-hermetic-arch-ratchet

> 生成: 2026-09-10 | 任务: D663 | 认领: 并行CTO（Mac DSH 控制塔线）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔 CI 门禁域（非产品代码）。CI 三红自 CT-64 起在 main 永久红 → 永久红=零信号，
D593-FIX2 的 +2 跨层违规藏于噪音入 main（CT-47 第三次实证）。本任务恢复门禁信号。
### b) 文件审计
- tests/control-tower/alloc-task-id.test.sh:96,109 — 沙箱 git commit 依赖全局身份（CI 实红）
- 同族：bypass-union-merge / clone-shadow-commit / generated-gate / hooks-install /
  post-commit / synova-commit 六测试同有沙箱 git commit
- tests/control-tower/ct-test-gate.test.sh — CI 红「配对绿 exit 1」（本机 CI 等价键 6/6 过，零配置差）
- scripts/check-architecture.sh — 「基线外新增 N 处」只报计数不报明细
- tests/architecture/l1-cross-layer-baseline.txt — 棘轮部分（diagnosis.ts 2→4 + 例外记账头）
  已由 CTO 先行落地并实测 SYNO_CI=1 exit 0，本任务不含
### c) 决策
复用 D539 沙箱机制补身份注入；simulate-ci 级联不改弱；棘轮已如实对齐不再动。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
D316（环境依赖失败≠恒失败，测试必须自带环境）；D421（grep -oP 家族，D661 另修）；
V3.9 教训（永久红门禁=没有门禁）；K3 D593FIX2 附记（棘轮逆向例外两条件，条件① CTO 已落地）。
参考：第一性原理（门禁的价值=信号，噪声即失效）+ 结论=修根因不修表象、禁改弱。

## Q2: 范围 — 正确的最简方案
做什么：
- tests/architecture/l1-cross-layer-baseline.txt — 棘轮如实 diagnosis.ts 2→4 + 逆向例外记账头
  （K3 D593FIX2 条件①，CTO 第一批先行落地，SYNO_CI=1 已实测 exit 0）
- docs/synova/coordination/board-backlog.json — PLAN-d593-fix2 闭环标注 + PLAN-ci-syno-leak
  证伪关闭 + PLAN-diagnosis-l5-di 立项（owner=编码线，期限=下个 L1 质量批）
- task-state/D663.json — 本任务立项登记（claimed）
- .claude/task-briefs/2026-09-10-D663-ct-ci-hermetic-arch-ratchet.md — 本 brief
- tests/architecture/check-architecture-gate.test.ts — 棘轮总数断言升级为例外记账语义
  （36→38 + >36 必须带例外记录校验，已随条件①落地，本地 12/12）
- tests/control-tower/*.test.sh（7 文件）— 沙箱 git commit 身份自持（env GIT_AUTHOR/COMMITTER
  或 git -c 注入），零配置模拟（GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null）全绿【并行CTO 工程批】
- tests/control-tower/ct-test-gate.test.sh — CI 红根因修复（先按身份同根排查）【并行CTO 工程批】
- Architecture job 潜在测试债 ×5（ubuntu 沙箱用例 expected 1 to be +0，脚本步骤首次变绿后
  首次暴露）——逐个诊断修复【并行CTO 工程批】
- scripts/check-architecture.sh — 「基线外新增」逐条输出违规 file:line【并行CTO 工程批】
不做什么：
- 不改 scripts/audit/（K3 红线）
- 不改 scripts/workflow/resolve-commit-brief.sh、scripts/control-tower/dev-doc-gatekeeper.sh、
  scripts/control-tower/external-auditor.sh（归 D661，写集互斥）
- 不改 src/（产品代码零触碰）；不改弱 simulate-ci.test.sh 断言
- DI 注入重构本体归 PLAN-diagnosis-l5-di（编码线），本任务只立项不实施

## Q3: 验收 — 入口 → 交互 → 结果
入口：GitHub Actions CI（Control Tower Gate Tests ubuntu/windows + Architecture Check）
处理：零配置身份隔离修复 + ct-test-gate 根因修复 + 明细输出
结果：三 job 在 main 实绿；本机 SYNO_CI=1 bash scripts/check-architecture.sh exit 0（已预验）；
      零配置模拟下 tests/control-tower 全绿；simulate-ci.test.sh 绿（级联消除）

## 架构层: 控制塔（tests/ + scripts/control-tower，非五层）

## Done 标准:
- [ ] CI 三红 job 在 main 实绿（job 级结论，非本地推断）
- [ ] 零配置模拟（GIT_CONFIG_NOSYSTEM=1 + GIT_CONFIG_GLOBAL=/dev/null）tests/control-tower 全绿
- [ ] check-architecture.sh 基线外新增逐条列 file:line
- [ ] simulate-ci.test.sh 零断言削弱前提下转绿
- [ ] check-architecture-gate.test.ts 双环境（SYNO_CI=1 / 无）12/12 绿（D663 补：gate 测试密封化）
