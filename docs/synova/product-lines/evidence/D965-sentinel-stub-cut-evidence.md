# D965 裁撤 2 个硬编码桩哨兵（+ 登记）— 交付证据

| 项 | 值 |
|---|---|
| **任务** | task-1（D965）— 裁撤 2 个硬编码桩哨兵并登记于 `_extinct/` |
| **执行者** | `sentinel-coder-a`（编码；自验不兼任） |
| **独立复核** | `sentinel-verifier`（异人、异工作树、自研探针） |
| **工作树** | `.synova-wt-D965`（专用，未复用他人工作树） |
| **分支** | `fix/D965-sentinel-stub-cut` |
| **基线** | 开工 `origin/main` = `ce231ff1b1e419095117413badba8c6b55ae39fd`；提交前 ff 至 `0f7099005a62406fbfaa546bbb00117ba1bcc589`（+1 提交 `docs(D964): 台账第六批`，**docs-only / 与我持有文件零重叠**，实测 `git rev-list --count HEAD..origin/main` = 0） |
| **裁定** | CTO 裁定「裁撤 + 登记」；写集按 **A 方案**扩至 5 个连带文件（CTO 2026-09-25 批准） |

## 0. 效力声明（防误读）

- 本件只出 **`自验结论`**，**不含「审计通过」**。通过性判定归 **CTO 收件闸 + K3 终审**。
- 本件由**编码者**撰写，**不是独立验证**；独立结论见 `docs/synova/product-lines/evidence/D965-D968-独立复核-20260925/`（复核员产物，异人异树）。
- 判据纪律：**不使用 grep 型静态判据当验收**。本卡全部结论由**运行时断言**给出，并带**红/绿对照**（金丝雀 + 改坏即红）。
- 数字全部为**命令原始输出**，无手写。原始输出随件入库于 `results/`。

---

## 1. 前提冻结（开工前实测，非转述）

| # | 前提 | 命令 | 输出摘要 | 结论 |
|---|---|---|---|---|
| P1 | 两桩 `check()` 收错第 1 参、从不碰 store、input 为字面量 | 读 `extensions/sentinels/{sentinel-forecast-accuracy,sentinel-pricing-strategy}/aggregate.ts` | forecast `check(context:{db,now,registry?})`，L22 字面量 `{mape:0.25,sampleCount:12,monthsOfHistory:3}`；pricing 同病，L24-26 字面量 `{hasUniformPricing:true,profitGainFromDiscrimination:0.2,price:100,marginalCost:80}` | **成立** |
| P2 | loader 解包后两桩每次产出 3+1 条编造 finding | `probe-D965-sentinels.mts --label=BASELINE45` | `sentinel-forecast-accuracy -> ["forecast-mape","forecast-sample","forecast-timeseries"]`；`sentinel-pricing-strategy -> ["pricing-disc"]` | **成立** |
| P3 | `_extinct/` 制 = `{manifest.json,aggregate.ts,computes/**}`，无单独登记册 | `ls extensions/sentinels/_extinct/`；`find … -maxdepth 2 -type f` | 现存 12 个目录，仅 `manifest.json`/`aggregate.ts`/`computes/**`，无 README/登记册 | **成立** |
| P4 | loader 跳过 `_` 前缀目录 | `grep -n "startsWith('_')" src/sentinel/sentinel-loader.ts` | `80: if (entry.name.startsWith('_')) continue; // 模板目录` | **成立** |
| P5 | **裁撤写集外有 5 处断裂** | 见 §4 | 5 处逐条实测定位 | **成立 → 已报队长 → CTO 批准 A 方案扩写集** |

**P5 是"前提不成立"型发现**：派单件与 task-1 原写集未覆盖裁撤的**连带断裂**。按纪律未擅自扩写集，先报队长，得 CTO 批准后执行（§4）。

---

## 2. `git diff --stat` 原始输出

```
$ git diff --stat -M HEAD
 .../sentinel-forecast-accuracy/aggregate.ts              |  0
 .../sentinel-forecast-accuracy/manifest.json             |  0
 .../sentinel-pricing-strategy/aggregate.ts               |  0
 .../sentinel-pricing-strategy/manifest.json              |  0
 src/sentinel/types.ts                                    |  7 +++++--
 tests/control-tower/check-sentinel-type-net.test.sh      | 11 ++++++++++-
 tests/sentinel/d752-type-net-gate.integration.test.ts    | 16 ++++++++++++----
 tests/sentinel/path-dependency-sentinel.test.ts          | 12 ++++++++----
 tests/sentinels/shared/d62-me-sentinels.test.ts          | 13 ++++++++-----
 9 files changed, 43 insertions(+), 16 deletions(-)

$ git diff -M --summary HEAD
 rename extensions/sentinels/{ => _extinct}/sentinel-forecast-accuracy/aggregate.ts (100%)
 rename extensions/sentinels/{ => _extinct}/sentinel-forecast-accuracy/manifest.json (100%)
 rename extensions/sentinels/{ => _extinct}/sentinel-pricing-strategy/aggregate.ts (100%)
 rename extensions/sentinels/{ => _extinct}/sentinel-pricing-strategy/manifest.json (100%)
```

⇒ **4 个文件是 `R100` 纯改名**（0 行改动）；其余 5 个是连带修复（§4）。完整原始输出：`results/git-diff-stat.txt`。

> **stat 口径说明（诚实登记）**：上表**只含代码/测试变更**，不含本卡的治理产物（本 evidence 文件、`results/`、`probes/`、`task-state/D965.json`、task brief）。治理产物在提交时由 git 计入，**其权威 stat 由 git 在提交/PR 时生成**；把本文件自身的 stat 写进本文件存在自指，故不伪造。

---

## 3. Done 逐条（命令 + 原始输出）

### Done 1 — 哨兵探针重跑：抛错 = 0

> 卡片原文为「45 哨兵探针重跑」。**实测口径修正**：裁撤后活跃哨兵 = **43**（原 45）。故给出**裁撤前 45** 与**裁撤后 43** 两侧，均为 `threw = 0`。

**工具**：`probes/probe-D965-sentinels.mts`（coder-a **自研**，未复用 `sentinel-verifier` 的 `probe-sentinels.mts`）。零数据图 = 生产库 `sqlite3 .backup` 快照 → `/tmp/D965/db-zero.db`（`graph_triples` = 0 行，`pragma integrity_check` = ok）；探针内含硬守卫：路径落在 `data/*.db` 时**拒绝运行**（`SqliteGraphStore` 构造器会 `reconcileSchema` 写库，故不可用只读句柄——实测 `SQLITE_READONLY`）。

**裁撤前（45）** 原始输出：

```
$ tsx probes/probe-D965-sentinels.mts --db=/tmp/D965/db-zero.db --label=BASELINE45 --cwd=<wt>
=== SUMMARY BASELINE45 ===
sentinels_total=45
threw_count=0
entry_missing=[]
module_import_failed=[]
hasCheck_false=[]
store_zero_call=["sentinel-forecast-accuracy","sentinel-pricing-strategy"]
degraded_prop_true=["customer-demand-shift"]

=== FINDINGS-BY-SENTINEL BASELINE45 (non-empty only, 逐元素可比) ===
business-model-coherence -> ["i7-crit"]
cash-runway -> ["cr_runway_degraded","cr_overdue_degraded"]
channel-capacity -> ["o6-nodata"]
competitive-moat -> ["i3-nodata"]
competitive-position -> ["e1-nodata"]
environment-rent-dependency -> ["e5-rent-warn"]
incentive-alignment -> ["o3-nodata"]
info-distortion -> ["o7-nodata"]
knowledge-accessibility -> ["o4-nodata"]
org-repairability -> ["o8-nodata"]
power-rigidity -> ["o9-nodata"]
routine-diffusion -> ["o5-nodata"]
sentinel-forecast-accuracy -> ["forecast-mape","forecast-sample","forecast-timeseries"]
sentinel-pricing-strategy -> ["pricing-disc"]
talent-density -> ["o10-nodata"]
finding_producing_sentinels=15
total_findings=18
```

**裁撤后（43）** 原始输出（`--label=D965-FINAL`，即本次交付的最终状态）：

```
=== SUMMARY D965-FINAL ===
sentinels_total=43
threw_count=0
entry_missing=[]
module_import_failed=[]
hasCheck_false=[]
store_zero_call=[]
degraded_prop_true=["customer-demand-shift"]

=== FINDINGS-BY-SENTINEL D965-FINAL (non-empty only, 逐元素可比) ===
business-model-coherence -> ["i7-crit"]
cash-runway -> ["cr_runway_degraded","cr_overdue_degraded"]
channel-capacity -> ["o6-nodata"]
competitive-moat -> ["i3-nodata"]
competitive-position -> ["e1-nodata"]
environment-rent-dependency -> ["e5-rent-warn"]
incentive-alignment -> ["o3-nodata"]
info-distortion -> ["o7-nodata"]
knowledge-accessibility -> ["o4-nodata"]
org-repairability -> ["o8-nodata"]
power-rigidity -> ["o9-nodata"]
routine-diffusion -> ["o5-nodata"]
talent-density -> ["o10-nodata"]
finding_producing_sentinels=13
total_findings=14
```

⇒ **`threw_count=0`（43/43）**；`store_zero_call` 由 **2 → 0**（硬编码桩特征消失）。

**逐元素 diff（无其它 finding 被误伤）** 原始输出：

```
$ python3 results/findings-diff-before-after.txt 的生成脚本
loadSentinels.count: 45 -> 43
total_findings:      18 -> 14

A-B (消失的 finding):
  - sentinel-forecast-accuracy:forecast-mape
  - sentinel-forecast-accuracy:forecast-sample
  - sentinel-forecast-accuracy:forecast-timeseries
  - sentinel-pricing-strategy:pricing-disc

B-A (新增的 finding):
  (空)

REMOVED_ENTRIES = {"sentinel-forecast-accuracy": ["forecast-mape", "forecast-sample", "forecast-timeseries"], "sentinel-pricing-strategy": ["pricing-disc"]}
ADDED_ENTRIES   = {}
CHANGED_ENTRIES = {}
COLLATERAL_DAMAGE = False
```

⇒ **消失恰为那 4 条编造 finding，新增 0、改动 0**。

**与独立复核员结论交叉对照**（引用结论，未复用其脚本）：`D965-D968-独立复核-20260925/results/probe-A.json` 的 `loadSentinels={count:45,degraded:false,errors:[]}`、`threwCount=0`、15 个有产出哨兵及其 id 清单——与本件 45 侧**逐元素一致**（18 = 1+2+1+1+1+1+1+1+1+1+1+1+3+1+1）。**无分歧，无需上报调和。**

### Done 2 — 两件已登记于 `_extinct/`，原目录无残留

```
$ ls extensions/sentinels/_extinct/ | sort
adaptation-velocity
capital-efficiency
capital-structure
capital-turnover
competitive-dynamics
competitive-moat-perceptual
competitive-moat-structural
connector-coverage
cost-health
market-lifecycle
profit-health
sentinel-forecast-accuracy      ← 新登记
sentinel-pricing-strategy       ← 新登记
structural-change

$ ls extensions/sentinels/_extinct/ | wc -l
14                              # 原 12 + 2

$ ls -d extensions/sentinels/sentinel-forecast-accuracy extensions/sentinels/sentinel-pricing-strategy
ls: extensions/sentinels/sentinel-forecast-accuracy: No such file or directory
ls: extensions/sentinels/sentinel-pricing-strategy: No such file or directory

$ 活跃目录数（loader 同口径：排除 shared 与 _ 前缀）
43

$ find extensions/sentinels/sentinel-forecast-accuracy extensions/sentinels/sentinel-pricing-strategy
find: extensions/sentinels/sentinel-forecast-accuracy: No such file or directory
find: extensions/sentinels/sentinel-pricing-strategy: No such file or directory

$ find extensions/sentinels/_extinct/sentinel-forecast-accuracy extensions/sentinels/_extinct/sentinel-pricing-strategy -type f | sort
extensions/sentinels/_extinct/sentinel-forecast-accuracy/aggregate.ts
extensions/sentinels/_extinct/sentinel-forecast-accuracy/manifest.json
extensions/sentinels/_extinct/sentinel-pricing-strategy/aggregate.ts
extensions/sentinels/_extinct/sentinel-pricing-strategy/manifest.json
```

⇒ **原目录零残留（无空目录）**；登记件与现存 12 个 extinct 同制（`manifest.json` + `aggregate.ts`，两者本就无 `computes/`）。原始输出：`results/extinct-registration-ls.txt`。

### Done 3 — 判别性夹具（改坏即红）· 方言无关（含金丝雀）

**工具**：`probes/assert-D965-stub-cut.mts`（与探针**分离**：探针只测量，本件只判定；`expect()` 等价断言 + exit 0/1/2）。

**判据设计（防假绿三件）**：

1. **金丝雀（方言无关）** — 3 个**未被本卡触碰**的哨兵必须在零数据图上产出与基线**逐元素相等**的 id。若探针因方言/加载原因"什么都没读到"，金丝雀必红 ⇒ **排除"因为空所以绿"**。
2. **禁用项** — 两个桩哨兵不得出现在加载集内，且其编造 id 不得出现在 finding 流中。
3. **无误伤** — 除被裁撤者外，findings 映射**逐元素相等**（多一条/少一条/改一个 id 都红）。

**① 裁撤前基线 → 必须红**（证明夹具确有判别力）：

```
$ tsx probes/assert-D965-stub-cut.mts --probe=/tmp/D965/probe-BASELINE45.json
PASS  金丝雀在 [cash-runway] -> ["cr_runway_degraded","cr_overdue_degraded"]
PASS  金丝雀在 [business-model-coherence] -> ["i7-crit"]
PASS  金丝雀在 [channel-capacity] -> ["o6-nodata"]
FAIL  裁撤未生效 [sentinel-forecast-accuracy]：仍出现在加载集（共 45 个哨兵）
FAIL  裁撤未生效 [sentinel-pricing-strategy]：仍出现在加载集（共 45 个哨兵）
FAIL  编造 finding 泄漏：["forecast-mape","forecast-sample","forecast-timeseries","pricing-disc"]（出现在 ["sentinel-forecast-accuracy","sentinel-pricing-strategy"]）
FAIL  有产出的哨兵集合变化（误伤）：多出 ["sentinel-forecast-accuracy","sentinel-pricing-strategy"] / 缺失 []
# 零 store 调用哨兵（裁撤后应为空）: ["sentinel-forecast-accuracy","sentinel-pricing-strategy"]
FAIL  裁撤后仍有哨兵零 store 调用（硬编码桩嫌疑）: ["sentinel-forecast-accuracy","sentinel-pricing-strategy"]
PASS  抛错 = 0（共 45 个哨兵）

=== ASSERT RESULT: RED (failures=5) ===
```

**② 裁撤后 → 必须绿**：

```
$ tsx probes/assert-D965-stub-cut.mts --probe=/tmp/D965/probe-D965-FINAL.json
PASS  金丝雀在 [cash-runway] -> ["cr_runway_degraded","cr_overdue_degraded"]
PASS  金丝雀在 [business-model-coherence] -> ["i7-crit"]
PASS  金丝雀在 [channel-capacity] -> ["o6-nodata"]
PASS  已裁撤 [sentinel-forecast-accuracy]：不在加载集内
PASS  已裁撤 [sentinel-pricing-strategy]：不在加载集内
PASS  编造 finding 零残留：["forecast-mape","forecast-sample","forecast-timeseries","pricing-disc","pricing-below-mc"] 均不在流中（全流 14 条）
PASS  有产出的哨兵集合一致：13 个
# 零 store 调用哨兵（裁撤后应为空）: []
PASS  零 store 调用哨兵 = 0（裁撤前为 2）
PASS  抛错 = 0（共 43 个哨兵）

=== ASSERT RESULT: GREEN (failures=0) ===
$ echo $?
0
```

**③ 「把裁撤还原（stub 回到原位）→ 该断言必须变红」** — 在隔离 scratch 树执行 `git mv` 把 stub 移回原位后重跑**同一夹具**：

```
$ git mv extensions/sentinels/_extinct/sentinel-forecast-accuracy extensions/sentinels/sentinel-forecast-accuracy
$ git mv extensions/sentinels/_extinct/sentinel-pricing-strategy extensions/sentinels/sentinel-pricing-strategy
restore ok

$ tsx probes/probe-D965-sentinels.mts --label=RED-RESTORED --cwd=<scratch>   # probe_exit=0
$ tsx probes/assert-D965-stub-cut.mts --probe=/tmp/D965/probe-RED-RESTORED.json
PASS  金丝雀在 [cash-runway] -> ["cr_runway_degraded","cr_overdue_degraded"]
PASS  金丝雀在 [business-model-coherence] -> ["i7-crit"]
PASS  金丝雀在 [channel-capacity] -> ["o6-nodata"]
FAIL  裁撤未生效 [sentinel-forecast-accuracy]：仍出现在加载集（共 45 个哨兵）
FAIL  裁撤未生效 [sentinel-pricing-strategy]：仍出现在加载集（共 45 个哨兵）
FAIL  编造 finding 泄漏：["forecast-mape","forecast-sample","forecast-timeseries","pricing-disc"]（出现在 ["sentinel-forecast-accuracy","sentinel-pricing-strategy"]）
FAIL  有产出的哨兵集合变化（误伤）：多出 ["sentinel-forecast-accuracy","sentinel-pricing-strategy"] / 缺失 []
# 零 store 调用哨兵（裁撤后应为空）: ["sentinel-forecast-accuracy","sentinel-pricing-strategy"]
FAIL  裁撤后仍有哨兵零 store 调用（硬编码桩嫌疑）: ["sentinel-forecast-accuracy","sentinel-pricing-strategy"]
PASS  抛错 = 0（共 45 个哨兵）

=== ASSERT RESULT: RED (failures=5) ===
$ echo $?
1
```

⇒ **同一夹具、同一数据、唯一变量 = 裁撤**：GREEN(exit 0) ⇄ RED(exit 1)。**金丝雀在两态均 PASS**，故红/绿差异**只能**归因于裁撤，而非探针失效。原始输出：`results/assert-on-BASELINE45.txt`、`assert-D965-FINAL.txt`、`assert-RED-RESTORED.txt`、`probe-RED-RESTORED.txt`(JSON)。

### Done 4 — `path-dependency` **哨兵目录** 0 改动

```
$ git diff --stat -M HEAD -- extensions/sentinels/path-dependency
（空输出 = 0 改动）
$ git diff --numstat -M HEAD -- extensions/sentinels/path-dependency
（空输出）
```
原始输出：`results/self-check-raw.txt`。

**精确表述（区分两件事，防误读）**：

| 对象 | 本卡是否改动 | 说明 |
|---|---|---|
| `extensions/sentinels/path-dependency/**`（**哨兵目录**） | **0 改动** | CTO 探针硬编码 `aggregate.ts` 才报 `Cannot find module`；其 `manifest.entryPoint=./computes/detect.ts` 存在、`exportKey=pathDependencySentinel`、`check()` 返回 `SentinelFinding[]`，loader 尊重 entryPoint（`src/sentinel/sentinel-loader.ts:193`）⇒ **探针口径问题，非哨兵故障** |
| `tests/sentinel/path-dependency-sentinel.test.ts`（其**测试文件**） | **改了 1 处**（`:82`） | 原硬编码 `expect(registered).toBe(45)`，裁撤后为 43 ⇒ 必红。改**动态取数**（见 §4），属本卡裁撤的**连带影响**，非 path-dependency 哨兵本身 |

### Done 5 — 加载数变化显式登记：45 → 43

```
loadSentinels().sentinels.length:  45（基线）→ 43（裁撤后）        # 探针原始输出，两态均 degraded=false errors=[]
活跃哨兵目录数（loader 同口径）:    45 → 43                        # results/extinct-registration-ls.txt
registerLoadedSentinels().registered: 45 → 43                      # 由 Done#4 的动态断言覆盖
```

**对本批其它卡判据的影响（必须显式交接）**：

| 卡 | 受影响判据 | 影响与处置 |
|---|---|---|
| **D966**（图数据空因/基线） | 其"基线"若引用 `registered=45` 或"45 哨兵 × …"口径 | **基线由此变为 43**。凡 D966 中形如「45 哨兵」「45/45」的分子/分母**必须改用 43**，否则判据失真。**本卡未改任何 D966 产物**，仅登记。 |
| **D968**（"加载数 = 目录数"不变式） | 其核心不变式本身 | **不变式仍然成立且更强**：43（loader 加载）= 43（真实活跃目录）= 43（门禁计数），三者一致（见 `results/gate-sh-test-after-fix.txt` 动态取数=43、`ci-tsc-filter.txt`）。**D968 应以此 43 为新起点**，并沿用本卡的动态取数写法，不得再写死数字。 |
| 独立复核员 `D965-D968-独立复核`（已落 main） | 其 probe-A/B/C/E 的 `loadSentinels.count=45` | 那是**裁撤前基线**的密封记录，**不应改动**（历史态）。复核员需在**本卡之后**重跑以取得 43 侧对照；本卡 §3-Done1 已给出 43 侧原始输出供对照。 |

**未为此新增哨兵**（院方禁令 3）：`_extinct/` 新增 2 个**归档**，活跃数**净减 2**，无新增活跃哨兵。

---

## 4. 写集外连带断裂（5 处）— 已报队长并经 CTO 批准 A 方案

裁撤打断了 **5 个写集外文件**。开工前冲突扫描实测定位，**未擅自扩写集**；报队长 → CTO 批准 A 方案 → 本卡一并修复。

| # | 文件:行 | 原内容 | 后果 | 处置（A 方案） |
|---|---|---|---|---|
| 1 | `src/sentinel/types.ts:297-298` | `import type {…} from "…/sentinel-{forecast-accuracy,pricing-strategy}/aggregate"` ×2 | 路径不存在 → **CI 类型门禁红**（`TS2307`，CI 白名单**不含** `src/`） | 两条 import 重指 `_extinct/`（与同文件既有 12 条 `_extinct/…` import 同制） |
| 2 | `tests/sentinels/shared/d62-me-sentinels.test.ts:93-104` | `await import('…/sentinel-{pricing-strategy,forecast-accuracy}/aggregate')` | vitest 模块找不到 → 红 | import 随迁 `_extinct/` + 显式标注「已归档」；**保留**导出形状契约（不删覆盖） |
| 3 | `tests/sentinel/path-dependency-sentinel.test.ts:82` | `expect(registered).toBe(45)` | 43 ⇒ 红 | **改动态取数** `loadSentinels().sentinels.length`（+ `>0` 防空载假绿） |
| 4 | `tests/sentinel/d752-type-net-gate.integration.test.ts:57-60` | `expect(out).toContain('45 个活跃哨兵全部已登记')`（跑**真实仓库**） | 门禁打印 43 ⇒ 红 | **改动态取数**：解析门禁输出的数字 × **独立**按目录口径重算，断言二者相等 |
| 5 | `tests/control-tower/check-sentinel-type-net.test.sh:37` | `assert_contains "$OUT" "45 个活跃哨兵全部已登记"` | 同上 ⇒ 红 | **改动态取数**：期望值按 loader 同口径实时计算 |

**#3/#4/#5 一律动态取数，未把 `45` 直接改成 `43`**（队长口径：后者只是把同一个坑挪到下一次裁撤）。⇒ 下一次裁撤/新增哨兵时这三处**自动跟随**（铁律 35 自动化优先）。

**已排除（实测不红，故未扩写集）**：

- `tests/sentinel/finding-id-stability.test.ts:25` 用**单层** `import.meta.glob('../../extensions/sentinels/*/aggregate.ts')`；`_extinct/` 为嵌套目录 → 不入扫描（44 → 42），断言为 ∀ 型 → **不红**（已跑，见下）。
- `tests/sentinel/sentinel-merge-d15a.test.ts:96-97` 断言区间 `>=40 && <=50` → 43 **通过**。
- `check-sentinel-type-net.sh` 豁免规则 2 明文：「`_` 前缀目录…归档哨兵在 types.ts 中的存量 import 不受本门禁管辖（不要求删，也不算登记）」⇒ 门禁**不强制**改 `types.ts`，但 **CI 的 tsc 会红**，故必须改。

### 4.2 本地 13 组门禁结果（**含一次自证伪 · 测量口径修正**）

**权威口径**（与 `synova-commit` 实际执行的完全一致：`STAGED_ALL` = 暂存集）：

```
$ git add -A && GITHUB_ACTIONS=true bash scripts/pre-commit-check.sh
── 组 6/13: Task Brief (6 核心字段) ──
  ✅ Task Brief: 编码变更须有今日 task brief
  ✅ Task Brief: 6 核心字段必须填写 (Q0/Q1/Q2/Q3/架构层/Done)
  ✅ 全部 13 组通过
EXIT=0
```

**裁撤/修复前的等价口径**（Gatekeeper 已 ACK 放行，`STAGED_ALL` 同为暂存集）亦为 `EXIT=0 / ✅ 全部 13 组通过`。原始输出：`results/precommit-authoritative.txt`、`results/precommit-nonvacuous.txt`。

#### ⚠️ 本次交付中**自查出并已修正**的一处假绿（诚实登记，勿略）

本证据的**首版**用 `GITHUB_ACTIONS=true SYNO_DIFF_BASE=origin/main` 测「13 组通过」。该口径在**提交前**（`HEAD == origin/main`，分支尚无提交）会令 `git diff origin/main...HEAD` = **0 文件** ⇒ `pre-commit-check.sh` 的 `STAGED_SRC`（由 `.ts` 暂存文件派生）**为空** ⇒ 组 6 的整块 `Task Brief 6 核心字段` 检查被**整体跳过**，`TASK_BRIEF_EMPTY` 保持空 ⇒ 两个 `decl_check` **空洞地打印 ✅**。

- **发现途径**：`synova-commit --check`（其内部就是 `bash pre-commit-check.sh`，但**不带** `SYNO_DIFF_BASE`）⇒ 当场硬阻断。
- **实测对照**：`git diff origin/main...HEAD --name-only` = **0** 个文件；`git diff --cached --name-only` = **39** 个文件。
- **修正**：本卡一律以 `STAGED_ALL` = 暂存集为准复跑（上）。`SYNO_DIFF_BASE` 口径在**提交后**才是非空洞的（CI 即此形态），故提交后另跑一次入证。
- **教训（同类第二次即升级）**：带 `SYNO_DIFF_BASE` 的本地预跑在"分支尚未提交"时是**空洞绿**——它与 CI 形态**同名不同义**。此坑建议立卡（可考虑让 `STAGED_SRC` 为空时**显式 degraded**，而非静默跳过整组）。

#### 该次硬阻断的真实缺陷（已修）

`--check` 报 `架构层: 未填写`，根因：`pre-commit-check.sh:877-883` 判 `LAYER_FILLED` 长度 **`< 3` 即视为未填写**，而本 brief 原写 `## 架构层: L3`（**2 字符**）⇒ 误判。已改为可读展开值：

```
$ python3 scripts/control-tower/brief_parser.py --layer .claude/task-briefs/2026-09-25-D965-sentinel-stub-cut.md
L3 洞察层（src/sentinel/ 哨兵加载与类型网 + extensions/sentinels/ 文件驱动扩展点）
```

（注：`CLAUDE.md` V4.2.7 变更日志声称已修「"L3"过短(2字符)导致6核心字段误阻断」，但**当前脚本实测仍误判**——已按"同类第二次立即升级"上报队长。）

⇒ **13 组硬检查全通过**。余 3 条**软提示**（本地不阻断）：

| 软提示 | 归属 | 说明 |
|---|---|---|
| 时间戳顺序: brief 必须早于代码写入（1 处） | **环境级陈旧残留，非本卡** | 触发源 `/tmp/.synova-before-brief` 时间为 **2026-09-24 16:31**、内容指向 **D941** 会话与另一文件（`dsh-electron-source-desktop.md`）。该检查只判**文件是否存在**，故会拦截任何提交。见 §6-9（队长裁定：原地保留不删）。 |
| PRD 对照（可选） | — | 标注为「可选提示——永不阻断」 |
| D2 登记门禁 | **本卡已解决** | 经队长批准扩写集，补登记 `DOC-0035`（本件）+ `DOC-0036`（复核员主证据）→ `✅ 登记门禁通过`（§6-7） |

**本地真提交的实际硬阻断见 §6-8（Gatekeeper 今日 tripwire，已获 CTO 授权 ACK）。**

### 4.1 修复后验证（绿侧）

**定向 vitest（4 文件，含回归）**：

```
$ vitest run tests/sentinels/shared/d62-me-sentinels.test.ts tests/sentinel/path-dependency-sentinel.test.ts \
             tests/sentinel/d752-type-net-gate.integration.test.ts tests/sentinel/finding-id-stability.test.ts
 ✓ tests/sentinels/shared/d62-me-sentinels.test.ts (14 tests) 33ms
 ✓ tests/sentinel/d752-type-net-gate.integration.test.ts (4 tests) 201ms
 ✓ tests/sentinel/path-dependency-sentinel.test.ts (12 tests) 309ms
 ✓ tests/sentinel/finding-id-stability.test.ts (4 tests) 61ms
 Test Files  4 passed (4)
      Tests  34 passed (34)
VITEST_EXIT=0
```

**门禁自身 shell 测试（9 ✅ / 0 ❌，动态取数 = 43）**：

```
$ bash tests/control-tower/check-sentinel-type-net.test.sh
── 1. 正常路径: 真实仓库全登记 → exit 0 ──
  ✅ 真实仓库门禁绿 (exit=0)
  ✅ 全登记计数输出（动态取数=43）
── 2. 红分支: 沙箱缺登记 → exit 1 + 点名 ──
  ✅ 缺登记非零退出（业务阻断） (exit=1)
  ✅ 缺失项被点名
  ✅ 已登记项不误报
── 3. 豁免边界: _ 前缀归档 + shared + 非目录条目不参与 ──
  ✅ 豁免规则生效（归档/shared/非目录不要求登记） (exit=0)
  ✅ 豁免项零误报
── 4. 降级路径: 哨兵目录缺失 → exit 2 fail-closed ──
  ✅ 目录缺失降级退出（不静默当绿） (exit=2)
  ✅ 降级原因显式输出
  全部通过: 9 ✅ / 0 ❌
SH_TEST_EXIT=0
```

**CI 同款类型门禁（`.github/workflows/ci.yml:76-81`）**：

```
$ grep -v "_extinct/\|ima.ts\|server.ts\|sentinel-service.ts\|industry-loader.ts\|tool-registration.ts\|llm-provider-loader.ts" results/tsc-AFTER-FIX.txt | grep -E "error TS"
[空输出 = CI 类型门禁绿]

baseline_raw=28  after_cut_raw=30  after_fix_raw=30
```

⇒ **CI 过滤后 = 0 条**（基线亦 0）。原始输出：`results/ci-tsc-filter.txt`。

**裁撤引入的 2 条新增原始错误 = `_extinct/` 内死代码的自身相对 import 深度**：

```
extensions/sentinels/_extinct/sentinel-forecast-accuracy/aggregate.ts: error TS2307: Cannot find module '../../../src/sentinel/types' …
extensions/sentinels/_extinct/sentinel-pricing-strategy/aggregate.ts: error TS2307: Cannot find module '../../../src/sentinel/types' …
```

这与**现存 12 个 extinct 目录完全同型**（它们各自也报同样的 `TS2307`），正是 CI 白名单 `_extinct/` 存在的**原因**。本卡按「与现存 12 个 extinct 同制」保留 4 个 `R100` 纯改名，未改动归档死代码。**CI 过滤后为 0**（上）。

---

## 5. 自检 5 问

**1. 接线检查（新 export 谁调用）**
本卡**未新增任何 export**（无新函数/新模块）。改动为：① 4 个文件 `R100` 改名；② `types.ts` 2 条 `import type` 重指（编译期类型登记，调用方语义不变）；③ 4 个测试文件的路径/计数断言。**无新增接线需求**。反向核对：`git grep "_extinct/sentinel-forecast-accuracy\|_extinct/sentinel-pricing-strategy"` → 命中 `src/sentinel/types.ts` + `tests/sentinels/shared/d62-me-sentinels.test.ts`（2 处，即预期的全部消费者）。

**2. 异常处理（catch 有 log + degraded）**
本卡**未新增/修改任何 `catch` 块**，未触碰运行时逻辑。被裁撤 2 桩的 `catch` 为空吞型（`catch (err) { log.warn(...) }` 且 `degraded:false` 硬编码 —— 违反铁律 11/31），**未修复而是整件裁撤**（院方禁令 3 禁止"补 compute 救活"），故该缺陷随文件归档，不再进入运行时。**未新增静默降级**。

**3. 类型安全（`as any` / `as never` / `as unknown as` = 0）**

```
$ git diff -M HEAD | grep -nE "as any|as never|as unknown as"
（空输出 = 0）
```

新代码仅用 `m![1]`（非空断言，`expect(m,…).toBeTruthy()` 已先行守卫）与 `readdirSync(..., {withFileTypes:true})` 的标准类型。**0 处三禁断言**。

**4. 测试质量（有 expect、覆盖三路径）**
本卡新增的运行时判据**全部带断言**：`probes/assert-D965-stub-cut.mts` 为 10 条判据（3 金丝雀 + 2 裁撤 + 1 泄漏 + 1 集合一致 + 13 项无误伤 + 1 零 store + 1 抛错），exit 码 0/1/2 三态明确（**2 = 输入缺失 fail-closed，不静默当绿**）。**三路径覆盖**：正常（裁撤后 GREEN）/ 降级（输入缺失 → exit 2）/ 边界（裁撤未生效 → RED；还原裁撤 → RED）。25 个被修改的既有断言全部保留 `expect()`/`assert_contains`，非空壳（铁律 48）。**未新增空壳测试**。

**5. 残留清理（死代码 / 旧文件 / 旧引用）**

```
$ git grep -n "extensions/sentinels/sentinel-forecast-accuracy\|extensions/sentinels/sentinel-pricing-strategy" -- .
```

命中且**逐条判定**：

| 命中位置 | 判定 |
|---|---|
| `.claude/task-briefs/2026-08-16-D386-*`、`2026-09-06-D580-*`、`2026-09-09/10-D658-*` | **历史 task brief（既往任务的时间点记录）**，非活引用，不改 |
| `docs/synova/coordination/派单-哨兵体系整改-20260925.md:52` | **历史派单件**（记录当时的写集），非活引用，不改（改它=篡改历史件） |
| `docs/synova/product-lines/evidence/D965-D968-独立复核-20260925/probes/claims-check.mts:13-14` | 复核员**已落 main 的密封证据**（记录**裁撤前**状态），**不得改**；已登记为「跨卡历史态」 |
| `task-state/D965.json:13-14` | **本卡自己的写集声明**，已在本卡同步更新（保留旧路径 glob 以覆盖 rename 的 source 侧 + 新增 `_extinct/**` 等） |

⇒ **活代码零旧引用**（`src/`、`tests/` 内已全部指向 `_extinct/` 或动态取数）。**无空目录残留**（§3-Done2）。**无死代码新增**（归档即本卡目的）。

---

## 6. 未清项（诚实登记，不掩盖）

1. **`tsc --noEmit` 基线本身是红的：28 条原始错误**，其中 25 条来自**现存 12 个 `_extinct/` 归档死代码**（相对 import 深度失配 `TS2307` + 隐式 any），3 条来自 `src/connectors/ima.ts`、`src/server.ts`（CI 已白名单）。**本卡新增 2 条**（同为 `_extinct/` 内死代码），**CI 过滤后为 0 条**（§4.1）。**若 CTO 要求"归档死代码也 tsc 干净"，那是 14 个文件的独立卡**（现存 12 个同样红），**不属本卡**。
2. **未跑全量 `vitest`**（全机重型验证串行；复核员持有对照基准）。本卡只跑了**定向** 4 个文件（34 tests）+ 门禁 shell 测试 + 定向 `tsc`（3 次，均单独串行执行，未并发）。**全量回归应由独立复核员或 CI 承担。**
3. **`sentinel-verifier` 的 `claims-check.mts` 仍引用已裁撤路径**（`results` 侧密封证据）。它落在 `docs/` 且**不在 vitest `include`（`./tests/**`）内**，不影响 CI；且作为**裁撤前**密封记录**不应改动**。**已登记，不处置。**
4. **本次裁撤**未回答"这两桩当初为何进入 main"（派单 D62 的验收为何放过硬编码字面量）——属根因追责，非本卡范围，**建议立卡**（同类第二次立即升级 CTO 的触发条件）。
5. **生产库 `data/synova.db` 全程只读**：仅执行 `sqlite3 "file:…?mode=ro" ".backup /tmp/D965/db-zero.db"`（快照）。探针内硬守卫拒绝在生产库路径运行（`SqliteGraphStore` 构造器会写 `schema_version`）。**未对 `data/synova.db` 做任何写入。**
6. **`probes/` 内两脚本的输出目录硬编码 `/tmp/D965`**（与复核员 `probe-sentinels.mts` 同制）。为保**"入库脚本与产出结果的脚本字节一致"**，未改为可配置；复现需先 `mkdir -p /tmp/D965`。脚本依赖 `<wt>/node_modules` 软链指向仓库根 `node_modules`。
7. **D2 登记门禁：已解决**（原为未清项）。本 evidence md 与**复核员已落 main 的独立复核主证据**同属一个门禁缺口（合并 PR #790 时漏登记）。经队长 **2026-09-25 批准**把 `docs/authority/DOCS-REGISTRY.yaml` 扩入写集，补登记 **2 条**：
   - `DOC-0035` → 本件 `docs/synova/product-lines/evidence/D965-sentinel-stub-cut-evidence.md`
   - `DOC-0036` → `docs/synova/product-lines/evidence/D965-D968-独立复核-20260925/D965-D968-独立复核-evidence.md`（复核员产出，owner `sentinel-verifier`）
   实测：`doc-registry-gate.sh` → `✅ 已登记 … 汇总: 检查 1 个文档，0 个未登记 → ✅ 登记门禁通过`。
   **残留子项（诚实登记）**：该复核目录下另有 `搬运声明-README.md`（`.md`，同属未登记缺口）。队长裁定条目数为 **2**，故未加第 3 条；**已上报待裁**。机制注：该门禁在 CI 实为空转（只扫 untracked + staged 新增；CI checkout 后索引干净 ⇒ 扫描集为空），故此为**治理完整性**问题，无 CI 阻断风险。
8. **【环境级 · 非本卡】Gatekeeper 今日 tripwire 阻断本地提交**（`results/env-blockers-raw.txt`）：
   ```
   $ grep -n "detected-bypass" .claude/bypass.log | grep "2026-09-25"
   1758:2026-09-25T00:56:43Z detected-bypass head-mismatch marker=ce5b13b96c9b0b5b40ff065da7f1361bd6996a72 parent=2b38d1779aa31caf553ef481eb6f2e5479a3199c

   $ git show HEAD:.claude/bypass.log | grep -c "2026-09-25.*detected-bypass"
   1                     # 该记录已在基线 origin/main 内
   $ git status --short .claude/bypass.log
   （空）                 # 本地未改动 ⇒ 非本卡产生
   ```
   `pre-commit-check.sh:238-253` 对「今日任意 detected-bypass」硬 `exit 1`，早于全部 13 组 ⇒ **本机任何基于当前 main 的工作树今日都无法本地提交**。marker 提交 `ce5b13b9` 作者 `synova-cto`（2026-09-24 20:02，**不在 main 祖先链**）。
   **处置（经队长/CTO 授权，见 §6.1）**：**仅对本条记录**使用一次 `SYNO_GATEKEEPER_ACK=1` 完成本次提交。**未自行 ACK**，未用 `--no-verify`。
9. **【环境级 · 非本卡】`/tmp/.synova-before-brief` 陈旧残留 —— 队长裁定「原地保留，不删」**：文件时间 **2026-09-24 16:31**，内容指向 **D941** 会话与 `/Users/wane/.claude/projects/.../dsh-electron-source-desktop.md` —— **非本卡产生**。`pre-commit-check.sh:908-916` 只判**该文件是否存在**（不看归属），故 `SYNO_CI=1` 本地复跑必红。**为何不删（队长裁定原文口径）**：它是**别的会话（D941）的违规证据**，删掉等于**替别人抹证据**；且它只影响 `SYNO_CI=1` 本地复跑、**不影响真提交**（本地软模式下仅告警）、**CI 无此文件**。⇒ **原地保留，登记为未清项**。

10. **【流程级 · 建议立卡】`pre-commit-check.sh` 的 `STAGED_SRC` 空洞跳过**：`GITHUB_ACTIONS=true SYNO_DIFF_BASE=<base>` 在**分支尚无提交**（`HEAD == base`）时，`git diff <base>...HEAD` 为空 ⇒ `STAGED_SRC` 为空 ⇒ 组 6（Task Brief 6 核心字段）**整块静默跳过并打印 ✅**。该形态与 CI 同名不同义（CI 是已提交的 PR diff，非空），**本地预跑会得到空洞绿**——本卡首版证据即被此坑误导，由 `synova-commit --check` 揭穿（§4.2 已自证伪并修正）。建议：`STAGED_SRC` 为空且存在暂存变更时**显式 degraded**，而非静默跳过整组。
11. **【流程级 · 建议立卡】`架构层` 字段 `< 3` 字符即判「未填写」**：`## 架构层: L3`（合法值，2 字符）被硬阻断（`pre-commit-check.sh:877-883`）；`CLAUDE.md` V4.2.7 变更日志声称已修，**实测仍误判**。建议改为**白名单/正则**判定（如 `^L[1-5]` 视为已填），而非长度阈值。

### 6.1 Gatekeeper ACK 使用登记（授权 + 理由 + 记录 id/作者）
| 项 | 值 |
|---|---|
| 是否使用 ACK | **是**（`SYNO_GATEKEEPER_ACK=1`，仅本次提交） |
| 授权链 | CTO 回执：「我确认是我本人的记录且已复核，你带 ACK 重跑本次提交」→ 队长 2026-09-25 授权 |
| 授权范围 | **单次、限今日、限这一条记录**；若出现**新的** bypass 记录 → 停报队长，不续用 |
| 被豁免的记录 | `.claude/bypass.log:1758` — `2026-09-25T00:56:43Z detected-bypass head-mismatch marker=ce5b13b96c9b0b5b40ff065da7f1361bd6996a72 parent=2b38d1779aa31caf553ef481eb6f2e5479a3199c` |
| 记录作者 | `synova-cto <cto@synova.local>`（marker 提交 `ce5b13b9`，2026-09-24 20:02:15 +0800，分支 `fix/d937-gate-failopen`，**不在 main 祖先链**） |
| 理由 | 该记录**已在基线 `origin/main` 内**（`git show HEAD:.claude/bypass.log` 含 1 条）且**非本卡产生**（`.claude/bypass.log` 本地零改动）；它早于全部 13 组硬 `exit 1`，阻断**本机所有**基于当前 main 的提交；本卡 13 组硬检查实测全通过 |
| 审计留痕 | `pre-commit-check.sh:245-250` 的 ACK 分支写 `.codex/control-tower/logs/degraded-events.log`（`component=gatekeeper`） |
| 提交前 `grep -c "2026-09-25.*detected-bypass"` | **1** |
| 提交后 `grep -c "2026-09-25.*detected-bypass"` | **1**（不变，与"该记录非本卡产生、本次未新增绕过"一致） |
| 未使用的绕过手段 | **未**用 `--no-verify`；**未**用 `git stash`；**未** force push |


---

## 7. 复现步骤

```bash
# 0) 工作树（专用，不复用他人）
git worktree add .synova-wt-D965 -b fix/D965-sentinel-stub-cut origin/main
cd .synova-wt-D965 && ln -sfn /Users/wane/SynovaAgent/node_modules node_modules

# 1) 零数据图快照（只读源 + 写 /tmp 副本）
sqlite3 "file:/Users/wane/SynovaAgent/data/synova.db?mode=ro" ".backup /tmp/D965/db-zero.db"
mkdir -p /tmp/D965 && ln -sfn /Users/wane/SynovaAgent/node_modules /tmp/D965/node_modules

# 2) 探针（裁撤前/后各一次；断言与探针分离）
EV=docs/synova/product-lines/evidence/D965-sentinel-stub-cut
tsx $EV/probes/probe-D965-sentinels.mts --db=/tmp/D965/db-zero.db --label=BASELINE45 --cwd=$PWD
tsx $EV/probes/probe-D965-sentinels.mts --db=/tmp/D965/db-zero.db --label=D965-FINAL --cwd=$PWD
tsx $EV/probes/assert-D965-stub-cut.mts --probe=/tmp/D965/probe-D965-FINAL.json   # 期望 exit 0

# 3) 改坏即红：把 stub 移回原位 → 同一夹具必须 exit 1（在一次性 scratch 树内做，勿污染交付树）
git mv extensions/sentinels/_extinct/sentinel-forecast-accuracy extensions/sentinels/sentinel-forecast-accuracy
git mv extensions/sentinels/_extinct/sentinel-pricing-strategy extensions/sentinels/sentinel-pricing-strategy
tsx $EV/probes/probe-D965-sentinels.mts --db=/tmp/D965/db-zero.db --label=RED-RESTORED --cwd=$PWD
tsx $EV/probes/assert-D965-stub-cut.mts --probe=/tmp/D965/probe-RED-RESTORED.json # 期望 exit 1

# 4) 绿侧
vitest run tests/sentinels/shared/d62-me-sentinels.test.ts tests/sentinel/path-dependency-sentinel.test.ts \
           tests/sentinel/d752-type-net-gate.integration.test.ts tests/sentinel/finding-id-stability.test.ts
bash tests/control-tower/check-sentinel-type-net.test.sh
npx tsc --noEmit --pretty false 2>&1 \
  | grep -v "_extinct/\|ima.ts\|server.ts\|sentinel-service.ts\|industry-loader.ts\|tool-registration.ts\|llm-provider-loader.ts" \
  | grep -E "error TS"   # 期望空
```

---

## 8. 证据清单（全部随件入库）

| 路径 | 内容 |
|---|---|
| `probes/probe-D965-sentinels.mts` | coder-a **自研**探针（loader 口径对齐；插桩 store 调用；硬守卫拒写生产库） |
| `probes/assert-D965-stub-cut.mts` | 判别性夹具（金丝雀 + 禁用项 + 无误伤；exit 0/1/2） |
| `results/probe-BASELINE45.json` / `probe-D965-FINAL.json` | 两态机器读全量（逐哨兵 entryExists/rawArray/unpackLen/threw/storeCounts/ids/evidenceLens） |
| `results/probe-BASELINE45-summary.txt` / `probe-D965-FINAL-summary.txt` | 人读 SUMMARY + FINDINGS-BY-SENTINEL |
| `results/assert-on-BASELINE45.txt` | 夹具在裁撤前 → **RED(5)**（判别力证明） |
| `results/assert-D965-FINAL.txt` | 夹具在裁撤后 → **GREEN(0)**，exit 0 |
| `results/assert-RED-RESTORED.txt` | **还原裁撤 → RED(5)，exit 1** |
| `results/findings-diff-before-after.txt` | 逐元素 diff：A-B=4 条编造 finding，B-A=∅，COLLATERAL_DAMAGE=False |
| `results/tsc-BASELINE.txt` / `tsc-AFTER-CUT.txt` / `tsc-AFTER-FIX.txt` | tsc 原始输出（28 / 30 / 30 条） |
| `results/ci-tsc-filter.txt` | CI 同款过滤链 → 空（基线/裁撤后均绿） |
| `results/vitest-targeted-AFTER-FIX.txt` | 定向 vitest 原始输出（34 passed） |
| `results/gate-sh-test-after-fix.txt` | 门禁 shell 测试原始输出（9 ✅ / 0 ❌） |
| `results/extinct-registration-ls.txt` | 登记 + 原目录零残留 + 活跃目录数 43 |
| `results/git-diff-stat.txt` | `git diff --stat -M HEAD` + `--summary`（R100 ×4） |
| `results/self-check-raw.txt` | 自检 5 问的原始输出（path-dependency 0 改动 / 三禁断言 0 / `_extinct` 消费者仅 2 处） |
| `results/probe-RED-RESTORED.json` | 「还原裁撤」态机器读全量（红侧输入） |
| `results/precommit-local-mode.txt` | 本地 13 组门禁原始输出（✅ 全部 13 组通过，EXIT=0） |
| `results/precommit-authoritative.txt` | **权威口径**（`STAGED_ALL`=暂存集，Gatekeeper ACK 放行）：✅ 全部 13 组通过 |
| `results/precommit-nonvacuous.txt` | `GITHUB_ACTIONS=true`（不带 `SYNO_DIFF_BASE`）：非空洞，组 6 真实判定 → ✅ 全通过 |
| `results/precommit-vacuous.txt` | **空洞绿对照**：`GITHUB_ACTIONS=true SYNO_DIFF_BASE=origin/main` 在提交前 ⇒ 组 6 被整块跳过（§4.2 自证伪） |
| `results/precommit-ci-strict.txt` | `SYNO_CI=1` 本地复跑原始输出（因 §6-9 / §6-7 两条**与提交内容无关**项转硬而 exit 1） |
| `results/env-blockers-raw.txt` | 环境级阻断取证（Gatekeeper tripwire 属基线 main + `/tmp/.synova-before-brief` 属 D941 会话） |
| `docs/authority/DOCS-REGISTRY.yaml`（写集第 6 件） | D2 登记门禁补登记 `DOC-0035`（本件）+ `DOC-0036`（复核员主证据） |
