# Task Brief — D967 PR-A（win 域）measurements 存储层 + P7 graph_triples 整表重建

#CRITERIA: A

## 写集

> D749 机器块 = 写集**单一事实源**。本卡 = D967 栈式两支的 **PR-A**（win 域）。

| 文件 | task/builtin（理由） |
| --- | --- |
| `src/store/migrations/002-graph-triples-rebuild.ts` | task（P7：graph_triples 整表重建回 canonical） |
| `src/store/migrations/003-measurements-table.ts` | task（①：measurements 建表 + 时序索引） |
| `src/store/measurements.ts` | task（①：append-only store API + 契约） |
| `src/store/schema-migration.ts` | task（注册两个迁移 + SCHEMA_VERSION 2→4） |
| `src/agent/post-diagnosis-processor.ts` | task（删 `finding_count=0` 伪条目） |
| `tests/store/migrations/002-graph-triples-rebuild.test.ts` | task（P7 判别性测试） |
| `tests/store/migrations/003-measurements-table.test.ts` | task（建表迁移配对测试：8 列契约 + 索引列序 + 幂等 + 复合主键语义） |
| `tests/store/measurements.test.ts` | task（时序 API 三路径） |
| `tests/store/measurements-append-only.test.ts` | task（② append-only 守卫） |
| `tests/store/schema-migration.test.ts` | task（既有测试版本轴改**动态**：原写死 `SCHEMA_VERSION===2`） |
| `task-state/D967.json` | task（两 PR 并集写集） |
| `.claude/task-briefs/2026-09-25-D967a-measurements-store.md` | task（本 brief） |
| `docs/synova/product-lines/evidence/D967a-measurements-store-evidence.md` | task（PR-A 主证据） |
| `docs/synova/product-lines/evidence/D967a-measurements-store/**` | task（原始输出 results/） |
| `.claude/bypass.log` | builtin（post-commit hook 运行期追加证据账本） |

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

L5 存储（`src/store/**`）+ L2 编排的一处副作用清理（`src/agent/post-diagnosis-processor.ts`）。本卡给哨兵体系补**时序记忆**（measurements），并修 P7（graph_triples 整表结构漂移导致**读写路径双双失效**）。

### b) 文件审计（实测，非推断）
- **P7 漂移实证**（只读 `.schema`）：
  - canonical（`src/adapters/sqlite-graph-store.ts` SCHEMA_SQL）：`id TEXT PRIMARY KEY` ／ `props TEXT NOT NULL DEFAULT '{}'` ／ `graph NOT NULL DEFAULT 'default'`
  - 生产实际：`id INTEGER PRIMARY KEY AUTOINCREMENT` ／ **无 `props`**（只有 `props_json`）／ `graph TEXT NOT NULL`（无默认）／多出 `confidence`/`source`
  - ⇒ 读 `queryEdges ... props` → `no such column: props`；写 `createEdge INSERT (... props)` → `table graph_triples has no column named props`；**只 ADD COLUMN 修不好写路径**（`edge-<uuid>` TEXT 写进 INTEGER PK → `datatype mismatch`）⇒ 必须整表重建。
  - 生产库 `graph_triples` = **0 行**（重建无数据损失风险）；`graph_nodes` **不需**重建（其 5 个 INSERT 列齐全，漂移为良性：多列 + PK 变体）。
- **迁移框架**：`src/store/schema-migration.ts` `reconcileSchema`；`Migration{version,name,up}`；`SCHEMA_VERSION` 现 = 2。
  - **关键约束（实测）**：`schema_version` 表被**多模块共用**，行内混有非数字值（`d93b_actor_role` / `d551_memory_type`），且 `reconcileSchema` 读的是 `ORDER BY updated_at DESC LIMIT 1` ⇒ **迁移会被反复触发** ⇒ **新迁移必须幂等**（本卡两条均已幂等）。
- **`measurements` 表不存在**（实测 `no such table`）。
- **伪条目位置**：`src/agent/post-diagnosis-processor.ts:271-272` `getBaselineStore().record('org-baseline-' + teamId, [])` —— 诊断路径不跑哨兵，`count=0` 是"没测"而非"测到 0"。

### c) 决策

按 CTO 裁定：**整表重建**（非 ADD COLUMN）；measurements 走**迁移建表 + 独立 store API**；伪条目**直接删除**（非改判断）。**不新增 ownership 规则**（跨域由栈式两支解决）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- **第一性原理**：schema 漂移的修法取决定于**约束**而非列：`INTEGER PRIMARY KEY` 是 SQLite 的 rowid 别名，无法 ALTER 成 TEXT 主键 ⇒ 只有"重建 + 搬数"一条路。只补列 = 修好读、修不好写（半修）。
- **Anthropic 工程基线**：迁移必须**幂等**（本仓 `schema_version` 被多模块污染，必被重复触发）+ **fail-closed**（失败阻止启动，不半成品）+ **判别性**（撤掉迁移 → 断言必红）。
- **memory 历史教训**：
  - **D355 / K3 P0-3**：同一族事故 —— "查询报 `no such column` 被 catch 吞成无数据"，哨兵把"查询失败"当"没有异常"。故本卡 store API **查询失败抛错**而非返回 `[]`（与 P7 同型防线）。
  - **D965（我上一张卡）**：`45`/`43` 硬编码导致的连带红 ⇒ 本卡把既有测试里写死的 `SCHEMA_VERSION === 2` 一并改成**动态派生**（否则每加迁移必假红）。
  - **铁律 37（dead code）**：删伪条目后同步核对无悬挂 import（`getBaselineStore` 在本文件已无消费者）。
- **决策参考系**：参考 Anthropic/第一性原理 + 结论 = 「约束级修复（整表重建）+ 幂等 + 查询失败不得静默成空」。

## Q2: 范围 — 正确的最简方案

做什么（逐条见 `## 写集`）：
- 新增 `002-graph-triples-rebuild.ts`：`table_info` 判幂等（`props` 存在且 `id` 为 TEXT → no-op）；非 TABLE（视图）→ 抛错；否则**单事务** `RENAME → CREATE canonical → INSERT..SELECT（逐列映射，缺列用默认）→ DROP 旧表 → 建 5 个 canonical 索引`。
- 新增 `003-measurements-table.ts`：8 列 + 复合主键 + `idx_measurements_entity_metric_time`。
- 新增 `src/store/measurements.ts`：`recordMeasurement(s)` / `queryMeasurements` / `latestMeasurement` / `diffMeasurement`（append-only，无 update/delete）。
- `schema-migration.ts`：注册两条 + `SCHEMA_VERSION = 4`。
- `post-diagnosis-processor.ts`：删伪条目块。
- `tests/store/**`：3 个新测试 + 1 个既有测试改动态。

不做什么（含文件路径）：
- **不改** `src/sentinel/**`（PR-B 域）；**不改** `tests/sentinel/**`（PR-B 域）
- **不重建** `graph_nodes`（实测其漂移为良性：5 个 INSERT 列齐全）
- **不改** `scripts/control-tower/**`、`scripts/audit/**`、`docs/synova/audit-reports/**`、`ci.yml`、`pre-commit-check.sh`
- **不动** `data/synova.db`（只读；迁移只在 `:memory:` 与 /tmp 副本上跑）
- **不加** `--max-files`、不改 `docs/synova/coordination/ownership.yaml`

## Q3: 验收 — 入口 → 交互 → 结果

入口：`SqliteGraphStore` 构造器 → `reconcileSchema(db)`；measurements 由 store API 直接调用。
处理：迁移按 version 顺序执行（2 → 3 → 4）；graph_triples 重建为 canonical；measurements 建表。
结果：`createEdge` 可写（`edge-<uuid>` 落 TEXT 主键）、`queryEdges` 可读含 `props`；`measurements` 可记录并按两个 `computed_at` 相减。

## 架构层: L5 存储（+ L2 一处副作用清理）

## Done 标准

- [ ] verify: `vitest run tests/store/ tests/agent/post-diagnosis-processor.test.ts` → 全绿（75 passed）
- [ ] verify: 撤掉 `graphTriplesRebuildMigration` 注册重跑 `tests/store/migrations/002-graph-triples-rebuild.test.ts` → **4 个用例变红**（改坏即红，含 P7 验收 (c) 的 `no column named props`）
- [ ] verify: `npx tsc --noEmit` 经 CI 同款白名单过滤 → **0 条**
- [ ] verify: 全量 `vitest run` → 与基线同绿（证明 **PR-A 单独合并不留红态**）
- [ ] verify: `check-ownership.py <PR-A 文件表>` → `✅ PASS 9 个文件同域: win`
- [ ] verify: `grep -rn "UPDATE measurements\|DELETE FROM measurements" src/` → **0 命中**（② append-only）
