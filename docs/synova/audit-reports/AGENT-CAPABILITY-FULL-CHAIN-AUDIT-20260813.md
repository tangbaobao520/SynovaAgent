# Agent 核心能力全链路贯通审计报告

> **审计员**: K3（Kimi Code CLI，独立会话，零上下文，只读）
> **审计日期**: 2026-08-14（任务书指定文件名日期 20260813）
> **任务书**: `docs/synova/coordination/AGENT-FULL-CHAIN-AUDIT-TASK.md` v1.1
> **方法**: 端到端链路追踪（L5→L4→L3哨兵→L2→L1）+ 活运行实验（T2 空库 / T3 数据注入）
> **运行环境**: Windows 11 + Git Bash + Node v24.16.0 + tsx；实验在数据库**临时副本/新建库**上进行，未改动任何项目文件与真实数据

---

## 〇、审计材料确认表

| # | 材料 | 状态 |
|---|------|:---:|
| 1 | 权威文档01（本体层因果体系） | ✓ 已定位（按需引用） |
| 2 | 权威文档03（哨兵-计算-本体规范，7 文件含路线A/B/C） | ✓ 全部精读 |
| 3 | 权威文档13（增长导航） | ✓ 已定位（按需引用） |
| 4 | 权威文档15（循环溢出导航） | ✓ 已定位（按需引用） |
| 5 | `docs/synova/architecture/SYNOVA-ARCH-哨兵体系-20260707.md` | ✓ 已读（声称来源） |
| 6 | A线审计缺口（`AUDIT-FINDINGS-LEDGER.md`，含 K3 权威偏差 v1/v1.1/v2） | ✓ 已读 |
| 7 | 代码仓库 + 运行库 `data/synova.db` | ✓ 已验证 |

---

## 一、总体结论

**FAIL（全链路未贯通）** — 3 个核心循环的端到端数据流**全部断裂**，断裂点集中在 **L5 连接器缺失** 与 **L4 数据契约（节点类型 + 属性名）失配**，并新发现 **P0 哨兵核心告警路径在生产接线下是死代码**（物理证明）。

- **全链路贯通循环数：0/3**
- **哨兵有效比例：44/47 目录可注册（任务书声称 50/61 —— 声称已过时）**
- **P0 哨兵状态：compute 缺失问题已修复，但被更深层接线缺陷取代（见 P0-1/P0-2）**

关键物理事实（活运行证明，非静态推断）：

1. 空库运行 6 个代表哨兵全部"正常返回 0 findings"——**无数据与无异常无法区分**（唯一例外：talent-density 返回 info"人员数据不足"）。
2. 注入合成数据后：customer-demand-shift / talent-density / capital-health 的计算链路真实触发（critical/warning 产出正确）——**L3 计算能力本身是真的**。
3. cash-runway（P0）在生产接线形态下 findings=0；假设挂上 manifest 则对无数据场景误报 critical"现金流危急—跑道0.0个月"。**两种形态都不可用**。

---

## 二、审计循环链路验证

### 2.1 客户循环

| 层级 | 组件 | 状态 | 证据 |
|------|------|:---:|------|
| L5 | CRM 连接器 | **FAIL** | 无 Salesforce/HubSpot/钉钉连接器：TS 侧 `grep -rli "salesforce\|hubspot\|crm" src/connectors/` 零命中；Python 侧 `synova_worker/connectors/` 仅 feishu.py；`extensions/adapters/` 仅 feishu + nemoclaw。真实数据入口仅：CSV 导入（`csv-import.ts` → `resource/money` 节点）、`POST /api/data/upload`、`POST /api/import/csv`、飞书桥、Python 连接器管线（见 2.2 L5） |
| L4 | 客户图节点映射 | **FAIL** | 哨兵读 `queryNodes('Client')`（9 处）；但上传映射 `crm-standard.json` 的 `targetNodeType` 是 **Market**（`extensions/ontology/field-mappings/crm-standard.json:4`），CRM 上传数据对客户哨兵**不可见**。唯一写 'Client' 的是文档提取（`diagnosis-upload-v2.ts:577`），其 props 只有 `content/confidence/dimensionKey`——**无** revenue/status/churn/nps 结构化字段（`diagnosis-upload-v2.ts:582-591`），属性级也断 |
| L3 | customer-demand-shift | **PASS**（有保留） | aggregate.ts 真实调用 `computeCustomerConcentration` + `computeCustomerChurnRisk`；T3 注入后正确产出 critical（集中度 89%、流失率 33%）。保留：① 阈值硬编码于 aggregate（0.4/0.3/0.2/0.1），不读 manifest（头部注释声称"比较 manifest.json 阈值"**不实**）；② `aggregate.ts:29` 已标记 @deprecated 的 DEPLOYS traverse 仍在门控——traversal 存在且无 DEPLOYS 边时**静默 return []** |
| L3 | unit-economics | **PASS** | 集成 7 个真实 compute（computeLtvCac/computeUnitMargin/computeVariableCosts/computeMarginalContribution/computeFixedCostRigidity/computeScenarioSimulation/computeBreakEven，`unit-economics/aggregate.ts:15-21`） |
| L2 | SentinelRunner 调度 | PASS | `runner.ts:169` listCronSentinels → CronScheduler 注册；manifest schedule（`0 9 * * 1`）真实生效 |
| L1 | API 诊断交付 | PASS（有 P2 缺陷） | `routes/sentinel.ts` 6 端点真实（findings/signals/run/reports/tickets/alerts），经 L2 `sentinel-service`。**但**：findings 来自 runner **内存** records（进程重启即丢）；`sentinel-service.ts:101` `checkedAt: new Date(run.result.durationMs)` 把耗时当时间戳 → 输出恒为 1970-01-01 |
| **端到端** | **全链路贯通** | **FAIL** | **断在 L5（无 CRM 连接器）+ L4（Market≠Client 类型断裂 + 提取数据无结构化 props）**。T3 证明：只要 L4 有合规数据，L3→L1 段可用 |

### 2.2 资本循环（含 4 个 P0 哨兵）

| 层级 | 组件 | 状态 | 证据 |
|------|------|:---:|------|
| L5 | 财务连接器 | **FAIL** | 无用友/金蝶/银行连接器（TS 侧 grep 零命中；Python 侧 `synova_worker/connectors/` 仅 feishu.py 一个连接器）。L5 管线架构本身存在且已接线：`l5/connector-pipeline.ts`（PythonBridge→OntologyEventBus→GraphStore），经 `server.ts:360` `POST /api/connector/sync` 可手动触发——**管线通、连接器无**。结构化财务数据唯一通道：`erp-standard.json` 上传映射 → `targetNodeType: Financial`（14 字段） |
| L4 | 财务图节点 | **PARTIAL** | 类型匹配（Financial ✓）；但**属性名断裂**：erp-standard 写 `cash`/`operating_expense`（snake_case），compute 读 `cashBalance`/`operatingExpenses`（camelCase）——见下 |
| L3 | cash-runway（P0） | **FAIL** | **三重缺陷（全部物理证明）**：①`compute-cash-runway-months.ts:60` 过滤器 bug——`store.queryNodes('Financial', { [input.teamId]: input.teamId })` 把 teamId 值当属性名（teamId='default' 时查 `props.default='default'`），**永不匹配**；② 属性名与 erp-standard 不匹配（`cashBalance`≠`cash`）；③ 阈值告警死代码——`aggregate.ts:14` `manifest: null` + `:28` `if (this.manifest)` 门控，而 `sentinel-loader.ts:170-210` 注册包装器**从不给 sentinelObj 挂 manifest**（全仓 grep 无 `.manifest =` 赋值）→ 生产形态 findings 恒空（活运行证明 [A] 组）；若挂上 manifest，无数据时 compute degraded value=0 ≤ critical 6 → **误报 critical"现金流危急—跑道0.0个月"**（活运行证明 [B] 组） |
| L3 | revenue-health（P0） | **FAIL** | 同样 `this.manifest` 门控（`aggregate.ts:50-51`）→ 阈值告警同为死代码。compute（compute-revenue-growth.ts）本身存在且被调用 |
| L3 | cost-health / profit-health（P0） | **已合并** | 目录已退役入 `_extinct/`，由 margin-health 合并承接。但 margin-health 的实现方式是**动态 import `../_extinct/cost-health/aggregate`**（`margin-health/aggregate.ts:26-27`）——桥接退役代码；且 _extinct computes 读 `props.amount/financialType/total_cost`，erp-standard 不写这些字段 → 数据契约仍断 |
| L3 | capital-health（合并哨兵） | PARTIAL | 同样桥接 `_extinct/` 三哨兵（`capital-health/aggregate.ts:27-29`）。T3 注入部分字段后产出 critical（利息覆盖 0.0x）——**缺失字段默认为 0 触发危急**，部分数据 → 误报 |
| L3 | cash-flow-sentinel（路径1 遗留 adapter，P0） | **FAIL** | builtins.ts 注册、每日 cron 真实存在。空数据有 `degraded: true` 正确传播（`cash-flow-sentinel.ts:63,77,101`，全场唯二合规样本之一）；**但**绕开 GraphStore 抽象直接裸 SQL 查 `type='FINANCIAL'`（`:69`）——全大写类型**零写入方**（erp-standard 写的是 'Financial'，SQLite 精确匹配区分大小写）→ 生产恒降级。prop 读取兼容 `cash`（与 erp-standard 匹配），是全场契约最宽容的消费者，可惜类型名错了 |
| L2 | 调度 | PASS | 同 2.1 |
| L1 | API | PASS（同 2.1 的 P2） | 同 2.1 |
| **端到端** | **全链路贯通** | **FAIL** | 断在 L5 + L4 属性契约 + L3 死代码/误报。**资本循环是三个循环中缺陷最深的** |

### 2.3 人才循环

| 层级 | 组件 | 状态 | 证据 |
|------|------|:---:|------|
| L5 | HR 连接器 | **FAIL** | 无北森/钉钉 HR 连接器。飞书桥（`feishu-bridge.ts:36`）创建 'Person' 节点（IM 成员，非 HR 数据）；上传映射 `hr-standard.json` → `targetNodeType: **People**` |
| L4 | 人才图节点 | **FAIL** | 哨兵读 `queryNodes('Person')`（11 处）；hr-standard 写 **People** → **类型断裂**。写 'Person' 的是：feishu-bridge、knowledge-ingest-bridge、synova-diagnosis-engine-impl；而 ontology-syncer 写 `resource/person`（新本体）——**'Person' 本身还有新旧双轨** |
| L3 | key-person-risk | PASS | `aggregate.ts` 包装 `src/l3/key-person-risk.ts` 的 checkKeyPersonRisk（读 'Person' 节点算 Bus Factor），真实接线。路线C 报告的"哨兵层空壳"**已修复** |
| L3 | talent-density | PASS | 真实 compute（compute-talent-density.ts），T3 触发 warning"人才密度低 (0%)"；空数据返回 info"人员数据不足"——**文件驱动哨兵中唯一符合降级诚实性的样本**（另一合规样本：路径1 遗留 cash-flow-sentinel 的 `degraded: true` 传播，见 2.2） |
| L3 | adaptation-velocity | **FAIL** | 任务书指定的第三哨兵已退役入 `_extinct/`——任务书口径过时 |
| L2/L1 | 调度 + API | PASS | 同 2.1 |
| **端到端** | **全链路贯通** | **FAIL** | 断在 L5（无 HR 连接器）+ L4（People≠Person） |

### 2.4 跨循环共享发现：L4 数据契约矩阵

`queryNodes` 是**精确字符串匹配**（`sqlite-graph-store.ts:193` `WHERE graph = ? AND type = ?`），无映射无容错。全仓生产者-消费者对账：

| 哨兵查询类型 | 查询处数 | 生产写入方 | 判定 |
|-------------|:---:|-----------|:---:|
| Event | 19 | **无静态写入方**（仅 `l5/ontology-event-bus.ts:73` 动态透传事件载荷类型） | **断** |
| Financial | 16 | erp-standard 上传 ✓（但 props 名断裂）；文档提取（无结构化 props） | 半断 |
| FINANCIAL（大写） | 2 | **零写入方**——cash-flow-sentinel 裸 SQL（`adapters/cash-flow-sentinel.ts:69`）+ `packages/evolution/org-adapter.ts:434`。与 'Financial' 大小写分裂 | **断** |
| Person | 11 | feishu-bridge / 知识摄入 / 诊断引擎（注意：hr-standard 写 People；ontology-syncer 写 resource/person） | 半断 |
| Client | 9 | 仅文档提取（无结构化 props）；crm-standard 写 Market | **断** |
| Tool | 9 | **无静态写入方** | **断** |
| Process/Team/Document/Agent | 13 | 部分有（Team/Document/Agent 有写入方） | 部分通 |

另：代码库存在**两套并存类型体系**——新本体 45 类型（`resource/client`、`outcome/financial`…`packages/ontology/src/node-types.ts`）与旧 PascalCase（'Client'/'Financial'，sog-core）；哨兵全部用旧体系，新连接器（csv-import 等）用新体系。`routes/ontology.ts:147` 同时查询两个体系，证明漂移已被感知但未收敛。

---

## 三、哨兵体系专项验证（任务书 §三 四个数字 + 两项）

| 架构文档声称 | 验证结果 | 状态 |
|-------------|---------|:---:|
| 61 个哨兵目录 | **实际 47**（44 活跃 + `_extinct/` + `path-dependency/` + `shared/`） | **FAIL——声称过时** |
| 50 个有效（有 aggregate.ts） | **实际 44**；loader 跳过 `shared` 与 `_` 前缀（`sentinel-loader.ts:72-73`）→ 44 可注册 | FAIL——声称过时 |
| 11 个空壳 | **实际 1**（path-dependency，仅 manifest；加载时记 error 不崩溃）。原 11 空壳中 10 个已物理删除，12 个旧哨兵退役入 `_extinct/` | 已过时（方向积极） |
| 4 个 P0 哨兵 compute 缺失 | **已修复**：cash-runway 4 个 compute 存在且被调用（68-107 行/个）；revenue-health compute 存在；cost/profit-health 合并入 margin-health（computes 在 _extinct 中存在） | 已修复——**但**被 P0-1/P0-2 新缺陷取代 |
| 三重注册入口 | **确认存在**：builtins.ts（4 个旧 adapter，3 个 @deprecated）+ file-driven-loaders + runner.ts:489。registry 按 ID 覆盖去重（`registry.ts:22-25`），同 ID 双注册无害化，但冗余入口仍在 | DEGRADED（确认） |
| 正向信号放大 | `grep excellence\|positive severity` 零命中 | 确认未实现（已知） |

**权威文档03 落地度附加验证**：

- 4 个合并哨兵（capital-health/competitive-position/competitive-moat/margin-health）✓ 全部存在
- **10 个新建哨兵（sentinel-breakeven 等 N1-N10）零落地**——无目录
- 管理经济学 compute：7/10 已按规范名落地（路线B 基线为 1/8），**仍缺 computeMarginalCost / computeLearningCurve / computeCSFProfile**。注：`shared/computes/l2-value/compute-learning-rate.ts` 存在 Wright Law 实现（路线A 标记为零消费 compute），与规范名 computeLearningCurve 语义相当但命名不一致且未被任何哨兵消费——能力半成品，不计入已落地
- 存在 2 个规范外哨兵：sentinel-forecast-accuracy、sentinel-pricing-strategy
- 42 边旧标签迁移**未完成**：生产代码仍在用 FUNDS/OPERATIONAL_EXECUTION/DEPLOYS/CONSTRAINS/REPLENISHES/DECISION_CONCENTRATES（revenue-health、cash-runway、talent-density、key-person-risk 等），路线A 的 P0 迁移队列（DELETE 边）因涉及哨兵多已退役而部分自然消解

---

## 四、与 A线审计缺口交叉验证

| A线缺口 | 本次验证结果 | 状态变化 |
|--------|------------|:---:|
| direction-monitor 未接线 | `src/loops/direction-monitor.ts` 存在，**零生产调用方**（grep 无 import/调用） | **确认未修复**（存活至今，铁律 37 违规持续） |
| middle-evolution-engine 未接线（N13 闭环断裂，P0） | `src/loops/middle-evolution-engine.ts` 存在，**零生产调用方**（D333 队列中） | **确认未修复** |
| NCI 零代码 | 精确 grep（非共识指数/NonConsensus）零命中 | **确认** |
| G2：Agent 自主性 vs 实现差距 | Cron 自动轮巡机制真实（runner+scheduler+registry），但资本/收入维度的"自动观测"因 P0-1 死代码**实质为空**；findings 仅存内存，工单表 0 行 | **确认 + 加深** |
| 4 个 P0 哨兵 compute 缺失 | compute 已补齐并被调用 | **已修复**（但被新 P0 取代） |

---

## 五、测试验证记录（活运行实验）

> 本审计非 commit 测试套件验证，T1（干净快照）不适用——审计对象是当前工作树 + 运行库。T2/T3 在**临时数据库**上执行（真实库只读），实验后临时文件已删除。

| 步骤 | 操作 | 结果 |
|------|------|------|
| T2-a | 对 `data/synova.db` 副本直接跑 6 哨兵 | **queryNodes 报 "no such column: props"（log.warn）后 fail-open 返回空，6 哨兵静默 0 findings**——运行库 schema 是旧版（`props_json`），代码期望 `props`；无 migration 修复（`src/store/migrations/` 无 graph_nodes 迁移）。fail-open：哨兵拿不到错误，只拿到空数组（注：warn 日志直接观测到 Financial 查询 2 条，其余类型共用同一 SQL 路径同样失败） |
| T2-b | 新库（当前 schema）空数据跑 6 哨兵 | 全部正常返回；cash-runway/customer-demand-shift/key-person-risk/margin-health/capital-health = 0 findings 且无 degraded 信号；**仅 talent-density 返回 info"人员数据不足"** |
| T3-a | 注入 3 Client + 1 Financial + 2 Person | customer-demand-shift 产出 2 critical + 1 warning（数值正确）；talent-density 产出 warning；capital-health 产出 2 critical（**缺失字段默认为 0 → 误报**）；cash-runway/key-person-risk/margin-health 仍 0（契约断裂） |
| T3-b | cash-runway 双形态对照 | [A] 生产形态（manifest=null）：findings=0（**死代码**）；[B] 手动挂 manifest：对无结构化字段的 Financial 节点误报 critical"现金流危急—跑道0.0个月" |

---

## 六、分级汇总

### P0（阻断交付）

| # | 发现 | 证据 |
|---|------|------|
| P0-1 | **P0 哨兵阈值告警生产死代码**：`sentinel-loader.ts` 注册时从不挂 manifest，cash-runway（`aggregate.ts:28`）与 revenue-health（`:50`）的全部阈值 finding 永不触发 | grep 无 `.manifest =` 赋值 + 活运行 [A] 组 findings=0 |
| P0-2 | **三循环端到端全断（0/3）**：L5 无 CRM/财务/HR 连接器；L4 类型契约断裂（Market≠Client、People≠Person、Event/Tool 零写入方）+ 属性契约断裂（cashBalance≠cash）+ filter bug（`compute-cash-runway-months.ts:60`） | §2.4 矩阵 + T3 实验 |
| P0-3 | **L4 查询层静默 fail-open**：schema 漂移时 queryNodes 只 log.warn 返回空（`sqlite-graph-store.ts:211-215`），哨兵把"查询失败"当"无数据"，无数据又当"无异常"——异常检测系统的失效本身不可见 | T2-a 物理复现 |

### P1（建议修复）

| # | 发现 | 证据 |
|---|------|------|
| P1-1 | 降级语义→误报：manifest 若挂上，无数据时 cash-runway 报 critical"现金流危急"（degraded value=0 穿过阈值门控，aggregate 未拦截 degraded） | 活运行 [B] 组 |
| P1-2 | margin-health / capital-health 合并实现 = 动态 import `_extinct/` 退役代码；退役哨兵的 props 契约（amount/financialType/total_cost）与上传映射不匹配 | `margin-health/aggregate.ts:26-27`、`capital-health/aggregate.ts:27-29` |
| P1-3 | capital-health 对缺失字段默认为 0 产出 critical（部分数据→误报） | T3-a |
| P1-4 | 任务书/架构文档口径严重过时（61/50/11/4、adaptation-velocity、capital-structure 等），审计任务书本身基于过期快照 | §三 |
| P1-5 | 权威文档03 新建哨兵 N1-N10 零落地；3 个管理经济学 compute 仍缺；42 边旧标签迁移停滞 | §三 |

### P2（可选改进）

| # | 发现 | 证据 |
|---|------|------|
| P2-1 | `sentinel-service.ts:101` checkedAt 用 durationMs 构造日期 → API 输出 1970 时间戳（loader 本已返回正确 checkedAt 字段，未被使用） | `sentinel-loader.ts:208` vs `sentinel-service.ts:101` |
| P2-2 | customer-demand-shift 阈值硬编码、不读 manifest；头部注释声称"比较 manifest.json 阈值"不实 | `customer-demand-shift/aggregate.ts:50,77` |
| P2-3 | 持久化分裂：findings 与 expert reports 仅存 runner 内存（进程重启丢，reports 上限 50 条）；`sentinel_tickets` 表有真实持久化路径（`runner.ts:423` INSERT + `:457` 状态更新）但 `/api/sentinel/tickets` **不读表**——从内存 findings 动态派生工单视图（`sentinel-service.ts:211-230`）。当前库表 0 行 = critical 信号从未真实产生（与空图 + P0 死代码互证）；`sentinel_baselines` 580 行说明基线写入路径活着 | `runner.ts:221,414,423` + `sentinel-service.ts:211` + DB 实测 |
| P2-4 | `customer-demand-shift/aggregate.ts:29` 已 @deprecated 的 DEPLOYS traverse 仍在门控，空遍历静默 return [] | 文件内注释 + 代码 |
| P2-5 | 规范外哨兵 2 个（sentinel-forecast-accuracy/pricing-strategy）未经权威文档登记 | §三 |
| P2-6 | `sentinel-loader.ts:84,93` catch 块使用 `err: any`（铁律 38 精神边缘） | 文件内 |

---

## 七、建议优先修复顺序

1. **P0-1 一行修复**：`sentinel-loader.ts` 注册前 `sentinelObj.manifest = manifest`（并同步修 P1-1：aggregate 对 `degraded` 结果不得穿过阈值门控，改发 degraded finding）。
2. **P0-2 的 L4 契约对账**：建立"节点类型 + 属性名"生产者-消费者注册表（field-mappings targetNodeType/prop × 哨兵 queryNodes/props），先入门禁做静态对账，再逐循环修类型别名（Market→Client、People→Person 或反向迁移哨兵到新本体 45 类型）。
3. **P0-3**：queryNodes 捕获 schema 级错误应抛/上报 degraded，不得与"真空结果"同态；启动时加 schema 版本校验。
4. **P0-2 的 L5**：三循环各至少 1 个真实连接器（或明确声明 MVP 仅支持上传/CSV 通道并下掉连接器声称）。
5. 修复后**重跑本审计的 T2/T3 脚本**作为验收（脚本已删除，逻辑见 §五，可重建）。

---

## 八、L4 防线缺口收割

> "本次发现的问题，控制塔哪一道防线本该拦住？为什么没拦住？缺什么？"

### 发现 1：P0 哨兵阈值告警死代码（P0-1）

**本该拦住的防线**: 铁律 0-2 接线验收（WIRE CHECK）+ 铁律 48 测试非空壳 + Agent 自检 5 问第 1 条（新 export 谁调用）
**为什么没拦住**: 现有 WIRE CHECK 只验证"export 被 import/调用"——loader 确实 import 并调用了 `sentinelObj.check()`，静态接线检查全过。但"调用"不等于"契约接通"：`this.manifest` 挂载是**对象内部状态契约**，静态 grep 看不到；哨兵测试（若有）单测 compute 或 aggregate 时手动构造了 manifest，生产装配路径（loader 包装器）无测试覆盖。
**缺什么**: ① 哨兵级**集成测试契约**——经 loader 真实注册后跑一次 check，断言阈值路径可达（如注入越阈 fixture 必须出 finding）；② 接线验收从"export 有调用方"升级为"**生产装配路径端到端跑一次**"（铁律 0-2 Step 5 的语义扩展）；③ aggregate 不得依赖可变外部挂载状态的 lint/约定（manifest 应作参数注入而非 this 挂载）。

### 发现 2：L4 数据契约断裂（P0-2，类型+属性双层）

**本该拦住的防线**: 铁律 47 契约优先 + pre-commit 组 9 契约门禁
**为什么没拦住**: 契约门禁管的是单个 compute 函数的 JSDoc 输入/输出/降级契约，**不管跨层数据契约**——field-mappings（L5 写）与哨兵 queryNodes/props（L3 读）分属两个目录两套维护者，没有任何机制把"生产者类型/属性"与"消费者类型/属性"放同一张表对账。两套本体类型体系（新 45 类型 vs 旧 PascalCase）并存加剧了漂移。
**缺什么**: 节点类型/属性的**生产者-消费者注册表 + 静态对账脚本**（扫 field-mappings/*.json 的 targetNodeType+prop × extensions/sentinels 的 queryNodes 类型+props.* 读取），入 pre-commit；断裂即阻断。

### 发现 3：查询层静默 fail-open（P0-3）

**本该拦住的防线**: 铁律 11/24/31（禁止静默降级、degraded 信号传播）
**为什么没拦住**: `queryNodes` 的 catch 有 log.warn（形式上合规），但**返回空数组使"查询失败"与"真空结果"同态**——铁律审查看"有没有 log"，不看"调用方能不能区分失败与空"。哨兵层随后把空数组解释为"无数据/无异常"，失效沿链路上行时被逐层合理化。
**缺什么**: 存储层错误的**三态返回**（ok/empty/error）或查询失败的强制抛出；铁律 24 检查项增加一条："catch 返回值是否让调用方能区分失败与空"。

### 发现 4：任务书/架构文档口径过时（P1-4）

**本该拦住的防线**: 文档-实现同步（铁律 9 关键变更全仓传播）
**为什么没拦住**: 哨兵目录大清理（61→47、_extinct 退役、P0 compute 补齐）发生后，没有机制要求同步刷新架构白皮书与下游任务书；K3 本次拿到的任务书带着两个月前的快照数字。
**缺什么**: 架构文档数字的**可执行化**（如 `check-sentinel-inventory.sh` 断言目录数/有效数，漂移即红），或文档头部强制"快照日期 + 自动失效提醒"。

---

## 九、附录：本次审计的可复核入口

- 哨兵清单：`ls -d extensions/sentinels/*/ | wc -l` → 47；`find extensions/sentinels -maxdepth 2 -name aggregate.ts | wc -l` → 44
- 死代码：`grep -rn "\.manifest =" src/` → 零赋值；`sentinel-loader.ts:170-210` 注册包装器
- filter bug：`extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts:60`
- 类型对账：`extensions/ontology/field-mappings/*.json` 的 targetNodeType × `grep -rhn "queryNodes('" extensions/sentinels/`
- schema 漂移：`data/synova.db` 的 `graph_nodes` 为 `props_json` 列 vs `sqlite-graph-store.ts:193` 期望 `props`
- 连接器盘点：TS 侧 `src/connectors/`（csv-import/feishu/ima/nemoclaw）+ Python 侧 `synova_worker/connectors/`（仅 feishu.py）+ 管线 `l5/connector-pipeline.ts`（`POST /api/connector/sync` 可触发）——无 CRM/ERP/HR 连接器实现
- A线：`grep -rn "direction-monitor" src/ --include="*.ts" | grep -v "src/loops/direction-monitor.ts"` → 零调用方

*报告完。K3 独立审计，全部结论以可 grep/可执行的物理事实为依据。*
