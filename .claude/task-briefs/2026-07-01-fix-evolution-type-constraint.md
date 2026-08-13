# Task Brief: 修复进化引擎 SQLite type 约束违规

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | 发现于集成测试 agent-memory-store.integration.test.ts

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 驻扎企业。Agent，不是 ChatBot。
AgentMemoryStore 的 SQLite 表有 CHECK 约束：`type IN ('fact','preference','decision','pattern','entity','enterprise_fact')`。
进化引擎使用 `'user_correction'/'threshold_adjustment'/'evolution_snapshot'`，SQLite 拒绝写入——阈值调整被静默丢弃。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（修复已有模块）— packages/evolution/ + src/sentinel/runner.ts

本任务修复集成测试发现的 production bug：进化模块使用 SQLite 不接受的 type 值。
- 性质：修复
- 风险：当前所有 `memoryStore.remember()` 调用写 `threshold_adjustment` 等类型时都会抛出 `SQLITE_CONSTRAINT_CHECK` 异常，被 try/catch 吞掉→阈值调整静默丢失→用户纠错永不生效

### b) 文件审计
- `packages/evolution/src/org-adapter.ts` — 写 type:'threshold_adjustment', 查 type:'user_correction'
- `packages/evolution/src/rule-version-manager.ts` — 写 type:'evolution_snapshot', 查 type:'evolution_snapshot'
- `packages/evolution/src/expert-evolution.ts` — 查 type:'user_correction'
- `packages/evolution/src/global-analyzer.ts` — 写 type:'enterprise_fact' ✅（已正确）
- `packages/evolution/src/feedback-collector.ts` — 写 type:'enterprise_fact' ✅（已正确）
- `src/sentinel/runner.ts` — L3WriteAPI.updateThreshold 写 type:'threshold_adjustment'

关系：修复（修改 4 个文件中的 type 值 + tags）

### c) 决策
无冲突。修正所有违规的 type 值。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
1. **问题**：SQLite CHECK 约束 `type IN (...)` 拒绝 `threshold_adjustment` / `user_correction` / `evolution_snapshot`
2. **根因**：设计时假设 AgentMemoryStore 可接受任意 type 字符串，实际有白名单
3. **修复模式**：使用 `'enterprise_fact'`（在白名单中）+ 在 tags 中存储原始 type 用于查询过滤

引用依据：
- 铁律 24+31: catch 不能空吞异常（原代码 try/catch 吞掉了 CHECK 约束异常）
- 铁律 9: 改完核心定义后 grep 全仓库引用（改完 type 后 grep 确认无残留）

### b) 本任务执行约束
- rule: "所有 type 值必须在 CHECK 约束白名单中"
  verify: "grep -n \"type: '[a-z]\" packages/evolution/src/ --include='*.ts' | grep -v 'enterprise_fact\|fact\|preference\|decision\|pattern\|entity' | grep -v node_modules"
- rule: "查询时须用 type:'enterprise_fact' + tags 组合过滤"
  verify: "grep -q 'enterprise_fact.*tags' packages/evolution/src/org-adapter.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `org-adapter.ts` — adjustThresholds: type 改为 enterprise_fact + 加 tag; processCorrections: 查 enterprise_fact + tag 过滤
2. `rule-version-manager.ts` — createSnapshot: type 改为 enterprise_fact + 加 tag; listSnapshots: 查 enterprise_fact + tag 过滤
3. `expert-evolution.ts` — analyzeExpertCorrections: 查 enterprise_fact + tag 过滤
4. `src/sentinel/runner.ts` — updateThreshold: type 改为 enterprise_fact + 加 tag
5. 验证：集成测试通过

不做什么：
- 不改 AgentMemoryStore 表结构（不加新 type 到 CHECK 约束）
- 不改 feedback-collector.ts（已正确使用 enterprise_fact）
- 不改 global-analyzer.ts（已正确使用 enterprise_fact）
- 不改现有测试逻辑

## Q3: 验收 — 入口 → 交互 → 结果

入口：OrgAdapter.adjustThresholds() 写入真实 SQLite
处理：使用 enterprise_fact type + threshold_adjustment tag → SQLite 接受
结果：集成测试 `npx vitest run tests/evolution/agent-memory-store.integration.test.ts` 确认写入后可通过 tag 查询到

## 本任务在哪一层
L0（packages/evolution/）+ L3（src/sentinel/runner.ts）

## Done 标准
- [x] verify: grep -n "type: '[a-z]" packages/evolution/src/ --include='*.ts' | grep -v 'enterprise_fact\|fact\|preference\|decision\|pattern\|entity' | grep -v node_modules; test $? -eq 1
- [x] verify: npx vitest run tests/evolution/agent-memory-store.integration.test.ts 2>&1 | tail -3 | grep -q 'Tests'
- [x] verify: npx vitest run tests/evolution/org-adapter.test.ts 2>&1 | tail -3 | grep -q 'Tests'
- [x] verify: npx vitest run tests/evolution/rule-version-manager.test.ts 2>&1 | tail -3 | grep -q 'Tests'
