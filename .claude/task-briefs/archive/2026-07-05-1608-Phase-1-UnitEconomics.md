# Task Brief: Phase 1 Pilot — unit-economics aggregate 迁移到图遍历

> 生成: 2026-07-05 16:08 | 分支: session/04 | V4.4.0

## Q0

- [x] 纵向 — 改 `extensions/sentinels/unit-economics/aggregate.ts`

**系统**: 哨兵 — L4 extensions。最复杂 aggregate：queryNodes (FINANCIAL+CLIENT) + queryEdges (COST_DRIVEN_BY) + 7 compute 函数。
**本任务**: 迁移到图遍历。3 条数据源分别用 traverse + evaluateEdges。

**文件审计**:
- `extensions/sentinels/unit-economics/aggregate.ts` — 本任务修改
- `extensions/sentinels/unit-economics/computes/` — 7 个纯函数，不改
- 7 个 compute: ltv-cac-ratio, gross-margin-per-unit, variable-costs, marginal-contribution, fixed-cost-rigidity, scenario-simulation, break-even

**决策**: 无覆盖 → 新建迁移。

## Q1

**决策链**: ① 读代码 → 3 个数据路径 (FINANCIAL/CLIENT/COST_DRIVEN_BY) → ② 每条加 traversal 路径 → ③ fallback 到 queryNodes/queryEdges → ④ 7 个 compute 不变

**约束**:
- rule: "traversal 返回空时必须降级到 queryNodes"
- rule: "不使用 nodes.length"
- rule: "catch 必须有 log.warn/error"

## Q2

**做什么**: `extensions/sentinels/unit-economics/aggregate.ts` — 3 条数据路径加图遍历

**不做**:
- 不改 7 个 compute 文件
- 不改 `extensions/sentinels/unit-economics/manifest.json`
- 不改 `src/sentinel/sentinel-loader.ts`
- 不改其他 aggregate

## Q3

**入口**: Cron → Runner → sentinel-loader → check(store, teamId, traversal?)
**处理**: traversal traverse → FINANCIAL_OUTCOME/MONEY/CLIENT 节点 → 7 compute → finding
**结果**: SentinelFinding[]

## 架构层: L4

## Done 标准
- [x] verify: npx tsc --noEmit 2>&1 | grep -c error | xargs -I{} bash -c 'test {} -eq 0 && echo PASS || echo FAIL'
- [x] verify: npx vitest run 2>&1 | grep -q "passed" && echo "PASS"
- [x] verify: grep -c "traversal?" extensions/sentinels/unit-economics/aggregate.ts | xargs test 1 -eq
- [x] verify: grep "nodes.length" extensions/sentinels/unit-economics/aggregate.ts && echo FAIL || echo PASS
- [x] verify: grep "as any" extensions/sentinels/unit-economics/aggregate.ts && echo FAIL || echo PASS
