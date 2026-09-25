# Task Brief: D966 独立复现「空转 / 零调用」并出三类清单

> 生成: 2026-09-25 | 分支: `docs/D966-sentinel-idle-repro` | 工作树: `.synova-wt-D966`
> 基线: `origin/main` = `ce231ff1b1e419095117413badba8c6b55ae39fd`
> 认领: sentinel-coder-b（编码）｜独立复核: sentinel-verifier（task-4，师出异门）
> as any: 0 ｜ 本卡红线: **只出清单与证据，不改任何哨兵、不改 `src/`**

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图

Synova = 组织数字孪生诊断 + 增长导航 Agent。本任务在 **L3 洞察层**（哨兵域 `src/sentinel/**`、
`extensions/sentinels/**`）与 **L4/L5 本体存储**（`src/adapters/sqlite-graph-store.ts`）的**交界处**，
但**不新增任何生产代码** —— 产出为「观测工具 + 事实清单」。

任务性质：**P0 事实核查**。批十四教训（4 张卡前提全错）与本院禁令（禁把线全绿说成产品被验证）
要求"事实先于改动"：先独立复现「哪些哨兵真算 / 空转 / 缺件」，再由后续卡（D967/D968）据此施工。

### b) 文件审计（grep 实测，非记忆）

```
extensions/sentinels/*/manifest.json      — 45 个（哨兵目录 45，+_extinct +shared）
extensions/sentinels/_extinct/            — 12 个已退役（本卡不纳入 45）
src/sentinel/sentinel-loader.ts           — loadSentinels()/registerLoadedSentinels()（entryPoint/exportKey 解析）
src/adapters/sqlite-graph-store.ts        — 唯一引用 graph_triples 的文件（grep 实测）
src/l4/graph-traversal.ts                 — createGraphTraversal()：traverse 起点 = startNodeIds
src/store/migrations/                     — ❌ 只有 001（只覆盖 graph_nodes）⇒ graph_triples 无迁移
tests/sentinel/audit/**                   — ❌ 新建（本卡写集）
```

### c) 决策

- 已有覆盖 → **复用**：`loadSentinels()` / `SqliteGraphStore` / `createGraphTraversal`，
  探针**逐字复刻 loader 调用语义**（不另造一套），避免"探针与生产不同源"。
- 无覆盖 → **新建**：合成图夹具（空库 / 3 边 / 4 边含 DEPLOYS 起点边）+ 三态 schema 断面
  （legacy / props-added / canonical）+ SQL 层插桩。
- 冲突 → **取消**：本卡不碰 D965（`extensions/sentinels/**`）、不碰 D967（`src/**`）。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策参考系
参考：第一性原理 + 实操实证。**结论**：
① 判据必须来自运行时实测（本批坑清单第 7 条：grep 型静态判据实测命中率 3/5 = 60%）；
② 「读数失败」与「无数据」必须可区分（铁律 11/31 静默降级）；
③ 混杂变量必须显式测量（P7：`graph_triples` 结构漂移），否则结论被污染。

### b) memory / 历史教训
- **批十四**：4 张卡前提全错 ⇒ **前提必须开工前自己实测**（本卡已独立重跑队长全部数字）。
- **铁律 0-2**：接线验收需物理证明 ⇒ 本卡用"改坏即红 + 改好即绿"判别性夹具。
- **铁律 24/31**：`queryEdges` 内部 catch 吞错只 `log.warn`、不返 `degraded` ⇒ 本卡将其列为派生发现。

### c) 执行约束
- 重型验证串行：45 哨兵探针 = 重型，已向队长申请令牌（**已批准**），跑完交回。
- 生产库 `data/synova.db` **只读**；一切写操作只在 `/tmp` 夹具，`assertTmpPath()` fail-closed 强制。
- 禁裸 `python3`：PYBIN 动态探测。

## Q2: 范围 — 正确的最简方案

做什么：
- tests/sentinel/audit/probe-harness.ts
- tests/sentinel/audit/run-runtime-probe.ts
- tests/sentinel/audit/run-static-audit.ts
- tests/sentinel/audit/run-p7-control.ts
- tests/sentinel/audit/run-flip-diff.ts
- tests/sentinel/audit/sentinel-audit.test.ts

不做什么（含文件路径）：
- 不改任何哨兵：`extensions/sentinels/**` 一件不动（裁撤归 D965）
- 不改 `src/**` 任何文件（`src/store/measurements.ts` 待建、`src/l4/graph-traversal.ts`、
  `src/adapters/sqlite-graph-store.ts`、`src/sentinel/sentinel-loader.ts` 均只读）
- 不改 `scripts/audit/**`、`docs/synova/audit-reports/**`、`.github/workflows/ci.yml`、
  `scripts/pre-commit-check.sh`、`scripts/control-tower/**`
- 不新增哨兵（院方禁令 3）；不对 `data/synova.db` 做任何写操作

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：
`npx tsx tests/sentinel/audit/run-*.ts`（4 个 runner）与 `npx vitest run tests/sentinel/audit/sentinel-audit.test.ts`

处理（中间步骤）：
① 生产库只读一致性快照 → `/tmp` 夹具；② 按 manifest 的 entryPoint/exportKey 动态 import 45 哨兵；
③ 四参注入（store/teamId/traversal/thresholds）+ store 方法与 SQL 层双重插桩；
④ 三态 schema 断面 × 图夹具三档交叉重跑；⑤ 静态四扫法对照。

结果（最终展示）：
`docs/synova/coordination/哨兵-空转复现-20260925.md`（三类清单 + 双列口径 + 差异归因 + P7 对照）
+ `docs/synova/product-lines/evidence/D966-sentinel-idle-repro-evidence.md`（原始输出逐字）

## 架构层: L3（哨兵域）+ L4/L5 只读观测 —— 本卡不新增生产代码

## Done 标准
1. 静态口径与运行时口径两套数字均跑出并贴原始输出（S1/S2/S3/S4 vs R）
2. 给出差异原因，含「CTO 报零 finding=23 vs 实测 29/30」的可证伪归因
3. 三类清单：真算的 / 空转的（不读数据）/ 缺件的
4. 双列呈现：`Array.isArray(raw)` 原始值 与 loader 解包后 `findings.length`（判定列）
5. P7 当混杂变量显式测量：三态断面 × 三档图夹具「补列前 vs 补列后」对照重跑
6. 结论拆两句：「边读写路径失效」= 缺陷 ／「当前 finding 计数不受影响」= 空库所致
7. `tests/sentinel/audit/**` 夹具含 `expect()` 断言 + 金丝雀 + 改坏即红原始输出
