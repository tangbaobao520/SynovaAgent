# Task Brief: D555 verify-parallel-ci-closed-task-exempt

> 生成: 2026-08-28 | 任务: D555 | 认领: CTO (DeepSeek Harness)
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 决策参考：第一性原理（门禁目的 = 拦在途并行冲突；已关闭任务的串行文件复用不是冲突）+ Anthropic（机器可验信号源：task-state status + audit-reports 文件）+ 收敛结论：只豁免已关闭侧，fail-closed 不削弱

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔门禁层（scripts/control-tower/verify-parallel.sh 的 --ci-pr 模式）。
D551 实证：新任务 spec 写集含 src/server.ts（D478 已合终审）与 src/growth/feedback-collector.ts（D338 已合有审计报告）——V5.2.0「无豁免纯重叠判定」把串行复用误判为并行冲突。

### b) 文件审计
- scripts/control-tower/verify-parallel.sh：compare_writesets_ci 无豁免；ci-pr 主循环 L339-345 两两比对
- tests/control-tower/verify-parallel-ci.test.sh：现有 T1-T5（7 断言），沙箱模式可扩展
- task-state/<D#>.json status=audited（D382 终态信号）
- docs/synova/audit-reports/*-D#*.md（历史任务关闭信号，D393 派生制同源）

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- V5.0.1 已完成任务豁免被 V5.2.0 移除（"豁免会让对比恒过"——文件存在性信号恒真）；本修复换**任务状态信号**（audited 终态），保留在途对比能力
- 铁律 0-2 接线验收：豁免分支 + 测试；铁律 48 三路径：豁免正常（T7/T8）+ 边界（T9 不削弱）+ 接线（T6）
- D393 派生制：audit 报告存在 = 任务关闭——与状态机同源，不新建信号
- ctrl-tower-change 模式 1/5：三态退出不变、测试沙箱注入

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/verify-parallel.sh：+_is_closed_doc()（task-state audited / audit-reports glob 两信号）+ ci-pr 循环对已关闭 mtmp 豁免（输出点名）
- tests/control-tower/verify-parallel-ci.test.sh：+T6 接线 / T7 audited 豁免 / T8 审计报告豁免 / T9 无信号仍 block（7→12 断言）
- .codex/control-tower/VERSION.md：V5.2.4（PATCH，bump 同 commit，tag 待 main 合并后打）

不做什么：
- 不改 scripts/control-tower/devdoc_writeset.py — 写集解析本体不动
- 不改 scripts/control-tower/verify-parallel.sh 内 compare_writesets_ci 函数 — 判定本体零触碰，豁免在调用侧
- 不改 scripts/audit/check-gates-v2.py — K3 红线
- 不改 src/sentinel/runner.ts — 产品代码（D551 任务文件，本任务零触碰）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：CI quality job `verify-parallel.sh --ci-pr origin/main`
处理（中间步骤）：PR doc × 已合 doc 两两比对；已合 doc 任务关闭（audited/有审计报告）→ 豁免并点名
结果（最终展示）：D551 PR 的 D338/D478 两对重叠被豁免，CI 绿；在途任务重叠仍拦

## 架构层: 控制体系

scripts/control-tower/ + tests/control-tower/（门禁脚本层，非 L1-L5 产品层）

## Done 标准: 以下全部物理可验

- [x] verify: bash tests/control-tower/verify-parallel-ci.test.sh —— 12/12 全绿
- [x] verify: bash -n scripts/control-tower/verify-parallel.sh —— 语法零错误
- [x] verify: cd .wt-d551-verify && bash scripts/control-tower/verify-parallel.sh --ci-pr origin/main —— D551 spec vs D338/D478 豁免放行（exit 0 + 点名）
- [x] verify: 沙箱无关闭信号场景仍 exit 1（T9，fail-closed 不削弱）
- [x] verify: git ls-remote --tags origin V5.2.4 —— main 合并后 tag 落位（D319 三处同步）
