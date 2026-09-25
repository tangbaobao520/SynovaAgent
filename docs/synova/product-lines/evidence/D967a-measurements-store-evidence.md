# D967 PR-A（win 域）measurements 存储层 + P7 graph_triples 整表重建 — 交付证据

| 项 | 值 |
|---|---|
| **任务** | D967（task-3）**PR-A**（栈式第 1 支） |
| **执行者** | `sentinel-coder-a`（编码；自验不兼任） |
| **分支 / 工作树** | `feat/D967a-measurements-store` ｜ `.synova-wt-D967a` |
| **基线** | `origin/main` = `ef2997466677324b94d7b2921a5b3de0b7ad57d3` |
| **域** | **win**（`check-ownership.py` 实测 `✅ PASS 9 个文件同域: win`） |
| **栈式关系** | 本支为**栈底**；**PR-B（mac 域）的 base = 本分支**（`feat/D967b-sentinel-alert-stats`），栈式声明见 PR-B 证据与 `task-state/D967.json` |

## 0. 跨线代做声明（CTO 硬要求 ⑥）

**本 PR 的文件全部属 `win` 域**（`src/store/**`、`tests/store/**`、`src/agent/post-diagnosis-processor.ts` 均为 `win`），而本卡由 **mac 小队（`sentinel-coder-a`）代做**。
**依据：CTO 2026-09-25 裁定 D967 拆栈式两支 PR**（不新增 `ownership.yaml` 规则、不开书面例外）——按域拆分会把 `src/sentinel/**`(mac) 与 `src/store/**`(win) 分到两支，故 PR-A 必然由 mac 小队代做 win 域。
**这不是越域偷做**：写集、域归属、代做关系均已在 `task-state/D967.json` 与队长的派单中显式登记。

## 1. 效力声明（防误读）

- 本件只出 **`自验结论` / `可提请独立审计`**，**不含「审计通过」**。通过性归 **CTO 收件闸 + K3 终审**。
- 本件由**编码者**撰写，**不是独立验证**。
- 全部数字为**命令原始输出**（随件入库 `results/`），无手写。

## 2. 改动清单（`git diff --stat -M HEAD`）

```
 src/agent/post-diagnosis-processor.ts              |  9 +--
 src/store/schema-migration.ts                      | 29 ++++++++++--
 tests/store/schema-migration.test.ts               | 52 ++++++++++++++++++++--
 src/store/measurements.ts                          | (新增)
 src/store/migrations/002-graph-triples-rebuild.ts  | (新增)
 src/store/migrations/003-measurements-table.ts     | (新增)
 tests/store/measurements.test.ts                   | (新增)
 tests/store/measurements-append-only.test.ts       | (新增)
 tests/store/migrations/002-graph-triples-rebuild.test.ts | (新增)
```

**唯一额外改动**：`tests/store/schema-migration.test.ts`（属 `tests/store/**`，在写集内）——把**写死** `SCHEMA_VERSION === 2` 的断言改为**动态派生**（每加一个迁移就假红的同型坑，见 D965 教训）。

### 2.1 `plan.json` 接线延期声明（栈式结构的必要步骤 + 授权来源）

本支是**栈底**，其 API 的真实消费者 `src/sentinel/runner.ts` 属 **mac 域 = PR-B**（CTO 2026-09-25 裁定：不新增 ownership 规则、按域拆栈式两支）。因此本支的 5 个 store API 导出 + 2 个 DDL 常量在 PR-A 内**必然无同域消费者**，触发 pre-commit 组 4「新 export 必须被引用」（硬阻断）。

**处理**：按仓库既有设计（`pre-commit-check.sh:420-455` + V3.7/V3.8「plan.json 声明架构步骤 ⇒ 接线在后续阶段」）在 `.claude/plan.json` **追加 phase 3**，对其声明 `checks.wiring: "deferred"` ⇒ 该组降级为**警告**（**只放宽、不新增阻断**）。

**授权来源（可核）**：**CTO（人类）2026-09-25 明确批准选项 A**；由队长转达并逐条核对；执行者 `sentinel-coder-a`。已写入 `plan.json` 的 `step 3.note`。

**只增不改（实测）**：
```
$ git diff -U0 .claude/plan.json | grep -E "^-[^-]"
-  "current_phase": 2,
```
⇒ **唯一被替换的行是 `current_phase`（2→3）**，D599 的 phase 1/2 内容**逐字未动**（`approved_by: founder` 保留）。
```
$ SYNO_GATEKEEPER_ACK=1 bash scripts/pre-commit-check.sh
  ⚠️  接线审计: 新 export 必须被引用: (plan.json deferred)  [警告]
  ✅ 全部 13 组通过
EXIT=0
```


## 3. Done 逐条（原始输出入库）

### ① measurements 表 + 索引 + store API

- `src/store/migrations/003-measurements-table.ts`：8 列（`entity_id` / `metric_id` / `value` / `computed_at` / `run_id` / `source` / `input_digest` / `def_version`）+ 复合主键 + `idx_measurements_entity_metric_time(entity_id, metric_id, computed_at)`。
- `src/store/measurements.ts`：`recordMeasurement(s)` / `queryMeasurements` / `latestMeasurement` / `diffMeasurement`，**全函数带 JSDoc 输入/输出/降级契约**（铁律 47）。
- **查询类 fail-closed**：表缺失时**抛错**而非返回 `[]` —— 空数组会被误读为"无数据"，与 P7 教训（"查询失败被当成无边"）同型。

### ② append-only（物理守卫）

```
$ grep -rn "UPDATE measurements\|DELETE FROM measurements" src/
命中数=0
```
另有两道运行时/静态守卫：`measurements-append-only.test.ts`（含**判别性自检**：喂 `UPDATE measurements …` 必须命中）+ store API 导出键里无 update/delete。

### ⑤ 产品价值（本支已备 API，端到端在 PR-B）

`diffMeasurement` 覆盖"上月 3 → 本月 1"：`delta=-2`，并给 `defVersionMatched` 标记（口径变更时不把不同定义的值当"变化"直读）。

### ⑥ P7：graph_triples 整表重建 —— **在真实生产库副本上验收三条全过**

**迁移前（生产副本实际结构，逐字）**：
```
CREATE TABLE graph_triples ( id INTEGER PRIMARY KEY AUTOINCREMENT, …, props_json TEXT DEFAULT '{}', confidence REAL, source TEXT, … )
```

**迁移后（canonical）**：
```
CREATE TABLE graph_triples ( id TEXT PRIMARY KEY, graph TEXT NOT NULL DEFAULT 'default', …, props TEXT NOT NULL DEFAULT '{}', … )
```

**P7 验收三条（`probes/p7-acceptance.mts`，对 `/tmp` 生产副本运行）**：
```
PASS  (a) `SELECT props FROM graph_triples` 成功
PASS  (b) queryEdges 无报错（返回 0 行）；props=true id=TEXT=true
PASS  (c) createEdge 读写全通（id=edge-ebe79569-…, props={"probe":true}）
=== P7 ACCEPTANCE: ALL PASS ===
```
> 原始输出：`results/p7-acceptance-prod-copy.txt`。**`data/synova.db` 全程只读**（`.backup` 到 `/tmp` 副本；探针内硬守卫拒绝生产库路径）。

### ⑦ 测试只用内存/临时库

全部新测试用 `:memory:` SQLite；P7 验收用 `/tmp` 副本。**未对 `data/synova.db` 写入**。

## 4. ⚠️ 本支查出的**第二个生产级缺陷**：迁移会"静默不跑"（已修 + 判别性守卫）

**发现途径**：第一次对生产副本跑 P7 验收 → **三条全 FAIL、结构未变**（`results/p7-acceptance-before-version-fix.txt`）。

**根因（实测）**：`schema_version` 表被**多模块共用**，行内混有**文本**版本标记（`d93b_actor_role` / `d551_memory_type`）。原 `reconcileSchema` 用
```sql
SELECT version FROM schema_version ORDER BY updated_at DESC LIMIT 1
```
一旦最近一行是文本：`currentVersion = 'd93b_actor_role'` ⇒ `>= SCHEMA_VERSION` 为 NaN 比较（false，不早退）⇒ 随后 `m.version > currentVersion` **同为 NaN 比较** ⇒ **`pending` 恒空** ⇒ 走到 `pending.length === 0` 分支**只写版本号、一个迁移都不执行**。

**这解释了为什么生产库 `graph_triples` 至今仍是漂移态**：迁移逻辑看着在跑，实际从未作用到它。

**修复**（`src/store/schema-migration.ts`）：只认**数值**行并取**最大**版本
```sql
SELECT MAX(version) AS version FROM schema_version WHERE typeof(version) IN ('integer','real')
```
（= "已真正应用到的最高版本"；干净库行为不变。）

**改坏即红**（`results/kill-red-version-parse.txt`）：把该解析**临时还原为原实现** → 2 个用例变红：
```
× 最新一行是文本版本标记时，>当前数值版本的迁移仍必须执行（不得静默空转）
× 判别性: 污染库上 measurements 表也必须被建出（P7 同源守卫）
Tests  2 failed | 10 passed
```
还原 → `Tests 12 passed`。**修复后 P7 验收三条在真实生产副本上 ALL PASS。**

### 4.1 因果链（队长要求显式写清 · 第 1 点）

**共用表 → 文本行 → NaN 比较 → pending 恒空 → 零迁移执行 → 生产库漂移长期无人发现**

```
① `schema_version` 表被**多模块共用**（`reconcileSchema` 建的，但 D93b/D551 等模块把各自的
   变更标记**写进同一列**）——生产库 18 行里 6 行是文本：`d93b_actor_role` ×4 / `d551_memory_type` /
   `d551_target_type`（实测 `typeof(version)`）
② 原实现取「最近写入的一行」：`SELECT version FROM schema_version ORDER BY updated_at DESC LIMIT 1`
   ⇒ 实测取到 **`d93b_actor_role`（text）**
③ `currentVersion = 'd93b_actor_role'`
   ⇒ `currentVersion >= SCHEMA_VERSION` → **NaN 比较 ⇒ false**（因此**不早退**，看着像要继续跑迁移）
④ `migrations.filter(m => m.version > currentVersion && …)` → `2 > 'd93b_actor_role'` **同为 NaN 比较 ⇒ false**
   ⇒ **pending 恒为空数组**
⑤ 于是走到 `pending.length === 0` 分支：**只写一行版本号、一个迁移都不执行**
⑥ 结果：**迁移静默失效**——日志显示"Schema 版本已初始化"（看着正常），实际零迁移
   ⇒ 生产库 `graph_triples` 自 2026-09-13 起一直是漂移态，**长期无人发现**
```

**更强的一点（实测）**：生产库 rowid 17（text，`2026-09-13 01:52:53`）与 rowid 18（integer `2`，**同一秒**）**`updated_at` 并列** ⇒ `ORDER BY … LIMIT 1` 取哪一行取决于 SQLite 行序 ⇒ **该缺陷是"非确定性"的：同一份代码，有时跑迁移、有时不跑**。这比"稳定不跑"更难被常规回归发现。

### 4.2 与 P7 的关系（第 2 点）

**P7 是结果，这一条是机制。**
- P7（`graph_triples` 表结构漂移）描述了**症状**：读 `props` 报缺列、写 `edge-<uuid>` 撞 INTEGER 主键。
- 本条描述**为什么症状一直存在**：**迁移机制整体失效** ⇒ 即使写了正确的重建迁移，也**不会被真正执行**。
- ⇒ **只修 P7 而不修机制 = 假绿**：本卡第一版代码就是这样（迁移写对了，但在生产副本上零执行、三条验收全 FAIL，见 `results/p7-acceptance-before-version-fix.txt`）。**修了机制，P7 的迁移才真正生效**——修复后三条 ALL PASS（`results/p7-acceptance-prod-copy.txt`）正是这一因果的物理证据。

### 4.3 反例边界（第 3 点，诚实，队长明确要求不得夸大）

**本缺陷 ≠ "迁移从未生效过任何一次"。实测反例：**

| 迁移 | 产物 | 生产库实测 | 结论 |
|---|---|---|---|
| 001 (v2) `graph_nodes` props | `graph_nodes.props` | **存在**（`pragma_table_info` 计数 = **1**） | **曾成功执行**（版本行 `2` 已登记） |
| 002 (v3) `graph_triples` 重建 | `graph_triples.props` | **不存在**（计数 = **0**） | 未生效（本卡新增） |
| 003 (v4) measurements | `measurements` 表 | **不存在**（计数 = **0**） | 未生效（本卡新增） |

⇒ 准确表述应是：**迁移机制"非确定性失效"**——历史上（至少迁移 001 那一次）确实跑过并补上了 `graph_nodes.props`；此后只要（或当）最近写入的是文本行，启动时就**跳过全部迁移**。
**不得**表述为"迁移从未生效"或"`graph_nodes.props` 是别处补的"——实测它是迁移 001 的产物（`001-graph-nodes-props.ts` 是补该列的唯一代码路径）。
**这也解释了为何 P7 长期潜伏**：迁移 001 成功让"迁移功能看起来是好的"，掩盖了机制只在特定写入顺序下才工作。

**非确定性的直接证据**（`results/nondeterminism-tie.txt`）——最近一行**同秒并列**：
```
$ SELECT rowid, version, typeof(version), updated_at FROM schema_version
  WHERE updated_at = (SELECT MAX(updated_at) FROM schema_version) ORDER BY rowid;
rowid|version|typeof(version)|updated_at
17|d93b_actor_role|text|2026-09-13 01:52:53      ← 文本
18|2|integer|2026-09-13 01:52:53               ← 数值（**同一秒**）

$ SELECT version || ' [' || typeof(version) || ']' FROM schema_version ORDER BY updated_at DESC LIMIT 1;
d93b_actor_role [text]                          ← 原实现实际取到文本行
$ SELECT MAX(version) FROM schema_version WHERE typeof(version) IN ('integer','real');
2                                               ← 修复口径
```
⇒ **并列 ⇒ 取哪行取决于 SQLite 行序 ⇒ 迁移"有时跑、有时不跑"**。故本缺陷的正确定性是
**「迁移机制非确定性失效」**，**不是**「从未生效」——两者差别很大，后者与实测反例（`graph_nodes.props` 存在）矛盾。
**这是比 P7 更大的一类缺陷**：不是"某个表结构旧"，而是"**能跑成功的迁移可能被静默跳过**"。

### 4.4 Gatekeeper ACK 使用登记（本支）

| 项 | 值 |
|---|---|
| 授权 | 队长 2026-09-25 逐次授权；CTO 回执确认该记录为其本人且已复核 |
| 被豁免记录 | `.claude/bypass.log:1758` — `2026-09-25T00:56:43Z detected-bypass head-mismatch marker=ce5b13b96c9b0b5b40ff065da7f1361bd6996a72`（作者 `synova-cto`） |
| 提交前 `grep -c "2026-09-25.*detected-bypass"` | **1** |
| 提交后 `grep -c "2026-09-25.*detected-bypass"` | **1**（不变 ⇒ 未新增绕过） |
| 今日 ACK 放行日志条数 | **4**（`degraded-events.log`，如实登记）——其中**含 1 次被门禁拦下的空跑**（新文件配对/接线审计阻断，**未提交任何内容**，不构成超用）；其余为 pre-commit 预检与真提交。**`synova-commit` 内部会多次调用 pre-commit，条数 ≠ 提交次数。** |
| 未使用的绕过手段 | 未用 `--no-verify`；未用 `git stash`；未 force push；未改 `.claude/bypass.log` |
| 审计留痕落点 | `.codex/control-tower/logs/degraded-events.log`（被 `.gitignore` 的 `*.log` 命中 ⇒ **未入库**，本地审计） |



## 5. 改坏即红：P7 迁移本身是**负载项**

撤掉 `graphTriplesRebuildMigration` 注册（`results/kill-red.txt`）→ **4 个用例红**，其中写路径用例报的正是生产同款错误：
```
SqliteError: table graph_triples has no column named props
Tests  4 failed | 3 passed
```
还原 → `7 passed`（`results/kill-red-restored.txt`）。

## 6. 「PR-A 单独合并不留红态」的证明（CTO 硬要求 ④）

**全量 vitest（本支工作树）**：
```
Test Files  2 failed | 608 passed | 3 skipped (613)
     Tests  4 failed | 4532 passed | 24 skipped (4560)
```
**4 个失败逐一归因（全部与本卡无关）**：

| # | 用例 | 归因 | 证据 |
|---|---|---|---|
| 1 | `tests/acceptance/zero-code-industry` pizza-chain 节点类型 | **基线既有红** | 在**干净树**（`origin/main`，无本卡改动）复跑**同样红** |
| 2 | 同上 · `queryByTags` | **基线既有红** | 同上 |
| 3 | `tests/l3/graphbridge-wiring` 只成功模块建点 | **基线既有红** | 同上 |
| 4 | `tests/acceptance/zero-code-industry` · 新增行业零 `.ts` 修改 | **未提交状态伪红**（该用例断言"零 .ts 修改"，依赖工作树干净；CI 本就 `exclude: tests/acceptance/**` 正因此） | 干净树复跑**绿**；提交后工作树干净即转绿 |

⇒ **PR-A 单独合并不引入任何新红**：新增代码全绿（`tests/store/` + `post-diagnosis-processor` = **78 passed**），全量唯一差异是 +3 个新用例全过。

**其它门禁**：
```
$ npx tsc --noEmit  → 原始 28 条（与基线同数）；CI 同款白名单过滤后 = 0 条
$ check-ownership.py <PR-A 文件表> → ✅ PASS 9 个文件同域: win（无归属 0，域判定豁免 0）
```

## 7. 自检 5 问

1. **接线检查**：新增 export `recordMeasurement(s)/queryMeasurements/latestMeasurement/diffMeasurement` 与两条 `Migration` —— **PR-A 内暂无生产调用方**（调用方是 PR-B 的 `src/sentinel/runner.ts` ⇒ 栈式依赖）。**已显式登记**：本支为栈底，接线在 PR-B；`migrations` 数组已注册（生产入口 `reconcileSchema` ← `SqliteGraphStore` 构造器）✅
2. **异常处理**：迁移失败 → `log.error` + **抛错阻止启动**（fail-closed）；非 TABLE 形态 → 抛错；查询缺失表 → 抛错（**不静默成空**）。**未新增空 catch / 静默降级** ✅
3. **类型安全**：`git diff \| grep -E "as any\|as never\|as unknown as"` → **0**（新代码零三禁断言；`db as never` 仅出现在**测试**里传给构造器，生产代码未用）✅
4. **测试质量**：新增 3 个测试文件共 **19 用例**，全部含 `expect()`；覆盖**正常 / 降级 / 边界**（幂等、视图守卫、全新库、表缺失 fail-closed、非法参数、污染版本解析）；**两组改坏即红**（迁移撤注册 / 版本解析还原）✅
5. **残留清理**：伪条目删除后无悬挂引用（`getBaselineStore` 在本文件已零消费者，`grep` 实测）；无死代码；临时改坏实验**已逐字节还原**（`results/schema-migration.good.ts` 为还原基准）✅

## 8. 未清项（诚实登记）

1. **接线在 PR-B**：本支的 measurements API 尚无生产调用方（栈式依赖，非缺陷）。若 PR-B 被撤，本支将成为"建了表没人写"的死代码 —— **栈式两支需同批评审**。
2. **`graph_nodes` 漂移未处理（有意）**：生产 `graph_nodes` 比 canonical 多 `confidence`/`props_json`/`updated_at`、PK 为 `(id, graph)`、缺 `valid_from`；但 `createNode` 的 5 个 INSERT 列**齐全**、读写均通（实测），故**不在本卡重建**。已登记为后续观察项。
3. **`schema_version` 表被多模块污染**是**系统性**问题：本次只做了"读版本时容忍污染"，**未拆表**（拆表=影响其他模块，超出本卡写集）。建议立卡（拆分 `schema_version` 与各模块的版本表）。
4. **`tests/acceptance/**` 第 4 个伪红**：CI 已 exclude，本地全量会红；**提交后复跑取证**（见 §6 表）。
5. **未跑全量 `tsc` 之外的平台门禁**（如 Windows 侧）；本支未改脚本。
6. **效力**：本支给 `可提请独立审计`；**栈式两支须一并评审**（PR-B 的 base = 本支）。
7. **【环境级 · 非本卡】跑全量 `vitest` 会改脏 4 个 tracked 文件**（实测）：`extensions/industries/{saas-tech,test-write}/thresholds.json`（`aggregatedAt` 被写成运行时刻）与 `docs/synova/product-lines/evidence/D8{17,19}-capture-*.json`。这是**既有测试写残留**的已知问题（D580 卡已登记同型：「本机全量 vitest 下被既有测试写残留，`git checkout --` 可清」）。
   **本卡处置**：`git add -A` 曾误将它们纳入暂存 ⇒ 已 `git restore --staged` + `git checkout --` 还原，**未进入本 PR**（D708 复跑：25 文件 / 夹带 **0**）。**建议立卡**根治（测试应写临时目录而非仓库内 tracked 文件）。

## 9. 复现步骤

```bash
cd .synova-wt-D967a
# 1) 单测（含两组改坏即红的绿侧）
node_modules/.bin/vitest run tests/store/ tests/agent/post-diagnosis-processor.test.ts

# 2) P7 验收（真实生产副本，只读 + /tmp）
sqlite3 "file:$PWD/../data/synova.db?mode=ro" ".backup /tmp/D967/prod-copy.db"
node_modules/.bin/tsx docs/synova/product-lines/evidence/D967a-measurements-store/probes/p7-acceptance.mts --db=/tmp/D967/prod-copy.db   # 期望 ALL PASS

# 3) 改坏即红（P7 迁移负载性）
#    注释掉 schema-migration.ts 里 `graphTriplesRebuildMigration,` → 重跑 002 测试 → 4 红 → 还原

# 4) 改坏即红（版本解析抗污染）
#    把版本读取还原为 ORDER BY updated_at DESC LIMIT 1 → 重跑 schema-migration 测试 → 2 红 → 还原
```

## 10. 证据清单

| 路径 | 内容 |
|---|---|
| `probes/p7-acceptance.mts` | P7 验收探针（生产副本三条断言；硬守卫拒写生产库） |
| `results/p7-acceptance-prod-copy.txt` | **迁移后 ALL PASS**（修复版） |
| `results/p7-acceptance-before-version-fix.txt` | **修复前三条全 FAIL、结构未变**（缺陷现场） |
| `results/kill-red.txt` / `kill-red-restored.txt` | P7 迁移撤注册 → 4 红 / 还原 → 绿 |
| `results/kill-red-version-parse.txt` | 版本解析还原 → 2 红（抗污染守卫判别性） |
| `results/vitest-store.txt` | 定向 78 passed |
| `results/vitest-full.txt` | 全量 4532 passed / 4 failed（附归因） |
| `results/tsc.txt` | tsc 原始 28 条 + CI 过滤 0 条 |
| `results/domain.txt` / `append-only.txt` / `diff-stat.txt` | 域判定 / append-only=0 / 改动清单 |
| `results/schema-migration.good.ts` | 改坏实验的还原基准（逐字节） |
