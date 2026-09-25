# Task Brief — D967 PR-B（mac 域，**栈式 base = PR-A**）哨兵告警统计改名 + measurements 接线

#CRITERIA: A

## 栈式声明（CTO 硬要求 ①）

**本支 base = `feat/D967a-measurements-store`（PR-A）**，不是 `origin/main`。
理由：本支的 `src/sentinel/runner.ts` **调用 PR-A 交付的 `recordMeasurements`**，且断言 `measurements` 表存在；
**PR-A 未合时本支必红** —— 这是栈式两支的**联合验收点**，不是缺陷。
评审顺序：**PR-A 先合 → 再合 PR-B**（PR-B 的 CI 须在 PR-A 已合的 base 上跑）。

## 写集

| 文件 | task/builtin（理由） |
| --- | --- |
| `src/sentinel/baseline-store.ts` | task（④ 表改名 + 原地保数据） |
| `src/sentinel/runner.ts` | task（③⑤ 接线 measurements） |
| `tests/sentinel/measurements-wiring.test.ts` | task（③ 跨 PR 联合验收 + ⑤ 产品价值） |
| `tests/sentinel/baseline-store.test.ts` | task（**写集扩展，已报队长**：改名连带其断言表名处；同域 mac） |
| `task-state/D967.json` | task（两 PR 并集写集） |
| `.claude/task-briefs/2026-09-25-D967b-sentinel-alert-stats.md` | task（本 brief） |
| `docs/synova/product-lines/evidence/D967b-sentinel-alert-stats-evidence.md` | task（主证据） |
| `docs/synova/product-lines/evidence/D967b-sentinel-alert-stats/**` | task（原始输出 results/） |
| `.claude/bypass.log` | builtin（post-commit hook 运行期追加证据账本） |

> **跨线代做声明**：本支全为 **mac 域**（`src/sentinel/**` + `tests/sentinel/**`）——与执行小队同域，**无跨线**。
> （跨线发生在 **PR-A**：其 win 域文件由 mac 小队代做，CTO 已批，见 PR-A 证据 §0。）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

L3 洞察层（哨兵体系）。本支做两件事：① 把语义错配的表名改对；② 给哨兵接上**时序记忆**（PR-A 建的表）。

### b) 文件审计（实测）
- 旧表名 `sentinel_baselines` 引用点：`src/sentinel/baseline-store.ts` 4 处（INSERT/DDL/INDEX/SELECT）+ `tests/sentinel/baseline-store.test.ts` 4 处。**`src/agent/sentinel-health-service.ts` 只用 API，零直接引用** ⇒ 无需改。
- 表语义：存的是**每次运行的 finding/critical/warning 计数** ⇒ 是"**告警统计**"而非"基线本身"（基线是 `BaselineStore` 内存窗口算出的均值）⇒ 改名 `sentinel_alert_stats` 名实相符。
- runner 侧：`executeSentinel` 已有 baseline 记录块；`this.db` 已被本文件多处直接操作 ⇒ 具备落盘条件。
- 架构层：`check-architecture.sh` 的 **L3→L5 规则只扫 `src/l3/`**（实测 `grep -rn … src/l3/`），而 `src/sentinel/` **不在扫描面**；runner 本已在用 `this.db.exec/.prepare`。⇒ 复用 L5 的 measurements API **不触发跨层门禁**。

### c) 决策

改名走**原地 RENAME 保数据**（不是"建新表让旧数据孤悬"）；接线**复用 PR-A 的 API**（不再造第二套 SQL，避免双写者）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- **第一性原理**：表改名若只改 DDL，**新表建成空表、旧数据留在旧表** = 静默数据丢失（比不改更坏）。故必须 `ALTER TABLE … RENAME TO` 原地改名（SQLite 语义：保行、保索引绑定）；索引名不会随表改 ⇒ 显式重建。
- **Anthropic 基线**：改名须**幂等**（`setDatabase` 可重复调用）+ **判别性**（旧库有数据 → 改名后仍读得到；撤掉改名逻辑必红）。
- **memory 教训**：
  - **D965/D967 PR-A 同源教训（硬编码计数）**：接线测试断言必须盯**行为**（行存在且值正确），不盯实现细节。
  - **铁律 31（降级传播）**：时序落盘失败**不得阻断**哨兵运行 ⇒ 单独 try/catch + `log.warn`，并写了"撤表仍能跑"的用例。
- **决策参考系**：参考 Anthropic/第一性原理 + 结论 = 「改名=原地 RENAME 保数据；接线=复用单一 API；落盘失败=降级不阻断」。

## Q2: 范围 — 正确的最简方案

做什么（见 `## 写集`）：
- `baseline-store.ts`：`initSchema` 增加"旧有新无 → ALTER RENAME + 丢旧名索引"，DDL/INSERT/SELECT/INDEX 全改新名
- `runner.ts`：`executeSentinel` 在 baseline 块后新增 measurements 落盘（3 metric：`finding_count`/`critical_count`/`warning_count`；`runId` 与事件流 runKey 同源；`defVersion='sentinel-counters/v1'`）
- `tests/sentinel/measurements-wiring.test.ts`：③ 联合验收 + ⑤ 产品价值 + 边界/降级
- `tests/sentinel/baseline-store.test.ts`：改名断言 + 4 个改名判别用例

不做什么（含文件路径）：
- **不改** `src/store/**`（PR-A 域，已交付）；**不改** `src/agent/sentinel-health-service.ts`（实测无需改）
- **不改** `docs/synova/coordination/ownership.yaml`、`scripts/control-tower/**`、`scripts/audit/**`、`docs/synova/audit-reports/**`、`ci.yml`、`pre-commit-check.sh`
- **不新增哨兵**（禁令 3）；**不动** `data/synova.db`（只用 `:memory:`）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`SentinelRunner.runOnce(sentinelId)`（生产由 cron/手动触发）。
处理：哨兵 `check()` → findings → baseline 记录（内存窗口）→ **新增**：把三类计数 append 到 `measurements`。
结果：`SELECT * FROM measurements WHERE metric_id LIKE '<sentinel>:%'` 有行；同 metric 两个 `computed_at` 可相减。

## 架构层: L3 洞察层（哨兵 runner / 告警统计）

## Done 标准

- [ ] verify: `vitest run tests/sentinel/measurements-wiring.test.ts tests/sentinel/baseline-store.test.ts` → 20 passed
- [ ] verify: 撤掉 runner 的 `recordMeasurements` 调用重跑 → **4 个用例红**（改坏即红）；还原 → 绿
- [ ] verify: `vitest run tests/sentinel/` → 236 passed（无回归）
- [ ] verify: `npx tsc --noEmit` 经 CI 同款白名单过滤 → **0 条**
- [ ] verify: `check-ownership.py <PR-B 文件表>` → `✅ PASS 4 个文件同域: mac`
- [ ] verify: `git grep sentinel_baselines -- src/ tests/` → 只剩改名逻辑与注释（无残留 SQL 引用）
