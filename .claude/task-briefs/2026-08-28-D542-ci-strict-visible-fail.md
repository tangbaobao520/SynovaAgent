# Task Brief: D542 CI strict 失败可见性修复

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova 控制塔 pre-commit 13 组门禁。本任务在组间公共函数层（soft_check/warn_check），修 CI strict 模式下的输出可观察性：两函数在 SYNO_CI=1 时 HARD_FAIL+1（计数为硬失败）但只打印黄色 ⚠️，导致 CI 汇总「N 组未通过」在日志中找不到对应 ❌ 行。D541 CI 红「2 组未通过」排查耗费一整轮即此缺陷代价（根因最终靠 CTO 拉 CI 日志逐组比对才定位）。
### b) 文件审计
scripts/pre-commit-check.sh 内 soft_check()（L86）/ warn_check()（L152）/ v5_soft()（L106，正确示范：CI 下打 ❌）。仅改 soft_check/warn_check 两函数的显示分支，v5_soft 不动；判定逻辑（HARD_FAIL/SOFT_COUNT/WARN_COUNT 计数）零变化。
### c) 决策
已有 v5_soft 正确示范 → 对齐它，不发明新格式。参考：Anthropic（fail loudly 原则——失败必须可见）+ 第一性原理（计为硬失败却显示警告 = 输出与计数不一致，观察者被误导）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界：CI 失败输出必须点名（GitHub Actions annotations / pytest -v 失败行均显式标红）。
b) 顶尖团队：失败摘要必须可追溯到具体条目，禁止只给计数不给明细。
c) memory/ 教训：M1 fail-open 静默失效（检查未执行==检查通过——本缺陷是变体：失败发生了但显示为警告=观察者以为没有硬失败）；D541 排查实录（「2 组未通过」无 ❌ 指向 → 猜 grep -P → 错误方向）。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh：soft_check() 与 warn_check() 的显示分支重排——SYNO_CI=1 时打印 RED ❌ + [CI strict]，本地打印 YELLOW ⚠️ 原样；计数逻辑一字不动
- tests/control-tower/ci-strict-visible.test.sh：新建配对测试（6 断言：接线/本地⚠️/CI❌/warn 同型/边界 miss）
不做什么（含文件路径）：
- 不改 v5_soft()（已是正确行为）
- 不改任何判定/计数语义（HARD_FAIL/SOFT_COUNT/WARN_COUNT 的加减条件原样）
- 不改 scripts/audit/、src/、其他门禁组逻辑
- 不改 ci.yml（工作流层无变化）

## Q3: 验收 — 入口 → 交互 → 结果
入口（从哪触发）：pre-commit / CI Iron Laws job 跑 pre-commit-check.sh 时任一 soft_check/warn_check 命中
处理（中间步骤）：SYNO_CI=1 → RED ❌ 行（含检查名 + 计数 + [CI strict]）+ 明细行
结果（最终展示）：CI 日志中「N 组未通过」的每一组都有对应 ❌ 行可追溯；本地模式显示不变（⚠️）

## 架构层: L0 控制塔工具层（scripts/）
## Done 标准: tests/control-tower/ci-strict-visible.test.sh 6/6 绿（含「SYNO_CI=1 → ❌」断言）+ bash -n 语法过 + 本地 pre-commit 13 组过 + CI quality job 绿
