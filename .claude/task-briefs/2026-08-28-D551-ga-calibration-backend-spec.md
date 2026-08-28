# Task Brief: D551 ga-calibration-backend-spec

> 生成: 2026-08-28 | 任务: D551 | 认领: dsh（编码 session，CTO 验收时补交入库）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 决策参考：第一性原理（GA 校准 = 人机协同数据入口，回流必须单源走事件流防旁路）+ Anthropic（垂直切片：四端点 + 认证共享 + 测试先行）+ 收敛结论：spec 为准（SYNOVA-IMPL-DSH-D551-ga-calibration-backend-20260828.md）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L1/L2/L3 交叉切片：GA 人机协同（Module-3 蓝图）三大后端能力——诊断校准（L1 路由 + L4 存储）、手动信号注入（L2 服务 + L3 runner 事件流）、反馈效用仪表（L1 只读聚合）。spec = docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D551-ga-calibration-backend-20260828.md（唯一执行契约）。

### b) 文件审计
- src/routes/ga-auth.ts — 新建（requireGa 共享认证提取，止住第四份复制）
- src/routes/ga-calibration.ts — 新建（四端点）
- src/sentinel/runner.ts — 扩展（injectManualFinding 注入链）
- src/agent/sentinel-service.ts — 扩展（injectManualSignal L2 服务）
- src/l4/agent-memory-store.ts — 扩展（MemoryType +2 值 + CHECK 迁移，spec §6.1 前提，写集偏差已声明）
- src/growth/feedback-collector.ts — 扩展（feedback_log target_type + migration d551_target_type）
- src/server.ts — 挂载 2 行
- 测试×3 新建

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 铁律 0-2 测试先行：40 用例红→绿；铁律 24/31 降级传播（runner 未初始化 → 503 degraded）
- D487 教训：扩枚举必须同步存量 DDL CHECK（agent_memory.type 重建表迁移）
- S5-2 GA 纠错回流断裂（N13）：回流双写 feedback_log（mark_error→reject / rewrite_logic→modify / demote_signal→ineffective）
- D539 教训：spec 产物必须提交 git（本 brief 与 spec 由 CTO 验收补交）

## Q2: 范围 — 正确的最简方案

做什么：
- src/routes/ga-auth.ts
- src/routes/ga-calibration.ts
- src/sentinel/runner.ts
- src/agent/sentinel-service.ts
- src/l4/agent-memory-store.ts
- src/growth/feedback-collector.ts
- src/server.ts
- tests/routes/ga-auth.test.ts
- tests/routes/ga-calibration.test.ts
- tests/sentinel/ga-manual-injection.test.ts
- task-state/D551.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D551-ga-calibration-backend-20260828.md

不做什么：
- 不改 src/agent/middle-evolution-engine.ts — 进化动作生成白名单（层 2 显式 descope）
- 不改 src/routes/sentinel.ts — 存量路由零回改（diff=0 已验证）
- 不改 src/routes/loops.ts — 存量路由零回改
- 不改 src/routes/actions-api.ts — 存量路由零回改
- 不改 scripts/audit/*.py — K3 红线

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：POST/GET /api/ga/calibration、POST /api/ga/calibration/signals、GET /api/ga/calibration/stats（requireGa 认证）
处理（中间步骤）：校准 append-only + supersedes 版本链；注入走 runner 事件流单源（零旁路）；回流双写 feedback_log
结果（最终展示）：校准列表/信号 201/统计仪表（回流计数 ≠ 采纳率 诚实声明在响应体）

## 架构层: L1-L3

L1 路由（ga-calibration/ga-auth）+ L2 服务（sentinel-service）+ L3 runner 注入链 + L4 存储前提（agent-memory-store）

## Done 标准: 以下全部物理可验

- [x] verify: npx vitest run tests/routes/ga-calibration.test.ts tests/routes/ga-auth.test.ts tests/sentinel/ga-manual-injection.test.ts —— 40/40 绿
- [x] verify: npx vitest run <域回归 52 文件清单> —— 52/365 绿（evidence/D551/vitest-domain-regression.txt 清单）
- [x] verify: npx tsc --noEmit --pretty false | grep -c "error TS" —— 28 = main 基线（零新增）
- [x] verify: git diff origin/main...HEAD -- src/routes/sentinel.ts src/routes/loops.ts src/routes/actions-api.ts —— 空（存量零回改）
- [x] verify: git diff origin/main...HEAD --name-only | wc -l —— 11 文件（写集一致）
- [x] verify: grep -c "as any" src/routes/ga-calibration.ts src/routes/ga-auth.ts —— 仅注释 1 处，代码 0
