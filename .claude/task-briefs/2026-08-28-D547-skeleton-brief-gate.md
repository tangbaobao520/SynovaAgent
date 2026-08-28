# Task Brief: D547 骨架 brief 占位符物理门禁

## Q0: 定位 — 项目拼图 + 文件审计
控制塔 pre-commit 组 6（Task Brief）。alloc-task-id 生成的骨架 brief 含未填占位符（认领字段尖括号 agent、Q0 尖括号问题句），曾随派单误提交进 main → check-plan-integrity CI 回退命中占位符 → 全局阻断非 docs PR（D544/D546 实证，同类失误第三次）。固化 = 物理门禁（非台账文字）。

## Q1: 调研
铁律 35（能变门禁的不靠文档）/ 一类一机制（防臃肿——三次失误归为"未完成骨架产物进 main"一类）。D544/D546 台账实录。

## Q2: 范围
做什么:
- 更新 scripts/pre-commit-check.sh（组 6 加 hard_check 骨架 brief 占位符检测）
- 新建 tests/control-tower/skeleton-brief-gate.test.sh
不做什么:
- 不改 src/、scripts/audit/、alloc-task-id.sh（骨架生成逻辑保留，只拦提交）

## Q3: 验收
骨架 brief（占位符未填）提交被 hard_check 拦；填好 brief 放行；配对测试 6/6

## 架构层
L0 控制塔工具层（scripts/pre-commit-check.sh + tests/control-tower/）
## Done 标准:
- [x] 配对测试 skeleton-brief-gate.test.sh 6/6 绿
- [x] CI quality job 绿（骨架 brief 占位符检测生效）
