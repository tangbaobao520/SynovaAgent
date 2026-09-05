# Task Brief: D584 P1-DSH线测试债-sentinels与契约批

> 生成: 2026-09-06 | 任务: D584 | 认领: DSH 编码线（CTO 直派测试债批）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
P1 测试债批（Win 盘点台账 898785d6 承接）。绿测试 = 专家架构 P1 改名的安全网。
### b) 文件审计
layer2-judge 41 测试 36 失败（Mac 实测）；l4-edges validateEdgeEndpoints；现权威 7 专家 host/capital-cycle/customer-cycle/talent-cycle/tech/finance-structure/competitive-strategy（expert/ 目录实测）
### c) 决策
逐文件判定测试过时 vs 产品 bug；真 bug 转单不混入

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
<引用铁律编号 + memory/ 教训；多选项必填决策参考小节>
参考：<参考系 + 结论>

## Q2: 范围 — 正确的最简方案
做什么：
- tests/sentinels/
- tests/config-file.test.ts
- tests/contract/
- tests/control-tower/signal-emitter.test.ts
- tests/env/
- tests/deploy/
- tests/golden-scenarios/
- tests/data-pipeline.feishu.integration.test.ts
- tests/data-pipeline.ingest.integration.test.ts
- tests/electron/
- task-state/D584.json
不做什么：
- 不改 scripts/audit/（K3 红线）
- 不改 <具体文件路径，排除项必须含文件名>

## Q3: 验收 — 入口 → 交互 → 结果
入口：<从哪触发>
处理：<中间步骤>
结果：<最终可验证输出>

## 架构层:
<L1-L5 或 scripts（控制塔）>

## Done 标准
- [x] 两批文件全绿或平台豁免 — verify: npx vitest run tests/sentinels/
- [x] 失败集净减 ≥45 — verify: npx vitest run 2>&1 | grep -c FAIL
- [x] tsc 28=28 — verify: npx tsc --noEmit
- [ ] verify: <可执行命令> <预期>
