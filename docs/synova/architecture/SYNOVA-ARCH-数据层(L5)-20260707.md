---
title: "SynovaAgent 数据层(L5)架构"
version: "v1.0"
date: "2026-07-07"
status: "现状白皮书 — 从代码反推"
---

# 数据层（L5）架构

> 数据层是 Synova 的"血液系统"。外部数据怎么进来、怎么存、
> 怎么变成本体层的节点和边——L5负责这一切。
> 部署模式是本地部署，数据不出企业。

---

## 一、数据来源

Synova 的输入数据来自三条通道：

| 通道 | 数据类型 | 代码位置 | 状态 |
|------|---------|---------|------|
| 连接器管道 | 结构化经营数据（ERP/财务/电商） | `l5/connector-pipeline.ts` | ✅ Python连接器→事件总线→GraphStore |
| IM 接入 | 非结构化沟通数据（飞书/企微消息） | `l1/im-inbound.ts` | ✅ Webhook接收→身份识别→Session存储 |
| GA/访谈采集 | 结构化访谈数据（初次诊断的10-15个问题） | `interview/engine.ts` | ✅ 多角色访谈引擎+矛盾检测 |

### 1.1 连接器管道

外部系统（ERP、财务软件、电商后台）通过 Python 连接器接入。
管线流程：Python连接器 → PythonBridge → OntologyEvent[] → OntologyEventBus → GraphStore。
支持多租户隔离（orgId），凭证加密存储。

### 1.2 IM 接入

飞书/企微的 Webhook 推送消息 → 解析发送者身份 → 存储到 Session。
消息内容可用于哨兵分析（如团队沟通频率、信息传递延迟）。

### 1.3 GA/访谈采集

产品全景中定义的"初次诊断"场景——GA用10-15个定制化问题进行多角色访谈。
访谈引擎支持多角色矩阵、矛盾检测（不同角色对同一问题的回答差异）、
结果聚合。访谈结果输入给诊断管线，生成初次诊断报告。

---

## 二、数据存储

| 存储 | 技术 | 位置 | 用途 |
|------|------|------|------|
| 本体图存储 | SQLite | `packages/graph-store/` | 节点和边的持久化，哨兵和专家查询的数据源 |
| 会话存储 | SQLite | `src/store/session-store.ts` | 用户对话历史 |
| Agent记忆 | SQLite | `src/l4/agent-memory-store.ts` | GA纠错、企业特征、决策记录、进化数据 |
| 知识库 | SQLite FTS5 | `src/l4/knowledge-store.ts` | 企业文档、行业资料全文检索 |

### 2.1 本地部署

所有数据存储在客户本地。SQLite 是嵌入式数据库——不需要独立的数据库服务器，
部署和运维成本极低。这也是数据不出企业的技术基础。

**合规红线**：
- PII 脱敏（`security/pii-scrubber.ts`）：4级敏感度（S1公开/S2内部/S3受限/S4禁止）
- 行业知识基座上传统计特征（均值/方差/分位数），不上传任何原始数据
- 样本数<3硬阻断——统计特征不上传、不对外提供

---

## 三、数据流向

```
外部系统（ERP/财务/电商）        IM（飞书/企微）           GA访谈
        |                           |                      |
  Python连接器                  Webhook接收            访谈引擎
        |                           |                      |
  PythonBridge                 im-inbound.ts         engine.ts
        |                           |                      |
  OntologyEventBus ←────────────── Session存储 ────→ 结构化数据
        |
  GraphStore.createNode / createEdge
        |
  本体层（L4）—— 哨兵查询 —— 专家推理
```

---

## 四、和产品全景的关系

产品全景定义的三阶段路径，数据层是每个阶段的基础：

- **初次诊断**：GA用访谈引擎采集结构化数据 → 跑出初次诊断 → 建立信任
- **部署接入**：连接器管道对接企业系统 → 对比诊断（访谈认知 vs 数据现实）
- **持续运行**：IM消息+经营数据持续流入 → 哨兵24小时监控 → 专家定期诊断

---

## 五、结论

**数据层三条采集通道齐全（连接器+IM+访谈），存储层基于SQLite本地部署，
PII脱敏已实现。**

- 连接器管道：Python桥接模式，可扩展新数据源
- IM接入：飞书/企微已对接
- 访谈引擎：多角色+矛盾检测，支撑初次诊断场景
- 行业知识基座的数据提取层：待实现（属于进化体系的第三层）

---

## 六、财务数据接入方案

> 数据层当前仅定义了三条采集通道（连接器+IM+访谈），但缺少标准财务数据的字段映射和结构化接入路径。
> 以下方案来自 GROWTH-DIAGNOSTICS-FULL-CHAIN-v3.md 的审计结论（第①链路——数据进入断裂）。
> **权威来源**：docs/plans/codex/GROWTH-DIAGNOSTICS-FULL-CHAIN-v3.md

### 6.1 背景：当前Financial节点字段不足

当前 Financial 节点仅有 3 个字段（financialType/amount/period），无法承载哨兵计算所需的丰富财务数据。

### 6.2 扩展后字段清单（11+5 字段）

扩展后的 Financial 节点 optionalProps 包含以下 16 个数值字段：

| 字段 | 类型 | 来源 | 用途 |
|------|------|------|------|
| **revenue** | number | ERP/损益表 | 收入哨兵、利润哨兵 |
| **operatingCashFlow** | number | 现金流量表 | 现金流哨兵、融资约束计算 |
| **netPpe** | number | 资产负债表 | 资本效率哨兵、ROIC计算 |
| **totalDebt** | number | 资产负债表 | 融资约束、资本结构哨兵 |
| **equity** | number | 资产负债表 | 权益比、杠杆率计算 |
| **cash** | number | 资产负债表 | 现金流跑道哨兵 |
| **totalAssets** | number | 资产负债表 | 资产周转率 |
| **currentAssets** | number | 资产负债表 | 流动比率、运营资金 |
| **currentLiabilities** | number | 资产负债表 | 流动比率、短期偿债 |
| **receivables** | number | 应收账款明细 | 应收逾期、现金流哨兵 |
| **grossMargin** | number | 损益表 | 利润健康、竞争壁垒 |
| **operatingExpense** | number | 损益表 | 成本结构哨兵 |
| **inventory** | number | 存货明细 | 运营效率、周转率 |
| **period** | string | 财务期间 | 时间维度标记 |
| **source** | string | 数据来源 | 字段溯源 |
| **currency** | string | 币种 | 多币种支持 |

前 11 项来自 `extensions/ontology/field-mappings/erp-standard.json` 的标准字段映射，后 5 项为扩展字段。

### 6.3 字段映射配置路径

字段映射配置统一存放在 L4 扩展层：

```
extensions/ontology/field-mappings/erp-standard.json
```

JSON 结构示例（来自 GROWTH-DIAGNOSTICS-FULL-CHAIN-v3.md）：

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

GA 可通过 L1 ontology-admin 界面增删映射配置，写入 L4 JSON 文件，即刻生效。

### 6.4 数据接入编排（L2 data-ingest-service）

L1 数据入口：

```
POST /api/data/upload
  Content-Type: multipart/form-data
  Body: file (.csv/.json/.xlsx) + mapping (字段映射配置名，如 "erp-standard")
  → L2 data-ingest-service 解析文件
  → 从 L4 extensions/ontology/field-mappings/{name}.json 读取映射
  → 逐行调用 L4 GraphStore.createNode(type='Financial', props) 写入
  → 返回写入统计 (节点数/跳过数/错误列表)
```

GA 手动输入路径：L1 对话界面输入企业数据 → L2 conversation-engine 调用 data-ingest-service → 写入 L4。

### 6.5 哨兵数据依赖声明

哨兵 manifest.json 增加 `dependsOn.requiredFields` 声明机制，使哨兵在加载时检查所需字段是否存在：

```json
{
  "dependsOn": {
    "nodeTypes": ["Financial"],
    "requiredFields": ["operatingCashFlow", "netPpe", "totalDebt", "equity", "cash"]
  }
}
```

字段不存在时哨兵标记为 degraded，不产出假 Finding（铁律 31 降级信号传播）。

---

> **文档位置**：docs/synova/architecture/SYNOVA-ARCH-数据层(L5)-20260707.md
> **数据来源**：src/l5/connector-pipeline.ts, src/l1/im-inbound.ts,
>   src/interview/engine.ts, src/store/*.ts, src/security/pii-scrubber.ts
> **下一步**：运行时与部署架构文档
