# Task Brief: Phase P1 — L0 进化引擎集成测试（真实 SQLite）

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | 弥合 mock 与生产之间的缺口

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。Agent，不是 ChatBot。
L0 进化引擎的 83 个测试全部使用 mock AgentMemoryStore。
mock 不验证标签过滤（SQLite JSON LIKE）、类型过滤、租户隔离的真实行为。
**测试全绿 ≠ 生产可用。**

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（测试）— tests/evolution/*.integration.test.ts

本任务为 L0 进化引擎添加真实 SQLite 集成测试。
- 性质：测试（不改生产代码，只加测试文件）
- 为什么现在做：架构评审发现 mock 与生产行为有 3 个已知差异点：
  1. Tag 过滤：mock 用 `Array.includes`，SQLite 用 `LIKE '%"tag"%'`
  2. 租户隔离：mock 手动实现，SQLite 靠 `WHERE org_id = ?`
  3. UPSERT：mock 覆盖写，SQLite 用 `INSERT OR REPLACE`

### b) 文件审计
- `tests/evolution/agent-memory-store.integration.test.ts` — 新建
- `tests/l4/agent-memory-store.test.ts` — 已有（只测单一 store 操作）
- `packages/evolution/src/org-adapter.ts` — 被测对象
- `packages/evolution/src/global-analyzer.ts` — 被测对象
- `packages/evolution/src/rule-version-manager.ts` — 被测对象
- `packages/evolution/src/expert-evolution.ts` — 被测对象

关系：新建（集成测试），不改任何生产代码

### c) 决策
无冲突。测试全新建。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题定义**：83 个单元测试全部使用 mock。mock 与真实 SQLite AgentMemoryStore 的 3 个差异点可能导致测试全绿但生产崩溃。需要集成测试覆盖这些差异。

2. **最小可行方案**：对每个差异点写一个集成测试。不是重写现有单元测试，而是补充 mock 无法覆盖的 SQLite 行为验证。

3. **3 个差异点**：
   | 行为 | Mock | 真实 SQLite | 风险 |
   |------|------|-------------|------|
   | Tag 过滤 | `Array.includes` — 精确匹配 | `LIKE '%"F1"%'` — JSON 子串匹配 | mock 不会漏配，SQLite 也不会 |
   | 联合类型 `['threshold_adjustment', 'F1']` | 没问题 | `LIKE` 会匹配任何包含该子串的 JSON 数组 | mock 不会产生误配 |
   | 租户隔离 | 自定义 `mapKey` | `WHERE org_id = ?` | 两者行为一致 |

   实际上这 3 个差异点在当前使用方式下风险很低。**真正的风险是**：如果将来修改了 `list()` 的 SQL 查询（比如改了 tag 过滤逻辑），单元测试不会发现——因为 mock 不执行 SQL。

4. **测试范围**：验证每个进化模块的核心方法在真实 AgentMemoryStore 上的行为与 mock 一致。不是测 SQLite 本身（那个在 `tests/l4/agent-memory-store.test.ts` 已测）。

引用依据：
- 铁律 33: 测试命名约定 — *.integration.test.ts
- 铁律 12: 集成测试 cover 真实路由，不 mock 管线
- 铁律 0-2: spec → test → impl → wire → review → merge

### b) 本任务执行约束
- rule: "集成测试必须使用 better-sqlite3 :memory: 数据库"
  verify: "grep -q 'better-sqlite3' tests/evolution/*.integration.test.ts"
- rule: "必须使用真实的 AgentMemoryStore 实例（非 mock）"
  verify: "grep -q 'new AgentMemoryStore' tests/evolution/*.integration.test.ts"
- rule: "必须覆盖至少 3 个进化模块（OrgAdapter/RuleVersionManager/global-analyzer）"
  verify: "grep -c 'OrgAdapter\|RuleVersionManager\|generateThresholdProposal\|listProposals' tests/evolution/*.integration.test.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `tests/evolution/agent-memory-store.integration.test.ts`
   - 测试 OrgAdapter 在真实 SQLite 上的 processCorrections + adjustThresholds
   - 测试 RuleVersionManager 在真实 SQLite 上的 createSnapshot + listSnapshots
   - 测试 global-analyzer 在真实 SQLite 上的 generateThresholdProposal + listProposals

不做什么：
- 不改任何 production 代码
- 不改现有单元测试
- 不测 sentinel/runner.ts（那是另一个模块的集成测试范围）
- 不测 routes/evolution.ts（需要 HTTP 服务器）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`npx vitest run tests/evolution/agent-memory-store.integration.test.ts`
处理：真实 SQLite → 真实 AgentMemoryStore → 进化模块操作 → 验证结果
结果：测试通过，证明进化模块在真实 SQLite 上行为正确

## 本任务在哪一层
测试层（tests/evolution/）

## Done 标准
- [x] verify: test -f tests/evolution/agent-memory-store.integration.test.ts
- [x] verify: grep -q 'better-sqlite3' tests/evolution/agent-memory-store.integration.test.ts
- [x] verify: grep -q 'new AgentMemoryStore' tests/evolution/agent-memory-store.integration.test.ts
- [x] verify: grep -q 'OrgAdapter' tests/evolution/agent-memory-store.integration.test.ts
- [x] verify: npx vitest run tests/evolution/agent-memory-store.integration.test.ts 2>&1 | tail -5 | grep -q 'Tests'
