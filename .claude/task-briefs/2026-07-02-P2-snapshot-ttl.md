# Task Brief: Phase P2 — 快照 TTL 自动清理

> 生成: 2026-07-02 | 分支: feat/prompt-architecture | ARCH-13 §6.5

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 横向（修改已有包）— packages/evolution/src/rule-version-manager.ts + src/server.ts

本任务为 RuleVersionManager 添加快照自动清理能力。当前 `evolution_snapshot` 永不过期，每月聚合产生一个新快照，12 个月后 12 个快照累积无上限。

- 性质：加固（添加清理方法 + 接线到 Cron）
- 默认策略：保留最近 10 个快照（`cleanupSnapshots(10)`），可选按天数清理
- 触发时机：每周 Cron 聚合后自动执行

### b) 文件审计
- `packages/evolution/src/rule-version-manager.ts` — 主修改文件，添加 cleanupSnapshots()
- `src/server.ts` — Cron 聚合 handler 末尾加一行 cleanupSnapshots()
- `packages/evolution/src/index.ts` — 无需修改（不导出新类型）

关系：加固（添加方法 + 接线）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题**：快照永久保留，无上限。每月 1 个，3 年 = 36 个，每个 ~50KB → 1.8MB。存储不是问题，但 listSnapshots 的查询会越来越慢（`limit: 100` 已是上限）。
2. **为什么不依赖 AgentMemoryStore 的 TTL**：现有快照都是 `expiresAt: null`。改造已有数据不如在 RuleVersionManager 层加清理方法。
3. **策略选择**：
   - **计数保留**（默认 10）：简单确定，用户知道「保留最近 N 个快照」
   - **时间保留**（可选 90 天）：适合合规需求
   - 两者结合：cleanupSnapshots(10, 90) → 最多保留 10 个，且不超过 90 天

引用依据：
- 铁律 24+31: 清理失败不阻断整体（log.warn + degraded）
- 铁律 35: 自动化优先 — Cron 后自动清理，无需手动操作

### b) 本任务执行约束
- rule: "cleanupSnapshots 必须按 createdAt 排序，保留最新的"
  verify: "grep -q 'createdAt\|sort.*created\|newer' packages/evolution/src/rule-version-manager.ts"
- rule: "清理必须在 Cron 聚合后自动执行"
  verify: "grep -q 'cleanupSnapshots' src/server.ts"
- rule: "默认保留至少 5 个快照（maxCount 默认值 ≥ 5）"
  verify: "grep -q 'cleanupSnapshots(maxCount.*10\|cleanupSnapshots(10' packages/evolution/src/rule-version-manager.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `rule-version-manager.ts` 新增 `cleanupSnapshots(maxCount, maxAgeDays?)`：
   - 列出所有快照 → 按 createdAt 降序排列
   - 保留前 maxCount 个 → 删除其余
   - 如果指定 maxAgeDays，删除超过该天数的快照
   - 返回已删除数量
2. `src/server.ts` Cron handler 末尾添加 `rvm.cleanupSnapshots(10)`

不做什么：
- 不改 listSnapshots 的返回格式
- 不改 createSnapshot 的签名
- 不改 AgentMemoryStore
- 不改任何测试 mock

## Q3: 验收 — 入口 → 交互 → 结果

入口：Cron 聚合后调用 cleanupSnapshots(10)
处理：列出快照 → 排序 → 删除超出部分
结果：最多保留 10 个快照，超出部分被自动删除

## 本任务在哪一层
L0（packages/evolution/）+ L1（src/server.ts Cron handler）

## Done 标准
- [x] verify: grep -q 'cleanupSnapshots' packages/evolution/src/rule-version-manager.ts
- [x] verify: grep -q 'cleanupSnapshots' src/server.ts
- [x] verify: npx vitest run tests/evolution/rule-version-manager.test.ts 2>&1 | tail -5 | grep -q 'Tests'
- [x] verify: npx tsc --noEmit 2>&1 | grep 'rule-version\|server.ts'; test $? -eq 1
