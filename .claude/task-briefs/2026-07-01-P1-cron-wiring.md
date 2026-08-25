# Task Brief: Phase P1 — Cron 接线（`aggregateAllIndustries` → CronScheduler）

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | L0 进化层第三层 Cron 触发

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（改 server.ts 注册 Cron 任务）— src/server.ts

`aggregateAllIndustries()` 已实现并导出（P1-2），但只能通过 `POST /api/evolution/aggregate/:industry` 手动触发。本任务将其接入 CronScheduler，每周自动聚合所有行业的阈值基线。

- 性质：接线（已有能力 + Cron 调度器 = 自动运行）
- 触发频率：每周日凌晨 2:00（`0 2 * * 0`），与 db-backup 和 daily-briefing 错开
- 流程：snapshot（回滚安全）→ 聚合所有行业 → 生成提案

### b) 文件审计
- `src/server.ts` — 唯一修改文件（在现有 Cron 注册区加一行）
- `src/cron/scheduler.ts` — 已有 schedule() 方法，无需修改
- `packages/evolution/src/global-analyzer.ts` — 已有 aggregateAllIndustries，无需修改
- `packages/evolution/src/rule-version-manager.ts` — 用于 snapshot，无需修改

关系：接线（不改已有逻辑，只在 server.ts 加一行调度）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题**：行业聚合只在手动触发时运行。如果 FDE 忘记每周调用，行业阈值永不过期。
2. **为什么不放 sentinel/runner.ts 里**：哨兵是 L3 洞察层，行业聚合是 L0 进化层的 Cron 任务。职责分离。
3. **Cron 表达式选择**：`0 2 * * 0` = 每周日 2:00 AM。与每天 19:00 的 daily-briefing 和每天 3:00 的 db-backup 错开，避免同一时间资源竞争。
4. **安全措施**：聚合前先 snapshot，确保可回滚——复用 P1-3 的 RuleVersionManager + P1-1 的 L3WriteAPI。

引用依据：
- 铁律 7: 入口可触达（Cron 自动触发）+ 链路完整 + 结果可见
- 铁律 24+31: catch 有 log + degraded，单个行业失败不阻断整体
- 铁律 37: 接线不修改已有模块

### b) 本任务执行约束
- rule: "Cron 表达式必须与其他定时任务错开"
  verify: "grep -q '0 2 \* \* 0\|0 3 \* \* \*\|0 19 \* \* \*' src/server.ts"
- rule: "聚合前必须创建快照（回滚安全）"
  verify: "grep -q 'createSnapshot\|RuleVersionManager' src/server.ts"
- rule: "必须使用 getGlobalSentinelRunner() 获取 L3WriteAPI"
  verify: "grep -q 'getGlobalSentinelRunner\|getL0API' src/server.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `src/server.ts` 在现有 Cron 注册区之后添加一行：
   - Cron 表达式 `0 2 * * 0`（每周日 2:00）
   - handler：snapshot → aggregateAllIndustries → log

不做什么：
- 不改 scheduler.ts
- 不改 global-analyzer.ts
- 不改 rule-version-manager.ts
- 不改 routes/evolution.ts

## Q3: 验收 — 入口 → 交互 → 结果

入口：每周日 2:00 → CronScheduler 触发
处理：RuleVersionManager.createSnapshot() → L3WriteAPI → aggregateAllIndustries()
结果：所有行业的阈值基线被重新聚合，有 snapshot 保护

## 本任务在哪一层
L1 → L0（server.ts 注册 Cron → evolution 包）

## Done 标准
- [x] verify: grep -q '0 2 \* \* 0\|evolution-aggregation' src/server.ts
- [x] verify: grep -q 'RuleVersionManager\|createSnapshot' src/server.ts
- [x] verify: npx tsc --noEmit 2>&1 | grep 'server.ts'; test $? -eq 1
