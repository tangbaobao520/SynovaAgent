<!--
  SYNOVA-IMPL-DSH-D803: 线10 资本循环 V1 6/6（第一条 100% 线）— dev doc（规格先行）
  状态: dev doc 待 CTO 复核冻结 | 2026-09-17 | 优先级 P0（里程碑 M3 循环类样板）
  依据: 派单-D804-D803-DSH标准-20260917.md §三（DSH 标准派单模板八节，缺一退回）
        依据计划 v1.2@4e46603f（整体推进计划-主线-20260913.md）
        V1 分母唯一来源: docs/synova/project/26线-V1验收标准-草案v0.1-20260917.md §线10（6 条）
  红线: 不碰 scripts/audit/** ｜ 不改判分 scripts/product-lines/calc-progress.py ｜ 禁 --no-verify
  域: win（src/connectors / src/l4 / extensions/ 下哨兵与映射目录，Mac 代行按 D773）｜ 文件预算 ≤12
  流程: 本 doc → CTO 复核冻结 → 交编码会话（指令②同款流程）；冻结前不得动 src/**
-->

---
north-star:
  服务用户: 企业主（最终受益者）与 GA（直接用户）——企业主"钱够不够、烧钱速度是否失控"必须由系统持续盯着并主动告警，不能等他自己翻报表
  服务场景: 企业财务数据（ERP 标准导出）上传后，哨兵 7×24 定时/按需巡检现金流跑道与应收风险，异常自动产出到告警与证据
  模块终态: 线10 资本循环 V1 六条断言全绿（v1_passed == v1_total == 6），成为全库第一条 100% 线——每条结论可回溯证据（场景证据 JSON + K3 复核）
  对齐北星: .claude/PRODUCT-BRIEF.md §一/§三（"哨兵定时巡检→发现异常→严重信号自动建工单"；"它主动替企业干活"）
  完成标准: 入口 POST /api/data/upload（erp-standard 契约）→ 处理 Financial 节点 + cash-runway 阈值哨兵 → 结果 GS-03 场景 exit 0 且六条 V1 断言证据落盘，10-8 由 K3 复核转 verified
  当前进度: 线10 ledger v1_passed=1/6（仅 10-4 绿且新鲜）。代码链路（上传→节点→哨兵→阈值告警）经 D355/D356/D577/D462 已通且 GS-03 三断言绿（2026-09-16 证据）；缺口是①场景证据只记到 4-5/5-2/4-7、没记到线10 点位 ②读侧属性契约无测试锚（cashBalance↔cash 无回归守卫）③跑道计算残留两处字段语义缺陷（部分数据→误报 critical）④K3 复核未做
---

# D803: 线10 资本循环 V1 6/6（第一条 100% 线）

> 一句话问题: 线10 的**代码链路已经通了**（上传→Financial 节点→cash-runway 阈值告警，GS-03 三断言 2026-09-16 全绿），但 **ledger 里只有 1/6**——因为①证据映射错位（场景证据记到线4/线5 点位，线10 点位零证据）②属性契约只有写侧锚、读侧无契约测试（cashBalance↔cash 断裂可无声复发）③跑道计算还有两处"部分数据→误报 critical"的字段语义缺陷 ④K3 全链路复核（10-8，100% 门槛）未做。本卡把四件事补齐，产出第一条 100% 线。

## 一、Authority Doc Verification（权威文档核验）

**来源 1**: [派单-D804-D803-DSH标准-20260917.md §三](../../../synova/coordination/派单-D804-D803-DSH标准-20260917.md)（分支 `docs/dispatch-dsh-standard-20260917`，commit 5be30b43）

> "**目标**：`ledger.json` 中线10 `v1_passed == v1_total == 6`……S6 断言表覆盖：`10-1`(数据上传→节点) `10-2`(属性契约) `10-3`(manifest 挂载+阈值真实触发) `10-4`(现金流跑道计算) `10-6`(无数据不误报) `10-8`(K3 全链路复核)……**验收**：线10 6/6；反向（删一条证据 → 该断言回退 false）；`calc-progress.py` 零提交"

**来源 2**: [26线-V1验收标准-草案v0.1-20260917.md §线10](../../../synova/project/26线-V1验收标准-草案v0.1-20260917.md)（V1 分母唯一来源）

> "| 10-1 | ERP 财务数据上传 → Financial 节点 | GS-03 exit 0 | scenario | 断在进口 |
> | 10-2 | 属性契约对齐（cashBalance↔cash） | contract-check | test | 映射缺失 |
> | 10-3 | 哨兵 manifest 挂载、阈值真实触发 | GS-03 + 配置生效 | scenario | 硬编码/未挂载 |
> | 10-4 | 现金流跑道计算正确（filter bug 修复） | compute-cash-runway 测试 + GS-03 | test | 计算错 |
> | 10-6 | 无数据不误报 critical（降级诚实） | GS-03 负向用例 | scenario | 误报 |
> | 10-8 | 审计员全链路复核（100% 门槛） | K3 PASS | k3 | 复核不通过 |
> - V1 外（backlog）: 10-5 告警→工单→推送 / 10-7 报告含资本结论"

**来源 3**: [K3 全链路审计 20260813 §2.2](../../../synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md)（三重缺陷原始定罪 + 转绿路径）

> "①`compute-cash-runway-months.ts:60` 过滤器 bug……永不匹配；② 属性名与 erp-standard 不匹配（`cashBalance`≠`cash`）；③ 阈值告警死代码……若挂上 manifest，无数据时 compute degraded value=0 ≤ critical 6 → **误报 critical**"

**来源 4**: [product-lines.yaml L459-511](../../../synova/product-lines/product-lines.yaml) 线10 定义（8 点，V1 取 6 点；10-5/10-7 为 V1 外 backlog）+ [PRODUCT-BRIEF §一/§三](../../.claude/PRODUCT-BRIEF.md)。

**来源 5（先例任务，全部 task-state audited）**: D355（L4 契约收敛——写侧锚本体 schema snake_case 方向，读侧对齐）、D356（P0-1 manifest 挂载 + P1-1 降级误报短路）、D577（阈值配置真实挂载 memStore 覆写闭环，7-2/8-1/10-3）、D462（sqlite v12/Node24 解锁 GS-03 服务器启动）、D589（线10 重验留证）。

## 二、S1 价值与入口

| 项 | 内容 |
|---|---|
| 谁 | 企业主看告警（钱还能烧几个月）；GA 用诊断报告里的资本结论 |
| 什么场景 | 企业把 ERP 标准导出（erp-standard 契约 14 字段）上传 → 系统写入本体 Financial 节点 → cash-runway P0 哨兵按 manifest 阈值巡检 → 低现金/应收逾期自动产 critical 告警，数据不完整时诚实降级不误报 |
| 触发什么 | 入口① `POST /api/data/upload`（`src/routes/data.ts L16`，erp-standard 映射）；入口② `POST /api/sentinel/run/cash-runway`（手动/场景）+ manifest cron `0 9 * * *`（extensions/sentinels/cash-runway/manifest.json ，K3 L2 实测 PASS） |
| 预期可观测结果 | `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` exit 0；`scripts/golden-scenarios/evidence/GS-03-<date>.json` 的 verdicts 覆盖 10-1/10-3/10-6（record_type=scenario）；A2 机器证据覆盖 10-2/10-4（record_type=test）；K3 复核后 10-8 → verified；`docs/synova/project/ledger.json` 线10 `v1_passed == v1_total == 6` |
| 不做的后果 | 第一条 100% 线立不起来；已修好的链路因证据错位被仪表盘判"没做过"（uncommitted），且属性契约无回归守卫，下一次改动可能无声回到 cashBalance 断裂 |

## 三、S2 契约

### 3.1 逐字段属性契约映射表（S2 特有要求：一行一字段 + 来源 + 缺失行为）

**写侧单一事实源**: extensions/ontology/field-mappings/erp-standard.json （14 字段，targetNodeType=Financial）→ 契约锚 = extensions/ontology/outcome/financial.json 的 optionalProps（22 个 snake_case 属性；D355 定方向：**写侧锚本体 schema，读侧向 schema 对齐**——l4-contract.test.ts 头注记录了推翻 D355 初版 camelCase 方向的修正）。**消费方读名为 2026-09-17 逐文件 grep/read 实测**（非凭文档推断）。

| # | 外部字段 | 写侧 prop | 本体 schema 锚 | 消费方读名（实测 file:line） | 对齐判定 | 缺失行为（用户可见信号） |
|---|---|---|---|---|---|---|
| 1 | 现金余额 | `cash` | optionalProps.cash:number | cash-runway compute 回退分支 `props.cash`（compute-cash-runway-months.ts:62）、compute-receivable-overdue-rate.ts:48 | ✅ 对齐（K3 断裂②已修） | 现金+费用全缺 → degraded warning「现金流数据不完整」（aggregate.ts:34-41）；**仅现金缺而费用在 → 现状误报 critical「跑道0.0个月」（见 S4 行2，本卡切片③修）** |
| 2 | 营业费用 | `operating_expense` | optionalProps.operating_expense:number | compute-cash-runway-months.ts:63 `props.operating_expense \|\| props.amount`；margin-health aggregate.ts:94；capital-health aggregate.ts:126 | ✅ 对齐（`amount` 为遗留别名，本卡不清） | burn=0 且 cash>0 → runway=Infinity「充足」不告警 + >60 月验证提示（compute:83-85） |
| 3 | 营业收入 | `total_revenue` | optionalProps.total_revenue:number | revenue-health aggregate.ts:28/43（遍历分支 `\|\| total_revenue`）；margin-health:92；capital-health:119；**cash-runway 遍历分支把它当现金用（compute-cash-runway-months.ts:50 `cash_balance \|\| total_revenue`——语义错位，切片③修）** | ⚠️ 部分错位（遍历分支挪用为现金） | revenue-health 回退分支见 #16 行；margin/capital 缺省按 0 参与指标 |
| 4 | 经营现金流 | `operating_cashflow` | optionalProps.operating_cashflow:number | capital-health aggregate.ts:125（无条件 `Number() \|\| 0`） | ✅ 对齐 | 缺省=0 参与资本指标（findings evidence 中可见 0 值） |
| 5 | 总负债 | `total_debt` | optionalProps.total_debt:number | capital-health:123 | ✅ 对齐 | 缺省=0（WACC/杠杆指标按 0 计） |
| 6 | 所有者权益 | `equity` | optionalProps.equity:number | capital-health:124 | ✅ 对齐 | 缺省=0（ROIC 分母失真，evidence 可见） |
| 7 | 毛利润 | `gross_margin` | optionalProps.gross_margin:number | margin-health:93；capital-health:120（hasValue 守卫） | ✅ 对齐 | capital-health:137-140 实测：缺 → `log.warn('gross_margin 缺失…跳过 spread 指标')` 且跳过 ROIC/WACC——显式不静默 |
| 8 | 固定资产净值 | `net_ppe` | optionalProps.net_ppe:number | 线10 V1 范围四个资本哨兵（cash-runway/revenue-health/margin-health/capital-health）无消费方（实测 grep） | ✅ 写入即合法（schema 收纳） | 无消费 → 不影响任何告警 |
| 9 | 总资产 | `total_assets` | optionalProps.total_assets:number | capital-health:121 | ✅ 对齐 | 缺省=0 |
| 10 | 流动资产 | `current_assets` | optionalProps.current_assets:number | capital-health:122（hasValue 守卫） | ✅ 对齐 | 缺 → undefined，相关流动比率指标跳过 |
| 11 | 流动负债 | `current_liabilities` | optionalProps.current_liabilities:number | 线10 V1 范围四个资本哨兵无消费方（实测） | ✅ 写入即合法 | 无消费 → 不影响任何告警 |
| 12 | 应收账款 | `receivables` | optionalProps.receivables:number | compute-receivable-overdue-rate.ts:49 回退分支 `props.receivables`；capital-health:131（hasValue） | ✅ 对齐（遍历分支别名 `accounts_receivable` :37 切片③对齐） | receivable 缺 → 逾期率 0 不告警（无害）；**cash 缺而 receivable 在 → 现状 rate=Infinity 误报 critical（同 S4 行2，切片③修）** |
| 13 | 存货 | `inventory` | optionalProps.inventory:number | capital-health:130（hasValue） | ✅ 对齐 | 缺 → undefined，存货周转类指标跳过 |
| 14 | 期间 | `period` | requiredProps.period | ingest 强制消费（data-ingest-service.ts:203-208）：period 进 `props.period` + `standardKey` 去重键 | ✅ 对齐 | 缺失/非法 → 行级拒绝，upload 响应可见（HTTP 4xx 带 error） |
| 15 | （ingest 生成）financialType | `financialType` = mapping.name = `'erp-standard'` | 非 schema 属性（ingest 生成，data-ingest-service.ts:164） | revenue-health:37 回退分支**硬编码 `=== 'revenue'`**——上传数据永远不等于 'revenue' → 判空 | ❌ 断裂（切片②修：对齐其自有遍历分支 :28 的 `\|\| total_revenue` 条件） | 判空 → 「无收入数据」info 日志后 return []（**静默无告警**，切片②消除断裂条件；teamId 过滤缺口见 S4 行9 债登记） |
| 16 | （ingest 生成）standardKey / pii_scrubbed | `standardKey`、`pii_scrubbed` | 非 schema 属性（ingest 生成 :208 / :191） | 无哨兵消费（幂等去重/PII 标记用） | ✅ 基建属性 | 不适用 |
| 17 | （缺失）teamId | **ingest 不写 props.teamId**（实测 data-ingest-service.ts 全文） | — | revenue-health:36 / margin-health:64 / capital-health:92 `queryNodes('Financial', { teamId })` 按 `json_extract(props,'$.teamId')` 过滤（sqlite-graph-store.ts:204-208）→ **上传数据永远查空** | ❌ 结构缺口（**V1 不修**，见 S4 行9：只有 cash-runway 无过滤回退分支能吃到数据） | 三个哨兵对上传数据静默判空（多租户债，登记不动） |

### 3.2 新增/改动接口契约（铁律 47，三态 @idempotent 0/1/2 = 幂等/首效/需重置）

**A. `computeCashRunwayMonths`（compute-cash-runway-months.ts，切片③修改）**
- @input: `store: GraphStoreReader` + `{ teamId: string, traversal?: GraphTraversal }`（不变）
- @output 正常: `{ value: number月数, unit:'个月', confidence:'high', evidence:['总现金: N','月消耗: N'], degraded:false }`（不变）
- @output 降级（新增第 2 类触发条件）: 现金字段**属性不存在**（区别于值为 0）而月消耗>0 → `degraded:true, warnings:['现金字段缺失 — 无法计算跑道']`，不再产出 runway=0
- @error: 内部 catch → degraded finding（现状保留，不抛出）
- @idempotent: 2（同输入同输出，纯函数；computedAt 时间戳除外）
- 字段选择收敛: 现金链 `cash_balance || cash`（**删除 `|| total_revenue` 挪用**）；消耗链 `monthly_burn || operating_expense || total_cost`

**B. `computeReceivableOverdueRate`（同款）**: 应收>0 而现金属性缺失 → `degraded:true`（现状 rate=Infinity 误报 critical，切片③修）；应收链遍历分支 `accounts_receivable || receivables` 对齐。

**C. GS-03 `expect.json`（切片④修改，schema 不变——gss-common.test.ts 校验继续适用）**
- 新增断言（须带 purpose，防恒真）: `financial-node-created`（sqlite: `graph_nodes` type='Financial' 计数 ≥1 且 `json_extract(props,'$.cash')`=30000 → 10-1 物证）；`no-data-degraded-warning`（空库运行响应 contains「现金流数据不完整」）；`no-data-no-critical`（空库运行响应 notContains「现金流危急」）
- evidence_map 扩展: `10-1 ← [erp-upload-ok, financial-node-created]`、`10-3 ← [cash-runway-critical-triggered, threshold-provenance]`、`10-6 ← [no-data-degraded-warning, no-data-no-critical, no-false-critical-zero-runway]`（既有 4-5/5-2/4-7 映射保留，一线两点共存合法——evidence_map 是数组可多映射）
- 断言总数 3 → ≥6（满足 assert.ts「≥3 条：正常+降级+负向」且正负两相位齐备）

**D. GS-03 `run.sh`（切片④修改）**: 负向相位前插——bootstrap 后**先**在空库上 `POST /api/sentinel/run/cash-runway`（响应存 `run-response-empty.json`）再上传注入（顺序调换，正相位行为不变）。@exit 语义不变（0 全过/1 断言 fail/2 环境）；@idempotent: 2（fresh-db 每次全新，同日重跑覆盖同日证据）。

**E. 判定与证据契约（不改 calc-progress.py，只喂它的输入）**
- scenario 证据: assert.ts 按 evidence_map 写 `verdicts:[{acceptance_point:"10-1"…}]`（record_type=scenario）→ calc-progress 消费（实测 calc-progress.py:261-271 点位索引逻辑）
- test 证据: product-lines.yaml 10-2 evidence 数组追加 `test:l4-contract` 绑定 → run-machine-evidence.sh（A2）套件定位 → evidence-writer 写 record_type=test 证据（实测 run-machine-evidence.sh:50-105 套件匹配逻辑；list-test-points.py 当前输出含 10-4 不含 10-2，绑定后即含）
- 10-8: K3 定向审计 → parse-k3-report.py 解析 → redeem-progress.py 回填；**线 100% 门槛 = verified==6 且存在 record_type=k3、acceptance_point="line:10"、verdict=pass 的线级复核记录，否则进度封顶 99**（实测 calc-progress.py:34 注释契约）

## 四、S3 数据流图（端到端，每步标失败分支）

```
[ERP 导出行] ──POST /api/data/upload──▶ src/routes/data.ts L16
   │ 失败F1: mapping 缺失/rows 空 → 400（用户可见 HTTP error）
   │ 失败F2: PII S4 命中 → 422 拒写（data.ts PII 预检）
   ▼
erp-standard 映射（extensions/ontology/field-mappings/erp-standard.json, 14 字段）
   │ 失败F3: 期间非法 → 行级拒绝（响应可见）
   ▼
ingestBatch（src/agent/data-ingest-service.ts L164-212）→ Financial 节点（graph='default', snake_case props）
   │ 失败F4: GraphStore 不可用 → 503
   ▼
[Financial 节点落库 sqlite graph_nodes] ◀── GS-03 断言 financial-node-created（10-1 物证）
   ▼
POST /api/sentinel/run/cash-runway → SentinelRunner → sentinel-loader 包装器
   ├─ manifest 挂载（sentinel-loader.ts:210-212 `sentinelObj.manifest = manifest`，D356/D577 已接）
   │    失败F5: 挂载回归 → this.manifest=null → 阈值与降级 finding 全部消失 → GS-03 负向相位必红（切片①守卫）
   ├─ 阈值解析（loader:141-183）: manifest 基线 + memStore 覆写（非法覆写 → warn + 回退基线）
   │    失败F6: 阈值配置非法 → 显式 log + 回退 manifest 基线（用户可见日志，禁静默）
   ▼
aggregate.check（extensions/sentinels/cash-runway/aggregate.ts L15）
   ├─ computes 并行: runway / overdue / constraint / replenish
   │    失败F7: 无数据 → degraded:true → warning「现金流数据不完整」（:34-41，P1-1 修）
   │    失败F8: 部分字段缺失（现金属性不存在而消耗>0）→ 现状误报 critical 0.0 → 切片③改 degraded（S4 行2）
   ├─ 阈值门: runway ≤ critical 6 → critical「现金流危急—跑道X个月」；≤ warning 12 → warning
   │    10-3 物证: 描述含「低于critical阈值6个月」← 值来自 manifest.thresholds（配置生效证明）
   ▼
[SentinelFinding[]] → 响应/内存 records（findings 落库为 V1 外 10-5 范围，不展开）
   ▼
GS-03 assert.ts → scripts/golden-scenarios/evidence/GS-03-<date>.json（record_type=scenario, verdicts→10-1/10-3/10-6）
   │ 失败F9: 断言 fail/error → exit 1（业务阻断）；expect 非法/IO → exit 2（fail-closed）
   ▼
vitest（l4-contract 读侧契约 + cash-runway compute 测试）→ A2 run-machine-evidence → evidence-writer（record_type=test, verdicts→10-2/10-4）
   ▼
refresh-all.sh（A2→A3.5→A4 calc-progress→A5 页面）→ product-progress.json / ledger.json
   │ 失败F10: 证据 >14 天或 modules 被触碰 → stale（TTL+惰性失效，诚实降级，重跑即恢复）
   ▼
K3 定向审计（10-8）→ parse-k3-report + redeem-progress 回填 → 线10 verified==6 + line:10 线级复核 pass → 100% 解锁
```

## 五、S4 失败模式表（≥6 条：行为 + 降级动作 + 用户可见信号，禁静默）

| # | 失败模式 | 行为 | 降级动作 | 用户可见信号 | 现状与本卡动作 |
|---|---|---|---|---|---|
| 1 | 无数据（空库/未上传） | compute hasData=false → degraded:true | aggregate 短路发 warning finding，不穿阈值门 | finding「现金流数据不完整」+ 证据 warnings | ✅ 已修（aggregate.ts:34-41 P1-1）；本卡切片④把它变成 GS-03 空库相位断言（10-6 证据化） |
| 2 | 部分字段缺失（现金属性不存在而月消耗>0） | runway = 0/burn = 0 → 命中 critical 6 → **误报「跑道0.0个月」**（cash=0 真没钱与 cash 属性缺失未区分）；同构：overdue rate=Infinity 误报「应收逾期严重」 | 切片③：按**属性存在性**守卫——现金属性全缺 → degraded warning（值=0 照常计算，0 是合法值） | 降级 warning「现金字段缺失」，不产假 critical | ❌ 现状误报路径真实存在（compute:62-63+80 实测推演）；切片③修 + L1 用例 + GS-03 部分字段负向断言 |
| 3 | 币种不一致 | erp-standard v1 **无币种字段**（实测 14 映射无一声明币种）——系统层不可检测 | V1 显式单币种契约：金额一律记账本位币（CNY）；含外币新来源必须先扩 mapping（新增 currency 字段 + 换算约定）才能过 contract-check | 模板级声明（mapping 文件即契约）；不假装能检测 | 本卡以契约声明 + l4-contract schema 锁定处置；检测能力记 V2 backlog（诚实不做假守卫） |
| 4 | 快照过期 | 证据 >14 天 TTL（calc-progress.py:67）或证据日期后线10 modules 有 git 变更（:33 A1 惰性失效）→ 状态 stale，绿不继承 | 机械重跑：`bash scripts/product-lines/rerun-evidence.sh`（D774 一键重跑 + refresh-all 前后对照） | 仪表盘六态 stale 🟡 + expiry 清单 | ✅ 机制已有（rerun-evidence.sh 实测在库）；完成标准含「次日跨天重跑一次」防同日 stale（派单 §六） |
| 5 | manifest 未挂载（K3 P0-1 回归） | `this.manifest=null` → 阈值告警与降级 finding 全部消失 → findings 恒空（静默死代码复发） | 切片①守卫：GS-03 空库相位断言 `no-data-degraded-warning`——降级 warning 只有挂载才产 → 挂载回归必红 | GS-03 exit 1 + 断言 fail 明细 | 挂载本体 ✅ 已修（sentinel-loader.ts:210-212 实测）；**回归守卫缺失是本卡新增**（反向验证：注释 ：211 → GS-03 必红） |
| 6 | 阈值配置非法（manifest 值非数/非有限；memStore 覆写非法） | loader:164 校验 `typeof number && Number.isFinite`（载入侧）；覆写侧 :166-169 同款校验，非法 → `log.warn('memStore 阈值非法 — 忽略覆写，使用 manifest 基线')` | 回退 manifest 基线阈值继续巡检（不崩、不静默） | 显式 warn 日志 + 覆写未生效（overrideApplied=false） | ✅ 已有（loader 实测）；本卡 10-3 断言 `threshold-provenance`（响应含「critical阈值6个月」）同时守"配置真实生效"侧 |
| 7 | 上传请求非法（mapping 缺/rows 空/PII S4 命中/期间非法） | 行级/请求级拒绝 | HTTP 400/422 + error 文案；不写半截节点 | upload-response.json 可见 error（GS-03 注入响应打印） | ✅ 已有（data.ts 实测）；GS-03 正相位断言 erp-upload-ok 隐含覆盖 |
| 8 | 服务未起/bootstrap 超时 | GS-03 run.sh 轮询 bootstrap-state.json 120s 超时 → exit 2 | 临时目录清理（trap cleanup）+ 日志尾打印 | run.sh 输出「bootstrap 超时」+ 日志尾 | ✅ 已有（D462 修复链实测在库，run.sh:60-64） |
| 9 | 多租户 teamId 过滤缺口（债，V1 不修） | ingest 不写 props.teamId → 三个哨兵 `{teamId}` 过滤查空 → 上传数据对它们静默不可见 | **不降级不误报，登记为已知债**：V1 = 单组织单图（graph='default' 即隔离边界）；多租户 props 契约属线4 数据接入 V2 | 本 dev doc 债登记 + What We Don't Do 显式排除 | ❌ 实测确认（data-ingest-service.ts 全文无 teamId；sqlite-graph-store.ts:204 json_extract 过滤）；**显式登记，禁止编码会话顺手修**（跨线写侧契约，须独立任务） |

## 六、S5 切片计划（5 片，每片独立提交 + 独立断言 + 独立回滚；禁止一 commit 混多片）

> 派单切片建议①"manifest 挂载"经实测**已存在**（D356/D577 已接、K3 D577 审计 audited、loader:210-212 今天可 grep）——切片①按诚实现状改为"挂载**回归守卫**+阈值来源证明"，不是重复修。②③构成 red→green 对：先写契约测试（红）再修读侧（绿）。

**切片①（10-3）manifest 挂载回归守卫 + 阈值来源证明**
- 改: `scripts/golden-scenarios/GS-03-capital-cycle/expect.json`（+`threshold-provenance` 断言：正相位响应 contains「低于critical阈值6个月」← 值 6 来自 manifest.thresholds 而非硬编码；evidence_map +`10-3`）
- 断言: `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` exit 0 且证据含 10-3 pass；反向：注释 sentinel-loader.ts:211 挂载行 → 10-3 与切片④负向断言必红（跑完还原）
- 回滚: revert 该 commit（单文件 expect.json，无代码依赖）

**切片②（10-2）读侧属性契约测试——先红**
- 改: `tests/contract/l4-contract.test.ts`（新增 describe：**读侧消费契约**——四个资本哨兵源码读名 ⊆ erp-standard mapping props ∪ ingest 生成属性 {financialType, period, standardKey, pii_scrubbed} ∪ hasValue 守卫的可选集；对 :37 `financialType==='revenue'`（值域只可能是 'erp-standard'）与 compute-cash-runway-months.ts:50 `|| total_revenue` 当现金用各有一条针对性断言）+ extensions/sentinels/revenue-health/aggregate.ts L37（回退分支条件对齐其自有遍历分支 `n.props.financialType === 'revenue' || n.props.total_revenue != null`）+ `tests/sentinels/revenue-health.test.ts`（回退分支用例）
- 断言: 修复前新 describe 红（S-5）；修复后 `node_modules/.bin/vitest run tests/contract/l4-contract.test.ts tests/sentinels/revenue-health.test.ts` 全绿
- 回滚: revert（测试文件 + 一行条件，互不依赖他片）

**切片③（10-4 加固）跑道计算字段语义修复——后绿**
- 改: extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts （现金链 `cash_balance||cash` 删 `|| total_revenue` 挪用；消耗链 `monthly_burn||operating_expense||total_cost`；新增现金属性存在性守卫→degraded，值 0 仍合法走公式）+ extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate.ts （遍历分支 `accounts_receivable||receivables`；cash 缺失而 receivable>0 → degraded）+ `tests/sentinels/cash-runway/compute-cash-runway-months.test.ts` / `compute-receivable-overdue-rate.test.ts`（新增用例：部分缺失不误报 critical / cash 显式 0 仍 critical / 遍历分支字段链）
- 断言: 切片②契约 describe 转绿（red→green 闭合）；`node_modules/.bin/vitest run tests/sentinels/cash-runway/` 全绿；GS-03 正相位仍绿（cash=30000 在，行为不变）；GS-05 回归绿（GS-05-alert-closure 复用 cash-runway，注入数据含 cash）
- 回滚: revert（compute 两文件 + 两测试文件一个 commit；10-4 已绿证据不受影响——测试套件名不变，A2 绑定不动）
- finding.id 纪律: 复用既有 `cr_runway_degraded` 稳定 ID（不新增 ID，finding-id-stability.test.ts 对 44 aggregate 双跑稳定断言不破）

**切片④（10-1 + 10-6）GS-03 负向相位 + 线10 证据落点**
- 改: `scripts/golden-scenarios/GS-03-capital-cycle/run.sh`（bootstrap 后先空库 run → `run-response-empty.json`，再上传→正相位不变）+ `expect.json`（+`financial-node-created`（sqlite 物证）/`no-data-degraded-warning`/`no-data-no-critical` 三断言；evidence_map +`10-1`、+`10-6`）
- 断言: run.sh exit 0；`GS-03-<date>.json` verdicts 同日含 10-1/10-3/10-6（scenario）；反向：删证据文件里任一 verdict → refresh 后该点回退 false（派单验收第 2 条，CTO 抽查口径）
- 回滚: revert（run.sh+expect.json 同 commit 成对回滚；若 CI 环境负向相位不稳定，整片回退不影响①②③）

**切片⑤（10-2 证据 + 10-8 准备）证据绑定与 K3 复核准备**
- 改: `docs/synova/product-lines/product-lines.yaml`（仅 10-2 evidence 数组追加 `test:l4-contract` 绑定——不动 status 种子、不动其他线；**不改 calc-progress.py**）
- 断言: `python3 scripts/product-lines/list-test-points.py` 输出含 10-2；A2 跑出 record_type=test 证据含 acceptance_point 10-2；10-4 证据链不回退
- K3 复核准备（10-8，本片只备料不执行）: 按 gen-k3-task.py 生成线10 定向复核任务清单——六点逐点附复跑命令（上表）+ 证据路径 + quote 摘要；明确 K3 须同时产**点级 verdicts（10-1…10-8）与线级复核（acceptance_point="line:10", verdict=pass）**，否则 100% 封顶 99（calc-progress.py:34 契约）；K3 执行与本卡解耦（禁自我审计）
- 回滚: revert yaml 行（10-2 回 uncommitted——诚实回退，无残留）

## 七、S6 验收断言表（Test Requirements）

**V1 六断言逐条绑定（verify 命令均可独立复跑；证据路径 = calc-progress 消费源）：**

| 断言 ID | 判定式 | verify（命令/场景） | 证据类型 | fail_when | 本卡动作 |
|---|---|---|---|---|---|
| 10-1 | ERP 上传 → Financial 节点 | `bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh` exit 0 且证据 verdicts 含 `10-1: pass`（erp-upload-ok + financial-node-created 物证） | scenario | 断在进口 | 切片④ |
| 10-2 | 属性契约对齐（cashBalance↔cash） | `node_modules/.bin/vitest run tests/contract/l4-contract.test.ts` 绿（读侧契约 describe）+ yaml 绑定 `test:l4-contract` → A2 证据含 `10-2: pass` | test | 映射缺失 | 切片②+⑤ |
| 10-3 | manifest 挂载、阈值真实触发 | GS-03 绿且 `cash-runway-critical-triggered` + `threshold-provenance` 双断言 pass → `10-3: pass` | scenario | 硬编码/未挂载 | 切片① |
| 10-4 | 现金流跑道计算正确（filter bug 修复） | `node_modules/.bin/vitest run tests/sentinels/cash-runway/` 绿（既有绑定 `test:compute-cash-runway`）+ GS-03 绿 | test | 计算错 | 切片③加固，保持已绿不回退 |
| 10-6 | 无数据不误报 critical（降级诚实） | GS-03 负向相位：`no-data-degraded-warning` + `no-data-no-critical` + `no-false-critical-zero-runway` → `10-6: pass` | scenario | 误报 | 切片④（含切片③部分字段守卫） |
| 10-8 | 审计员全链路复核（100% 门槛） | K3 定向审计报告 verdicts：10-1…10-8 点级 pass + `line:10` 线级复核 pass → parse-k3-report + redeem-progress 回填 → 线10 verified==6 | k3 | 复核不通过 | 切片⑤备料，K3 执行 |

**测试分层（铁律 48：每 compute 正常/降级/边界三路径；S-5：red 必须覆盖失败模式非仅 happy path）：**

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| L1 单元契约 | `tests/sentinels/cash-runway/compute-*.test.ts` 扩展 | 新增 ≥6 用例 | 部分字段缺失不误报 critical（S4 行2 red→green）；cash 显式 0 → 仍 critical（0 是合法值边界）；遍历分支现金链/消耗链字段选择；overdue cash 缺失 degraded；runway=Infinity 边界（burn=0, cash>0） |
| L2a 接线 | `tests/contract/l4-contract.test.ts` 扩展 + `tests/sentinel/sentinel-threshold-wiring.test.ts` 回归 | 新增 ≥3 断言 | 读侧消费名 ⊆ 写侧 mapping（四哨兵全量）；financialType 值域断裂断言；manifest 挂载既有回归不破 |
| L2b 降级 | GS-03 负向相位（场景级） | 3 断言 | 空库 degraded warning 可见 + 零 critical；部分字段缺失负向 |
| L2c 边界/回归 | 既有套件回归 | 全量绿 | threshold-wiring / finding-id-stability / gss-common（expect schema）/ GS-05-alert-closure（同哨兵消费方）/ 全量 vitest 零新增失败 |

**反向验证（派单 §五.3"反向必红"，CTO 抽查口径）：**
1. 注释 `sentinel-loader.ts:211` 挂载行 → GS-03 负向相位 `no-data-degraded-warning` 必红（守 S4 行5）
2. `erp-standard.json` `cash`→`cashBalance` → l4-contract 读侧契约必红 + GS-03 critical 必红（守 10-2，K3 断裂②复现指纹）
3. compute 现金链加回 `|| total_revenue` → L1 用例必红（守 10-4）
4. 删 `GS-03-<date>.json` 任一 verdict → refresh 后该验收点回退 false（守证据链，派单验收第 2 条）

## 八、S7 幂等与可观测 + Wiring Verification（接线验证——铁律 4）

**幂等（@idempotent 语义见 S2.2）**
- GS-03: fresh-db 临时库每跑全新，同日重跑覆盖同日证据文件（assert.ts --out 同名覆盖）；临时资源 trap 清理（run.sh:38-47 实测）
- A2 机器证据: 同日同源同结论去重（run-machine-evidence.sh:117-134 实测）；rerun-evidence.sh 全量编排防双写
- compute: 纯函数同输入同输出（computedAt 除外）；finding.id 内容稳定键（finding-id-stability 全量守卫）

**日志与计数**
- 每个 catch 有 log + degraded（aggregate.ts:100-104 cr-error 路径实测合规，铁律 24/31）
- 阈值覆写生效/非法均有 log（loader:168/171）；gross_margin 缺失跳过有 warn（capital-health:138）

**证据落盘路径**
- 场景: `scripts/golden-scenarios/evidence/GS-03-<date>.json`（record_type=scenario）
- 测试: `docs/synova/product-lines/evidence/test-<date>*.json`（record_type=test）
- 汇总: `docs/synova/product-lines/product-progress.json` + `docs/synova/project/ledger.json`（gen-project-board.py 生成，D795 在途——本卡只喂证据不改生成器）

**Wiring Verification（生产调用点——全部 grep 实测，测试调用不计）**

| 新增/改动能力 | 生产调用链（谁 import → 谁调用 → 结果在哪呈现） | 实测证据 |
|---|---|---|
| 上传→Financial | HTTP POST /api/data/upload（`src/routes/data.ts L16`）→ loadFieldMapping + ingestBatch（src/agent/data-ingest-service.ts ）→ GraphStore.createNode → sqlite graph_nodes | 路由挂载于 server.ts；GS-03 正相位真实走通（2026-09-16 证据 erp-upload-ok pass） |
| 哨兵触发→阈值告警 | routes POST /api/sentinel/run/:name → SentinelRunner → sentinel-loader 包装器（`:286` check 调用 + `:210-212` manifest 挂载）→ aggregate.check → findings HTTP 响应 | GS-03 正相位 cash-runway-critical-triggered pass（响应含「现金流危急」） |
| cron 定时 | manifest.schedule `0 9 * * *` → runner listCronSentinels → CronScheduler 注册 | K3 审计 L2 PASS 原文（§2.2 表） |
| 契约测试→证据 | product-lines.yaml `test:l4-contract` → list-test-points → run-machine-evidence（A2）→ evidence-writer → calc-progress | run-machine-evidence.sh:50-105 套件定位逻辑实测；A2 链路既有（10-4 同链已产证据 12 份） |
| 场景证据→点位 | assert.ts evidence_map → verdicts[].acceptance_point → calc-progress.py:261 点位索引 | GS-03-2026-09-16.json 实测 verdicts 结构（4-5/5-2/4-7 pass） |
| 完成门禁 | 编码会话完成后 `grep -rn` 新增符号在上述生产链有调用方；零结果 = 未完成（铁律 0-2 Step 5 WIRE CHECK） | 本卡新增符号仅测试内断言与 expect 断言 ID，生产行为全部复用既有接线——这是"接线已通、补证据与守卫"类任务的天然属性，WIRE CHECK 口径 = 上述五条链复跑通过 |

## 九、S8 回滚方案（版本回退 / 特性开关）

1. **版本回退**: 五切片各自独立 commit（每片一个写集闭包），任一片可独立 `git revert`——依赖顺序 ②→③（契约测试先红后绿）、①④⑤互相独立；revert 切片③须连同其测试同 revert（同 commit 内）。
2. **特性开关（负向相位）**: 切片④若在某环境不稳定（如 sqlite 扩展差异），整片回退——run.sh 恢复单相位 + expect.json 恢复三断言，两文件同 commit 成对回滚；①②③⑤不受影响。
3. **证据回退即诚实回退**: revert yaml 绑定 → 10-2 回 uncommitted；删场景证据 verdict → 点位回退 false——证据链没有"隐藏开关"，回滚状态对仪表盘可见（派单验收第 2 条反向口径的正向利用）。
4. **红线自证**: 本卡写集零 scripts/audit/ 触碰、零 `calc-progress.py`（完成报告附 `git log --stat` 证明）；禁 `--no-verify`。
5. **最坏情况**: 六点中任一点复核不过 → 该点如实 failed/rejected，线10 不够 100%——**禁止为凑 6/6 放宽断言或改判分**（进度封顶 99 机制就是防这个）。

## 十、实现方案写集

### 10.1 写集 (10 修改 + 0 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| scripts/golden-scenarios/GS-03-capital-cycle/run.sh | 修改 | 切片④：bootstrap 后先空库跑哨兵（run-response-empty.json）再上传（负向相位前插，正相位不变） |
| scripts/golden-scenarios/GS-03-capital-cycle/expect.json | 修改 | 切片①④：+threshold-provenance / financial-node-created / no-data-degraded-warning / no-data-no-critical；evidence_map +10-1/10-3/10-6 |
| extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts | 修改 | 切片③：现金链删 total_revenue 挪用；现金属性存在性守卫→degraded；消耗链补 operating_expense |
| extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate.ts | 修改 | 切片③：遍历分支 accounts_receivable||receivables 对齐；cash 缺失而应收>0 → degraded |
| extensions/sentinels/revenue-health/aggregate.ts | 修改 | 切片②：回退分支 financialType==='revenue' 断裂条件对齐遍历分支（\|\| total_revenue） |
| tests/sentinels/cash-runway/compute-cash-runway-months.test.ts | 修改 | 切片③：部分缺失/显式0/字段链 ≥4 用例（red 先行对齐切片②契约） |
| tests/sentinels/cash-runway/compute-receivable-overdue-rate.test.ts | 修改 | 切片③：cash 缺失 degraded + 别名对齐用例 |
| tests/sentinels/revenue-health.test.ts | 修改 | 切片②：回退分支 total_revenue 命中用例 |
| tests/contract/l4-contract.test.ts | 修改 | 切片②：新增读侧消费契约 describe（四哨兵读名 ⊆ mapping ∪ ingest 生成集；两条断裂针对性断言） |
| docs/synova/product-lines/product-lines.yaml | 修改 | 切片⑤：仅 10-2 evidence 数组追加 test:l4-contract 绑定（不动 status/其他线/calc-progress.py） |

> 共享资源标注（S-8）: `tests/contract/l4-contract.test.ts` 是 D355 建立的写读契约锚文件，本卡只**追加** describe 不改既有断言；`product-lines.yaml` 为 26 线共享真相源，本卡只动线10 的 10-2 一行 evidence；`GS-03` 场景被 D774 rerun 流水线消费——expect.json 结构变更须过 gss-common.test.ts schema 校验（L2c 回归已列）。与在途 D795（gen-project-board/ledger 生成器）零文件交集。

### 10.2 不做的事（显式排除——Q2 排除项含文件路径）

| 不做 | 文件/路径 | 原因 |
|---|---|---|
| 不改判分逻辑 | scripts/product-lines/calc-progress.py | 派单红线；只喂证据 |
| 不碰审计域 | scripts/audit/** | K3 专属红线 |
| 不修多租户 teamId 契约 | src/agent/data-ingest-service.ts （写侧加 teamId） | 跨线写侧契约变更（线4 数据接入 V2 域）；S4 行9 已登记债，修=越权 |
| 不接 findings 落库/工单推送 | src/routes/sentinel.ts 、sentinel_tickets 链路 | 10-5 是 V1 外 backlog（V1 验收标准原文），本卡不扩 |
| 不做报告一页纸资本结论 | GS-08 相关 | 10-7 是 V1 外 backlog |
| 不清 cash-flow-sentinel 死适配器 | src/sentinel/adapters/cash-flow-sentinel.ts （type='FINANCIAL' 零写入方、未注册 builtins 实测） | 铁律 37 债但非线10 V1 断言域，独立任务处置（登记） |
| 不做币种检测 | erp-standard.json 加字段 | V1 单币种契约声明（S4 行3），检测能力 V2 |
| 不新增哨兵/不新增 finding.id | extensions/sentinels/ 下其余目录（除写集两文件外） | 防范围膨胀；finding-id-stability 全量守卫不可破 |

## 十一、决策参考（S-12：本卡四个决策点，四步框架）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| D-1 属性契约锚点方向 | A 写侧改 camelCase 迁就 compute（D355 初版）/ B 读侧对齐本体 schema snake_case | 第一性原理（单一事实源=本体 schema，consumer 对 producer 对齐）+ Anthropic（契约变更向消费端传播）；B 已是 l4-contract 现行锚（头注记录 D355 初版被推翻） | **B**——本卡全部读侧修复沿 B 方向收尾 |
| D-2 无数据负向断言形态 | A 独立新场景 GS-XX / B GS-03 内 run-before-upload 双相位 | Anthropic（失败路径与正常路径同等——DSH compaction-pruner 先例）+ 第一性原理（一份 fresh-db 天然有"空库"这一半，何必再造）+ 文件预算（B 省 2 文件） | **B**——同场景正负两相位，一份证据同时覆盖 10-6 与挂载回归守卫 |
| D-3 teamId 多租户缺口 | A 本卡顺手修（ingest 写 teamId）/ B 登记债 V1 不修 | 第一性原理（V1 六断言无一涉及多租户；单图='default' 即边界）+ 最小写集（A 触发线4 写侧契约变更 + 三哨兵连锁回归，文件预算爆） | **B**——S4 行9 显式登记，禁编码会话顺手修 |
| D-4 币种不一致处置 | A 加币种字段+检测 / B 单币种契约声明 + schema 锁 | 第一性原理（无可检测信号时造"守卫"= 假安全）+ Anthropic（诚实降级：声明边界优于假装防御） | **B**——声明进 S4 行3 与 mapping 契约；检测能力 V2 backlog |

> 收敛检查：四个决策点双参考系均指向同一结论，无分歧。**参考：Anthropic/DeepSeek/第一性原理 + 结论**（K3 可核）。

## 十二、完成标准（DS 与断言一一对应，禁重编号/静默缺项——S-10）

1. DS1: 切片① 提交 + `threshold-provenance` 断言绿 + 反向（注释挂载行）必红留痕
2. DS2: 切片② 提交 + l4-contract 读侧 describe 修复前红（原始输出）修复后绿 + revenue-health 用例绿
3. DS3: 切片③ 提交 + cash-runway compute 测试新增 ≥4 用例绿 + GS-03 正相位与 GS-05 回归绿
4. DS4: 切片④ 提交 + GS-03 六断言 exit 0 + 证据 verdicts 含 10-1/10-3/10-6（原始 JSON 入 git）
5. DS5: 切片⑤ 提交 + list-test-points 含 10-2 + A2 证据含 acceptance_point 10-2 与 10-4（原始 JSON 入 git）
6. DS6: 反向删证据 → refresh 后该点回退 false（对照输出入报告）
7. DS7: `bash scripts/product-lines/refresh-all.sh` 后 ledger 线10 `v1_passed=5, v1_total=6`（10-8 待 K3）；10-8 备料清单落盘（K3 点级+线级复核要求写明）
8. DS8: K3 执行后（独立环节）verified==6 且 line:10 线级复核 pass → 线10 100%（v1_passed==v1_total==6）；**本卡交付以 DS7 为完工线，DS8 为 K3 环节验收**
9. DS9: 全量 vitest 零新增失败；tsc 零新增错误；`as any`=0
10. DS10: 真实提交无 --no-verify；`git diff --name-only` 与写集表一致；`git log --stat` 证明零 scripts/audit/** 零 calc-progress.py
11. DS11: 次日跨天重跑一次（rerun-evidence.sh 或 GS-03 单场景）证据日期滚动，非同日 stale
12. DS12: 完成报告含决策记录（§十一 四决策点参考系与结论）+ 未做/未能验显式清单

## 十三、自检清单

- [x] 派单 §三 全部特有要求落位：S2 逐字段映射表（14+3 行，含来源 file:line 与缺失行为）/ S4 失败模式 9 条（≥6）/ S6 断言表含 10-1/10-2/10-3/10-4/10-6/10-8 / S5 五切片对齐派单建议（①按实测现状改为回归守卫并说明）
- [x] 全部声称 2026-09-17 当天 grep/read 实测（file:line 可复查），非凭记忆/文档转述——含 ingest 不写 teamId、financialType='erp-standard'、loader:210-212 挂载、GS-03 证据 verdicts 实际落点 4-5/5-2/4-7
- [x] D381 范例结构对齐（D352 spec）：写集表格式 / 权威引用带原文 / 失败模式分节 / red→green 对照 / 决策参考表 / DS 一一对应 / 自检清单
- [x] 写集 10 文件 ≤12 预算；零新建（复用既有测试文件与场景文件）
- [x] 红线：零 scripts/audit/ 与零 calc-progress.py、规格冻结前不动 src/ 实现（本 doc 无实现代码）
- [x] 取号：D803 由 CTO 派单分配（task-state/D803.json @ 分支 docs/dispatch-dsh-standard-20260917，status=claimed），本会话未自编号
- [x] S-5：切片②③ red 设计覆盖失败模式（契约断裂/部分缺失误报），非仅 happy path
- [x] 诚实边界：DS7≠DS8 分开（本卡不含 K3 执行）；币种/teamId 两处"不可为"显式声明而非假守卫
