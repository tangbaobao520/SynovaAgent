# D967 PR-B（mac 域，栈式 base = PR-A）—— 哨兵告警统计改名 + measurements 接线 — 交付证据

| 项 | 值 |
|---|---|
| **任务** | D967（task-3）**PR-B**（栈式第 2 支） |
| **执行者** | `sentinel-coder-a`（编码；自验不兼任） |
| **分支 / 工作树** | `feat/D967b-sentinel-alert-stats` ｜ `.synova-wt-D967b` |
| **base（栈式声明）** | **`feat/D967a-measurements-store`（PR-A）** —— **不是** `origin/main` |
| **域** | **mac**（`check-ownership.py` 实测 `✅ PASS 4 个文件同域: mac`） |
| **合并顺序** | **PR-A 先合 → 再合 PR-B**；PR-B 的 CI 必须在 PR-A 已合的 base 上跑 |

## 0. 栈式关系与跨线说明

- **本支调用 PR-A 交付的 `recordMeasurements`（`src/store/measurements.ts`）**，且断言 `measurements` 表存在。
  ⇒ **PR-A 未合时本支必然红**（`no such table: measurements` / `Cannot find module`）。**这是栈式两支的联合验收点，不是缺陷。**
- **跨线代做**：本支全为 **mac 域**（`src/sentinel/**` + `tests/sentinel/**`），与执行小队**同域，无跨线**。
  跨线出现在 **PR-A**（win 域文件由 mac 小队代做，CTO 2026-09-25 已批）——见 PR-A 证据 §0。

## 1. 效力声明

- 本件只出 **`自验结论` / `可提请独立审计`**，**不含「审计通过」**。**栈式两支须一并评审。**
- 本件由**编码者**撰写，非独立验证。全部数字为**命令原始输出**（随件入库 `results/`）。

## 2. 改动清单

```
 src/sentinel/baseline-store.ts                 | 改名 + 原地保数据
 src/sentinel/runner.ts                         | 接线 measurements
 tests/sentinel/baseline-store.test.ts          | 改名断言 + 4 个改名判别用例（**写集扩展，已报队长**）
 tests/sentinel/measurements-wiring.test.ts     | 新增：③ 联合验收 + ⑤ 产品价值（5 用例）
```

**写集扩展说明**：原派单 PR-B 清单只列 `tests/sentinel/measurements*.test.ts`；改名 `sentinel_baselines → sentinel_alert_stats` **连带**其断言表名的测试 `tests/sentinel/baseline-store.test.ts`（**同域 mac**）⇒ 已加入 `task-state/D967.json` 的并集写集并在队长处登记。

## 3. Done 逐条

### ④ `sentinel_baselines` → `sentinel_alert_stats`（改名 + 5 消费点）

**改名语义（先想清楚再改）**：该表存的是**每次运行的 finding/critical/warning 计数** ⇒ 是"**告警统计**"，不是"基线本身"（基线 = `BaselineStore` 内存窗口算出的均值）。旧名名实不符。

**改名实现（保数据，非"建新表"）**：
```sql
-- 仅在"旧表存在且新表不存在"时执行一次（幂等）
ALTER TABLE sentinel_baselines RENAME TO sentinel_alert_stats;
DROP INDEX IF EXISTS idx_sentinel_baselines_sid;   -- RENAME 只改索引绑定表、不改索引名
-- 然后 CREATE TABLE/INDEX IF NOT EXISTS（新名）
```

**为什么必须是原地 RENAME（"为什么这么改"，而不只是结果）**：
- ❌ **只改 DDL 里的表名（`CREATE TABLE IF NOT EXISTS <新名>`）会得到什么**：SQLite 建出一张**空的新表**，而**历史告警统计全部留在旧表里且再无人读它** ⇒ **静默丢数据**（读路径全绿、数据不在）。这属**铁律 11/24 级别**的问题：**不报错 ≠ 正确**。
- ✅ **`ALTER TABLE … RENAME TO` 的语义**：**保行、保索引绑定**，只换名字 ⇒ 历史数据无缝接续。
- ⚠ **SQLite 的一个坑**：`RENAME` **只改索引绑定的表，不改索引名** ⇒ 若不管，旧名索引 `idx_sentinel_baselines_sid` 会继续挂在改名后的表上、与新名索引**并存** ⇒ 由本支显式 `DROP INDEX IF EXISTS` 处理（用例"索引随改名重建为新名"覆盖）。
- **幂等**：仅在"旧有新无"时执行一次（`setDatabase` 可重复调用，用例"幂等"覆盖）。

**5 个消费点实测**：
```
$ git grep -n "sentinel_baselines" -- src/ tests/     # 见 results/old-table-name-residual.txt
src/sentinel/baseline-store.ts:197  ← 注释（改名说明）
src/sentinel/baseline-store.ts:203  ← 改名判定查询（必须保留旧名）
src/sentinel/baseline-store.ts:209  ← ALTER RENAME 语句
src/sentinel/baseline-store.ts:211  ← DROP 旧名索引
src/sentinel/baseline-store.ts:212  ← 日志文案
tests/sentinel/baseline-store.test.ts:101 ← **改名判别用例自身构造的"旧库"**（必须保留旧名）
```
⇒ **活 SQL 引用零残留**（其余 4 处是改名逻辑本身/注释/测试夹具）。`src/agent/sentinel-health-service.ts` 只用 API，**实测零直接引用 ⇒ 无需改**。
`tests/sentinel/` 全量 **236 passed**（含 15 个 baseline-store 用例）⇒ 5 个消费点全绿。

### ③ 跑一次哨兵 ⇒ measurements 有行（**跨 PR 联合验收**）

`tests/sentinel/measurements-wiring.test.ts` 用真实生产路径 `runner.runOnce(sentinelId)`：
```
✓ ① 跑一次哨兵 → measurements 出现该哨兵的 3 个 metric 行
✓ ② 行内容与 findings 一致（finding/critical/warning 三类计数）
✓ ③ 产品价值: 两次运行 ⇒ 同 metric 两个 computed_at 可相减
✓ ④ 边界: 零 finding 的运行也落盘（0 = "测到 0"，不是"没测"）
✓ ⑤ 时序落盘失败不阻断运行结果（铁律 31 降级可观测且不阻断）
```

### ⑤ 产品价值：两个时点可相减

用例 ③ 实测：第 1 次运行 1 条 warning → 第 2 次 3 条 ⇒ `diffMeasurement(...)` 返回 `delta = +2`、`defVersionMatched = true`。
（这正是要回答的"上月 X、本月 Y"形态。）

## 4. 改坏即红（本支的判别性）

撤掉 `runner.ts` 里的 `recordMeasurements` 调用（`results/kill-red.txt`）：
```
× ① 跑一次哨兵 → measurements 出现该哨兵的 3 个 metric 行
× ② 行内容与 findings 一致
× ③ 产品价值: 两个 computed_at 相减
× ④ 边界: 零 finding 也落盘
Tests  4 failed | 1 passed
```
还原 → `Tests 5 passed`。⇒ **接线是负载项**。

改名侧另有 4 个判别用例（`baseline-store.test.ts` 的 `D967 ④` 组）：旧库 2 行数据 → 改名后**新表存在 / 旧表消失 / 2 行数据仍在**（若只建新表会得 0 行）；索引随改名重建为新名；幂等；全新库不触发改名。

## 5. 门禁实测

```
$ vitest run tests/sentinel/                → Test Files 33 passed | 1 skipped ｜ Tests 236 passed | 1 skipped
$ vitest run <PR-B 两个测试文件>             → 20 passed
$ npx tsc --noEmit                          → 原始 28 条（与基线同数）；CI 同款白名单过滤后 = 0
$ check-ownership.py <PR-B 文件表>            → ✅ PASS 4 个文件同域: mac（无归属 0，域判定豁免 1）
```

## 6. 自检 5 问

1. **接线检查**：`recordMeasurements` 的调用方 = `src/sentinel/runner.ts`（grep 实测存在）；**PR-A 的 5 个 store API 导出由此获得真实消费者**（PR-A 的 `plan.json` 接线延期至此闭环）✅
2. **异常处理**：时序落盘独立 `try/catch` → `log.warn` + **不阻断运行**（铁律 24/31）；新增用例 ⑤ 专门断言"撤表后 runOnce 仍 ok=true" ✅
3. **类型安全**：`git diff | grep -E "as any|as never|as unknown as"` → **0**（本支仅用文件既有的 `db as Database.Database` 形态）✅
4. **测试质量**：新增 5 用例 + 改名 4 用例，全部含 `expect()`；覆盖正常/降级（撤表）/边界（零 finding、全新库、幂等）✅
5. **残留清理**：旧表名仅剩"改名逻辑 + 注释 + 测试夹具"（见 §3-④ 逐行判定）；无死代码；临时改坏实验已逐字节还原 ✅

## 7. 未清项（诚实登记）

> **本批 P0 未清项（请 K3 直接引这两条）**：`inputDigest` 语义偏差 与 `entityId` 恒空。两者**不阻断交付**（非本卡 Done 判定项），但**改变了"跨时点可比性"的强度**，必须显式可见。

### 7.1 【批级未清项 ①】`inputDigest` 用"运行指纹"代替输入哈希

**指引原义**：`input_digest` = **输入快照摘要**（"这条测量是用什么输入算出来的"）。
**我实际写入的**：**运行指纹** = `sentinelId | ok/fail | degraded/normal | 排序后 finding id 集`。

**它防住了什么**（正向）：
- **"两个不可比的数被拿来相减"的粗粒度场景**：若两次运行的**观测结果形态**不同（finding id 集变了），指纹必不同 ⇒ 使用者可看出"这两点不同源"。
- **可稳定复现**：同一输入集 + 同一 finding 集 ⇒ 指纹逐字相同（`diffMeasurement` 的 `defVersionMatched` 之外还有第二道对照）。
- **可追溯**：与事件流 `runKey`（`sentinelId@checkedAt`）同源，两侧可互相定位。

**它**没**防住什么（必须写清，别夸大）**：
- **图输入变了但 finding id 集没变时，指纹不变** ⇒ 仍可能漏判"不可比"。
  例：`graph_nodes` 里某财务字段从 100 改成 90，恰好哨兵判定仍落在同一档（finding id 仍为 `fin-leverage-warn`）⇒ **指纹与上次逐字相同**，但底层输入已变。
- **不是输入内容的哈希** ⇒ **不能**用于"同一份输入重跑应得同一结果"的校验（那需要输入摘要）。
- **不覆盖未进入 findings 的输入部分**（哨兵读了但未触发告警的字段完全不在指纹里）。

⇒ **建议后续卡（具体）**：把**图查询摘要**（或 compute 层输入快照的 hash）从 L4/compute 侧透传到 runner，作为真正的 `input_digest`；本支的"运行指纹"可退化为 `run_fingerprint` 附加列或直接替换。

### 7.2 【批级未清项 ②】`entityId` 恒为 `''` —— 影响"产品价值 ⑤"的**一个维度**

**指引原义**：`entity_id` = **谁**（org / 客户 / 业务单元）。
**实际写入**：恒为 `''`（空串 = "组织级"）—— 因为 `executeSentinel` 的上下文**没有 org/team 标识**（该处 runner 是 org-agnostic 的，只有 `sentinel.config.id`；`SentinelRunner` 的 orgId 出现在别的调用路径）。

**对 Done ⑤（产品价值）的精确影响**：
- ✅ **`metric_id` 维度可分时点**：`<sentinelId>:finding_count` 的"上月 vs 本月"**成立**（用例 ③ 实测 `delta=+2`）。
- ❌ **`entity_id` 维度不可分**：**多客户场景下，所有组织的同名 metric 会写进同一 `entity_id=''` 分区 ⇒ 同表混流**。此时 `diffMeasurement(entityId='', '<sid>:finding_count', t1, t2)` 相减的是**全部客户混在一起**的序列，**不是某一家的**。
- ⇒ 单客户/单组织部署下**结论有效**；**多租户部署下，⑤ 的结论只在"组织级汇总"意义上成立，不能按客户下钻**。

⇒ **建议后续卡（具体）**：把 `orgId` 透传进 `SentinelRunner.executeSentinel`（其 `SentinelRunInput`/事件流已带 `orgId`，见 `runner.ts:173` 的 `orgId: string` 与 `:537/:608/:709` 的用法）⇒ 写入 `entityId: orgId`；并补一条"同 metric 不同 org 不得互相相减"的判别性测试。

### 7.3 其余未清项

1. **表名的历史数据依赖**：改名在 `initSchema` 内**惰性**执行；某库若从未被 `setDatabase` 触达，其旧表不会被改名（无副作用，但也不算"已迁移"）。
2. **`sentinel_baselines` 不在 `SCHEMA_VERSION` 迁移体系内**（它是 store 自建表）⇒ 本次改名**未走** `src/store/migrations/**`（那是 PR-A/win 域）。**跨域拆分的直接后果**：同一件事的"迁移"与"改名"分居两支，评审须一并看。
3. **栈式依赖**：**PR-A 未合时本支必红**（缺 `measurements` 表与 API）。合并顺序不可颠倒。
4. **效力**：本支给 `可提请独立审计`；**PR-A + PR-B 须一并评审**。

## 8. 复现步骤

```bash
cd .synova-wt-D967b
# 1) 定向（③⑤ + ④ 改名）
node_modules/.bin/vitest run tests/sentinel/measurements-wiring.test.ts tests/sentinel/baseline-store.test.ts
# 2) 全量 sentinel 回归
node_modules/.bin/vitest run tests/sentinel/
# 3) 改坏即红：注释掉 runner.ts 的 recordMeasurements(db, [...]) 调用 → 重跑 1) → 4 红 → 还原
```

## 9. 证据清单

| 路径 | 内容 |
|---|---|
| `results/kill-red.txt` | 撤掉接线 → 4 红（判别性） |
| `results/vitest-prb-focused.txt` / `vitest-sentinel.txt` | 定向 20 passed / 全量 236 passed |
| `results/tsc.txt` | tsc 原始 28 条 + CI 过滤 0 条 |
| `results/domain.txt` | `✅ PASS 4 个文件同域: mac` |
| `results/old-table-name-residual.txt` | 旧表名逐行判定（活 SQL 零残留） |
| `results/diff-stat.txt` | 改动清单 |
