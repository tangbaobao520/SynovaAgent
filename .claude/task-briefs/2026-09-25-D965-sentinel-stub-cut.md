# Task Brief — D965 裁撤 2 个硬编码桩哨兵（+ 登记 `_extinct/`）

#CRITERIA: A

## 写集

> D749 机器块 = 写集**单一事实源**（pre-commit Q2 / D540 verify-parallel / D708 三处同源消费）。
> 本卡经 CTO 批准 **A 方案**扩写集（原写集未覆盖裁撤的连带断裂，见 Q2）。

| 文件 | task/builtin（理由） |
| --- | --- |
| `extensions/sentinels/sentinel-forecast-accuracy/aggregate.ts` | task（git mv source） |
| `extensions/sentinels/sentinel-forecast-accuracy/manifest.json` | task（git mv source） |
| `extensions/sentinels/sentinel-pricing-strategy/aggregate.ts` | task（git mv source） |
| `extensions/sentinels/sentinel-pricing-strategy/manifest.json` | task（git mv source） |
| `extensions/sentinels/_extinct/sentinel-forecast-accuracy/aggregate.ts` | task（登记目标） |
| `extensions/sentinels/_extinct/sentinel-forecast-accuracy/manifest.json` | task（登记目标） |
| `extensions/sentinels/_extinct/sentinel-pricing-strategy/aggregate.ts` | task（登记目标） |
| `extensions/sentinels/_extinct/sentinel-pricing-strategy/manifest.json` | task（登记目标） |
| `src/sentinel/types.ts` | task（连带：2 条 import type 重指 `_extinct/`） |
| `tests/sentinels/shared/d62-me-sentinels.test.ts` | task（连带：import 随迁 + 标注归档） |
| `tests/sentinel/path-dependency-sentinel.test.ts` | task（连带：硬编码 45 → 动态取数） |
| `tests/sentinel/d752-type-net-gate.integration.test.ts` | task（连带：硬编码 45 → 动态取数） |
| `tests/control-tower/check-sentinel-type-net.test.sh` | task（连带：硬编码 45 → 动态取数） |
| `.claude/task-briefs/2026-09-25-D965-sentinel-stub-cut.md` | task（本 brief） |
| `task-state/D965.json` | task（卡 + write_set 同步） |
| `docs/synova/product-lines/evidence/D965-sentinel-stub-cut-evidence.md` | task（主证据） |
| `docs/synova/product-lines/evidence/D965-sentinel-stub-cut/**` | task（探针 + 原始输出 results/） |
| `.claude/bypass.log` | builtin（post-commit hook 运行期追加证据账本） |

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

L3 洞察层 · 哨兵体系（文件驱动扩展点 `extensions/sentinels/**` ↔ `src/sentinel/sentinel-loader.ts`）。
本卡**不新增能力**，只做**质量收口**：把 2 个"看上去在工作、实际每次产出编造 finding"的哨兵**裁撤 + 登记**，并把由此产生的 5 处写集外断裂按 CTO 批准的 A 方案一并修绿。

### b) 文件审计（实测，非记忆）

- **真坏件（2 个硬编码桩）**：
  - `extensions/sentinels/sentinel-forecast-accuracy/aggregate.ts:18` — `check(context:{db,now,registry?})` **收错第 1 参**（loader 传的是 `store`）；`:22` `const input: ForecastAccuracyInput = { mape: 0.25, sampleCount: 12, monthsOfHistory: 3 }` **字面量**；全程 **0 次 store 调用** ⇒ 每次运行产 3 条 `evidence: []` 的编造 finding。
  - `extensions/sentinels/sentinel-pricing-strategy/aggregate.ts:19` 同病；`:24-26` 字面量 `{hasUniformPricing:true, profitGainFromDiscrimination:0.2, price:100, marginalCost:80}` ⇒ 产 1 条 `pricing-disc`。
  - 运行时实证：`probe-D965-sentinels.mts` → `store_zero_call=["sentinel-forecast-accuracy","sentinel-pricing-strategy"]`，`total_findings=18`（其中 4 条来自这 2 桩）。
- **登记惯例**：`extensions/sentinels/_extinct/` 现存 **12** 个目录，制式为 `{manifest.json, aggregate.ts, computes/**}`，**无**单独登记册文件。loader `sentinel-loader.ts:80` `if (entry.name.startsWith('_')) continue;` ⇒ 归档即脱离加载。
- **连带断裂（写集外，冲突扫描实测）**：`git grep "sentinel-forecast-accuracy\|sentinel-pricing-strategy"` ⇒ 活引用仅 2 处（`src/sentinel/types.ts:297-298` + `tests/sentinels/shared/d62-me-sentinels.test.ts:93-104`）；另有 2 处**硬编码计数 45**（`tests/sentinel/path-dependency-sentinel.test.ts:82`、`tests/sentinel/d752-type-net-gate.integration.test.ts:60`、`tests/control-tower/check-sentinel-type-net.test.sh:37`）。
- **不坏（已实测排除，不改）**：`path-dependency` 的 `manifest.entryPoint=./computes/detect.ts` 存在、`exportKey=pathDependencySentinel`、`check()` 返回 `SentinelFinding[]`（loader 尊重 entryPoint，`sentinel-loader.ts:193`）⇒ 派单件所称"缺 aggregate"是**探针口径问题**（CTO 探针硬编码了 `aggregate.ts`）。`customer-demand-shift` 的对象形态只出现在设计内降级路径（`sentinel-loader.ts:288-290` 明确支持）。

### c) 决策

已有覆盖 → **不新建**哨兵（院方禁令 3）；不"补 compute 救活"（派单禁令）。裁撤 + 登记，连带 5 处按 A 方案修绿。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- **第一性原理**：哨兵的**唯一**存在理由是"回答关于这家企业的事实"。一个**不读数据**、只把常量转成告警的组件不是哨兵而是**噪声源**——它让 finding 流的信噪比无法被信任（空库 18 条里 4 条是编造的）。裁撤 > 补丁：把一个必须重写的桩留在加载路径上，等于每次运行都在污染诊断输入。
- **Anthropic 工程基线**：判据必须**可判别**（夹具改坏即红）+ 降级不得冒充通过（`assert` 缺输入 → exit 2，不判绿）+ 计数不写死（铁律 35 自动化优先：能自动化的不靠人记数）。
- **memory 历史教训**：
  - **铁律 37（dead code 入仓库即违规）** 与本卡张力：`_extinct/` 是**登记在案的归档**（loader + D752 门禁双重显式豁免），不是偷偷留下的死代码。
  - **铁律 47（"拆完了"必须物理证明）** → 本卡**不作**"整治已毕"式声称，只给 `git mv` + `R100` + 计数三源一致的物理输出。铁律 47 要求的物理证明照附：`grep -rn "packages/engine-core" src/ --include="*.ts" --include="*.tsx" | grep -v "\.test\."` → **0 命中**（本卡不涉 engine-core）。
  - **D752**（软约束 0% 有效）：`types.ts` 静态登记曾是软约束，8/45 长期未登记无人发现 ⇒ 本卡沿用**硬门禁同源口径**（`_` 前缀显式豁免），不引入新的软约束。
  - **D515/D516**（本地软提示 + CI 权威）：本卡以 **CI 同款过滤链**实测（`grep -v "_extinct/\|ima.ts\|server.ts\|…"`），不靠本地观感。
  - **批十四教训**（4 张卡前提全错）：本卡开工前逐条实测前提（§Q0-b + 证据 §1），并**拦下**了"原写集不含连带断裂"这一前提错误（报队长 → CTO 批 A 方案）。
- **决策参考系**：参考 Anthropic/第一性原理 + 结论 = 「不读数据的哨兵必须裁撤而非救活；连带断裂必须同卡修绿，且计数改动态取数而非换一个写死值」。

## Q2: 范围 — 正确的最简方案

做什么（逐条精确路径见 `## 写集` 机器块）：
- `extensions/sentinels/{sentinel-forecast-accuracy,sentinel-pricing-strategy}/**` → `git mv` 至 `extensions/sentinels/_extinct/`（4 个 `R100` 纯改名，0 行改动）
- `src/sentinel/types.ts:297-298` — 2 条 `import type` 重指 `_extinct/`（与同文件既有 12 条同制）
- `tests/sentinels/shared/d62-me-sentinels.test.ts:93-104` — import 随迁 + 显式标注「已归档」
- `tests/sentinel/path-dependency-sentinel.test.ts:82` — `toBe(45)` → `toBe(loadSentinels().sentinels.length)`（+ `>0` 防空载假绿）
- `tests/sentinel/d752-type-net-gate.integration.test.ts:57-60` — 解析门禁输出数字 × 独立按目录口径重算，断言相等
- `tests/control-tower/check-sentinel-type-net.test.sh:37` — 期望计数按 loader 同口径实时计算（**注**：原含 `docs/authority/DOCS-REGISTRY.yaml` 登记 2 条，已按队长裁定**拆出为独立登记支**——D965 需回到 D734 的 12 文件预算内；本卡对该文件净零改动）
- `.claude/task-briefs/2026-09-25-D965-sentinel-stub-cut.md` — 本 brief
- `task-state/D965.json` — 卡 + `write_set` 同步
- `docs/synova/product-lines/evidence/D965-sentinel-stub-cut-evidence.md` + `docs/synova/product-lines/evidence/D965-sentinel-stub-cut/**` — 主证据 + 自研探针/夹具 + 全部原始输出

不做什么（含文件路径）：
- 不修改 `extensions/sentinels/path-dependency/**`（其 `detect.ts` 无损；Done#4 要求 0 改动）
- 不新增任何哨兵目录（院方禁令 3）；不以"补 compute"救活这 2 桩
- 不修改 `scripts/audit/**`、`docs/synova/audit-reports/**`（K3 审计域，红线）
- 不修改 `.github/workflows/ci.yml`（红区不可改；CI 侧接线已由既有测试 `d752-type-net-gate.integration.test.ts` 承担）
- 不修改 `scripts/pre-commit-check.sh`、`scripts/control-tower/**`
- 不修改 `docs/synova/product-lines/evidence/D965-D968-独立复核-20260925/**`（复核员已落 main 的**密封**证据，属裁撤前历史态，改动=篡改）
- 不修复 `_extinct/` 内 12 个既有归档死代码的相对 import 深度（CI 白名单已豁免；属独立卡）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`Sentinel.check()` 由 loader 经 `extensions/sentinels/*/manifest.json` 扫描加载（`registerLoadedSentinels()` / `SentinelRegistry`）。
处理：loader 跳 `_` 前缀目录 ⇒ 2 桩不再进加载集；finding 流由**真 store 查询**产出，不再含常量编造项。
结果：空库全量 finding **18 → 14**；编造 id（`forecast-mape`/`forecast-sample`/`forecast-timeseries`/`pricing-disc`）**零残留**；13 个真实哨兵的 finding **逐元素不变**（无误伤）；`threw = 0`（43/43）。

## 架构层: L3 洞察层（src/sentinel/ 哨兵加载与类型网 + extensions/sentinels/ 文件驱动扩展点）

## Done 标准

- [ ] verify: `tsx docs/synova/product-lines/evidence/D965-sentinel-stub-cut/probes/probe-D965-sentinels.mts --db=/tmp/D965/db-zero.db --label=D965-FINAL --cwd=$PWD` → `threw_count=0`、`sentinels_total=43`
- [ ] verify: `tsx docs/synova/product-lines/evidence/D965-sentinel-stub-cut/probes/assert-D965-stub-cut.mts --probe=/tmp/D965/probe-D965-FINAL.json` → `rc=0`（GREEN）
- [ ] verify: 还原裁撤后同一夹具 → `rc=1`（改坏即红，红原始输出入库）
- [ ] verify: `bash tests/control-tower/check-sentinel-type-net.test.sh` → `rc=0`（9 ✅ / 0 ❌）
- [ ] verify: `vitest run tests/sentinels/shared/d62-me-sentinels.test.ts tests/sentinel/path-dependency-sentinel.test.ts tests/sentinel/d752-type-net-gate.integration.test.ts tests/sentinel/finding-id-stability.test.ts` → 34 passed
- [ ] verify: `npx tsc --noEmit --pretty false 2>&1 | grep -v "_extinct/\|ima.ts\|server.ts\|sentinel-service.ts\|industry-loader.ts\|tool-registration.ts\|llm-provider-loader.ts" | grep -E "error TS"` → 空输出（CI 类型门禁绿）
- [ ] verify: `git diff --stat -M HEAD -- extensions/sentinels/path-dependency` → 空输出（哨兵目录 0 改动）
- [ ] verify: `ls extensions/sentinels/sentinel-forecast-accuracy` → `No such file or directory`（原目录零残留）
