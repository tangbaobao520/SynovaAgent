---
title: "L3本体层+哨兵体系双轨并行审计 — 代码真相报告"
version: "v1.0"
date: "2026-07-06"
status: "审计完成 — 逐文件读取"
methodology: "逐JSON/逐TS文件读取 + grep全仓库引用 + 启动链追踪"
---

# L3本体层+哨兵体系双轨并行审计

## 执行摘要

**Synova的L3层存在三套并行且互不兼容的本体论+两套哨兵注册系统。这不是"参数没对齐"，而是同一层里跑着两套完整但互不知情的代码体系。**

| 系统 | 边类型 | 节点类型 | 运行文件数 | 注册方式 |
|------|--------|---------|-----------|---------|
| **旧SOG系统** (`@synova/sog-core`) | 14条 (INTERACTS_WITH/AFFECTS/CONSUMES等) | 17个 (Person/Team/Client/Process等) | **108个import** | `builtins.ts` 扫描adapters/ (5个文件) |
| **新本体系统** (`extensions/ontology/`) | 16条 (PRODUCES/FUNDS/SIGNAL_TRANSMITS等) | 29个子类型 | **2个import** | `sentinel-loader.ts` 扫描extensions/sentinels/ (62个目录) |
| **v2.4规范** (设计文档) | 16条+4调节因子 | 10实体 | 0个import | 不存在于代码中 |

**启动时两套系统都在运行，但新系统的62个哨兵manifest的`id`字段全部为空，旧系统的5个适配器是唯一在起作用的。**

---

## 发现1: 两套本体边——只有一个交集

旧SOG的14条边和新本体的16条边，只有**一条**名字相同：`DEPENDS_ON`。其余29条边各自独立。

| 旧SOG (108个文件在用) | 新本体 (2个文件在用) | JTBD Phase 3假设 | v2.4规范 |
|----------------------|-------------------|-----------------|---------|
| INTERACTS_WITH | AUGMENTS | — | — |
| BELONGS_TO | CONSTRAINS | — | — |
| OWNS | DECISION_CONCENTRATES | — | DECISION_CONCENTRATES |
| TRIGGERS | — | — | — |
| **AFFECTS** | — | **AFFECTS** | — |
| **DEPENDS_ON** | **DEPENDS_ON** | **DEPENDS_ON** | **DEPENDS_ON** |
| CORRESPONDS_TO | DEPENDS_ON_PLATFORM | — | DEPENDS_ON_PLATFORM |
| **CONSUMES** | — | **CONSUMES** | — |
| ALIGNS_WITH | — | — | — |
| PROVIDES | — | — | — |
| HAS_ACCESS_TO | — | — | — |
| REVENUE_FROM | — | — (FLOWS_TO类似) | — |
| COST_DRIVEN_BY | — | — | — |
| VALUE_PROPOSITION | — | — | — |
| — | DEPLOYS | — | — |
| — | EXTERNAL_ASSUMPTION_BINDS | — | EXTERNAL_ASSUMPTION_BINDS |
| — | FUNDS | FLOWS_TO (近似) | — |
| — | INCENTIVE_BINDS | INCENTIVE_BINDS | INCENTIVE_BINDS |
| — | INFORMS | — | — |
| — | LOCKS_IN | ASSET_LOCKS (近似) | LOCKS_IN / ASSET_LOCKS |
| — | METRIC_BINDS | METRIC_BINDS | METRIC_BINDS |
| — | **PRODUCES** | **PRODUCES** | — |
| — | REPLENISHES | — | — |
| — | SIGNAL_TRANSMITS | SIGNAL_TRANSMITS | SIGNAL_TRANSMITS |
| — | SUBSTITUTES | COMPETES_WITH (不匹配) | — |
| — | — | COUPLES | COUPLES |
| — | — | CUMULATIVE_LEARNING | CUMULATIVE_LEARNING |
| — | — | COGNITIVE_FRICTION | COGNITIVE_FRICTION |
| — | — | EXPANSION_BRAKES | EXPANSION_BRAKES |
| — | — | CAPITAL_ALLOCATES | CAPITAL_ALLOCATES |
| — | — | — | OCCUPIES |
| — | — | — | CANNIBALIZES |
| — | — | — | VOLATILITY_ARBITRAGES |

**结论：不存在"一套通用本体"——存在的是三套不同演进路径、互不兼容的本体论设计。**

---

## 发现2: 哨兵ID体系完全断裂

### 2.1 边JSON里的`consumed_by_sentinels`引用了一个不存在的ID空间

16条边JSON文件声明自己被哪些哨兵消费，使用的ID格式是：`I3`, `S1`, `O10`, `E1`, `F3`, `F4` 等。但62个哨兵目录的名字全部是：`capital-efficiency`, `customer-demand-shift`, `unit-economics` 等英文全名。

**边JSON引用的32个哨兵ID，在`extensions/sentinels/`下一个都不存在。**

反过来，**62个哨兵目录，没有任何一条边的`consumed_by_sentinels`声明过它们。**

### 2.2 哨兵manifest的id字段全部为空

62个哨兵的`manifest.json`中，`id`字段无一例外都是空字符串或不存在。注册时，`sentinel-loader.ts`用`sentinel-${manifest.name}`自动生成id。

### 2.3 两套注册系统同时运行，但旧系统只有5个哨兵

启动链：
1. `synova-agent.ts` → `registerBuiltinSentinels()` → 扫描 `src/sentinel/adapters/` → **注册5个旧哨兵** (cash-flow, cpc, goal-alignment, integration-health + helpers)
2. `file-driven-loaders.ts` → `registerLoadedSentinels()` → 扫描 `extensions/sentinels/` → **注册62个新哨兵** (但id为空，manifest不完整)

结果：同一个全局`SentinelRegistry`里混着5个旧系统的哨兵（有实际功能的）和62个新系统的哨兵（ID自动生成，compute函数通过动态import接上了但大部分可能data为空）。

---

## 发现3: 108个文件在用旧SOG枚举，2个文件在用新本体JSON

旧系统（`@synova/sog-core`）的使用方覆盖了整个核心管线：
- `graph-store.ts` — 图存储核心
- `graph-bridge.ts` — 诊断→本体桥接
- `entity-resolver.ts` — 实体解析
- `entity-registry.ts` — 实体注册
- `graph-query.ts` — 图查询
- `graph-monitor.ts` — 图监控
- `hona.ts` — 组织网络分析
- `financial-impact.ts` — 财务影响
- `key-person-risk.ts` — 关键人物风险
- 所有5个专家工具 (strategy/org/finance/tech/marketing)
- 所有连接器 (feishu/nemoclaw)

新系统（`ontology-loader.ts`）仅被 `sentinel-loader.ts` 和 `file-driven-loaders.ts` 两个文件调用，而且在 `file-driven-loaders.ts` 中的接线验证调用（第98行）使用了旧SOG的边名 `INTERACTS_WITH`，**该调用必然失败**。

---

## 发现4: manifest.json里的数字和实际数量不一致

`extensions/ontology/manifest.json` 声称：
- `"nodeTypes": 17`
- `"edgeTypes": 14`
- `"note": "sog-core-schema.ts enum is deprecated reference."`

实际情况：
- nodeTypes: 8个activity + 13个resource + 8个outcome = **29个子类型**
- edgeTypes: **16个JSON文件**
- sog-core-schema.ts: **108个文件在import，根本不是deprecated**

---

## 发现5: 哨兵的compute函数名和文件里的函数名不匹配

| 哨兵 manifest.computes | 文件里的实际函数名 |
|----------------------|-----------------|
| `roic-wacc-spread` | `computeRoicWaccSpread` |
| `capital-turnover` | `computeCapitalTurnover` |
| `debt-equity-ratio` | `computeDebtEquityRatio` |
| `interest-coverage` | `computeInterestCoverage` |
| `customer-concentration` | `computeCustomerConcentration` |
| `customer-churn-risk` | `computeCustomerChurnRisk` |
| `hhi-index` | `computeHhiIndex` |
| `competitive-intensity` | `computeCompetitiveIntensity` |
| `ltv-cac-ratio` | `computeLtvCac` |
| `gross-margin-per-unit` | `computeUnitMargin` |

manifest用kebab-case文件名，代码里用camelCase函数名。**没有任何代码做这个映射转换**——`sentinel-loader.ts`里直接 `import(pathToFileURL(entryPath))`然后取`exportKey`，所以如果exportKey写对了就能接上，写错了就接不上。但exportKey大部分是对的（如`capitalEfficiencySentinel`），问题在于manifest的`computes`字段纯粹是文档用途——它不被任何代码消费。

---

## 发现6: erp-standard.json里的字段名和实际money.json里的不一致

`field-mappings/erp-standard.json` 声明把外部ERP字段映射到：
- `revenue`, `operatingCashFlow`, `netPpe`, `totalDebt`, `equity`, `cash`, `grossMargin`, `operatingExpense`, `totalAssets`, `currentAssets`, `currentLiabilities`, `receivables`, `inventory`

但 `resource/money.json` 实际的optionalProps是：
- `cash_balance`, `total_revenue`, `operating_cashflow`, `free_cashflow`, `total_debt`, `total_equity`, `fixed_cost`, `variable_cost`, `monthly_burn`, `interest_expense`, `long_term_debt`, `short_term_debt`, `recurring_revenue`, `retained_earnings`, `production_cost`, `rd_cost`, `sales_cost`, `admin_cost`, `total_cost`, `currency`, `period`

**字段名全部不匹配**——ERP映射使用的是驼峰式 (`operatingCashFlow`)，money.json使用的是蛇形 (`operating_cashflow`)。

---

## 问题严重性排序

| 优先级 | 问题 | 影响 | 修复难度 |
|--------|------|------|---------|
| **P0** | 108个文件在用旧SOG，2个文件在用新本体——双轨并行，旧系统是实际运行的那个 | 新本体JSON Schema文件形同虚设，两边数据不互通 | 高 — 需要统一到一套本体 |
| **P0** | 边JSON的`consumed_by_sentinels`引用的32个ID（I3/S1/O10等）不存在 | 边→哨兵依赖链完全断裂，任何基于`consumed_by_sentinels`的查询都返回空 | 中 — 改边JSON或建立ID映射表 |
| **P0** | 62个哨兵manifest的`id`字段全部为空 | 哨兵身份不稳定，ID靠代码自动生成，无法可靠引用 | 低 — 填充manifest的id字段 |
| **P1** | erp-standard.json字段名与money.json不一致 | ERP数据映射失败 | 中 — 统一命名约定 |
| **P1** | manifest.computes命名(kebab-case)与函数名(camelCase)不一致 | 虽然不影响运行（computes字段未被消费），但文档会误导开发者 | 低 — 统一命名约定 |
| **P1** | ontology-loader验证调用使用了已废弃的旧边名 `INTERACTS_WITH` | 验证调用静默失败（被catch吞了），掩盖了本体不兼容问题 | 低 — 修复file-driven-loaders.ts:98 |
| **P2** | manifest.json的数字(17 nodeTypes/14 edgeTypes)与实际(29/16)不一致 | 文档数字不准确 | 低 |

---

## 根因分析

这不是某个人犯的错——这是**三次独立的本体层重构，每次只完成了一部分**：

1. **第一次**（最早）：`sog-core-schema.ts` — 14条边, 17个节点, TypeScript枚举。这是108个文件的底座。**已经写到代码里跑起来了。**

2. **第二次**（V3.8）：`extensions/ontology/` — 试图把本体从TypeScript枚举改为JSON文件驱动，创建了新的16条边、29个子类型。加载器写好了（`ontology-loader.ts`、`sentinel-loader.ts`），但**几乎没有人把108个旧文件的import改过来**。旧代码继续import `@synova/sog-core`，新JSON文件只在2个loader里被读取。

3. **第三次**（V4.x）：v2.4规范文档 — 16条因果边+10实体+4调节因子+完整数学模型。这是**理论设计文档**，不是代码。它和第二次的JSON Schema有重叠但不完全一致（比如v2.4的COUPLES/CUMULATIVE_LEARNING等增长动力边在JSON中不存在）。

**每次重构时，前一次的代码都没有被迁移。结果就是三层本体论同时存在——最底层的旧代码（108个文件）是唯一在生产的。**

---

## 修正路线图

### 第一步：停止新伤（立即）
- 修复 `file-driven-loaders.ts:98` 的 `validateEdgeEndpoints('INTERACTS_WITH', ...)` 调用——要么删掉，要么改用新本体的边名
- 给62个哨兵manifest填充`id`字段

### 第二步：统一本体（本周）
- **决策：保留哪套本体？**
  - 方案A：以新本体JSON Schema为权威，逐步迁移108个旧文件 → 风险高但干净
  - 方案B：以旧SOG为底座，将新本体中缺失的边（SIGNAL_TRANSMITS/METRIC_BINDS/INCENTIVE_BINDS/DECISION_CONCENTRATES等）追加到SOG枚举 → 风险低但SOG枚举不是为"诊断本体"设计的
  - **推荐方案C**：建立旧SOG→新本体的双向映射适配层。108个文件不改import，但在graph-store层做边名翻译。新compute函数和哨兵消费新本体JSON。两边在适配层统一。

### 第三步：边名对齐（本周）
- 建立四套命名体系(JTBD/v2.4/SOG/新本体)的统一对照表
- 更新16条边JSON的`consumed_by_sentinels`字段为真实的哨兵目录名
- 统一erp-standard.json和money.json的字段命名约定(全部改为snake_case)

### 第四步：JTBD增量落地（下周）
- 在适配层搭建完成后，按照之前对齐研究的P0计划扩展边参数
- 实施3个EXTEND compute函数(L1-04/L2-01/L2-07)
- 启动Shapley归因引擎设计

---

*审计完成 · v1.0 · 2026-07-06*
*执行人: Codex Agent · 审计范围: extensions/ontology/ (47 JSON) + extensions/sentinels/ (62目录) + src/sentinel/ (10 TS) + src/l4/ (21 TS) + packages/sog-core/ + packages/engine-core/*
