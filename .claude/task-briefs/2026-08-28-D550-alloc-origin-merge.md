# Task Brief: D550 alloc-task-id 查占用合并 origin/main

## Q0: 定位 — 项目拼图 + 文件审计
控制塔发号器（scripts/control-tower/alloc-task-id.sh L82-83）。盲区：占用检查只读本地 task-state/，落后主工作区漏号（D547/D548 撞号实证——main 已有 D547.json 而本地无 → alloc 重发 D547）。

## Q1: 调研
D547/D548 撞号实录（2026-08-28）；D454/D455 撞车先例（同脚本 L35 注释）；D382 教训（撞号=证据链混淆）。

## Q2: 范围
做什么:
- 更新 scripts/control-tower/alloc-task-id.sh（占用合并 origin/main + SYNO_ALLOC_NO_REMOTE 测试注入缝）
- 更新 tests/control-tower/alloc-task-id.test.sh（用例 6 origin/main 合并 + 用例 1-5 加注入开关）
不做什么:
- 不改 src/、scripts/audit/、pre-commit-check.sh

## Q3: 验收
空本地发号 > main max（不漏号）；13/13 测试绿

## 架构层: L0 控制塔
L0 控制塔发号器（scripts/control-tower/alloc-task-id.sh + tests/control-tower/）
## Done 标准:
- [x] 占用合并 origin/main（落后本地不漏号）
- [x] 测试 13/13 绿（含用例 6 origin/main 合并）
