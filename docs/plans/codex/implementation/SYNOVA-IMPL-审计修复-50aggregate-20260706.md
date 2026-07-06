---
title: "SYNOVA-IMPL — 50 Aggregate 审计修复任务"
version: "v1.0"
date: "2026-07-06"
status: "P0任务 — 立即执行"
input: "SYNOVA-AUDIT-kv-aggregates-20260706.md + SYNOVA-AUDIT-traversal-aggregates-20260706.md"
scope: "修复全部50个aggregate的审计发现的问题（P0/P1/P2），然后补上图遍历模式"
---

# Task C: 50 Aggregate 审计修复 + 图遍历补全

> **前置条件：** 必须先读取以下两份审计报告全文，理解每一处FAIL的具体位置和修复方向。
> 1. `D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-AUDIT-kv-aggregates-20260706.md`
> 2. `D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-AUDIT-traversal-aggregates-20260706.md`
>
> **本体层合法实体类型（9种）：** `Person`, `Team`, `Agent`, `Tool`, `Client`, `Process`, `Event`, `Document`, `Financial`
> **注意：** 类型名是**大小写敏感**的（PascalCase），`TOOL`/`CLIENT`/`FINANCIAL`必须改为`Tool`/`Client`/`Financial`。
>
> **铁律引用：**
> - 铁律24：catch 块必须有 log.error（不是 log.warn），必须返回 degraded 标记或 Finding
> - 铁律31：降级信号传播——compute返回degraded=true时，aggregate必须检查并标注
> - 铁律11：静默降级禁止——catch 不得空吞异常

---

## Phase 1: P0修复 — 诊断结果不可信（必须先完成）

### 1A. 本体层类型失配（14个KV文件 — 查询了不存在的实体类型）

**问题：** 以下文件查询了本体层不存在的节点类型，`queryNodes('Goal', ...)` 永远返回空数组。哨兵永远不会产生有效数据。

**修复规则：** 将不存在的节点类型替换为等价的本体层合法类型。如果该哨兵的概念在本体层没有直接等价类型，则改为查询多个合法类型然后过滤。

| 文件 | 当前查询 | 修复为 | 理由 |
|------|---------|--------|------|
| `adaptation-velocity` | `queryNodes('Goal', ...)` | `queryNodes('Event', ...)` + 过滤 `eventType === 'strategic'` | 战略目标事件存在Event节点中 |
| `explore-exploit-balance` | `queryNodes('Goal', ...)` + `queryNodes('Product', ...)` | `queryNodes('Event', ...)` + `queryNodes('Tool', ...)` | 探索/利用信号来自事件和工具 |
| `incentive-alignment` | `queryNodes('Goal', ...)` | `queryNodes('Person', ...)` + 从props中提取incentive字段 | 激励对齐数据在Person节点上 |
| `resource-misallocation` | `queryNodes('Goal', ...)` | `queryNodes('Event', ...)` + 过滤 eventType包含'goal' | 资源分配目标存在Event中 |
| `strategy-capability-fit` | `queryNodes('Goal', ...)` + `queryNodes('Capability', ...)` | `queryNodes('Event', ...)` + `queryNodes('Person', ...)` | 战略目标→Event, 能力→Person.skills |
| `competitive-moat-perceptual` | `queryNodes('Product', ...)` | `queryNodes('Tool', ...)` | 产品在Tool实体中 |
| `knowledge-accessibility` | `queryNodes('KnowledgeChunk', ...)` + `queryNodes('Capability', ...)` | `queryNodes('Document', ...)` + `queryNodes('Person', ...)` | 知识→Document, 能力→Person |
| `make-or-buy` | `queryNodes('Capability', ...)` | `queryNodes('Person', ...)` + 从props.skills提取 | 能力在Person上 |
| `talent-density` | `queryNodes('Capability', ...)` | 删除此行（该查询结果未使用） | 查询了但未消费，直接删除 |
| `network-power` | `queryNodes('Supplier', ...)` | `queryNodes('Agent', ...)` | 外部实体在Agent中 |
| `niche-breadth` | `queryNodes('Location', ...)` + `queryNodes('Market', ...)` | `queryNodes('Client', ...)` + `queryNodes('Event', ...)` | 地域→Client.location, 市场→Event |
| `niche-squeeze` | `queryNodes('Market', ...)` + `queryNodes('Supplier', ...)` | `queryNodes('Client', ...)` + `queryNodes('Agent', ...)` | 同上 |
| `structural-change` | `queryNodes('Compliance', ...)` | `queryNodes('Event', ...)` + 过滤 eventType包含'compliance' | 合规事件在Event中 |
| `data-health` | `queryNodes('ALL', ...)` + `queryNodes('APP', ...)` + `queryNodes('SYSTEM', ...)` | `queryNodes('Tool', ...)` + `queryNodes('Process', ...)` + `queryNodes('Document', ...)` | 数据健康检查三种合法实体 |

**每个文件的具体修复步骤（必须逐行执行）：**

1. 找到 `store.queryNodes('不存在的类型', ...)` 行
2. 替换为表中的修复类型
3. 如果原代码对该节点的props有特殊字段读取（如`n.props.priority`），确认新类型的props schema中是否有等价字段；如果没有，使用`(n.props.xxx as string) || ''`的安全读取方式并标注warnings
4. 修复后运行该哨兵的单元测试（如果存在`__tests__/`目录）或至少确认文件语法正确

### 1B. 大小写不一致（5个KV文件）

| 文件 | 当前 | 修复为 |
|------|------|--------|
| `api-coverage` | `queryNodes('TOOL', ...)` | `queryNodes('Tool', ...)` |
| `customer-demand-shift` | `queryNodes('CLIENT', ...)` | `queryNodes('Client', ...)` |
| `data-health` | `queryNodes('TOOL', ...)` | `queryNodes('Tool', ...)` |
| `resource-misallocation` | `queryNodes('FINANCIAL', ...)` | `queryNodes('Financial', ...)` |
| `value-capture` | `queryNodes('FINANCIAL', ...)` | `queryNodes('Financial', ...)` |

**修复步骤：** 全局搜索替换，每个文件一行改动。同时检查同一文件中是否还有其他大写引用。

### 1C. 硬编码假数据 — traversal aggregates（4个文件）

**这些文件使用了硬编码的假数据调用compute函数，诊断结果完全不可信。必须改为从store读取。**

#### competitive-moat-structural (`extensions/sentinels/competitive-moat-structural/aggregate.ts`)
- **当前代码（L35附近）：** `computeCounterPositioningSlm({ incumbentMargin: 0.6, incumbentPrice: 100, ourPrice: 60, ourRevenue: 100, incumbentRevenue: 5000 })`
- **修复：** 从 `allNodes` 中提取真实数据。若数据不足，标记 degraded 并返回 info Finding：
```typescript
const marketNodes = allNodes.filter(n => n.type === 'MARKET_OUTCOME');
const ourFinNodes = allNodes.filter(n => n.type === 'Financial');
if (marketNodes.length === 0 || ourFinNodes.length === 0) {
  return [{ id: `i3-nodata-${now.getTime()}`, severity: 'info', 
    title: '市场数据不足', description: '无法计算护城河SLM——缺少市场或财务数据',
    evidence: [], suggestion: '补充Market和Financial节点数据。', detectedAt: checkedAt }];
}
const marketData = marketNodes.reduce((acc, n) => ({
  incumbentMargin: acc.incumbentMargin + (Number(n.props.incumbentMargin) || 0.3),
  incumbentPrice: acc.incumbentPrice + (Number(n.props.incumbentPrice) || 100),
  count: acc.count + 1
}), { incumbentMargin: 0, incumbentPrice: 0, count: 0 });
const avg = { incumbentMargin: marketData.incumbentMargin / marketData.count, incumbentPrice: marketData.incumbentPrice / marketData.count };
const ourRevenue = ourFinNodes.reduce((s, n) => s + (Number(n.props.revenue) || 0), 0);
const slmResult = computeCounterPositioningSlm({ incumbentMargin: avg.incumbentMargin, incumbentPrice: avg.incumbentPrice, ourPrice: ourPrice, ourRevenue: ourRevenue, incumbentRevenue: 0 });
```

#### competitive-dynamics (`extensions/sentinels/competitive-dynamics/aggregate.ts`)
- **当前代码（L60-62附近）：** `recentEntries: 1, recentExits: 1, marketGrowth: 0.05` 硬编码
- **修复：** 从 `marketNodes` 中提取：
```typescript
const recentEntries = marketNodes.reduce((s, n) => s + (Number(n.props.recentEntries) || 0), 0);
const recentExits = marketNodes.reduce((s, n) => s + (Number(n.props.recentExits) || 0), 0);
const marketGrowth = marketNodes.length > 0 ? marketNodes.reduce((s, n) => s + (Number(n.props.growthRate) || 0), 0) / marketNodes.length : 0;
```

#### market-lifecycle (`extensions/sentinels/market-lifecycle/aggregate.ts`)
- **当前代码（L50附近）：** `previousRevenue = currentRevenue * 0.85` 凭空构造
- **当前代码（L55附近）：** `competitorEntries: 1, competitorExits: 0` 硬编码
- **修复：**
  - `previousRevenue` 从 `finNodes.props.previousRevenue` 读取，若字段不存在则标记 degraded
  - `competitorEntries/Exits` 从 `marketNodes` 读取，同 competitive-dynamics 的修复方式

#### internal-transaction-cost (`extensions/sentinels/internal-transaction-cost/aggregate.ts`)
- **当前代码（L17附近）：** `previousAdminCost: adminCost * 0.9, previousTotalCost: totalCost * 0.9`
- **修复：** 从 `finNodes.props.previousAdminCost` 和 `finNodes.props.previousTotalCost` 读取。若字段不存在，使用当前值并标记 degraded：
```typescript
const previousAdminCost = Number(finNode.props.previousAdminCost) || adminCost; // fallback到当前值
const previousTotalCost = Number(finNode.props.previousTotalCost) || totalCost;
// 如果用到了fallback，在返回的Finding中标注: evidence: ['注意：历史成本数据缺失，使用当前值替代']
```

### 1D. 完全不读数据的哨兵（1个KV文件）

#### moat-dependency (`extensions/sentinels/moat-dependency/aggregate.ts`)
- **当前代码：** `computeMoatDependency(0.6, 0.3)` — store参数完全未使用
- **修复：** 从store查询数据后计算：
```typescript
const finNodes = store.queryNodes('Financial', { teamId });
const toolNodes = store.queryNodes('Tool', { teamId });
const clientNodes = store.queryNodes('Client', { teamId });
const structuralStrength = toolNodes.length > 0 ? toolNodes.reduce((s, n) => s + (Number(n.props.moatScore) || 0.5), 0) / toolNodes.length : 0.5;
const perceptualStrength = clientNodes.length > 0 ? clientNodes.reduce((s, n) => s + (Number(n.props.nps) || 0) / 100, 0) / clientNodes.length : 0.3;
const r = computeMoatDependency(structuralStrength, perceptualStrength);
if (finNodes.length === 0 && toolNodes.length === 0) {
  // 数据不足，返回info
  return [{ id: `i8-nodata-${now.getTime()}`, severity: 'info', title: '护城河数据不足', ... }];
}
```

---

## Phase 2: P1修复 — 异常被吞没（铁律24/31违规）

### 2A. 未检查degraded标志（11个KV文件）

**问题：** compute函数返回了 `{ degraded: true, ... }` 但aggregate不检查，直接使用可能不准确的值输出Finding。

**文件列表：** `competitive-moat-perceptual`, `make-or-buy`, `moat-dependency`, `network-power`, `niche-breadth`, `niche-squeeze`, `opportunity-window`, `resource-misallocation`, `structural-change`, `time-penetration`, `value-capture`

**统一修复模式（每个文件都要加）：**
```typescript
const result = computeXxx(...);
if (result.degraded) {
  log.warn({ teamId, warnings: result.warnings }, 'compute函数降级——数据可能不完整');
  // 仍然可以输出Finding，但severity降为info，并在evidence中标注数据质量问题
  // 或者：如果degraded导致数据完全不可信，返回info Finding并跳过后续阈值判断
}
```

**注意：** 不要在degraded时静默返回`[]`——那会让调用方以为"一切正常没有Finding"，实际上是有问题但算不出来。正确的做法是返回info级别的Finding告知数据质量问题。

### 2B. catch块无Finding返回（4个traversal文件 + 2个KV文件）

**Traversal文件：** `cash-runway`, `cost-health`, `profit-health`, `revenue-health`
- **当前代码：** `catch (err) { log.warn({err}, 'xxx'); }` — 无return语句
- **修复：** 每个catch块末尾添加：
```typescript
catch (err: unknown) {
  log.error({ err, teamId }, '[sentinel-name] check失败');
  return [{
    id: `{prefix}-error-${Date.now()}`,
    severity: 'warning',
    title: '哨兵执行异常',
    description: `${(err as Error)?.message || String(err)}`,
    evidence: [],
    suggestion: '检查数据源和系统状态。',
    detectedAt: new Date().toISOString(),
  }];
}
```

**KV文件：**
- `key-person-risk`: aggregate.ts本身无try/catch，委托的L3函数`checkKeyPersonRisk`的catch使用`log.warn`而非`log.error`。修复：aggregate.ts外层加try/catch，L3函数的catch改为`log.error`。
- `agent-deployment-maturity`: catch返回的Finding的`description`和`suggestion`为空字符串。修复：填入有意义的错误描述。

### 2C. magic number — 硬编码值（P2，可defer但建议一起修）

**KV文件（11个）：**
| 文件 | 当前值 | 修复为 |
|------|--------|--------|
| `agent-deployment-maturity` | `autonomyLevel: 2` | 从 `store.queryNodes('Tool', ...)` 的props.autonomyLevel读取，默认值2 |
| `ai-ecosystem-fit` | `totalPlatforms: 5` | 从store读取Tool节点数量 |
| `ai-ecosystem-fit` | `/ 3` | 改为 `/ Math.max(1, platforms.length)` |
| `ai-investment-return` | `5000, 3000, 10000` | 从store查询Financial节点的实际值 |
| `human-agent-boundary` | `100, 0.5, 0.7` | 从Process/Tool节点的props读取，无数据时标注degraded |
| `power-rigidity` | `founderEquity: 0.5` | 从Person节点的props.equity读取 |
| `process-ai-readiness` | `teamSkillAvg: 3` | 从Person节点的props.skillLevel聚合计算 |
| `time-penetration` | `0` (外部事件数) | 从Event节点查询eventType为'external'的数量 |

**Traversal文件（1个）：**
| `profit-health` | `benchmarkMargin = 0.25` | 从manifest.json的thresholds读取，或从Financial节点聚合计算行业均值 |

**修复规则：** 如果能从store读取→读取；如果store中确实没有对应字段→保留默认值但**必须在返回的Finding.evidence中标注"使用默认值xxx，原因：数据字段缺失"**。

---

## Phase 3: 图遍历模式补全（33个KV→遍历+fallback）

**这些文件当前只有`check(store, teamId)`签名，没有traversal参数。需要：**

1. 在`check()`签名中增加第三个参数 `traversal?: GraphTraversal`
2. 增加import: `import type { GraphTraversal } from '../../../src/l4/graph-traversal';`
3. 在数据查询前增加图遍历尝试：
```typescript
let nodes: Array<{id:string; type:string; props:Record<string,unknown>}> = [];
let usedTraversal = false;
try {
  if (traversal) {
    const r = traversal.traverse([teamId], ['EDGE_TYPE1', 'EDGE_TYPE2']);  // 选择合适的因果边
    if (r.nodes[0]) { nodes = r.nodes; usedTraversal = true; }
  }
} catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到KV模式'); }
if (!usedTraversal) {
  nodes = store.queryNodes('EntityType', { teamId });  // 原有的KV查询
}
```

4. 选择正确的因果边类型——参考该哨兵所属的领域。例如：
   - 财务类哨兵 → traverse用 `['FUNDS', 'PRODUCES']`
   - 人员/组织哨兵 → traverse用 `['REPORTS_TO']`
   - 客户/市场哨兵 → traverse用 `['BUYS_FROM', 'COMPETES_WITH']`
   - 工具/技术哨兵 → traverse用 `['DEPENDS_ON']`

**文件列表（33个）：** adaptation-velocity, agent-deployment-maturity, ai-ecosystem-fit, ai-investment-return, api-coverage, channel-capacity, competitive-moat-perceptual, connector-coverage, customer-demand-shift, data-health, explore-exploit-balance, human-agent-boundary, incentive-alignment, info-distortion, key-person-risk, knowledge-accessibility, make-or-buy, moat-dependency, network-power, niche-breadth, niche-squeeze, opportunity-window, org-repairability, power-rigidity, process-ai-readiness, resource-misallocation, routine-diffusion, routine-mutation, strategy-capability-fit, structural-change, talent-density, time-penetration, value-capture

---

## Phase 4: 验证与收尾

### 4.1 修复验证（每个Phase完成后必做）

```
[ ] git diff --stat 确认仅修改了预期文件
[ ] npx tsc --noEmit 零错误
[ ] npx vitest run 零新增失败
[ ] grep -rn "queryNodes('Goal'" extensions/sentinels/ 返回空（确认全部Goal已替换）
[ ] grep -rn "queryNodes('Product'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('Capability'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('Market'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('Supplier'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('Location'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('Compliance'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('KnowledgeChunk'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('ALL'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('APP'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('SYSTEM'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('TOOL'" extensions/sentinels/ 返回空（大写应全部改为Tool）
[ ] grep -rn "queryNodes('CLIENT'" extensions/sentinels/ 返回空
[ ] grep -rn "queryNodes('FINANCIAL'" extensions/sentinels/ 返回空
[ ] grep -rn "catch.*\{.*log\.warn.*\}$" extensions/sentinels/ 检查是否还有空吞异常的catch（仅log.warn无return的）
```

### 4.2 Done标准

```
[ ] Phase 1: 全部14个本体层类型失配已修复 + grep确认零残留
[ ] Phase 1: 全部5个大小写不一致已修复 + grep确认零残留
[ ] Phase 1: 全部4个traversal硬编码假数据已从store读取
[ ] Phase 1: moat-dependency不再使用硬编码参数
[ ] Phase 2: 全部11个文件已检查degraded标志
[ ] Phase 2: 全部6个文件catch块改为返回warning Finding
[ ] Phase 2: 全部magic number已改为从store读取或标注默认值原因
[ ] Phase 3: 全部33个KV文件已增加traversal参数+图遍历+KV fallback
[ ] Phase 4: tsc --noEmit 零错误
[ ] Phase 4: vitest run 零新增失败
[ ] Phase 4: 全部grep检查零残留
```

---

> **文档位置：** docs/plans/codex/implementation/SYNOVA-IMPL-审计修复-50aggregate-20260706.md
> **关联审计报告：** SYNOVA-AUDIT-kv-aggregates-20260706.md + SYNOVA-AUDIT-traversal-aggregates-20260706.md
> **修复完成后：** 执行 JTBD哨兵工程实施方案 v2.0 (SYNOVA-IMPL-JTBD哨兵工程实施方案-20260706.md)
