<!--
  SYNOVA-IMPL-D355: L4 数据契约收敛 + 查询层 fail-open 修复
  状态: dev doc | 2026-08-16 | 优先级 P0（K3 全链路审计 P0-2 写侧 + P0-3）
  权威文档: AGENTS.md 铁律 24/31/39 + K3 全链路审计 AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md P0-2/P0-3
  依赖: 无
  并行: 无（独占 L4 契约定义，与 DSH 哨兵读侧调整串行——写侧先定契约，读侧后对齐）
-->

# D355: L4 数据契约收敛 + 查询层 fail-open 修复

> 一句话问题：L4 存储层 queryNodes 是**精确字符串匹配 + 静默 fail-open**（schema 漂移/类型不匹配时只 log.warn 返回空，哨兵把"查询失败"当"无数据"、又把"无数据"当"无异常"）；上传映射（写侧）与哨兵（读侧）的类型名、属性名断裂（Market≠Client、People≠Person、cash≠cashBalance）。本任务收敛 **Claude 线（写侧 + 存储层）**的契约，哨兵读侧对齐留给 DSH。

## 1. 权威文档引用

**来源**: [AGENTS.md 铁律 24](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 24. 异常处理审计——写 catch 时必须确认：有 log.error/warn（不能空吞）、返回 degraded: true（后端）、区分 ENOENT（正常默认）和 JSON.parse 失败（打 log + degraded）。

**来源**: [AGENTS.md 铁律 31](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 铁律 31. 降级信号传播。每个可独立失败的模块必须返回 degraded 标记，调用方检查，前端展示。

**来源**: [K3 全链路审计 P0-3](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\audit-reports\AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md)

> P0-3：L4 查询层静默 fail-open——schema 漂移时 queryNodes 只 log.warn 返回空，哨兵把"查询失败"当"无数据"，无数据又当"无异常"——异常检测系统的失效本身不可见。

## 2. 代码审计——现状 (2026-08-16 实测)

### 2.1 缺陷 A (P0-3): queryNodes 静默 fail-open

实测 [sqlite-graph-store.ts](D:\novis-backup-20260526\Novis\synova-agent\src\adapters\sqlite-graph-store.ts)：

- `:193` 精确匹配：`SELECT id, type, props FROM graph_nodes WHERE graph = ? AND type = ? AND valid_to IS NULL`——无映射无容错，大小写/命名不一致即查不到。
- `:213-214` fail-open：catch 块 `log.warn({ err: msg, type }, "查询图节点失败"); return [];`——查询失败静默返回空数组，调用方无法区分"查询失败"与"无数据"。
- schema 漂移：K3 实测旧库 `props_json` 列 vs 代码期望 `props` 列 → `no such column` 被 catch 吞掉返回空（src/store/migrations/ 目录不存在，无迁移）。

### 2.2 缺陷 B (P0-2 写侧): 上传映射类型/属性名断裂

实测 field-mappings（extensions/ontology/field-mappings/）：

| 文件 | 实测 | 哨兵读侧（DSH） | 判定 |
|------|------|---------|:---:|
| crm-standard.json:4 | `targetNodeType: "Market"` | `queryNodes('Client')`（customer-demand-shift/aggregate.ts:31） | 断 |
| hr-standard.json:4 | `targetNodeType: "People"` | `queryNodes('Person')`（channel-capacity:26、make-or-buy:13） | 断 |
| erp-standard.json:11 | `prop: "cash"`（snake_case） | `n.props.cashBalance`（compute-cash-runway-months.ts:62，camelCase） | 断 |
| erp-standard.json:13 | `prop: "operating_expense"` | `n.props.operatingExpenses`（compute-cash-runway-months.ts:63） | 断 |

### 2.3 缺陷 C: 两套类型体系并存（旧 PascalCase 内部写读还不一致）

实测 [node-types.ts](D:\novis-backup-20260526\Novis\synova-agent\packages\ontology\src\node-types.ts)：

- `:24` 新本体 `OUTCOME_FINANCIAL: 'outcome/financial'`、`:40` `RESOURCE_CLIENT: 'resource/client'`（snake_case 路径）
- 哨兵读旧 PascalCase `'Client'`/`'Person'`/`'Financial'`/`'Event'`/`'Tool'`（extensions/sentinels/*/aggregate.ts）
- 上传映射写同属旧 PascalCase 但名不同 `'Market'`/`'People'`（写读在旧体系内部不一致）

## 3. 实现方案

### 3.1 写集 (4 修改 + 3 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/adapters/sqlite-graph-store.ts](D:\novis-backup-20260526\Novis\synova-agent\src\adapters\sqlite-graph-store.ts) | 修改 | queryNodes 三态输出：查询失败抛显式 degraded（不再静默 `return []`），`no such column` 识别为 schema 漂移并提示迁移 |
| [src/store/migrations/](D:\novis-backup-20260526\Novis\synova-agent\src\store\migrations) | 新建 | graph_nodes schema 迁移（旧 `props_json` → 新 `props`，幂等） |
| [extensions/ontology/field-mappings/crm-standard.json](D:\novis-backup-20260526\Novis\synova-agent\extensions\ontology\field-mappings\crm-standard.json) | 修改 | `targetNodeType` Market → Client（对齐哨兵读侧） |
| [extensions/ontology/field-mappings/hr-standard.json](D:\novis-backup-20260526\Novis\synova-agent\extensions\ontology\field-mappings\hr-standard.json) | 修改 | `targetNodeType` People → Person（对齐哨兵读侧） |
| [extensions/ontology/field-mappings/erp-standard.json](D:\novis-backup-20260526\Novis\synova-agent\extensions\ontology\field-mappings\erp-standard.json) | 修改 | `prop` cash → cashBalance、operating_expense → operatingExpenses（对齐 compute 读侧） |
| [tests/contract/l4-contract.test.ts](D:\novis-backup-20260526\Novis\synova-agent\tests\contract\l4-contract.test.ts) | 新建 | 契约测试：类型/属性名写读一致性 + fail-open 升级 error |
| [tests/store/schema-migration.test.ts](D:\novis-backup-20260526\Novis\synova-agent\tests\store\schema-migration.test.ts) | 新建 | schema 迁移幂等 + props_json→props 兼容 |

> **共享资源标注**（S-8）：本任务定义的 L4 类型/属性契约是**共享契约**，写侧（本任务）与读侧（DSH 哨兵）串行对齐——写侧先定契约并落地，读侧在后续 DSH 任务对齐；本任务**不改** extensions/sentinels/、src/sentinel/（DSH 地盘）。

### 3.2 修复模式（关键代码）

**queryNodes 保持 Array 返回（兼容现有哨兵调用方），catch 静默 warn 升级为 error**（sqlite-graph-store.ts）：

```typescript
queryNodes(type, filters?, graph?): Array<{ id: string; type: string; props: Record<string, unknown> }> {
  try {
    // ... SELECT ...
    return rows.map(...);  // 返回类型不变，哨兵调用方不受影响
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such column")) {
      // schema 漂移 → 升级 error（非静默 warn），失效在日志层可见
      log.error({ err: msg, type }, "图节点 schema 漂移——props 列缺失，需运行迁移");
      return [];
    }
    log.error({ err: msg, type }, "查询图节点失败");
    return [];
  }
}
```

> 设计说明：**不改 queryNodes 返回类型**（保持 Array 兼容，否则破坏全部哨兵调用方）；本任务最小修复 = `log.warn → log.error`（失效在日志层可见）。**严格三态**（让哨兵区分"失败"与"无数据"）需 DSH 读侧对齐时另加 `queryNodesStrict`（返回 `{ok, nodes, degraded}`），**本任务不引入**（避免破坏现有调用方 + 避免越界改哨兵）。
> §3.2 最终实现同 commit 回填（S-6）：若 degraded 信号改用全局计数器/typed error 等，同一提交更新本节为最终形态。

### 3.3 不做的事

| 项 | 理由 |
|----|------|
| 不改 extensions/sentinels/*/aggregate.ts（哨兵读侧） | DSH 地盘，读侧对齐留给 DSH 后续任务 |
| 不改 src/sentinel/adapters/cash-flow-sentinel.ts（FINANCIAL 裸 SQL） | DSH 地盘 |
| 不改 compute-cash-runway-months.ts:60 filter bug | DSH 地盘（extensions/sentinels/） |
| 不统一到新本体 resource/client 全量迁移 | 两套类型体系的最终收敛是跨线决策，本任务只收敛写侧到旧 PascalCase（对齐现有哨兵读侧） |

## 4. 测试要求 (测试优先)

> 第一步写测试（red）→ 第二步实现（green）。

| 层 | 类型 | 数量 | 覆盖 |
|----|------|:---:|------|
| 单测 | l4-contract.test.ts | ≥6 断言 | 类型写读一致（Market→Client/People→Person 映射）/ 属性名写读一致（cash→cashBalance）/ queryNodes 失败时 log.error（非静默 warn） |
| 单测 | schema-migration.test.ts | ≥6 断言 | props_json→props 迁移幂等 / 旧库兼容 / 无迁移时 degraded 提示 |

**RED 必须覆盖失败模式**（S-5）：
- 场景 1（P0-3 复现）：构造 props_json 旧库 → queryNodes → 旧逻辑静默 return []（仅 log.warn）→ 修复后 log.error（schema 漂移）——"修复前静默 warn → 修复后显式 error"。
- 场景 2（P0-2 复现）：crm-standard 上传 → 写入 Market → 哨兵读 Client 查不到 → 修复后写 Client 读 Client 命中。

## 4.5 决策参考

**决策点**：属性名统一方向（改写侧 erp-standard 对齐 compute 读侧，而非改读侧）。

**参考系**：第一性原理——写侧（上传映射）是"数据入口"，读侧（compute）是"已接线的消费者"；改写侧成本最低、影响面最小，且写侧字段名尚未被外部系统依赖（上传映射是本产品内部定义）。Anthropic——契约由单一权威定义，写读两侧都对齐它；本任务选"compute 读侧现名"为契约锚点。

**结论**：写侧 erp-standard 对齐 compute 读侧（cash→cashBalance、operating_expense→operatingExpenses）。完成报告须含"决策记录"。

## 5. 接线要求

| 新函数/机制 | 调用方 | 确认方式 |
|------|------|---------|
| queryNodes 失效升级 log.error | 所有 queryNodes 调用方透明受益（哨兵无需改动） | `grep -n "log.error" src/adapters/sqlite-graph-store.ts` |
| schema 迁移 | 启动时自动执行 | `grep -n "migration" src/adapters/sqlite-graph-store.ts` |

> 接线说明：queryNodes 返回类型不变（Array），现有哨兵调用方**零改动**即受益（失效升级为 log.error 可追溯）；本任务不新增 store 层外部函数，仅改 queryNodes 内部 catch 行为。

## 6. 完成标准

- DS1: `grep -n "no such column\|log.error" src/adapters/sqlite-graph-store.ts` 命中（queryNodes 失效升级 error）
- DS2: `ls src/store/migrations/` 非空（迁移脚本存在）
- DS3: `grep -n "targetNodeType" extensions/ontology/field-mappings/crm-standard.json` → "Client"
- DS4: `grep -n "targetNodeType" extensions/ontology/field-mappings/hr-standard.json` → "Person"
- DS5: `grep -n "cashBalance\|operatingExpenses" extensions/ontology/field-mappings/erp-standard.json` 命中（属性名对齐）
- DS6: `npx vitest run tests/contract/l4-contract.test.ts tests/store/schema-migration.test.ts` 全绿（red→green 已证）
- DS7: `git diff --name-only HEAD~1..HEAD` 恰为写集 4 修改 + 3 新建（无越界，不碰 extensions/sentinels/、src/sentinel/）
- DS8: 真实 push 验证：`git log @{upstream}..HEAD` 为空（已推送）+ CI task-relevant jobs 绿（vitest/tsc/golden-case；npm audit/Architecture 预存失败单独标注）

## 7. 自检清单

- [ ] 代码审计 3 缺陷均 grep 实测（file:line），不是凭记忆
- [ ] 写集表格式符合契约（`### 3.1 写集` 标题后紧跟表格，无空行）
- [ ] 写集严格限定 Claude 线（src/adapters、src/store、extensions/ontology、packages/ontology、tests），不碰 DSH 的 extensions/sentinels、src/sentinel
- [ ] 测试 red→green 覆盖失败模式（schema 漂移静默→显式 degraded、类型断裂写读不一致）
- [ ] DS 每项可机器验证（grep/ls/vitest/git diff）
- [ ] §5 接线要求 ≥1 生产调用点（queryNodes 三态契约）
- [ ] 属性名统一方向有决策记录（§4.5）
- [ ] 交付声明 DS 须与本 dev doc DS1..DS8 一一对应，缺项显式 descope
- [ ] 派发说明：不得与 DSH 哨兵读侧对齐任务并行（写侧先定契约），若必须并行先 git worktree 隔离
- [ ] 不用 --no-verify
