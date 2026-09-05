# Task Brief: D535 Stage1-D4-guard-timeout

> 生成: 2026-08-26 | 任务: D535 | 认领: dsh | 切片: stage1-cont
> 参考: 编码指令-Stage1续-D534-D535-20260826.md + SYNOVA-IMPL-DSH-D535-guard-loop-hygiene-20260826.md

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属 L0 工程治理层（控制塔）：incident-loop.py（D314 学习闭环）+ synova-commit（提交网守）。现有 staging_guard.py 已接线（synova-commit:477-490 block），但 incident-loop 零生产调用方（学习闭环死）+ 超时各写各的 + 无重复事故提醒。本任务：guard 循环卫生通用化（借鉴 DSH timeout-policy + repeat-tool-reminder，融入现有 guard 不新建）。
### b) 文件审计
- scripts/control-tower/incident-loop.py:149-151 — 幂等 duplicate 静默返回（无 reminder 字段）
- scripts/control-tower/synova-commit:504-516 — block 分支 exit 1 前无 incident-loop 调用
- 长跑脚本超时：gen-task-board.py:169(20s) / generate-dashboard.py:84(10s) / gen-cto-health.py:183(30s) / founder-truth.py:39(30s) / attach.py:141(5s)
- tests/control-tower/incident-loop.test.sh — 既有（D314），5 用例
### c) 决策
已有覆盖→融入不新建：不改 staging_guard.py 本体（D311/D329 已审计）、不改 verify 超时（timeout=10 已有）、不批量改 timeout 值（文档化验证）。新建 docs/synova/coordination/控制塔循环卫生标准-20260826.md + tests/control-tower/incident-loop-hygiene.test.sh。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 24/31（降级诚实）：fail-open 显式提示不静默；铁律 35（自动化优先）：标准文档化 + grep 可验证
- DSH 范式：dsh-tool-call-timeout-policy（timeoutMs 声明 + deadline enforce）+ dsh-repeat-tool-reminder（thresholds [3,5,8] 阶梯提醒 + advisory only），不引代码
- memory 教训：D529（时间黑洞防膨胀——只治真问题不建新机制）；D473（运行时 guard 已交付，不重复）
参考：Anthropic（fail-closed 显式降级）+ DSH（声明式超时 + 重复提醒 advisory only）+ 第一性原理（学习闭环接线的最小机制 = block 分支调 record）+ 结论：按天聚合 id、重复提醒不阻断、文档化不批量改值

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/incident-loop.py — record duplicate 加 repeat_count/reminder/last_recorded + future import 兼容 py3.9 + 头注释契约
- scripts/control-tower/synova-commit — block 分支接线 incident-loop record（fail-open）
- docs/synova/coordination/控制塔循环卫生标准-20260826.md — 新建（超时契约/重复提醒/接线说明）
- tests/control-tower/incident-loop-hygiene.test.sh — 新建（≥8 用例：5 L1 + 2 L2a + 1 L2b + 1 L2c）
不做什么：
- 不改 staging_guard.py（D311/D329 已审计）
- 不改 src/（D473 运行时 guard 已交付）
- 不新建 guard 脚本/门禁组（防膨胀）
- 不批量改控制塔脚本 timeout 值
- 不改 scripts/audit/（K3 红线）

## Q3: 验收 — 入口 → 交互 → 结果
入口：staging-guard block（并行冲突）→ synova-commit block 分支
处理：调用 incident-loop.py record（同 id 重复 → reminder 提醒，fail-open 不阻断）
结果：incident.log 有真实记录 + 重复事故有提醒（测试可复现）+ 循环卫生标准文档存在（grep 可查）

## 架构层: L0（工程治理/开发侧）+ 控制塔（不触碰 L1-L5）

## Done 标准
- [ ] verify: bash tests/control-tower/incident-loop-hygiene.test.sh — ≥8 用例全绿（PASS=12 FAIL=0）
- [ ] verify: grep -n "incident-loop" scripts/control-tower/synova-commit — 命中 block 分支调用
- [ ] verify: grep -n "subprocess.*timeout\|重复事故提醒" docs/synova/coordination/控制塔循环卫生标准-20260826.md — 命中
- [ ] verify: grep -rn "subprocess" scripts/control-tower/*.py | grep -v "timeout=" — 除基线缺口外零结果
- [ ] verify: git diff --name-only — 与写集一致（4 文件）
