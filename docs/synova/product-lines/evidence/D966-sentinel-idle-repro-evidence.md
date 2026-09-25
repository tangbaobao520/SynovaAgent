# D966 证据 —— 哨兵「空转 / 零调用」独立复现（原始输出）

> 本文件全部数字均为**命令原始输出逐字粘贴**（禁手写）。组装方式：脚本读取当日实跑日志内联，非人工转录。
> 配套报告：`docs/synova/coordination/哨兵-空转复现-20260925.md`
> 本卡红线：只出清单与证据 —— 未改任何哨兵、未改 `src/`、未改 `extensions/`。
> **断面**：本复现为 **D965 裁撤前（`ce231ff1`）密封态快照**；D965 裁撤 2 桩后加载数 45 → 43，
> 全部夹具分母为动态取数，禁写死。

---

## 1. 基线与环境

```bash
$ git fetch origin && git ls-remote --heads origin main
$ git rev-parse HEAD && git rev-parse --abbrev-ref HEAD
$ ls -d extensions/sentinels/*/ | grep -v -E '/(_extinct|shared)/$' | wc -l
$ ls extensions/sentinels/*/manifest.json | wc -l
```

```text
ef2997466677324b94d7b2921a5b3de0b7ad57d3	refs/heads/main
--- HEAD ---
39b7d818e5b3f51c43da0841c1512c5f955511f0
docs/D966-sentinel-idle-repro
--- 哨兵目录数 ---
      45
--- manifest 数 ---
      45
```

## 2. 生产库只读断面（独立复现，不采信队长/CTO 数字）

```bash
$ sqlite3 "file:/Users/wane/SynovaAgent/data/synova.db?mode=ro" ".schema graph_nodes"
$ sqlite3 "file:/Users/wane/SynovaAgent/data/synova.db?mode=ro" ".schema graph_triples"
$ sqlite3 "file:/Users/wane/SynovaAgent/data/synova.db?mode=ro" "SELECT (SELECT COUNT(*) FROM graph_nodes), (SELECT COUNT(*) FROM graph_triples);"
$ sqlite3 "file:/Users/wane/SynovaAgent/data/synova.db?mode=ro" "SELECT props FROM graph_triples LIMIT 1;"   # 期望: no such column: props
```

```text
CREATE TABLE graph_nodes (
        id TEXT NOT NULL, type TEXT NOT NULL, graph TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '', confidence REAL DEFAULT 1.0,
        props_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        valid_to TEXT, props TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (id, graph)
      );
CREATE INDEX idx_gn_type ON graph_nodes(graph, type);
CREATE INDEX idx_gn_name ON graph_nodes(graph, name);
CREATE INDEX idx_gn_valid ON graph_nodes(graph, valid_to);

CREATE TABLE graph_triples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
        predicate TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
        graph TEXT NOT NULL, weight REAL DEFAULT 1.0,
        props_json TEXT DEFAULT '{}', confidence REAL DEFAULT 1.0, source TEXT,
        valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE INDEX idx_gt_subject ON graph_triples(graph, subject_type, subject_id);
CREATE INDEX idx_gt_object ON graph_triples(graph, object_type, object_id);
CREATE INDEX idx_gt_predicate ON graph_triples(graph, predicate);
CREATE INDEX idx_gt_weight ON graph_triples(graph, predicate, weight);
CREATE INDEX idx_gt_valid ON graph_triples(graph, valid_from, valid_to);
--- counts ---
0|0
--- triples.props ---
Error: in prepare, no such column: props
  SELECT props FROM graph_triples LIMIT 1;
         ^--- error here
```

## 3. 队长三条事实的独立复核

```bash
$ grep -rn "graph_triples" src/ --include=*.ts | grep -v "src/adapters/sqlite-graph-store.ts"   # 期望：空
$ grep -rn "props_json" src/ packages/ --include=*.ts
$ ls src/store/migrations/
```

```text
[exit=1 (1=无匹配=仅适配器引用)]
--- props_json ---
src/adapters/sqlite-graph-store.ts:111:    //（框架契约），修复 K3 P0-3 旧库 props_json 无 props 列的 schema 漂移。
src/store/migrations/001-graph-nodes-props.ts:4: * 背景 (K3 P0-3 实测): 旧库 graph_nodes 以 props_json 列存储节点属性，
src/store/migrations/001-graph-nodes-props.ts:11: *             且旧 props_json 值已回填
src/store/migrations/001-graph-nodes-props.ts:31:    const hasPropsJson = cols.some((c) => c.name === 'props_json');
src/store/migrations/001-graph-nodes-props.ts:33:      db.exec("UPDATE graph_nodes SET props = props_json WHERE props_json IS NOT NULL AND props_json != ''");
src/store/schema-migration.ts:34:  // D355: 旧库 graph_nodes 以 props_json 存储属性 → 补 props 列并回填（K3 P0-3）
--- migrations ---
001-graph-nodes-props.ts
```

## 4. 口径 A / A2 + 口径 Q / Q2 / R —— 运行时 loader 口径（全部哨兵，生产库一致性只读快照）

```bash
$ npx tsx tests/sentinel/audit/run-runtime-probe.ts baseline
```

```text
D966 运行时口径探针 ｜ mode=baseline
生产库（只读）: /Users/wane/SynovaAgent/data/synova.db
夹具根: /var/folders/bs/ltqkv_rd45z6b7p5wq90vv500000gn/T/d966-probe
夹具 = 生产库一致性只读快照（未加任何合成数据）: {"path":"/var/folders/bs/ltqkv_rd45z6b7p5wq90vv500000gn/T/d966-probe/baseline-prod-snapshot.db","bytes":2396160}
生产库只读断面: {"nodesColumnNames":["id","type","graph","name","confidence","props_json","created_at","updated_at","valid_to","props"],"triplesColumnNames":["id","subject_type","subject_id","predicate","object_type","object_id","graph","weight","props_json","confidence","source","valid_from","valid_to","created_at"],"nodeCount":0,"edgeCount":0,"triplesDdl":"CREATE TABLE graph_triples ( id INTEGER PRIMARY KEY AUTOINCREMENT, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, predicate TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL, graph TEXT NOT NULL, weight REAL DEFAULT 1.0, props_json TEXT DEFAULT '{}', confidence REAL DEFAULT 1.0, source TEXT, valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')) )","nodesDdl":"CREATE TABLE graph_nodes ( id TEXT NOT NULL, type TEXT NOT NULL, graph TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', confidence REAL DEFAULT 1.0, props_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT, props TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (id, graph) )"}

══════════════════════════════════════════════════════════════════════════════
口径 A/A2（loader 口径：manifest.entryPoint + manifest.exportKey + 四参注入） — 逐哨兵原始结果（45 行）
══════════════════════════════════════════════════════════════════════════════
#  哨兵                                entry               数组   列A   列B   deg  store  成功/失败     qE(调用/成功/失败)       qE行数   SQL失败   形态
1  agent-deployment-maturity         ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
2  ai-ecosystem-fit                  ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
3  ai-investment-return              ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
4  api-coverage                      ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
5  business-model-coherence          ./aggregate.ts      是    1    1    false 6      6/0       1/1/0              0      1       array
6  capital-health                    ./aggregate.ts      是    0    0    false 1      1/0       0/0/0              0      0       array
7  cash-runway                       ./aggregate.ts      是    2    2    false 6      6/0       4/4/0              0      4       array
8  channel-capacity                  ./aggregate.ts      是    1    1    false 4      4/0       1/1/0              0      1       array
9  competitive-moat                  ./aggregate.ts      是    1    1    false 4      4/0       2/2/0              0      2       array
10 competitive-position              ./aggregate.ts      是    1    1    false 6      6/0       2/2/0              0      2       array
11 customer-demand-shift             ./aggregate.ts      否    -    0    true 1      1/0       1/1/0              0      1       object
12 data-health                       ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
13 environment-rent-dependency       ./aggregate.ts      是    1    1    false 2      2/0       1/1/0              0      1       array
14 explore-exploit-balance           ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
15 financing-constraint              ./aggregate.ts      是    0    0    false 2      2/0       1/1/0              0      1       array
16 growth-quality                    ./aggregate.ts      是    0    0    false 2      2/0       1/1/0              0      1       array
17 human-agent-boundary              ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
18 incentive-alignment               ./aggregate.ts      是    1    1    false 3      3/0       1/1/0              0      1       array
19 info-distortion                   ./aggregate.ts      是    1    1    false 3      3/0       1/1/0              0      1       array
20 internal-transaction-cost         ./aggregate.ts      是    0    0    false 4      4/0       1/1/0              0      1       array
21 key-person-risk                   ./aggregate.ts      是    0    0    false 2      2/0       1/1/0              0      1       array
22 knowledge-accessibility           ./aggregate.ts      是    1    1    false 3      3/0       1/1/0              0      1       array
23 make-or-buy                       ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
24 margin-health                     ./aggregate.ts      是    0    0    false 1      1/0       0/0/0              0      0       array
25 moat-dependency                   ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
26 network-power                     ./aggregate.ts      是    0    0    false 5      5/0       1/1/0              0      1       array
27 niche-breadth                     ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
28 niche-squeeze                     ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
29 opportunity-window                ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
30 org-repairability                 ./aggregate.ts      是    1    1    false 2      2/0       1/1/0              0      1       array
31 path-dependency                   ./computes/detect.ts 是    0    0    false 2      2/0       1/1/0              0      1       array
32 power-rigidity                    ./aggregate.ts      是    1    1    false 3      3/0       1/1/0              0      1       array
33 process-ai-readiness              ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
34 resource-misallocation            ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
35 revenue-health                    ./aggregate.ts      是    0    0    false 4      4/0       2/2/0              0      2       array
36 routine-diffusion                 ./aggregate.ts      是    1    1    false 3      3/0       1/1/0              0      1       array
37 routine-mutation                  ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
38 sentinel-forecast-accuracy        ./aggregate.ts      否    -    3    false 0      0/0       0/0/0              0      0       object
39 sentinel-pricing-strategy         ./aggregate.ts      否    -    1    false 0      0/0       0/0/0              0      0       object
40 software-health                   ./aggregate.ts      是    0    0    false 2      2/0       1/1/0              0      1       array
41 strategy-capability-fit           ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array
42 talent-density                    ./aggregate.ts      是    1    1    false 2      2/0       1/1/0              0      1       array
43 time-penetration                  ./aggregate.ts      是    0    0    false 2      2/0       1/1/0              0      1       array
44 unit-economics                    ./aggregate.ts      是    0    0    false 5      5/0       3/3/0              0      3       array
45 value-capture                     ./aggregate.ts      是    0    0    false 1      1/0       1/1/0              0      1       array

══════════════════════════════════════════════════════════════════════════════
口径 A/A2 — 汇总（全部为原始实测值，禁手写）
══════════════════════════════════════════════════════════════════════════════
哨兵总数                     = 45
raw 为数组（列 A 可计）       = 42
raw 非数组                    = 3  [customer-demand-shift, sentinel-forecast-accuracy, sentinel-pricing-strategy]
抛错 / 加载失败               = 0  []
entryPoint 缺件               = 0
exportKey 无 check()          = 0
零 finding（列 A 数组口径）   = 29
零 finding（列 B loader 口径）= 30   ← 判定列
store 调用 = 0 的哨兵（口径 R） = 2  [sentinel-forecast-accuracy, sentinel-pricing-strategy]
queryNodes 方法调用 = 0（口径 Q） = 20  [agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, customer-demand-shift, data-health, explore-exploit-balance, human-agent-boundary, make-or-buy, moat-dependency, niche-breadth, niche-squeeze, opportunity-window, process-ai-readiness, resource-misallocation, routine-mutation, sentinel-forecast-accuracy, sentinel-pricing-strategy, strategy-capability-fit, value-capture]
无 FROM graph_nodes 取数（口径Q2） = 20  [agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, customer-demand-shift, data-health, explore-exploit-balance, human-agent-boundary, make-or-buy, moat-dependency, niche-breadth, niche-squeeze, opportunity-window, process-ai-readiness, resource-misallocation, routine-mutation, sentinel-forecast-accuracy, sentinel-pricing-strategy, strategy-capability-fit, value-capture]
Q 与 Q2 名单是否一致            = true
store 调用全失败（≥1 调用全红）= 0  []
queryEdges 逐哨兵面           = 有调用 41 ｜ 方法层"成功" 41 ｜ 方法层全失败 0
queryEdges 调用总次数         = 49
queryEdges 真的读到的边行数   = 0   ← 判定量（补列前应恒 0）
SQL 层 prepare 调用/失败      = 97 / 49
SQL 层出现失败的哨兵数        = 41  [agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, business-model-coherence, cash-runway, channel-capacity, competitive-moat, competitive-position, customer-demand-shift, data-health, environment-rent-dependency, explore-exploit-balance, financing-constraint, growth-quality, human-agent-boundary, incentive-alignment, info-distortion, internal-transaction-cost, key-person-risk, knowledge-accessibility, make-or-buy, moat-dependency, network-power, niche-breadth, niche-squeeze, opportunity-window, org-repairability, path-dependency, power-rigidity, process-ai-readiness, resource-misallocation, revenue-health, routine-diffusion, routine-mutation, software-health, strategy-capability-fit, talent-density, time-penetration, unit-economics, value-capture]

零 finding 名单（列 A）: agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, capital-health, data-health, explore-exploit-balance, financing-constraint, growth-quality, human-agent-boundary, internal-transaction-cost, key-person-risk, make-or-buy, margin-health, moat-dependency, network-power, niche-breadth, niche-squeeze, opportunity-window, path-dependency, process-ai-readiness, resource-misallocation, revenue-health, routine-mutation, software-health, strategy-capability-fit, time-penetration, unit-economics, value-capture
零 finding 名单（列 B）: agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, capital-health, customer-demand-shift, data-health, explore-exploit-balance, financing-constraint, growth-quality, human-agent-boundary, internal-transaction-cost, key-person-risk, make-or-buy, margin-health, moat-dependency, network-power, niche-breadth, niche-squeeze, opportunity-window, path-dependency, process-ai-readiness, resource-misallocation, revenue-health, routine-mutation, software-health, strategy-capability-fit, time-penetration, unit-economics, value-capture
```

## 5. CTO 口径复刻矩阵 —— 「CTO 报 23」的差异归因

```bash
$ npx tsx tests/sentinel/audit/run-runtime-probe.ts misspec
```

```text
D966 运行时口径探针 ｜ mode=misspec
生产库（只读）: /Users/wane/SynovaAgent/data/synova.db
夹具根: /var/folders/bs/ltqkv_rd45z6b7p5wq90vv500000gn/T/d966-probe

══════════════════════════════════════════════════════════════════════════════
CTO 口径复刻矩阵（用于 23 vs 实测 的差异归因）
══════════════════════════════════════════════════════════════════════════════
CTO 派单件 §一 声明: 返回数组=42 ｜ 抛错=3 ｜ 零 finding=23 ｜ store 调用=0 的=2
   异常清单: path-dependency(aggregate 缺件) / forecast-accuracy(非数组) / pricing-strategy(非数组)

变体                                                            数组    非数组    抛错    零A    零B    零C    零调用    
V1 loader 口径（manifest.entryPoint + manifest.exportKey + 四参）   42    3      0     29    30    30    2      
V2 硬编码 aggregate.ts + manifest.exportKey + 四参                 41    3      1     28    29    30    2      
V3 硬编码 aggregate.ts + manifest.exportKey + 二参 check(store, teamId) 42    2      1     22    22    23    2      
V4 manifest.entryPoint + manifest.exportKey + 二参 check(store, teamId) 43    2      0     23    23    23    2      
V5 manifest.entryPoint + manifest.exportKey + 三参（无 thresholds） 42    3      0     29    30    30    2      
V6 硬编码 aggregate.ts + 四参 + thresholds 空表                      41    3      1     28    29    30    2      


══════════════════════════════════════════════════════════════════════════════
CTO 口径异常清单核对（V3：硬编码 aggregate.ts + 二参）
══════════════════════════════════════════════════════════════════════════════
  path-dependency                  outcome=import-threw err=entryPoint 不存在: /Users/wane/SynovaAgent/.synova-wt-D966/extensions/sentinels/path-dependency/aggregate.ts
  异常总数 = 1
```

## 6. 静态口径 S1/S2/S3/S4 vs 运行时 R / Q

```bash
$ npx tsx tests/sentinel/audit/run-static-audit.ts
```

```text
D966 静态口径 ↔ 运行时口径 对照
仓库根: /Users/wane/SynovaAgent/.synova-wt-D966/

══════════════════════════════════════════════════════════════════════════════
逐哨兵对照表
══════════════════════════════════════════════════════════════════════════════
#  哨兵                                文件   qNodes qEdges traverse 静态有数据访问        运行时store调用      运行时qE成功/调用        运行时qE读到的边        列B
1  agent-deployment-maturity         2    3      0      1        true           1               1/1               0                0
2  ai-ecosystem-fit                  2    2      0      1        true           1               1/1               0                0
3  ai-investment-return              2    2      0      1        true           1               1/1               0                0
4  api-coverage                      3    2      0      1        true           1               1/1               0                0
5  business-model-coherence          2    6      0      1        true           6               1/1               0                1
6  capital-health                    10   1      0      0        true           1               0/0               0                0
7  cash-runway                       5    3      0      4        true           6               4/4               0                2
8  channel-capacity                  2    4      0      1        true           4               1/1               0                1
9  competitive-moat                  1    1      0      0        true           4               2/2               0                1
10 competitive-position              1    1      0      0        true           6               2/2               0                1
11 customer-demand-shift             3    2      0      1        true           1               1/1               0                0
12 data-health                       3    6      1      1        true           1               1/1               0                0
13 environment-rent-dependency       2    2      0      1        true           2               1/1               0                1
14 explore-exploit-balance           2    4      0      1        true           1               1/1               0                0
15 financing-constraint              4    2      0      1        true           2               1/1               0                0
16 growth-quality                    3    2      0      1        true           2               1/1               0                0
17 human-agent-boundary              2    3      0      1        true           1               1/1               0                0
18 incentive-alignment               2    3      0      1        true           3               1/1               0                1
19 info-distortion                   2    3      0      1        true           3               1/1               0                1
20 internal-transaction-cost         2    4      0      1        true           4               1/1               0                0
21 key-person-risk                   1    1      0      1        true           2               1/1               0                0
22 knowledge-accessibility           2    3      0      1        true           3               1/1               0                1
23 make-or-buy                       2    2      0      1        true           1               1/1               0                0
24 margin-health                     8    2      0      2        true           1               0/0               0                0
25 moat-dependency                   2    4      0      1        true           1               1/1               0                0
26 network-power                     2    5      0      1        true           5               1/1               0                0
27 niche-breadth                     2    3      0      1        true           1               1/1               0                0
28 niche-squeeze                     2    3      0      1        true           1               1/1               0                0
29 opportunity-window                2    3      0      1        true           1               1/1               0                0
30 org-repairability                 4    2      0      1        true           2               1/1               0                1
31 path-dependency                   1    3      3      0        true           2               1/1               0                0
32 power-rigidity                    3    3      0      1        true           3               1/1               0                1
33 process-ai-readiness              2    3      0      1        true           1               1/1               0                0
34 resource-misallocation            2    4      0      1        true           1               1/1               0                0
35 revenue-health                    2    4      0      3        true           4               2/2               0                0
36 routine-diffusion                 2    3      0      1        true           3               1/1               0                1
37 routine-mutation                  2    3      0      1        true           1               1/1               0                0
38 sentinel-forecast-accuracy        1    0      0      0        false          0               0/0               0                3
39 sentinel-pricing-strategy         1    0      0      0        false          0               0/0               0                1
40 software-health                   5    4      0      1        true           2               1/1               0                0
41 strategy-capability-fit           2    3      0      1        true           1               1/1               0                0
42 talent-density                    2    2      0      1        true           2               1/1               0                1
43 time-penetration                  2    2      0      1        true           2               1/1               0                0
44 unit-economics                    13   3      2      2        true           5               3/3               0                0
45 value-capture                     2    2      0      1        true           1               1/1               0                0

══════════════════════════════════════════════════════════════════════════════
两套口径数字（差异归因）
══════════════════════════════════════════════════════════════════════════════
哨兵总数                                       = 45

静态口径（四种扫法，全部实测）:
  S1 只扫 entryPoint 文件 · queryNodes 字样 0 次 = 3
  S2 只扫 entryPoint 文件 · 全无数据访问原语    = 3
  S3 扫整个哨兵目录 · queryNodes 字样 0 次      = 2
  S4 扫整个哨兵目录 · 全无数据访问原语          = 2

运行时口径:
  R   store 调用 = 0 的哨兵                     = 2  [sentinel-forecast-accuracy, sentinel-pricing-strategy]
  R'  store 调用 > 0 的哨兵                     = 43

差异归因（逐条可核）:
  ① 扫错范围：S1(3) → S3(2)，差 1 件 —— 数据访问大量下沉在 computes/*.ts 与 shared/computes/，只扫入口必漏。
  ② 静态 vs 运行时：S3(2) → R(2)，差 0 件 —— 真正的硬编码桩**声明**了 context/store 形参，静态看"有引用"（出现字样），运行时却一次都不调用。
  ③ S4(2) vs R(2)：名单**恰好一致**（S4=[sentinel-forecast-accuracy, sentinel-pricing-strategy]）。
     登记：本断面下整目录静态扫法与运行时判定同值同名单，但这**不构成**静态可作判据的理由——
     二者同值是"桩恰好一行数据访问都没有"这一巧合，换断面/换哨兵即失效（S1 已差 1 件）。

⇒ 结论：静态口径不可作判据（本卡坑清单第 7 条）。判定列一律用运行时实测。

【未归因·如实登记】派单件 §一 引述"院方《边界评估》：20/45 哨兵 queryNodes 调用 = 0"。
  本卡四种静态扫法实测为 S1=3 / S2=3 / S3=2 / S4=2，运行时 R=2 —— **没有任何一种扫法得到 20**。
  院方 20 的口径本卡无法复现（未写明扫法/断面/是否含 _extinct 或全仓）；登记为未清项，不作猜测。

S1 名单（只扫 entryPoint 时 queryNodes 为 0）: cash-runway, sentinel-forecast-accuracy, sentinel-pricing-strategy
S3 名单（整目录仍无 queryNodes 字样）       : sentinel-forecast-accuracy, sentinel-pricing-strategy
```

## 7. P7 三态对照 + 断面矩阵（含口径 Q/Q2 的断面敏感性）

```bash
$ npx tsx tests/sentinel/audit/run-p7-control.ts
```

```text
D966 P7 对照重跑 ｜ graph_triples 三态 × 图夹具三档

══════════════════════════════════════════════════════════════════════════════
① 生产库只读断面（独立复现，不采信任何声称）
══════════════════════════════════════════════════════════════════════════════
生产库                    : /Users/wane/SynovaAgent/data/synova.db
graph_nodes   列          : id, type, graph, name, confidence, props_json, created_at, updated_at, valid_to, props
graph_triples 列          : id, subject_type, subject_id, predicate, object_type, object_id, graph, weight, props_json, confidence, source, valid_from, valid_to, created_at
graph_nodes   行数        : 0
graph_triples 行数        : 0
graph_nodes   有 props 列 : true
graph_triples 有 props 列 : false
graph_triples DDL        : CREATE TABLE graph_triples ( id INTEGER PRIMARY KEY AUTOINCREMENT, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, predicate TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL, graph TEXT NOT NULL, weight REAL DEFAULT 1.0, props_json TEXT DEFAULT '{}', confidence REAL DEFAULT 1.0, source TEXT, valid_from TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')) )
graph_nodes   DDL        : CREATE TABLE graph_nodes ( id TEXT NOT NULL, type TEXT NOT NULL, graph TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', confidence REAL DEFAULT 1.0, props_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), valid_to TEXT, props TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (id, graph) )

══════════════════════════════════════════════════════════════════════════════
② 读路径/写路径 三态对照（空库，图数据 0）
══════════════════════════════════════════════════════════════════════════════
读路径：
  [legacy      ] 直连 SQL 边行数（数据确实存在？）= 0
  [legacy      ] queryEdges 返回行数 = 0
  [legacy      ] 方法层：正常返回（无异常）
  [props-added ] 直连 SQL 边行数（数据确实存在？）= 0
  [props-added ] queryEdges 返回行数 = 0
  [props-added ] 方法层：正常返回（无异常）
  [canonical   ] 直连 SQL 边行数（数据确实存在？）= 0
  [canonical   ] queryEdges 返回行数 = 0
  [canonical   ] 方法层：正常返回（无异常）
写路径：
  [legacy      ] createNode → createEdge → queryEdges : 失败 ｜ table graph_triples has no column named props
  [props-added ] createNode → createEdge → queryEdges : 失败 ｜ datatype mismatch
  [canonical   ] createNode → createEdge → queryEdges : 成功 ｜ 写入 edgeId=edge-ec524129-9aac-4bfb-7a1a-25870b5c4713 ｜ 读回 1 行

══════════════════════════════════════════════════════════════════════════════
③ 读路径对照（3 边夹具：数据确实存在，读不到 = 读路径坏，不是"没数据"）
══════════════════════════════════════════════════════════════════════════════
  [legacy      ] 直连 SQL 边行数（数据确实存在？）= 3
  [legacy      ] queryEdges 返回行数 = 0
  [legacy      ] 方法层：正常返回（无异常）
  [props-added ] 直连 SQL 边行数（数据确实存在？）= 3
  [props-added ] queryEdges 返回行数 = 3
  [props-added ] 方法层：正常返回（无异常）
  [canonical   ] 直连 SQL 边行数（数据确实存在？）= 3
  [canonical   ] queryEdges 返回行数 = 3
  [canonical   ] 方法层：正常返回（无异常）

══════════════════════════════════════════════════════════════════════════════
④ 读路径对照（4 边夹具：3×DEPLOYS + 1×OWNS）
══════════════════════════════════════════════════════════════════════════════
  [legacy      ] 直连 SQL 边行数（数据确实存在？）= 4
  [legacy      ] queryEdges 返回行数 = 0
  [legacy      ] 方法层：正常返回（无异常）
  [props-added ] 直连 SQL 边行数（数据确实存在？）= 4
  [props-added ] queryEdges 返回行数 = 4
  [props-added ] 方法层：正常返回（无异常）
  [canonical   ] 直连 SQL 边行数（数据确实存在？）= 4
  [canonical   ] queryEdges 返回行数 = 4
  [canonical   ] 方法层：正常返回（无异常）

══════════════════════════════════════════════════════════════════════════════
⑤ 哨兵口径矩阵（同一节点集，仅改 graph_triples 断面 ⇒ 差异只能归因于 P7）
══════════════════════════════════════════════════════════════════════════════
口径                      数组    非数组    抛错    零A    零B    零C    零R   零Q   零Q2   零Q(43件)   qE调用    qE读到的边      SQL失败   SQL失败哨兵     
A  空库 + legacy          42    3      0     28    29    29    2    20   20    18/43     49      0           49      41          
A2 空库 + props-added     42    3      0     28    29    29    2    20   20    18/43     49      0           0       0           
B  3 边 + legacy         42    3      0     25    26    26    2    20   20    18/43     49      0           49      41          
C  4 边 + legacy         42    3      0     25    26    26    2    20   20    18/43     49      0           49      41          
D  3 边 + props-added    43    2      0     16    16    16    2    11   2     9/43      49      144         0       0           
E  4 边 + props-added    43    2      0     16    16    16    2    11   2     9/43      49      145         0       0           
F  3 边 + canonical      43    2      0     16    16    16    2    11   2     9/43      49      144         0       0           
G  4 边 + canonical      43    2      0     16    16    16    2    11   2     9/43      49      145         0       0           

列义: 零A=数组口径零 finding ｜ 零B=loader 解包口径零 finding（判定列）｜ 零C=产出为零（含缺件）
      零R=总 store 调用=0（「空转/零调用」判定列 = 2）｜ 零Q=方法层 queryNodes 调用=0 ｜ 零Q2=SQL 层无 FROM graph_nodes
      零Q(43件) = D965 裁撤 2 桩后的断面模拟（分子/分母，分母 = 动态取数 − 2）
      ⚠️ 零Q（20）与 零R（2）是两个不同口径，不可互相证伪：零Q 中 18 件走 traverse→queryEdges/getNode，仍触达图
      qE读到的边 = queryEdges 返回值中真实边行数累加（legacy 应恒 0）
```

## 8. 逐哨兵产出差（P7 = 混杂变量，方向不单调）

```bash
$ npx tsx tests/sentinel/audit/run-flip-diff.ts
```

```text
D966 P7 混杂变量 — 逐哨兵产出差（同节点集 + 同边集，仅 graph_triples 断面不同）
夹具: nodes=19 edges=3 ｜ teamId=probe-team
queryEdges 真实读到的边: legacy=0 ｜ canonical=144

哨兵                                legacy列B   canonical列B 方向
ai-ecosystem-fit                  0          1           ↑ 增
ai-investment-return              0          1           ↑ 增
api-coverage                      0          1           ↑ 增
competitive-moat                  1          2           ↑ 增
customer-demand-shift             0          1           ↑ 增
data-health                       0          1           ↑ 增
explore-exploit-balance           0          1           ↑ 增
niche-squeeze                     0          1           ↑ 增
process-ai-readiness              0          1           ↑ 增
resource-misallocation            0          1           ↑ 增
routine-mutation                  0          1           ↑ 增
software-health                   4          0           ↓ 减
strategy-capability-fit           0          1           ↑ 增
unit-economics                    3          0           ↓ 减
value-capture                     0          1           ↑ 增

产出改变的哨兵数 = 15 ｜ 增 13 ｜ 减 2

产出**反而减少**的哨兵（必须登记，禁止把"修好"说成单调变多）:
  software-health: 4 → 0
  unit-economics: 3 → 0

⇒ 判定：P7 修复会**改变**哨兵走哪条代码路径（产出方向逐件不同），因此 P7 是混杂变量；
   任何"空转/零调用"结论若不在可读边断面上重跑，都不能区分"没数据"与"读不到"。
```

## 9. 判别性夹具 —— 绿（10/10）

```bash
$ npx vitest run tests/sentinel/audit/sentinel-audit.test.ts
```

```text

 RUN  v4.1.8 /Users/wane/SynovaAgent/.synova-wt-D966

 ✓ tests/sentinel/audit/sentinel-audit.test.ts > D966 金丝雀：夹具自证（先证明夹具本身没坏） > T0 canary: pinned 生产 DDL 必须保持"漂移态"特征 —— 若被误改成 canonical，本套断言全部无意义 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > D966 金丝雀：夹具自证（先证明夹具本身没坏） > T1 canary: 三个夹具的边数据都真实落库（直连 SQL 计数 = 3） 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C1 边读路径：数据存在 ≠ 读得到（P7 读侧） > T2 legacy 断面：3 条边存在，但 queryEdges 读到 0 行，且**不抛错**（静默 fail-open） 3ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C1 边读路径：数据存在 ≠ 读得到（P7 读侧） > T3 canonical 断面：同一夹具读到 3 行（改好即绿，反证 T2 不是夹具假象） 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4a legacy：写边失败，错误为缺列 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4b 仅补 props 列：写边**仍然失败**，错误变成主键类型不匹配（补列 ≠ 修好） 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4c 整表重建为 canonical：写边成功（这是唯一转绿态，构成判别性三态） 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T5 legacy 断面下该哨兵产出 0 条 finding；canonical 断面下产出 ≥1 条 17ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T6 canary 证伪开关：canonical 断面但边落在读不到的 graph ⇒ 判别量回到 0 2ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T7 边界：空图（无合成数据）⇒ 产出 0；且 teamId 不匹配 ⇒ 产出 0（两条边界都不许伪绿） 5ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  19:36:12
   Duration  300ms (transform 67ms, setup 0ms, import 113ms, tests 99ms, environment 0ms)
```

## 9b. CI 自洽性证明 —— **无生产库**也全绿（`data/synova.db` 被 .gitignore 排除）

```bash
$ grep -n 'data/' .gitignore | head -1
$ SYNOVA_PROD_DB_CAPTURE=/nonexistent/ci.db npx vitest run tests/sentinel/audit/sentinel-audit.test.ts
```

```text
3:data/


 RUN  v4.1.8 /Users/wane/SynovaAgent/.synova-wt-D966

 ✓ tests/sentinel/audit/sentinel-audit.test.ts > D966 金丝雀：夹具自证（先证明夹具本身没坏） > T0 canary: pinned 生产 DDL 必须保持"漂移态"特征 —— 若被误改成 canonical，本套断言全部无意义 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > D966 金丝雀：夹具自证（先证明夹具本身没坏） > T1 canary: 三个夹具的边数据都真实落库（直连 SQL 计数 = 3） 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C1 边读路径：数据存在 ≠ 读得到（P7 读侧） > T2 legacy 断面：3 条边存在，但 queryEdges 读到 0 行，且**不抛错**（静默 fail-open） 2ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C1 边读路径：数据存在 ≠ 读得到（P7 读侧） > T3 canonical 断面：同一夹具读到 3 行（改好即绿，反证 T2 不是夹具假象） 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4a legacy：写边失败，错误为缺列 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4b 仅补 props 列：写边**仍然失败**，错误变成主键类型不匹配（补列 ≠ 修好） 2ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4c 整表重建为 canonical：写边成功（这是唯一转绿态，构成判别性三态） 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T5 legacy 断面下该哨兵产出 0 条 finding；canonical 断面下产出 ≥1 条 12ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T6 canary 证伪开关：canonical 断面但边落在读不到的 graph ⇒ 判别量回到 0 2ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T7 边界：空图（无合成数据）⇒ 产出 0；且 teamId 不匹配 ⇒ 产出 0（两条边界都不许伪绿） 3ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  19:36:13
   Duration  238ms (transform 61ms, setup 0ms, import 80ms, tests 79ms, environment 0ms)
```

## 10. 改坏即红（对抗式复核）

```bash
$ npx vitest run tests/sentinel/audit/sentinel-audit.test.ts   # 注入 INJECTED-RED 后
$ grep -c 'INJECTED-RED' tests/sentinel/audit/sentinel-audit.test.ts   # 还原后，期望 0
```

```text

 RUN  v4.1.8 /Users/wane/SynovaAgent/.synova-wt-D966

 ✓ tests/sentinel/audit/sentinel-audit.test.ts > D966 金丝雀：夹具自证（先证明夹具本身没坏） > T0 canary: pinned 生产 DDL 必须保持"漂移态"特征 —— 若被误改成 canonical，本套断言全部无意义 1ms
 × tests/sentinel/audit/sentinel-audit.test.ts > D966 金丝雀：夹具自证（先证明夹具本身没坏） > T1 canary: 三个夹具的边数据都真实落库（直连 SQL 计数 = 3） 3ms
   → expected +0 to be 3 // Object.is equality
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C1 边读路径：数据存在 ≠ 读得到（P7 读侧） > T2 legacy 断面：3 条边存在，但 queryEdges 读到 0 行，且**不抛错**（静默 fail-open） 2ms
 × tests/sentinel/audit/sentinel-audit.test.ts > C1 边读路径：数据存在 ≠ 读得到（P7 读侧） > T3 canonical 断面：同一夹具读到 3 行（改好即绿，反证 T2 不是夹具假象） 2ms
   → expected +0 to be 3 // Object.is equality
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4a legacy：写边失败，错误为缺列 1ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4b 仅补 props 列：写边**仍然失败**，错误变成主键类型不匹配（补列 ≠ 修好） 1ms
 × tests/sentinel/audit/sentinel-audit.test.ts > C2 边写路径：补列 ≠ 修好（P7 写侧，判定加严的判别性证据） > T4c 整表重建为 canonical：写边成功（这是唯一转绿态，构成判别性三态） 1ms
   → expected 1 to be greater than or equal to 3
 × tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T5 legacy 断面下该哨兵产出 0 条 finding；canonical 断面下产出 ≥1 条 12ms
   → expected 0 to be greater than 0
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T6 canary 证伪开关：canonical 断面但边落在读不到的 graph ⇒ 判别量回到 0 2ms
 ✓ tests/sentinel/audit/sentinel-audit.test.ts > C3 哨兵级：P7 是混杂变量（同节点同边，仅换断面 ⇒ 产出改变） > T7 边界：空图（无合成数据）⇒ 产出 0；且 teamId 不匹配 ⇒ 产出 0（两条边界都不许伪绿） 3ms

 Test Files  1 failed (1)
      Tests  4 failed | 6 passed (10)
   Start at  19:36:14
   Duration  264ms (transform 61ms, setup 0ms, import 96ms, tests 83ms, environment 0ms)

--- 红证清理 ---
0
```

## 11. 红线自证（diff 范围）

```bash
$ git diff --stat -- extensions/ src/          # 期望：空（本卡不改哨兵/不改 src）
$ git status --porcelain | sort
```

```text
--- git diff --stat -- extensions/ src/ ---
(空=未改)

--- 本卡变更/新增文件 ---
 M docs/synova/coordination/哨兵-空转复现-20260925.md
 M tests/sentinel/audit/probe-harness.ts
 M tests/sentinel/audit/run-p7-control.ts
 M tests/sentinel/audit/run-runtime-probe.ts
```

## 12. 自检 5 问

1. **接线检查**：本卡产出为**只读探针 + 夹具**，不新增任何 `src/` 生产导出 ⇒ 无接线义务。
   夹具脚本由谁调用：`tests/sentinel/audit/sentinel-audit.test.ts`（vitest 收集，`include: ./tests/**/*.test.ts`）
   + 报告 §九 的命令（可复跑）；`probe-harness.ts` 被 4 个 runner 与 1 个单测 import。
2. **异常处理**：探针 3 处 catch 全有 log/显式登记，无空吞 ——
   ① `snapshotProdDb` 前置失败 → `throw`（fail-closed，不伪装成零 finding）；
   ② `probeSentinels` 单哨兵失败 → 记入该行 `outcome/error`，不中断整体；
   ③ `instrumentStore` / `instrumentDatabase` → **异常原样重抛**，只计数不降级（观测层不得改变被测行为）。
   schema 来源两态**显式声明、无隐式回退**（避免「生产库不在 → 悄悄换 schema」的静默降级）。
3. **类型安全**：`as any` / `as never` / `as unknown as` = 0（仅内联类型断言 + `unknown` + 类型守卫）。
4. **测试质量**：`sentinel-audit.test.ts` 10 个 `it`、**25 个 `expect()`**（≥3 硬门禁）；
   覆盖正常（T3/T4c/T5-canonical）、降级（T2 静默 fail-open、T4a/T4b 写失败）、
   边界（T7 空图 / teamId 不匹配）、**三金丝雀（T0 pinned DDL 漂移态、T1 夹具自证、T6 证伪开关）**；判据方言无关（只用运行时数值）。
5. **残留清理**：`INJECTED-RED` 计数 = 0；无临时脚本残留；未新增空目录；**未动 `.claude/bypass.log`**。

## 13. 未清项

见配套报告 §八（口径 20 已清理；余 5 条）+ §十一（2 条批级门禁缺陷）。
**「生产库图数据为何全空」按 CTO 裁定不查**；**复核员六口径字母定义**需用夹具定义对齐后逐条对拍。

## 14. Gatekeeper ACK 使用登记（限今日、限这一条）

授权链：CTO 回执确认 `ce5b13b9` / `marker=head-mismatch` 系本人记录且已复核；队长转授权，限今日限这一条。

```bash
$ grep -c "2026-09-25.*detected-bypass" .claude/bypass.log   # 提交前 / 提交后
$ grep "2026-09-25.*detected-bypass" .claude/bypass.log
$ git log -1 --format='%h | %an | %ad | %s' --date=iso 0ab457f2   # 引入该记录的提交
```

```text
[计数]
1
[记录内容]
2026-09-25T00:56:43Z detected-bypass head-mismatch marker=ce5b13b96c9b0b5b40ff065da7f1361bd6996a72 parent=2b38d1779aa31caf553ef481eb6f2e5479a3199c
[引入提交]
0ab457f2 | tangbaobao520 <huangxuesongvip@163.com> | 2026-09-25 13:09:35 +0800 | fix(D937-v2): 门禁 fail-open 假绿修复 + T3f 判据收敛组7a行 [承接 #737] (#762)
[bypass.log 工作区是否被本卡修改]
(空=未改)
```

## 15. 推送回执

```bash
$ git rev-parse HEAD && git log --oneline -3
$ git ls-remote --heads origin | grep docs/D966-sentinel-idle-repro
```

```text
39b7d818e5b3f51c43da0841c1512c5f955511f0
39b7d818 chore: bypass COMMITTED 登记 (auto hook, D521)
b76ce285 docs(D966): 澄清两点 diff 的 13 文件现象（main 已前进，非本卡夹带）
e01041e7 chore: bypass COMMITTED 登记 (auto hook, D521)

39b7d818e5b3f51c43da0841c1512c5f955511f0	refs/heads/docs/D966-sentinel-idle-repro
```

## 16. CI 写集门禁预检回执

```text
── merge-writeset-gate (D708) 合并级写集对账 ──
✅ 结论: pass — 提交文件集 ⊆ 声明写集（无夹带）
   任务: D966 | 分支: docs/D966-sentinel-idle-repro
   D# 推断来源: branch → D966
   变更集: 11 个文件（merge-base ce231ff1）
   声明写集 10 条（多源并集）:

── verify-parallel (D311): 并行声明物理验证 ──
  ✅ 无 dev doc 写集变化（origin/main..HEAD）— 跳过
```

## 18. 🔧 复核员指出的三处更正（原表述保留 + 更正说明）

### 18.1 口径 20：从「无法复现」更正为「精确可复现」（本卡双测量独立复现）

**原表述**：见 §13 与报告 §3.2 更正块（本卡四种静态扫法 3/3/2/2、运行时 R=2，未得 20，登记为未清项）。

**更正后**：本卡新增**两条互不依赖的测量**，各自独立得到 **20，且名单逐件相同**：

```text
store 调用 = 0 的哨兵（口径 R） = 2  [sentinel-forecast-accuracy, sentinel-pricing-strategy]
queryNodes 方法调用 = 0（口径 Q） = 20  [agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, customer-demand-shift, data-health, explore-exploit-balance, human-agent-boundary, make-or-buy, moat-dependency, niche-breadth, niche-squeeze, opportunity-window, process-ai-readiness, resource-misallocation, routine-mutation, sentinel-forecast-accuracy, sentinel-pricing-strategy, strategy-capability-fit, value-capture]
无 FROM graph_nodes 取数（口径Q2） = 20  [agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, customer-demand-shift, data-health, explore-exploit-balance, human-agent-boundary, make-or-buy, moat-dependency, niche-breadth, niche-squeeze, opportunity-window, process-ai-readiness, resource-misallocation, routine-mutation, sentinel-forecast-accuracy, sentinel-pricing-strategy, strategy-capability-fit, value-capture]
Q 与 Q2 名单是否一致            = true
```

### 18.2 「缺 traversal 差 6 件」→ 逐件 7 出 / 1 进

**原表述**：差集名单列为 6 件（漏 `strategy-capability-fit`）。
**更正后**：7 出 / 1 进，净差 6；第 7 件机制已复核：

```bash
$ sed -n '44p' extensions/sentinels/strategy-capability-fit/aggregate.ts
```

```text
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }
```

### 18.3 「两点 diff 多出 2 个删除文件」→ 1 个 D + 1 个 M，且**伪影随 main 前进增长**

> **原表述（保留留痕，未抹除）** —— 以下是上一版 §17 的原文：
>
> ## 17. ⚠️ 「两点 diff 会看到 13 个文件」的澄清（防误判夹带）
>
> **现象**：`git diff --stat origin/main..HEAD`（**两点**）会额外列出两个**与 D966 无关**的文件：
>
> ```
>  .claude/task-briefs/2026-09-25-D964-ledger-row6.md |  30 -
>  docs/synova/coordination/审计发现台账-DSH-CTO.md   |   1 -
> ```
>
> **这不是本卡所为**，证据链（全部实跑）：
>
> ```bash
> $ git rev-parse origin/main            # 已从 ce231ff1 前进到 0f709900
> 0f7099005a62406fbfaa546bbb00117ba1bcc589
> $ git merge-base origin/main HEAD
> ce231ff1b1e419095117413badba8c6b55ae39fd          # ← 本卡 merge-base 正确
> $ git rev-list --count HEAD..origin/main
> 1                                                  # ← 本地落后 main 1 个提交
>
> # 这两个文件的引入提交（在 main 侧，非本卡分支）
> $ git log --oneline ce231ff1..origin/main -- .claude/task-briefs/2026-09-25-D964-ledger-row6.md
> 0f709900 docs(D964): 台账第六批（含 1 项升级创始人：误扫他人文件第2次） (#786)
> $ git log --oneline ce231ff1..origin/main -- docs/synova/coordination/审计发现台账-DSH-CTO.md
> 0f709900 docs(D964): 台账第六批（含 1 项升级创始人：误扫他人文件第2次） (#786)
>
> # 本卡 4 个提交中是否有删除动作
> $ git log --oneline --diff-filter=D origin/main..HEAD -- .claude/task-briefs/2026-09-25-D964-ledger-row6.md
> （空 → 本卡从未删除任何文件）
> ```

```bash
$ git rev-parse origin/main ; git merge-base origin/main HEAD ; git rev-list --count HEAD..origin/main
$ git diff --name-status origin/main..HEAD | head -5
$ git diff --name-only origin/main..HEAD | wc -l     # 两点（含伪影）
$ git diff --name-only origin/main...HEAD | wc -l    # 三点（正确口径）
```

```text
[origin/main]
ef2997466677324b94d7b2921a5b3de0b7ad57d3
[merge-base]
ce231ff1b1e419095117413badba8c6b55ae39fd
[behind]
2
[两点 diff 状态（前 5）]
M	.claude/bypass.log
D	.claude/task-briefs/2026-09-25-D945-preset-bundle-migration.md
D	.claude/task-briefs/2026-09-25-D964-ledger-row6.md
A	.claude/task-briefs/2026-09-25-D966-sentinel-idle-repro.md
M	.github/workflows/ci.yml
[两点文件数]
      27
[三点文件数（正确口径）]
      11
```

### 18.4 口径 Q / Q2 / R 的断面敏感性（数据在场与否两档）

```text
A  空库 + legacy          42    3      0     28    29    29    2    20   20    18/43     49      0           49      41          
A2 空库 + props-added     42    3      0     28    29    29    2    20   20    18/43     49      0           0       0           
B  3 边 + legacy         42    3      0     25    26    26    2    20   20    18/43     49      0           49      41          
C  4 边 + legacy         42    3      0     25    26    26    2    20   20    18/43     49      0           49      41          
D  3 边 + props-added    43    2      0     16    16    16    2    11   2     9/43      49      144         0       0           
E  4 边 + props-added    43    2      0     16    16    16    2    11   2     9/43      49      145         0       0           
F  3 边 + canonical      43    2      0     16    16    16    2    11   2     9/43      49      144         0       0           
G  4 边 + canonical      43    2      0     16    16    16    2    11   2     9/43      49      145         0       0
```
