<!--
  SYNOVA-IMPL-D358: 合并哨兵去 _extinct 桥接 + props 契约对齐 erp-standard
  状态: dev doc | 2026-08-18 | 优先级 P1
  权威文档: docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md（K3 全链路审计 P1-2）; AGENTS.md 铁律 37/47/48; extensions/ontology/field-mappings/erp-standard.json（props 契约唯一权威）
  依赖: 无（D355 已修 L4 契约 + 查询层 fail-open；D356 已修 loader 挂 manifest + degraded 拦截；本任务在其上做合并哨兵真实化）
  并行: 无（写集在 extensions/sentinels/margin-health + capital-health，与 D356 已完成的 cash-runway/revenue-health 不重叠，但同属哨兵域，串行触碰；若必须并行先 worktree 隔离）
-->

# SYNOVA-IMPL-D358 合并哨兵去 _extinct 桥接 + props 契约对齐 erp-standard

## 1. 权威文档引用

* **K3 全链路审计报告** `docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md` P1-2：「margin-health / capital-health 合并实现 = 动态 import `_extinct/` 退役代码；退役哨兵的 props 契约与上传映射（erp-standard）不匹配——数据契约仍断」。
* **erp-standard.json**（props 契约唯一权威）：targetNodeType=Financial，写 snake_case：`total_revenue` / `operating_cashflow` / `total_debt` / `equity` / `cash` / `gross_margin` / `operating_expense` / `total_assets` / `current_assets` / `current_liabilities` / `receivables` / `inventory` / `period`。
* **AGENTS.md 铁律 37**：dead code 入仓库即违规；**铁律 47**：契约优先；**铁律 48**：测试非空壳。

## 2. 代码审计——现状

### 缺陷 A（P1-2 前半）：合并哨兵动态 import _extinct 退役代码

* `extensions/sentinels/margin-health/aggregate.ts:26-27`：`await import('../_extinct/cost-health/aggregate')` + `await import('../_extinct/profit-health/aggregate')`——margin-health 是空壳桥接，真实逻辑在退役目录。
* `extensions/sentinels/capital-health/aggregate.ts:27-29`：`await import('../_extinct/capital-efficiency/aggregate')` + `capital-structure` + `capital-turnover`——同样空壳桥接。
* 违反铁律 37（dead code 存活 + 依赖退役代码）。

### 缺陷 B（P1-2 后半）：props 契约断裂（camelCase vs snake_case）

* `_extinct/capital-efficiency/aggregate.ts` 归一化读 camelCase：`Number(n.props.revenue) || Number(n.props.totalRevenue)`、`operatingExpenses`、`totalDebt`、`equity`、`taxRate`、`wacc`。
* `_extinct/capital-structure/aggregate.ts` 读 `totalDebt`/`shortTermDebt`/`equity`/`operatingIncome`/`interestExpense`（camelCase）。
* `_extinct/capital-turnover/aggregate.ts` 读 `revenue`/`totalAssets`/`currentAssets`/`accountsReceivable`（camelCase）。
* 但 erp-standard.json 写 snake_case：`total_revenue`/`total_debt`/`total_assets`/`current_assets`/`receivables`/`gross_margin`/`operating_expense`——**归一化读不到真实上传字段，恒 `Number(undefined)||0 = 0` → 假 finding 或恒空**（D356 已用入口校验兜底降级，但真数据仍喂不进）。

### 缺陷 C：margin-health 的 cost/profit 子哨兵同样依赖 camelCase + _extinct 桥接

* `_extinct/cost-health/aggregate.ts` + `_extinct/profit-health/aggregate.ts` 的 compute（`compute-gross-margin` / `compute-profit-margin-change` 等）被 margin-health 动态 import，同样读 camelCase props。

## 3. 实现方案

核心：把 5 个 _extinct 子哨兵的**真实 compute 逻辑迁到合并哨兵自己的 `computes/` 目录**，归一化改读 erp-standard snake_case，删除动态 import。

### 3.1 写集 (7 修改 + 35 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| extensions/sentinels/margin-health/aggregate.ts | 修改 | 壳桥接重写为归一化层，零动态 import，7 指标接入（`import ../_extinct/cost-health`/`profit-health` 删除） |
| extensions/sentinels/capital-health/aggregate.ts | 修改 | 同上，8 指标接入（`_extinct/capital-efficiency`/`structure`/`turnover` 删除） |
| src/sentinel/types.ts | 修改 | import-type 接线链指向新 computes（组 4a 物理证据） |
| tests/sentinel/capital-health-degraded.test.ts | 修改 | D356 fixtures camel→snake + 显式 0 断言升级 |
| .claude/current-brief | 修改 | 认领绑定本任务 brief（08-19 文件名，D366 日期判定） |
| .claude/plan.json | 修改 | 审批锁定 plan（分阶段 create→refactor） |
| .claude/reference-map.md | 修改 | 写前 grep 引用地图（hook-block-write 前置门禁产物） |
| extensions/sentinels/margin-health/computes/compute-gross-margin.ts | 新建 | 迁自 cost-health（算法原样，入参 snake 归一化） |
| extensions/sentinels/margin-health/computes/compute-fixed-variable-ratio.ts | 新建 | 同上 |
| extensions/sentinels/margin-health/computes/compute-cost-per-head.ts | 新建 | 同上 |
| extensions/sentinels/margin-health/computes/compute-incentive-bind.ts | 新建 | 同上（边绑定 compute，store-based 保持） |
| extensions/sentinels/margin-health/computes/compute-profit-margin-change.ts | 新建 | 迁自 profit-health |
| extensions/sentinels/margin-health/computes/compute-margin-vs-benchmark.ts | 新建 | 同上 |
| extensions/sentinels/margin-health/computes/compute-metric-bind-divergence.ts | 新建 | 同上（边绑定 compute，store-based 保持） |
| extensions/sentinels/capital-health/computes/roic-wacc-spread.ts | 新建 | 迁自 capital-efficiency |
| extensions/sentinels/capital-health/computes/wacc.ts | 新建 | 同上 |
| extensions/sentinels/capital-health/computes/capital-turnover.ts | 新建 | 同上 |
| extensions/sentinels/capital-health/computes/debt-equity-ratio.ts | 新建 | 迁自 capital-structure |
| extensions/sentinels/capital-health/computes/interest-coverage.ts | 新建 | 同上 |
| extensions/sentinels/capital-health/computes/debt-structure.ts | 新建 | 同上 |
| extensions/sentinels/capital-health/computes/asset-turnover.ts | 新建 | 迁自 capital-turnover |
| extensions/sentinels/capital-health/computes/receivable-turnover.ts | 新建 | 同上 |
| extensions/sentinels/capital-health/computes/cash-conversion-cycle.ts | 新建 | 同上（旧 aggregate import 却从不调用的死代码，本次接线） |
| tests/sentinel/margin-capital-deextinct.test.ts | 新建 | 集成：静态 grep 无 _extinct + 真实装配 snake 注入 + 显式 0 vs 缺失 |
| tests/sentinels/margin-health/compute-gross-margin.test.ts | 新建 | 配对测试（组 2b 硬门禁） |
| tests/sentinels/margin-health/compute-fixed-variable-ratio.test.ts | 新建 | 同上 |
| tests/sentinels/margin-health/compute-cost-per-head.test.ts | 新建 | 同上 |
| tests/sentinels/margin-health/compute-incentive-bind.test.ts | 新建 | 同上 |
| tests/sentinels/margin-health/compute-profit-margin-change.test.ts | 新建 | 同上 |
| tests/sentinels/margin-health/compute-margin-vs-benchmark.test.ts | 新建 | 同上 |
| tests/sentinels/margin-health/compute-metric-bind-divergence.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/roic-wacc-spread.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/wacc.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/capital-turnover.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/debt-equity-ratio.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/interest-coverage.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/debt-structure.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/asset-turnover.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/receivable-turnover.test.ts | 新建 | 同上 |
| tests/sentinels/capital-health/cash-conversion-cycle.test.ts | 新建 | 同上（CCC 取整语义断言 43/243） |
| docs/plans/codex/implementation/SYNOVA-IMPL-D358-merged-sentinel-de-extinct-20260818.md | 新建 | 主树复制进 worktree + §3.2 回填（G12c 双向核对） |
| .claude/task-briefs/2026-08-19-D358-merged-sentinel-deextinct.md | 新建 | task brief（08-18 生成，提交跨午夜 → D366 文件名日期改 08-19） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（纯产品代码重构，非门禁/工具行为变化）；`extensions/sentinels/margin-health` + `capital-health` 是哨兵同域，与 D354（runner/signal-aggregator）零交集，但与任何动这两个目录的并行任务串行触碰。

### 3.2 最终实现同 commit 回填（2026-08-19 交付）

**方案采纳**：§4.5 决策「独立 `computes/` 目录 + aggregate 归一化」原样执行，无偏离。§3.1 写集低估了测试规模：组 2b 硬门禁要求 16 个 compute 每个配对测试（`tests/sentinels/{哨兵名}/` 复数目录），实际交付比 §3.1 多 16 个配对测试 + 2 个修改测试 + 1 个接线链文件。

**最终文件清单（commit 写集，DS6 已核对）**：见 §3.1 全枚举表（同 commit 回填后 42 条逐文件登记——G12c 双向对账：声明 42 = 实际 42）。§3.1 原始 5 行写集低估了测试规模：组 2b 硬门禁要求 16 个 compute 每个配对测试（`tests/sentinels/{哨兵名}/` 复数目录），实际交付比 §3.1 原始声明多 16 个配对测试 + 2 个修改测试 + 1 个接线链文件。

**props 归一化映射表**（erp-standard 契约 → compute 输入，normalization 唯一入口 = 两个 aggregate）：

| 契约 prop（erp-standard.json） | 归一化后 | 消费 compute |
|------|---------|-------------|
| total_revenue | total_revenue | 全部收入类 compute |
| gross_margin（毛利润**金额**） | gross_margin + COGS=total_revenue−gross_margin | gross-margin / profit-margin-change / roic-wacc-spread / CCC |
| operating_expense（D455 起契约全 snake） | operatingExpenses（内部 typed record 字段名；契约边界=aggregate，见决策 10） | fixed-variable-ratio / profit-margin-change / roic-wacc-spread |
| operating_cashflow | operating_cashflow | interest-coverage |
| total_debt | total_debt | debt-equity / debt-structure / wacc |
| equity | equity | debt-equity / wacc |
| cash（D455 起） | —（本哨兵不消费，cash-runway 域） | — |
| total_assets | total_assets | asset-turnover / capital-turnover |
| current_assets | current_assets | asset-turnover |
| current_liabilities | current_liabilities | wacc（creditSpread 判定） |
| receivables | receivables | receivable-turnover / CCC |
| inventory | inventory | CCC |
| net_ppe | net_ppe | capital-turnover（资本基数） |
| period | period | 时间窗语义 |
| （契约外扩展字段） | fixed_cost / interest_expense / short_term_debt / long_term_debt / accounts_payable / tax_rate / wacc_override | 各指标 optional，缺失 → 该指标 log.warn + 跳过，不发 finding（P1-3 双层降级第二层） |

**决策记录（Q1c，K3 可核）**：

1. **契约冲突**：dev doc §1 与 origin/main 实际文件不符（cash/operating_expense vs cashBalance/operatingExpenses）→ 以 erp-standard.json 实际文件为准（D355 锁定，tests/contract/l4-contract.test.ts 见证），不改契约文件。**交付中途上游 D455 落地**（fix(D455): cashBalance↔cash 对齐 + compute filter bug，统一 financial.json snake_case）——契约正式改为全 snake（`cash` + `operating_expense`），本任务在合并 origin/main（30 commits）后按新契约重新对齐（见决策 10）。
2. **归一化上移**：compute 公式零改动（verbatim 迁移，仅 snake 化入参名），数据获取集中到 aggregate 归一化层。
3. **阈值来源**：11 个 manifest key 走 `this.manifest.thresholds`（loader 注入），4 个无 key 沿用 T7b 硬编码先例（incentive-bind 0.4 / metric-bind 0.5/0.3 / debt-structure 0.7/0.5 内部常量 / CCC 120/90 内部常量）。两个 manifest.json 不改。
4. **CCC 死代码接线**：旧 capital-turnover aggregate import `computeCashConversionCycle` 却从不调用（铁律 37 死代码），本任务在新 aggregate 接线，产出 f5-ccc-crit/f5-ccc-warn finding。
5. **分母 0 → 降级**（堵假 critical）：asset-turnover(total_assets=0)、debt-equity(equity=0)、interest-coverage(interest=0)、gross-margin/profit-margin(total_revenue=0)、fixed-variable-ratio(totalCost=0)、roic-wacc-spread(capital=0) 全部 degrade，删除原 fallback 0/99/rev-1。
6. **假 critical 修复**：margin-vs-benchmark degraded → `gap: 0`（不再产出 gap=−benchmark 假 finding）；profit_margin 层级加 `!degraded` 门控；aggregate 所有 metric 判定前 `!degraded` gate（降级信号传播，铁律 31）。
7. **接线链**：src/sentinel/types.ts import-type 链指向新位置（组 4a 物理证据）；exportKey 保持 `marginHealthSentinel`/`capitalHealthSentinel` + check 签名不变（sentinel-merge-d15a 锁定）。
8. **P1-3 双层降级**：入口 REQUIRED_FIELD_GROUPS（snake）缺失 → mh-degraded/ch-degraded warning finding；扩展字段缺失 → metric 级 log.warn + 跳过。interest-coverage/debt-structure/CCC-DPO 在纯契约数据下不触发（brief Q2 显式声明，非静默吞错）。
9. **CCC 取整语义**：原算法 `Math.round(dio+dso−dpo)`（未取整分量求和后取整）verbatim 保留；测试期望曾误写为逐分量取整（42/244），修正为 43/243（compute 不动，测试修正——K3 可核 _extinct 原件第 70-91 行）。
10. **中途契约迁移（D455，2026-08-19 上游合并）**：D358 在途时 origin/main 前进 30 commits，其中 D455 把 erp-standard 的 `cashBalance`→`cash`、`operatingExpenses`→`operating_expense`（契约全 snake，与本任务决策 1 记录的原契约冲突同源——上游修的是同一缺陷的契约侧）。处理：① `git merge origin/main` 平基（脏树不 rebase，D363 先例；current-brief 冲突用备份+checkout+merge+restore，D333 N13 先例）；② aggregate 契约读取改 `operating_expense`（REQUIRED_FIELD_GROUPS + 归一化层），集成测试 fixtures 同步；③ **内部 typed record 字段名保持 `operatingExpenses`**——契约边界=aggregate 归一化层，compute 是纯函数接收归一化后数据（决策 2 算法冻结承诺，compute 文件零改动）；④ 现金字段本哨兵不消费（cash-runway 域，D455 已修）。K3 核验路径：集成测试 snake 注入 → 真实 finding（DS4）+ aggregate 源码零 camelCase props 读取。

**DS 证据摘要**：

- DS1：`npx vitest run tests/sentinel/margin-capital-deextinct.test.ts tests/sentinel/capital-health-degraded.test.ts tests/sentinels/margin-health tests/sentinels/capital-health` → 18 files / 80 tests 全绿。
- DS2：`grep -rn "import('../_extinct\|from '../_extinct" extensions/sentinels/margin-health extensions/sentinels/capital-health` → 零命中。
- DS3：归一化字段 grep 命中：margin aggregate 10 处 / capital aggregate 46 处。
- DS4：集成测试经 `registerLoadedSentinels()` 真实装配 + snake_case 注入 → 真实 critical/warning finding（loader count=45 errors=0）。
- DS5：合并平基后（origin/main 213a9a2e，含 D455 等 30 commits）全量 `npx vitest run` → 62 failed | 479 passed (541)；62 = 旧基座 b0560a63 的 61 预存失败 + 上游新增 `tests/golden-scenarios/gss-common.test.ts`（D361 自带，非本任务），D358 20 个测试文件全绿，tsc 零新增。旧基座对照证据（b0560a63 临时 worktree 全量运行，已清理）：61 失败集与 D358 完全一致（_extinct 退役哨兵 stale-path 测试、LLM/e2e/feishu 环境依赖测试）；zero-code-industry 的 oven/queryByTags 两断言在基座隔离运行同样失败（ontology-loader 只扫行业 edge-types 不扫 node-types，仓库既有 order-dependent 缺陷）；其 git-diff 子断言对工作区未提交 .ts 计数，提交后自清。tsc baseline-check：存量 27 + 新增 0。
- DS6：`git status --porcelain` 与本节文件清单一致；排除 3 个测试运行副产物（saas-tech/test-write thresholds.json 的 aggregatedAt 时间戳 + tests/output/expert-quality-cross-industry.json——测试写产物，不随 commit）。
- DS7：pre-commit 全组通过，无 --no-verify（见 commit 记录）。
- DS8：推送后 CI 验证。

### 3.3 不做的事

* 不删 `_extinct/` 目录（保留为审计参考，退役由独立 D 处理）。
* 不改 compute 的算法逻辑（只迁位置 + 对齐 props 归一化）。
* 不改 cash-runway / revenue-health（那是 D356 已交付）。
* 不接 new N1-N10 哨兵（那是 D359）。

## 4. 测试要求（测试优先）

第一步写测试（red），第二步实现（green）。red 必须覆盖失败模式（S-5）：

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 单元 | margin-capital-deextinct.test.ts | ≥3 断言 | ① grep 无 `_extinct` 动态 import（修复前有 → red）；② 注入 snake_case Financial 节点 → 产出真实 finding（修复前读 camelCase → 恒 0 → red）；③ 显式 0 与缺失区分（degraded 不假 critical，回归 D356 P1-3 语义） |

* red 基准：修复前 `grep -rn "from '../_extinct\|import('../_extinct" extensions/sentinels/margin-health extensions/sentinels/capital-health` 命中（→ red）；修复后零命中（→ green）。
* red 基准 2：修复前 snake_case 数据注入（`{total_revenue: 100, gross_margin: 0.1, ...}`）→ 恒空/假 finding；修复后 → 真实 critical/warning。
* 测试非空壳：正常（完整 snake_case）/降级（缺字段）/边界（显式 0）三态。

## 4.5 决策参考

* 决策点：compute 迁入方式是「独立 `computes/` 目录」还是「直接内联进 aggregate」？
* 参考系：第一性原理——compute 是纯函数，迁位置不动算法，最少改动 = 保持 compute 独立、只改 aggregate 归一化；Anthropic——契约优先，归一化是唯一 props 入口，集中改一处；收敛——采用「独立 computes/ 目录 + aggregate 归一化」，写集清晰、可 grep 验证。
* 结论：compute 迁入合并哨兵 `computes/`，aggregate 归一化改 snake_case。完成报告必含决策记录（K3 可核）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| margin-health 内联 check | `registerLoadedSentinels()` 目录扫描发现（manifest.json entryPoint） | `grep -n "entryPoint" extensions/sentinels/margin-health/manifest.json` 命中 `./aggregate.ts` |
| capital-health 内联 check | 同上 | `grep -n "entryPoint" extensions/sentinels/capital-health/manifest.json` 命中 `./aggregate.ts` |
| _extinct 动态 import 清零 | margin-health + capital-health aggregate | `grep -rn "import('../_extinct" extensions/sentinels/margin-health extensions/sentinels/capital-health` 零命中 |

* 生产调用点必须（S-3）：margin-health/capital-health 的 check 必须仍被 loader 生产装配路径真实调用（grep 验证），不能因重构丢失注册。

## 6. 完成标准

* DS1 测试绿：`npx vitest run tests/sentinel/margin-capital-deextinct.test.ts` 全绿；red 先行已证（修复前 _extinct import 命中 + camelCase 恒 0 → 修复后 snake_case 产出 finding）。
* DS2 _extinct 桥接清零：`grep -rn "import('../_extinct" extensions/sentinels/margin-health extensions/sentinels/capital-health` 零命中。
* DS3 props 对齐：`grep -n "total_revenue\|gross_margin\|operating_expense\|total_debt\|total_assets\|current_assets\|receivables" extensions/sentinels/margin-health/aggregate.ts extensions/sentinels/capital-health/aggregate.ts` 命中 snake_case 归一化。
* DS4 端到端 finding：注入 snake_case Financial 节点经 loader 装配 → margin-health/capital-health 产出真实 finding（测试断言）。
* DS5 零回归：`bash scripts/control-tower/baseline-check.sh` tsc/测试/审计三基线无新增。
* DS6 范围一致：`git diff --name-only HEAD^` 与 §3.1 写集一致，无越界文件。
* DS7 无绕过：pre-commit 12 组全过，bypass.log 无 `--no-verify`；提交走 synova-commit。
* DS8 推送 + CI：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿（job 级；npm audit/Architecture 预存失败单独标注）。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 全部 grep 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格、格式符合 verify-parallel 契约
* [ ] 测试 red→green 覆盖失败模式（_extinct import / camelCase 恒 0 / 显式 0 误伤）
* [ ] 接线要求 ≥1 生产调用点（loader 装配路径，测试调用不计）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：纯产品代码重构，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| _extinct 动态 import 清零 | grep -rn "import('../_extinct" extensions/sentinels/margin-health extensions/sentinels/capital-health | 零命中 |
| props 归一化对齐 erp-standard | grep -n "total_revenue\|gross_margin\|total_debt\|total_assets" extensions/sentinels/margin-health/aggregate.ts extensions/sentinels/capital-health/aggregate.ts | 命中 snake_case 字段 |
| 测试全绿 | vitest run tests/sentinel/margin-capital-deextinct.test.ts | 全 pass |
| as any = 0 | grep -rn "as any" extensions/sentinels/margin-health extensions/sentinels/capital-health | 0 命中 |

---

> 交付声明 DS 须与本文档 DS1-DS8 一一对应，缺项显式 descope（S-10）；依赖非空禁止并行开 session（S-7）；§3.2 最终实现同 commit 回填（S-6）。
