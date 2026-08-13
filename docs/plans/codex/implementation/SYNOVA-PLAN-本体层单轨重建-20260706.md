---
title: "本体层统一方案 — 单轨重建计划"
version: "v2.0"
date: "2026-07-06"
status: "执行计划 — 待审批后执行"
---

# 本体层统一方案 — 单轨重建

## 0. 问题定义

Synova 当前存在三层互不兼容的本体论：
- **生产层** (旧SOG): 14条边 + 17节点 + 17个Props接口 + `@synova/sog-core`。`SOGEdgeType.AFFECTS`等枚举在241个文件位置被使用。graph-store的SQLite表结构依赖这些枚举值。这是唯一在生产跑的。
- **Schema层** (新JSON): 16条边 + 29子类型。`extensions/ontology/`下的JSON Schema。只有2个loader文件读取。边名完全不同。哨兵manifest(id全空)引用了一个不存在的ID体系。`consumed_by_sentinels`字段指向幽灵哨兵。
- **理论层** (v2.4规范): 16条边+4调节因子+完整数学公式。设计文档，零代码实现。

**目标**: 删除旧SOG枚举，以新JSON Schema为单一权威来源，所有代码直接使用JSON定义的节点类型字符串和边类型字符串。不保留旧枚举作为兼容层。一次切干净。

---

## 1. 新本体的最终形态

### 1.1 节点类型 (27个字符串值)

不再使用TypeScript枚举。使用字符串字面量联合类型。

```
activity/production
activity/acquisition
activity/innovation
activity/coordination
activity/learning
activity/governance
activity/maintenance
activity/compliance

outcome/financial
outcome/market
outcome/operational
outcome/people
outcome/innovation
outcome/risk
outcome/competitive
outcome/external

resource/money
resource/person
resource/team
resource/agent
resource/tool
resource/knowledge
resource/client
resource/brand
resource/data
resource/ip
resource/location
resource/channel
resource/supplier
```

### 1.2 边类型 (16个字符串值)

```
PRODUCES
DEPLOYS
FUNDS
DEPENDS_ON
SUBSTITUTES
SIGNAL_TRANSMITS
METRIC_BINDS
INCENTIVE_BINDS
DECISION_CONCENTRATES
EXTERNAL_ASSUMPTION_BINDS
LOCKS_IN
CONSTRAINS
AUGMENTS
INFORMS
DEPENDS_ON_PLATFORM
REPLENISHES
```

### 1.3 旧SOG→新本体映射表

| 旧SOG枚举 | 新本体字符串 | 映射类型 | 说明 |
|-----------|------------|---------|------|
| `SOGNodeType.PERSON` | `resource/person` | 1:1 | |
| `SOGNodeType.TEAM` | `resource/team` | 1:1 | |
| `SOGNodeType.AGENT` | `resource/agent` | 1:1 | |
| `SOGNodeType.TOOL` | `resource/tool` | 1:1 | |
| `SOGNodeType.CLIENT` | `resource/client` | 1:1 | |
| `SOGNodeType.FINANCIAL` | `outcome/financial` 或 `resource/money` | 拆分 | 旧SOG的Financial节点同时承载"现金储备"(resource/money)和"财务结果"(outcome/financial)。迁移时需按上下文判断 |
| `SOGNodeType.LOCATION` | `resource/location` | 1:1 | |
| `SOGNodeType.GOAL` | — | 无直接对应 | 新本体无Goal节点。Goal在v2.4规范中映射为Assumption实体的属性。迁移方案：GOAL节点存储为`activity/governance`(战略对齐活动) |
| `SOGNodeType.CAPABILITY` | — | 无直接对应 | 新本体无Capability节点。能力在新本体中通过DEPLOYS边的`contribution_elasticity`参数表达。迁移方案：CAPABILITY存储为`resource/knowledge`(知识资源) |
| `SOGNodeType.PROCESS` | `activity/production` (最接近) | 近似 | 旧SOG的Process对应新本体的Activity体系。需按processType映射：approval→governance, deployment→production, meeting→coordination |
| `SOGNodeType.EVENT` | — | 无直接对应 | 新本体无Event节点。事件作为边的时序数据存在。迁移方案：EVENT存储为时间戳标记在相关边的props中 |
| `SOGNodeType.DOCUMENT` | `resource/knowledge` 或 `resource/data` | 近似 | DOCUMENT映射为knowledge(data类型) |
| `SOGNodeType.RISK` | `outcome/risk` | 1:1 | |
| `SOGNodeType.COMPLIANCE` | `activity/compliance` | 1:1 | |
| `SOGNodeType.USER` | `resource/person` (带role=user标记) | 近似 | |
| `SOGNodeType.KNOWLEDGE_CHUNK` | `resource/knowledge` | 1:1 | |
| `SOGNodeType.BUSINESS_MODEL` | — | 无直接对应 | 商业模式作为EXTERNAL_ASSUMPTION_BINDS边的参数存储 |
| `SOGEdgeType.INTERACTS_WITH` | `INFORMS` (近似) | 近似 | 人与人交互映射为信息反馈 |
| `SOGEdgeType.BELONGS_TO` | — | 语法结构 | 归属关系通过节点ID中的路径前缀表达(如`resource/person`天然归属resource层) |
| `SOGEdgeType.OWNS` | `DEPLOYS` (近似) | 近似 | 所有权映射为资源部署 |
| `SOGEdgeType.TRIGGERS` | — | 时序数据 | 事件触发通过边的时序参数表达 |
| `SOGEdgeType.AFFECTS` | `DEPENDS_ON` + `INFORMS` | 组合 | 因果影响拆分为依赖+反馈 |
| `SOGEdgeType.DEPENDS_ON` | `DEPENDS_ON` | 1:1 | |
| `SOGEdgeType.CORRESPONDS_TO` | — | 无直接对应 | 文档对应关系降级为knowledge节点的metadata |
| `SOGEdgeType.CONSUMES` | `DEPLOYS` (资源→活动方向) | 方向反转 | 旧CONSUMES(Agent→Financial)和新DEPLOYS(Resource→Activity)表达同一件事但方向不同 |
| `SOGEdgeType.ALIGNS_WITH` | `INCENTIVE_BINDS` (近似) | 近似 | 目标对齐映射为激励对齐 |
| `SOGEdgeType.PROVIDES` | `DEPLOYS` (person→activity) | 近似 | 能力提供映射为资源部署 |
| `SOGEdgeType.HAS_ACCESS_TO` | — | 权限系统 | 访问控制不是本体边，是权限层 |
| `SOGEdgeType.REVENUE_FROM` | `PRODUCES` (activity→outcome/financial) + `REPLENISHES` (outcome→resource) | 组合 | 收入流拆为产出+反哺 |
| `SOGEdgeType.COST_DRIVEN_BY` | `FUNDS` (resource/money→activity) | 近似 | 成本驱动映射为资金分配 |
| `SOGEdgeType.VALUE_PROPOSITION` | `DEPLOYS` (resource/client→activity) | 近似 | 价值主张映射为客户资源部署到获客活动 |

---

## 2. 迁移步骤

### Step 1: 生成新的 TypeScript 类型包 `@synova/ontology`

创建一个新的 npm 包，取代 `@synova/sog-core`：

```
packages/ontology/
  src/
    index.ts          # 导出所有类型
    node-types.ts     # 27个节点类型字符串常量 + 联合类型
    edge-types.ts     # 16个边类型字符串常量 + 联合类型
    node-props.ts     # 27个节点Props接口 (从JSON Schema生成)
    edge-props.ts     # 16个边Props接口 (从JSON Schema生成)
    endpoint-map.ts   # 边端点矩阵 (从JSON Schema生成)
    validators.ts     # 节点/边验证器 (从JSON Schema生成)
  package.json
  tsconfig.json
```

**关键设计决策**: 不使用TypeScript枚举。使用`as const`字符串常量对象。

```typescript
// node-types.ts
export const NodeType = {
  ACTIVITY_PRODUCTION: 'activity/production',
  ACTIVITY_ACQUISITION: 'activity/acquisition',
  // ... 全部27个
  RESOURCE_SUPPLIER: 'resource/supplier',
} as const;

export type NodeType = typeof NodeType[keyof typeof NodeType];

// 向后兼容别名 (标记@deprecated, 编译警告)
/** @deprecated Use NodeType.RESOURCE_PERSON */
export const PERSON = NodeType.RESOURCE_PERSON;
/** @deprecated Use NodeType.RESOURCE_CLIENT */
export const CLIENT = NodeType.RESOURCE_CLIENT;
// ... 全部17个旧别名
```

同样模式处理EdgeType。

### Step 2: 编写自动化迁移脚本

`scripts/migrate-ontology.ts` — 一个 codemod 脚本，使用 `jscodeshift` 或直接正则替换：

1. 替换所有 `import { SOGNodeType, SOGEdgeType } from '@synova/sog-core'` → `import { NodeType, EdgeType } from '@synova/ontology'`
2. 替换 `SOGNodeType.PERSON` → `NodeType.RESOURCE_PERSON`
3. 替换 `SOGEdgeType.AFFECTS` → `EdgeType.DEPENDS_ON` (近似) 或标记 `// TODO: 人工审核 AFFECTS→DEPENDS_ON`
4. 对于无法自动映射的(如 `BELONGS_TO`, `TRIGGERS`, `CORRESPONDS_TO`, `HAS_ACCESS_TO`)，添加 `// ONTOLOGY-MIGRATION: 旧SOGEdgeType.BELONGS_TO 在新本体中无直接对应。请人工选择替代边。`

每个替换生成一个commit，逐文件review。

### Step 3: 迁移 graph-store.ts

`graph-store.ts` 是迁移的核心——它直接操作SQLite表，用 `SOGNodeType` 枚举值作为 `type` 列的值。

**需要修改**：
- `createNode()`: `SOGNodeType` → `NodeType`，验证器从 `NODE_VALIDATORS[type as SOGNodeType]` → `NODE_VALIDATORS[type as NodeType]`
- SQLite表中的`type`列当前存储旧枚举值(如`Person`, `Financial`)。**不做数据迁移**——旧数据保持旧type值。新数据使用新type值(如`resource/person`, `outcome/financial`)。graph-store的`queryNodes`方法支持两种格式的查询。
- `initSchema()`: 不动。表结构不变，type是TEXT列天然兼容。

### Step 4: 迁移 sentinel 系统

1. 给62个哨兵manifest填充`id`字段。ID格式：`sentinel-{目录名}`。
2. 更新16条边JSON的`consumed_by_sentinels`字段为真实的哨兵目录名。
3. 删除`src/sentinel/builtins.ts`的adapters扫描逻辑——旧adapters下的5个哨兵全部迁移到`extensions/sentinels/`目录下。
4. 统一哨兵注册入口只留`registerLoadedSentinels()`。

### Step 5: 迁移扩展目录的哨兵

`extensions/sentinels/`下62个哨兵目录，每个哨兵的aggregate.ts和computes/目录需要使用新的`NodeType`和`EdgeType`。

但哨兵aggregate.ts使用的是动态字符串（`store.queryNodes('CLIENT', ...)` → `store.queryNodes(NodeType.RESOURCE_CLIENT, ...)`）。需逐文件替换。

### Step 6: 删除旧代码

- 删除 `packages/sog-core/src/sog-core-schema.ts` 中的枚举导出（保留接口定义但标记`@deprecated`）
- 或者：将 `@synova/sog-core` 的 `index.ts` 改为从 `@synova/ontology` re-export，让旧的import路径仍然工作但实际使用新类型。**给一个版本号的过渡期，然后彻底删除旧包。**

### Step 7: 门禁

1. **pre-commit检查**: 禁止任何文件 `import { SOGNodeType, SOGEdgeType } from '@synova/sog-core'`（来自旧枚举的直接引用）
2. **CI集成测试**: 启动→加载所有哨兵→验证id非空→验证consumed_by_sentinels引用真实哨兵
3. **本体JSON一致性检查**: 启动时验证 edge-types/ 目录下的16个JSON Schema与 `@synova/ontology` 包的TypeScript类型定义完全一致

---

## 3. 本次迁移中不处理的内容（Phase 5再做）

| 项目 | 原因 |
|------|------|
| v2.4规范中A本体缺失的5条增长动力边 (COUPLES/OCCUPIES/CANNIBALIZES/CUMULATIVE_LEARNING/VOLATILITY_ARBITRAGES) | 需要本体扩展——本次只做统一，不做扩展 |
| v2.4规范的实体重新分类 (ResourcePool→15子上下文, Activity→单一抽象等) | 需要实体层重构——本次只统一边名和节点名 |
| ERP字段映射修复 (erp-standard.json vs money.json命名不一致) | P1级别，不阻塞主线 |
| 大规模props字段迁移 (旧SOG的FinancialProps vs 新本体的MONEY/FINANCIAL_OUTCOME) | 需要逐字段语义分析——本次只迁移类型标识 |

---

## 4. 预计影响范围

| 影响范围 | 文件数 | 迁移方式 |
|---------|--------|---------|
| `@synova/sog-core` import替换 | ~108个文件 | 脚本自动替换 + 人工审核 |
| 字符串常量 `SOGNodeType.XXX` → `NodeType.XXX` | ~1000个位置 | 脚本自动替换 |
| 字符串常量 `SOGEdgeType.XXX` → `EdgeType.XXX` | ~400个位置 | 脚本自动替换 |
| 哨兵manifest填充id | 62个manifest.json | 脚本批量生成 |
| 边JSON `consumed_by_sentinels` 修复 | 16个JSON | 人工校准 |
| 删除废弃adapters | 5个文件 + builtins.ts | 手动 |
| graph-store SQLite兼容 | 1个文件 | 手动 |
| entity-resolver / entity-registry / graph-bridge 等核心L4文件 | ~10个文件 | 人工逐行 |
| 62个哨兵aggregate.ts字符串引用 | ~62个文件 | 脚本辅助 + 人工检查 |

---

## 5. 验证标准

迁移完成的标准（全部硬门禁）：

1. `rg "SOGNodeType\." --type ts` 返回零结果（src/和packages/下）
2. `rg "SOGEdgeType\." --type ts` 返回零结果（src/和packages/下）
3. `rg "from '@synova/sog-core'" --type ts` 返回零结果（src/下）—— packages/sog-core自身除外
4. `npm run test` 全量通过（零失败）
5. `npm run lint` 通过（tsc --noEmit）
6. 启动synova-agent，日志中显示 `sentinel loader 已初始化: count=62, registered=62`
7. `GET /api/sentinel/reports` 返回非空哨兵报告
8. 每个哨兵的 `id` 字段非空
9. 每条边的 `consumed_by_sentinels` 引用的哨兵ID真实存在

---

*统一方案 · v2.0 · 2026-07-06*
