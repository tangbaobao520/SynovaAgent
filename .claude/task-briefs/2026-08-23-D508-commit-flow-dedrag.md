# Task Brief: D508 提交流程减负 — 对账 merge-base + --check 全量 + brief 骨架 + 双清洁

> 生成: 2026-08-23 | 任务: D508 | 认领: dsh-cto | 依据: 创始人指示 + CTO 自查 + Win PR#128 五摩擦项综合
> 参考决策记录: memory/notes/implemented/2026-08-23-d508-commit-flow-dedrag.md

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔提交流程。一次典型交付被门禁循环消耗 7+ 轮（CTO 实测）+ Win 实测 6+ 次补记循环——时间黑洞在反馈模式（逐个揭穿）与对账自指，非质量要求本身。
### b) 文件审计
- scripts/control-tower/check-bypass-log.sh — `git log "$BASE..HEAD"`：merge main 后 main 侧实体提交落入范围 → 全要补记（Win #7 实证 6+ 次死循环）
- scripts/control-tower/synova-commit — COMMITTED 登记在 auto_tag/push 之后（set -e 下 push 失败 → 记录永缺 → 死循环）；无 --check 模式
- scripts/control-tower/alloc-task-id.sh — 认领不生成 brief 骨架（格式错误靠提交失败发现）
- scripts/install-hooks.sh — GATE_FAIL_SOFT 污染 bypass.log（Win #10 实测 10+ 次 checkout 清理）
### c) 决策
四项纯摩擦消除（质量根零触碰）：①对账范围 merge-base 化（main 已验提交不再重查；无记录新提交仍拦——双断言测试）②--check 全量 dry-run（plan-integrity+13 组+格式一次报全，Anthropic fail-fast 理念）③brief 六字段骨架认领即生成（变量用真实 NEW_ID/TITLE + 未定义守卫）④登记提前到 commit 成功瞬间 + 软噪声移独立日志。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
Anthropic CI 理念: fail fast + 完整报告（一次跑完报全清单，7 轮→1-2 轮）。Win PR#128 #7/#10 实测数据。历史教训: D451 补记机制在制造新欠账（自指）；M5 变体——本次实现中 alloc 骨架变量名错误（TASK_ID/TASK_NAME 不存在，真实为 NEW_ID/TITLE）实证了"骨架生成也要守卫"。
参考：Anthropic（完整报告）+ Win PR#128 实测 + 第一性原理（对账语义=本地新提交证据，非 main 已验提交复验）。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/check-bypass-log.sh — 对账范围 merge-base 化（回退路径保留）
- scripts/control-tower/synova-commit — --check 参数+执行体（cwd 断言防污染）；COMMITTED 登记提前（主路径+降级路径）；删 push 后旧登记防双写
- scripts/control-tower/alloc-task-id.sh — brief 骨架生成（NEW_ID/TITLE 真实变量 + 未定义守卫）
- scripts/install-hooks.sh — GATE_FAIL_SOFT 迁移 gate-soft-warnings.log
- tests/control-tower/check-bypass-log.test.sh — D508 merge-base 双断言（子 shell 防污染）
- tests/control-tower/synova-commit.test.sh — D508 七项断言（--check/登记位置/降级/软日志/骨架）
- task-state/D508.json — 状态回填
- memory/notes/implemented/2026-08-23-d508-commit-flow-dedrag.md — 决策记录 Note（D395-a 要求）
不做什么：
- 不改 scripts/audit/ 目录任何脚本（K3 红线）
- 不改 scripts/pre-commit-check.sh 的 13 组门禁判定逻辑（质量根一毫米不动，--check 只是汇总入口）
- 不做 reference-map union driver 与 D334 分支保护（归 D507 补充批次）
- 不改 .github/workflows/ 内任何 yml 文件（CI 无关）

## Q3: 验收 — 入口 → 交互 → 结果
入口: synova-commit --check / git push / alloc-task-id
处理: ①merge main 后 push 不再要求 main 侧提交记录 ②--check 一次报全部问题 ③提交后（push 前）记录已在 ④认领即有 brief 骨架
结果: 典型交付循环 7+ 轮 → 1-2 轮；D451 补记死循环消失

## 架构层:
scripts（控制塔），非产品五层

## Done 标准
- [x] verify: bash tests/control-tower/check-bypass-log.test.sh 全绿（含 merge-base 双断言）
- [x] verify: bash tests/control-tower/synova-commit.test.sh 全绿（含 D508 七项）
- [x] verify: --check 端到端——一次列出全部失败项（本轮实测 3 类同报）
- [x] verify: 提交成功瞬间 bypass.log 即含 COMMITTED 记录（行号断言 reg<push）
