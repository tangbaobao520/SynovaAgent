# Task Brief: Phase 1 Pilot — cash-runway aggregate 迁移到图遍历

> 生成: 2026-07-05 12:26:27 | 分支: session/04 | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向 — 改 L4 extensions（extensions/sentinels/cash-runway/aggregate.ts）

**系统**: 哨兵 — L4 extensions（哨兵延伸层）。
**本任务**: 将 cash-runway aggregate 从 KV 读取模式（queryNodes + .props）迁移到图遍历模式（traversal.traverse + getTemporalParams）。
- 当前: `check(store, teamId)` → `store.queryNodes('Financial', { teamId })` → `.props.cashBalance`
- 改为: `check(store, teamId, traversal?)` → `traversal?.traverse(teamId, ['FUNDS'])` → `n.props.cash_balance`
- traversal 失败时降级到 queryNodes 旧路径

**本任务是新增迁移模式**（在已有 check() 中加图遍历路径），不是修改框架。

### b) 文件审计
- `extensions/sentinels/cash-runway/aggregate.ts` — 本任务修改的目标文件
- `src/sentinel/sentinel-loader.ts` — Phase 0 已注入 traversal（本任务不改）
- `src/sentinel/types.ts` — Phase 0 已加 `traversal?` 字段（本任务不改）

关系: 复用 Phase 0 的 GraphTraversal 注入机制。扩展 cash-runway aggregate 的数据访问方式。

### c) 决策
无覆盖 → 新建迁移。已有 GraphTraversal API（Phase 0）→ 复用。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
  ① 读取当前 aggregate 代码 → 理解数据访问模式（queryNodes + 4 个 .props 字段）
  ② 改为 try-traversal-fallback-queryNodes 模式
  ③ 测试：mock traversal + mock store 分别验证两条路径
  ④ tsc + vitest 全通过

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 24+31: traversal 失败 → log.warn + 降级到旧路径
  - 铁律 38: as any 零容忍
  - Phase 0 memory: traversal 是可选第 3 参，旧 aggregate 不收也能工作

### b) 本任务执行约束
- rule: "traversal 返回空数据时必须降级到 queryNodes 旧路径"
  verify: "grep -c 'queryNodes' extensions/sentinels/cash-runway/aggregate.ts | xargs test 1 -eq"
- rule: "新字段映射使用 snake_case（MONEY 节点规范）"
  verify: "grep -c 'cash_balance' extensions/sentinels/cash-runway/aggregate.ts | xargs test 1 -eq"
- rule: "catch 块必须有 log.warn + 不吞错误"
  verify: "grep -c 'log.warn' extensions/sentinels/cash-runway/aggregate.ts | xargs test 1 -eq"

## Q2: 范围 — 正确的最简方案是什么？

**做什么**:
- `extensions/sentinels/cash-runway/aggregate.ts`: 加第 3 参 `traversal?`，加 try-traversal 路径，保留 fallback queryNodes
- 字段映射: `cashBalance` → `cash_balance`, `operatingExpenses` → `total_cost`（或 `monthly_burn`）, `accountsReceivable` → `accounts_receivable`

**不做什么**:
- 不改 `extensions/sentinels/cash-runway/manifest.json`
- 不改 `src/sentinel/sentinel-loader.ts`（Phase 0 已完成）
- 不改 `src/sentinel/types.ts`
- 不改 `src/l4/graph-traversal.ts`
- 不加新测试文件（这是试点迁移，验证模式即可）
- 不改其他 aggregate

## Q3: 验收 — 入口 → 处理 → 结果

**入口**: Cron 触发 Runner → sentinel-loader.ts → check(store, teamId, traversal?)
**处理**: traversal 优先：traverse → MONEY 节点 → 读取 cash_balance/total_cost → 计算 runwayMonths → 与阈值对比 → 产出 finding
         降级：traversal 失败/空 → queryNodes('Financial') → .props.cashBalance → 同样计算
**结果**: 哨兵产出 SentinelFinding[]（与迁移前输出一致或更好）

## 本任务在哪一层
L4（sentinel 延伸层 — extensions/sentinels/cash-runway/）

## Done 标准
- [x] verify: npx tsc --noEmit 2>&1 | grep -c error | xargs -I{} bash -c 'test {} -eq 0 && echo PASS || echo FAIL'
- [x] verify: npx vitest run 2>&1 | grep -q "passed" && echo "PASS"
- [x] verify: grep -c "traversal?" extensions/sentinels/cash-runway/aggregate.ts | xargs test 1 -eq
- [x] verify: grep "queryNodes" extensions/sentinels/cash-runway/aggregate.ts | grep -v "^.*//.*queryNodes" | grep -c "queryNodes" | xargs test 1 -eq
- [x] verify: grep -c "log.warn" extensions/sentinels/cash-runway/aggregate.ts | xargs test 2 -eq
- [x] verify: grep "as any" extensions/sentinels/cash-runway/aggregate.ts && echo FAIL || echo PASS
