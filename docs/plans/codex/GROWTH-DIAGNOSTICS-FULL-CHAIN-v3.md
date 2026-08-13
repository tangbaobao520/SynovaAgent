# SynovaAgent 增长诊断全链路 — 架构升级设计 v3.1

> 2026-06-29 | 基于当前代码完整审计 | 五层架构内升级，不新增层

---

## 零、审计结论: 当前链路五处断裂

追踪了从"用户触发诊断"到"拿到可行动报告"的完整链路:

| 链路环节 | 状态 | 断裂点 |
|---------|------|--------|
| ① 数据进入 | **断裂** | 无数据源接入。L4 Financial 节点只有 {financialType, amount} 三个字段，哨兵需要的 operatingCashFlow/netPpe 等字段无写入路径 |
| ② 本体层 | **部分** | extensions/ontology/ 已有 JSON 文件驱动的扩展系统。但节点字段过少，无法承载哨兵需要的丰富财务/运营数据 |
| ③ 哨兵计算 | **部分** | 46 哨兵算法存在且有理有据。但输入数据全为 0/null，所有哨兵永远返回"无异常"或 degraded |
| ④ Cron 调度 | **运行时断裂** | L3 SentinelRunner 传 raw better-sqlite3 Database 给哨兵，哨兵期望 queryNodes() 方法。每秒产生 TypeError 被 catch 吞掉 |
| ⑤ API→用户 | **未接线** | sentinel-service.ts 的 getSentinelFindings() 硬编码返回空。MCP 无哨兵/飞轮工具。对话引擎不消费哨兵结果 |

---

## 一、总体架构: 在五层内升级

```
铁律 39 架构边界 (不变):
  L1 交互层 ──→ L2 编排层 ──→ L3 洞察层 ──→ L4 本体层 ──→ L5 存储层
     ↑            ↑            ↑            ↑            ↑
     只调 L2      只调 L3      只调 L4      只调 L5      SQLite
```

本次升级在各层内部进行，不改变层间边界:

```
L1 交互层
├── routes/data.ts         [新增] POST /api/data/upload — 数据上传入口
├── routes/diagnosis.ts    [升级] 增加 depth/layers/language 参数
├── routes/sentinel.ts     [修复] 接入真实数据
├── mcp/                   [升级] 注册 sentinel + flywheel 工具
├── ga-diagnosis.ts        [升级] 飞轮仪表盘渲染
└── ontology-admin.ts      [新增] GA 本体调优 Web 界面 (节点/边类型管理)
     │ 调用
L2 编排层
├── agent/sentinel-service.ts     [修复] getSentinelFindings → 真实数据
├── agent/data-ingest-service.ts  [新增] 数据接入编排 (解析→验证→写入 L4)
├── agent/report-assembler.ts     [新增] 四层报告组装
└── agent/conversation-engine.ts  [升级] 哨兵结果消费 + 颗粒度控制
     │ 调用
L3 洞察层
├── sentinel/runner.ts      [修复] Cron 路径 → 创建 GraphStore 适配器
├── sentinel/               [现有] 信号聚合 + 飞轮计算 + 专家调度
└── expert-platform/        [现有] 8 位专家推理
     │ 调用
L4 本体层
├── synova-graph-store.ts   [现有] GraphStore 实现，无需改动
├── extensions/ontology/
│   ├── node-types/         [扩展] 每个节点的 JSON Schema 加字段
│   ├── edge-types/         [现有] 边类型定义
│   ├── field-mappings/     [新增] GA 可编辑的字段映射配置
│   └── tags.json           [现有] 三层标签体系
└── ontology-loader.ts      [现有] 从 JSON 文件热加载类型定义
     │ 调用
L5 存储层
└── SQLite                  [现有] 节点/边/三元组表
```

---

## 二、① 数据进入: L2 编排层数据接入服务

### 入口: L1 交互层

```
POST /api/data/upload
  Content-Type: multipart/form-data
  Body: file (.csv/.json/.xlsx) + mapping (字段映射配置名)
  → L2 data-ingest-service 解析文件 → 验证字段 → 调用 L4 GraphStore 写入
```

### 编排: L2 data-ingest-service.ts

职责:
1. 接收文件 + 字段映射配置名
2. 从 L4 extensions/ontology/field-mappings/{name}.json 读取映射
3. 解析文件，按映射转换字段名 → 本体层 prop 名
4. 逐行调用 L4 GraphStore.createNode() / createEdge() 写入
5. 返回写入统计 (节点数/边数/跳过数/错误列表)

### 字段映射: L4 持久化配置

L4 `extensions/ontology/field-mappings/erp-standard.json`:
```json
{
  "name": "erp-standard",
  "label": "标准ERP导出",
  "mappings": [
    { "externalField": "营业收入",   "nodeType": "Financial", "prop": "revenue" },
    { "externalField": "经营现金流", "nodeType": "Financial", "prop": "operatingCashFlow" },
    { "externalField": "固定资产净值","nodeType": "Financial", "prop": "netPpe" },
    { "externalField": "总负债",     "nodeType": "Financial", "prop": "totalDebt" },
    { "externalField": "所有者权益", "nodeType": "Financial", "prop": "equity" },
    { "externalField": "现金余额",   "nodeType": "Financial", "prop": "cash" },
    { "externalField": "总资产",     "nodeType": "Financial", "prop": "totalAssets" },
    { "externalField": "流动资产",   "nodeType": "Financial", "prop": "currentAssets" },
    { "externalField": "流动负债",   "nodeType": "Financial", "prop": "currentLiabilities" },
    { "externalField": "应收账款",   "nodeType": "Financial", "prop": "receivables" },
    { "externalField": "毛利润",     "nodeType": "Financial", "prop": "grossMargin" }
  ]
}
```

GA 可通过 L1 ontology-admin 界面增删映射，写入 L4 JSON 文件，即刻生效。

### GA 手动输入路径

L1 对话界面输入企业数据 → L2 conversation-engine 调用 data-ingest-service → 写入 L4。

---

## 三、② 本体层: L4 字段扩展

### 当前能力 (无需改动)

- extensions/ontology/node-types/*.json: 每节点 1 个 JSON 文件，含 requiredProps + optionalProps
- extensions/ontology/edge-types/*.json: 每边 1 个 JSON 文件，含 allowedFrom + allowedTo
- ontology-loader.ts: 扫描 extensions/ontology/ → 自动加载 → 构建 EDGE_ENDPOINT_MAP + NODE_VALIDATORS
- SOGSchemaRegistry: 支持运行时注册新类型
- 三层标签 (domain/object/industry)

### 需扩展: 节点字段

当前 `financial.json`:
```json
{ "requiredProps": ["financialType"], "optionalProps": { "amount": "number", "currency": "string" } }
```

扩展后 `financial.json`:
```json
{
  "requiredProps": ["financialType"],
  "optionalProps": {
    "amount": "number", "currency": "string",
    "revenue": "number", "operatingCashFlow": "number",
    "netPpe": "number", "totalDebt": "number",
    "equity": "number", "cash": "number",
    "grossMargin": "number", "operatingExpense": "number",
    "totalAssets": "number", "currentAssets": "number",
    "currentLiabilities": "number", "receivables": "number",
    "inventory": "number", "period": "string", "source": "string"
  }
}
```

同理扩展 Goal 节点 (加 goalType 枚举值)、Client 节点 (加 churnRisk/lifetimeValue 等哨兵需要的字段)。

### GA 调优界面: L1 ontology-admin

非技术人员访问 L1 Web 界面:
- 查看当前所有节点/边类型及字段
- 新增节点类型 (填表: 名称/标签/必填字段/可选字段)
- 修改已有类型可选字段 (加新不删旧)
- 新增边类型 (填表: 名称/标签/起点/终点)
- 实时预览变更对哨兵计算的影响

界面操作 → 写入 L4 extensions/ontology/ 对应 JSON 文件 → ontology-loader 下次加载时生效。

---

## 四、③ 哨兵计算: L3 现有结构保持不变

当前结构已正确:
```
extensions/sentinels/{name}/
├── manifest.json    # 元数据 + 依赖声明 (节点类型/边类型/字段) + 阈值
├── aggregate.ts     # check(store, teamId) → SentinelFinding[]
└── computes/*.ts    # 纯函数: (typedInput) → number|{score,...}
```

### 数据依赖声明 (manifest.json 扩展)

当前 manifest 声明 `requiredDataSources`。增加 `dependsOn` 字段:
```json
{
  "dependsOn": {
    "nodeTypes": ["Financial"],
    "edgeTypes": [],
    "requiredFields": ["operatingCashFlow", "netPpe", "totalDebt", "equity", "cash"]
  }
}
```

哨兵加载时检查: 所需节点类型/字段是否存在 → 不存在则标记 degraded，不产出假 Finding。

### Compute 函数规范

1. 明确输入类型 (不用 unknown)
2. 处理空数据 → 返回 degraded:true，不抛异常
3. JSDoc 标注理论来源和公式
4. 至少 3 个测试用例 (正常/边界/异常)

### 新增哨兵流程

GA 在 L1 ontology-admin 界面操作 → 系统生成 manifest.json + aggregate.ts 骨架 + compute 模板 → 开发实现 → 不改任何现有代码 → 放置到 extensions/sentinels/ → 自动注册。

---

## 五、④⑤ 调度修复 + 报告→用户: L2+L3+L1

### L3 修复: SentinelRunner Cron 路径

当前 `runner.ts:executeSentinel()` 第 378 行:
```typescript
const ctx = { db: this.db, ... };  // this.db = raw better-sqlite3, 无 queryNodes()
```

修复为:
```typescript
const { createSynovaGraphStore } = await import('../l4/synova-graph-store');
const store = createSynovaGraphStore(this.db);
const ctx = { db: store, ... };  // store 有 queryNodes()
```

### L2 修复: sentinel-service.ts

`getSentinelFindings()` 当前硬编码返回空。改为:
1. 从 L3 SentinelRunner.getStats() 获取最新运行记录
2. 从 L3 SentinelRunner.getExpertReports() 获取专家报告
3. 从 L3 FlywheelAggregator 获取飞轮转速
4. 组装为 FindingsResponse / SignalsResponse 返回

### L2 新增: report-assembler.ts

四层报告:
- **L1 CEO摘要**: 瓶颈在哪 + 一个行动建议 (3 句话，≤200 字)
- **L2 飞轮仪表盘**: `{ valueCreation: 72, valueCapture: 45, valueRegeneration: 58, bottleneck: "capture" }` + 关联哨兵得分列表
- **L3 专家详细**: 每位专家的完整推理→结论→置信度→证据链
- **L4 原始数据**: 每个哨兵的计算输入值→公式→输出→阈值对比

### L1 API: 触发 + 颗粒度控制

```
POST /api/diagnosis/run
  Body: {
    layers?: ("environment"|"capital"|"interface"|"technology"|"alignment"|"internal")[],
    sentinelIds?: string[],
    depth?: "ceo" | "flywheel" | "expert" | "raw",
    language?: "zh" | "en",
    compareWith?: "last_quarter" | "last_month" | "baseline"
  }
  → L2 diagnosis-launcher → L3 sentinel-runner + expert-dispatcher
  → L2 report-assembler → L1 SSE 流式返回

GET /api/diagnosis/report/:id/adjust?depth=ceo&language=en
  → 已有报告按参数重新切片/翻译
```

### L1 对话交互

用户: "我的增长卡在哪" → L2 conversation-engine → L3 哨兵全量运行 → L2 report-assembler → 飞轮报告 → 对话呈现

用户: "只看资本层" → L2 过滤 layer=capital → 仅 F1-F5 哨兵 → 重新组装报告

用户: "F1 融资约束详细计算过程" → 返回 computeKzIndex 输入值+公式+阈值对比+历史趋势

### L1 MCP 工具

```
sentinel_list     → 列出所有哨兵 (ID/名称/层/状态/数据依赖满足度)
sentinel_run      → 运行指定哨兵
sentinel_run_all  → 运行全量哨兵
flywheel_speeds   → 获取三飞轮当前转速 + 瓶颈
diagnosis_report  → 获取最新诊断报告 (支持 depth 参数)
data_source_status→ 数据源连接状态 + 字段覆盖度
```

---

## 六、实施路线

```
Week 1: L4 本体字段扩展 + L2 数据接入
  - 所有节点JSON扩展字段 (哨兵需要的 props)
  - POST /api/data/upload (文件解析→字段映射→写入 GraphStore)
  - GA 手动输入 → 数据写入

Week 2: L3 修复 + L2 接线
  - Cron 路径: 创建 GraphStore 适配器
  - sentinel-service: 接入真实数据
  - report-assembler: 四层报告

Week 3: L1 交互
  - depth/layers/language 参数 → 报告颗粒度控制
  - GA 对话: 哨兵结果消费 + 飞轮仪表盘渲染
  - MCP 工具注册
  - GA 本体调优 Web 界面

Week 4: 测试 + 验收
  - 端到端: 上传数据→哨兵运行→飞轮报告→对话调整
  - GA 独立操作验收: 无需开发介入完成一次完整诊断
```

---

## 七、与现有架构的关系

| 现有模块 | 本次改动 | 性质 |
|---------|---------|------|
| L5 SQLite | 无改动 | — |
| L4 GraphStore | 无改动 | queryNodes/createNode 接口不变 |
| L4 extensions/ontology/*.json | **扩展字段** | 只加 optionalProps，不改 requiredProps，向后兼容 |
| L4 ontology-loader.ts | 无改动 | 扫描 JSON → 自动加载新字段 |
| L3 sentinel/runner.ts | **修复 Cron 路径** | 改 ctx.db 来源，不改接口 |
| L3 sentinel/signal-aggregator.ts | 无改动 | — |
| L3 sentinel/flywheel-aggregator.ts | 无改动 | — |
| L3 expert-platform/ | 无改动 | — |
| L2 agent/sentinel-service.ts | **修复** | 从返回空 → 返回真实数据 |
| L2 agent/report-assembler.ts | **新增** | 纯 L2，只调 L3 |
| L2 agent/conversation-engine.ts | **升级** | 增加 depth/layers 参数传递 |
| L1 routes/sentinel.ts | 无改动 | 已有 API 结构不变 |
| L1 routes/diagnosis.ts | **升级** | 增加请求参数 |
| L1 routes/data.ts | **新增** | 数据上传入口 |
| L1 ontology-admin.ts | **新增** | GA 本体调优界面 |
| extensions/sentinels/ | **扩展 manifest** | 加 dependsOn 字段 |

**不新增层。不改变五层架构。不修改层间通信规则。**
