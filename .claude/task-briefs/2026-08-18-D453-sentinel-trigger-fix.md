# Task Brief: D453 哨兵触发路径修复（runSentinelOnce db:undefined）

> 生成: 2026-08-18 | 分支: feat/d453-sentinel-trigger-fix | 角色: DeepSeek Harness (Mac)
> 依据: D442 GS-03 转绿前置（三层阻塞之「触发 bug」，DSH 领地）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
GS-03 转绿三层阻塞之一。`POST /api/sentinel/run/:id` → `runSentinelOnce` 传 `db: undefined`
→ 哨兵 wrapper 拿空 store → compute 读不到注入数据 → 恒 degraded，阈值永不触发。

### b) 文件审计（grep 实测，非凭记忆）
- runSentinelOnce（src/agent/sentinel-service.ts:173）传 `db: undefined`（根因）
- SentinelRunner.check（src/sentinel/runner.ts:835-852）已正确包装 GraphStore（参考实现）
- getDatabase（src/init/engine-context.ts:49）返回 `Database.Database`
- SqliteGraphStore（src/adapters/sqlite-graph-store.ts:106）构造函数包装 db → queryNodes

### c) 决策（D333，K3 可核）
参考：Anthropic（复用 runner.ts 已验证的 GraphStore 包装，最小机制，不发明新路径）+
第一性原理（db:undefined 是根因，对齐 runner 的构造即修复）。结论：inline 复制 runner
的 GraphStore 构造逻辑。

## Q1: 调研 — 决策链 + 历史教训
引用铁律 0-2/24/31/47/48。M3 机制未接线教训：哨兵阈值告警已接线（D356）但触发路径
（runSentinelOnce）未给 store，属「机制建成未接线」同型。降级：GraphStore 构造失败 →
回退原始 db（log.warn + 不静默，铁律 24/31）。

## Q2: 范围 — 最简方案

做什么：
- src/agent/sentinel-service.ts
- tests/sentinel/sentinel-service-runonce.test.ts

不做什么：
- 不改 src/sentinel/runner.ts（参考实现，保持不动）
- 不改 extensions/sentinels/cash-runway/compute-cash-runway-months.ts（D355 范畴）
- 不改 scripts/audit/audit-check.py（K3 红线）

## Q3: 验收 — 入口→交互→结果

入口：POST /api/sentinel/run/:id（runSentinelOnce）
处理：getDatabase → 按需 SqliteGraphStore 包装 → 构造 context
结果：sentinel.check 收到带 queryNodes 的 store（非 undefined）

## 架构层: L2

#CRITERIA: A

## Done 标准
- [ ] grep -n "SqliteGraphStore" src/agent/sentinel-service.ts 命中（接线）
- [ ] tests/sentinel/sentinel-service-runonce.test.ts 含 expect 断言（正常 + 降级路径）
- [ ] npx vitest run tests/sentinel/sentinel-service-runonce.test.ts 全绿
- [ ] npx tsc --noEmit 零新增错误
