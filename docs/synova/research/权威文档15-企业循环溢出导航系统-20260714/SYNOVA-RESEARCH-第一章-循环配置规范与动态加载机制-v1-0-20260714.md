# 第一章：循环配置规范与动态加载机制

> 权威文档15 -- 企业循环溢出导航系统 | 2026-07-14 | v1.0
> 定位：子循环运行的基石 -- 定义"什么是子循环、怎么配置、怎么加载、怎么覆盖"

---

## 一、设计哲学：子循环不是固定枚举，是运行时注册的可配置拓扑

**核心命题**：不同的企业有不同的循环拓扑。餐饮连锁有"门店复制循环"，建筑企业有"工程交付循环"，SaaS有"ARR增长循环"。系统预设的4个通用循环（现金流/客户/人才/产品）只是起点，不是全集。

**设计原则**：

1. **文件驱动注册**：新增子循环 = 新增一个JSON配置文件，不修改任何代码。类比：哨兵系统 -- 新增哨兵 = 在 `extensions/sentinels/{name}/` 下新增 `manifest.json` + `aggregate.ts`。
2. **行业分层模板**：系统预置 -> 行业模板 -> 企业自定义，三层覆盖，下层覆盖上层。
3. **契约显式化**：溢出公式中的每个参数显式标注数据来源（来源类型、来源ID、是否估值、置信度），不允许隐式来源。
4. **不可约简性门禁**：不是"觉得重要就加" -- 每个候选子循环必须通过三条正交性检验才能注册为独立循环。

---

## 二、子循环判定框架：三条正交性检验

一个候选循环是否应该被建模为独立子循环？用以下三条检验判断：

### 检验1：输入独立性

**问题**：该循环的输入是否具有独立来源，不完全是其他循环的副产品？

**判定标准**：循环的输入池（如cash-pool, talent-pool）中，至少有一个具有独立的外部来源或内部自主生成机制。如果所有输入都来自其他循环的输出（如"利润再投资"完全来自现金流循环的溢出），则该循环不具备输入独立性。

**示例**：
- "门店复制循环"的输入 `cash-pool` 部分来自母店利润（独立），`talent-pool` 来自外部招聘（独立） -> 通过
- "内部审计循环"的输入完全来自其他循环的执行结果 -> 不通过

### 检验2：转化独特性

**问题**：该循环的转化活动是否涉及不同的42边组？与其他循环的边组重叠度是否 < 50%？

**判定标准**：将候选循环映射到42条因果边，计算与其他已注册循环的边组重叠率：

```
overlap_rate = |candidate_edges U existing_cycle_edges| / |candidate_edges|
```

如果对所有已有循环，`overlap_rate < 0.5`，则通过。

**示例**：
- "门店复制循环"边组：E-05, E-07, E-13, E-23, E-28, E-30, E-31, E-34, E-37, E-38（10条）
- "现金流循环"边组：E-05, E-06, E-13, E-23, E-30, E-37（6条）
- 重叠边：E-05, E-13, E-23, E-30, E-37（5条/10条=50%）-> 边界情况，需看检验3

### 检验3：溢出不可约简性

**问题**：该循环的溢出是否不能被其他已有循环的溢出组合解释？

**判定标准**：用已有循环的溢出指标对候选循环的溢出做回归分析：

```
candidate_overflow = beta_1 * cycle_1_overflow + ... + beta_n * cycle_n_overflow + residual
```

如果 `adjusted_R^2 < 0.7`（即残差 > 阈值），说明候选溢出有独立信息量，不能被已有循环组合还原。

### 综合判定表

| 检验1 | 检验2 | 检验3 | 结论 |
|-------|-------|-------|------|
| Y | Y | Y | **独立子循环** -- 注册为新循环 |
| Y | Y | N | "子阀" -- 在已有循环内增加细分监测点 |
| Y | N | Y | "子阀" -- 在已有循环内增加细分监测点 |
| N | Y | Y | "子阀" -- 在已有循环内增加细分监测点 |
| 任一为N且R^2>=0.7 | -- | -- | 不建模为独立循环 -- 作为已有循环的参数变体 |

---
## 三、循环配置JSON Schema（完整定义）

### 3.1 顶层结构

```jsonc
{
  "$schema": "https://synova.dev/schemas/cycle-manifest-v1.json",
  "cycleId": "store-replication",
  "name": "门店复制循环",
  "version": "1.0.0",
  "lifecycle": "active",
  "description": "单店盈利模型 -> 复制新店 -> 规模效应 -> 更强单店盈利能力。核心问题：单店模型盈利能力是否覆盖新店投资？",
  "applicableIndustries": ["餐饮", "零售", "连锁服务"],

  "nodes": { /* 池节点四分类 */ },
  "edges": { /* 五阀映射 */ },
  "overflowFormula": "...",
  "overflowParams": [ /* 参数溯源 */ ],
  "dataMaturity": { /* 数据成熟度 */ },
  "crossCyclePropagation": [ /* 跨循环传导 */ ],
  "computeInterval": "monthly"
}
```

### 3.2 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `$schema` | string | 是 | JSON Schema引用，格式 `https://synova.dev/schemas/cycle-manifest-v1.json` |
| `cycleId` | string | 是 | 唯一标识，kebab-case（对标哨兵 `name`），如 `store-replication`、`arr-growth` |
| `name` | string | 是 | 中文显示名 |
| `version` | string | 是 | SemVer版本号，对标哨兵 `manifest.version` |
| `lifecycle` | enum | 是 | `active` | `deprecated` | `experimental` |
| `description` | string | 是 | 1-3句中文描述，说明循环是什么、核心问题是什么 |
| `applicableIndustries` | string[] | 是 | 适用行业列表，空数组 `[]` 表示全行业通用 |
| `nodes` | object | 是 | 池节点四分类（见3.3） |
| `edges` | object | 是 | 五阀映射（见3.4） |
| `overflowFormula` | string | 是 | 溢出公式，等号右边为数学表达式 |
| `overflowParams` | object[] | 是 | 参数溯源表（见3.5） |
| `dataMaturity` | object | 是 | 数据成熟度分段（见3.6） |
| `crossCyclePropagation` | object[] | 否 | 跨循环传导路径（见3.7） |
| `computeInterval` | enum | 是 | 计算周期：`daily` | `weekly` | `monthly` | `quarterly` |

### 3.3 `nodes` -- 池节点四分类

```
input（输入池）：循环消耗的资源储备，来自企业边界之外或上游循环溢出
   例：cash-pool, talent-pool, site-pipeline

conversion（转化池）：将输入变为输出的核心活动能力
   例：store-operations, site-selection, training-system

output（输出池）：循环产出的价值
   例：store-profit, customer-base, brand-presence

reflow（回流池）：从输出回注到输入的机制
   例：profit-reinvestment, brand-equity, talent-referral
```

```jsonc
{
  "nodes": {
    "input": ["cash-pool", "talent-pool"],
    "conversion": ["store-operations", "site-selection", "training-system"],
    "output": ["store-profit", "customer-base", "brand-presence"],
    "reflow": ["profit-reinvestment", "brand-equity", "talent-referral"]
  }
}
```

### 3.4 `edges` -- 五阀映射（含action_effect_lag）

每个子循环构建"获取->分配->转化->交付->回收"五个阀门。每个阀门映射到42条因果边的一条或多条。每条边标注其 `actionEffectLag`。

> **注意**：`actionEffectLag` 字段在42边权威定义中尚未全面写入（当前仅在研究方案 v2.0 中提出了E-15/E-17/E-38的预估值）。循环配置中的滞后标注代表"预期生效延迟" -- 当42边体系中正式写入 `action_effect_lag` 后，Loader 会交叉校验并标记差异。

```jsonc
{
  "edges": {
    "acquisitionValve": [
      { "edgeId": "E-05", "actionEffectLag": "immediate" },
      // E-05 CAPITAL_ACQUISITION：资本获取 -- 获取即生效，无延迟
      { "edgeId": "E-07", "actionEffectLag": "1-3_months" }
      // E-07 TALENT_ACQUISITION：招聘到入职一般1-3个月
    ],
    "allocationValve": [
      { "edgeId": "E-13", "actionEffectLag": "1_month" }
      // E-13 CAPITAL_ALLOCATION：预算分配到位一般1个月
    ],
    "conversionValve": [
      { "edgeId": "E-23", "actionEffectLag": "3-6_months" },
      // E-23 OPERATIONAL_EXECUTION：运营效率改善一般3-6个月见效
      { "edgeId": "E-28", "actionEffectLag": "3-6_months" }
      // E-28 CROSS_FUNCTIONAL_SYNERGY：跨职能协同改善
    ],
    "deliveryValve": [
      { "edgeId": "E-30", "actionEffectLag": "1-3_months" },
      // E-30 VALUE_DELIVERY：价值交付到客户感知
      { "edgeId": "E-31", "actionEffectLag": "1_month" }
      // E-31 CUSTOMER_SUCCESS：客户成功反馈
    ],
    "recycleValve": [
      { "edgeId": "E-37", "actionEffectLag": "6-12_months" }
      // E-37 PROFIT_REINVEST：利润确认到再投资决策一般6-12个月
    ]
  }
}
```

**action_effect_lag 取值规范**：

| 取值 | 含义 | 适用场景 |
|------|------|---------|
| `immediate` | 即时生效，无延迟 | 资本获取（钱到账即可用） |
| `1_month` | 约1个月 | 预算调整、激励变更、客户反馈 |
| `1-3_months` | 1~3个月 | 招聘入职、价值交付感知、数据反馈 |
| `3-6_months` | 3~6个月 | 运营改善、知识积累实现、品牌建设 |
| `6-12_months` | 6~12个月 | 利润再投资决策、组织学习见效 |
| `>12_months` | 超过12个月 | 文化变革、结构性转型 |

### 3.5 `overflowParams` -- 参数溯源表

溢出公式中的每个参数必须显式标注数据来源。三种来源类型：

| 来源类型 | 含义 | 示例 |
|---------|------|------|
| `compute` | 来自25个测量器中的一个，有确定的计算逻辑 | `sourceId: "COMPUTE-STORE-PROFIT-V1"` |
| `42edge` | 来自42条因果边参数，是transfer_function的输出或中间变量 | `sourceId: "E-13.capital_allocation"` |
| `manual` | 需GA手动输入或从外部数据源导入，无自动计算能力 | `sourceId: "GA_INPUT"` |

```jsonc
{
  "overflowParams": [
    {
      "name": "store_profit",
      // 溢出公式中的变量名
      "source": "compute",
      "sourceId": "COMPUTE-STORE-PROFIT-V1",
      "isEstimated": false,
      "confidence": "high"
    },
    {
      "name": "new_store_investment",
      "source": "42edge",
      "sourceId": "E-13.capital_allocation",
      // 引用路径格式：{edgeId}.{parameter_name}，对应42边定义中的参数语义表
      "isEstimated": false,
      "confidence": "high"
    },
    {
      "name": "operating_cost",
      "source": "manual",
      "sourceId": "GA_INPUT",
      "isEstimated": true,
      "confidence": "medium",
      "estimatedBy": "GA"
      // 标注估算方
    }
  ]
}
```

**置信度定义**：

| 置信度 | 含义 | 条件 |
|--------|------|------|
| `high` | 数据来自确定计算或已验证的42边 | `isEstimated=false` + 来源为compute/42edge |
| `medium` | 数据来自GA手动输入或估值，有行业基准校验 | `isEstimated=true` + 有行业对比 |
| `low` | 数据来自GA手动输入，无校验 | `isEstimated=true` + 无标记来源 |

### 3.6 `dataMaturity` -- 数据成熟度分段

不同企业接入SynovaAgent的时间不同，数据积累量不同。溢出指标必须标注其数据基础是否充足。

```jsonc
{
  "dataMaturity": {
    "minimumDataWindow": "6_months",
    // 该循环最小数据窗口 -- 少于此窗口时使用行业基准代替

    "maturityStages": {
      "learning": {
        "window": "0-6_months",
        "usesIndustryBaseline": true,
        "displayLabel": "学习期（使用行业参考值）"
        // 仪表盘显示行业基准，标注"参考值，非贵企业实际数据"
      },
      "active": {
        "window": "6-12_months",
        "confidence": "medium",
        "displayLabel": "活跃期（中等可靠性）"
        // 有初步数据置信度，标注"基于6-12个月数据"
      },
      "mature": {
        "window": ">12_months",
        "confidence": "high",
        "displayLabel": "成熟期（高可靠性）"
      }
    }
  }
}
```

### 3.7 `crossCyclePropagation` -- 跨循环传导路径

子循环之间并非独立 -- 一个循环的溢出可能是另一个循环的输入。此字段显式标注传导关系。

```jsonc
{
  "crossCyclePropagation": [
    {
      "from": "store-profit",
      // 来源循环溢出指标名
      "to": "profit-reinvestment",
      // 目标循环输入指标名
      "via": "E-37",
      // 传导介质 -- 42边ID
      "estimatedLag": "3-6_months",
      // 传导延迟 = 来源边action_effect_lag + 传导边action_effect_lag
      "multiplier": { "min": 0.3, "typical": 0.5, "max": 0.8 }
      // 传导效率：来源循环溢出中，实际转化为目标循环输入的比例
    }
  ]
}
```

---

## 四、循环加载器（CycleLoader）

### 4.1 设计对标

CycleLoader 对标 `src/sentinel/sentinel-loader.ts` 的架构模式 -- 文件驱动扫描 + 注册的模式。核心差异：哨兵是单目录 + 单层加载，循环是三目录 + 优先级覆盖。

**哨兵加载器核心模式（本loader应复现）**：
- `loadSentinels()`：扫描目录 -> 读取manifest -> 校验 -> 缓存 -> 返回 `{ data, degraded, errors[] }`
- `clearSentinelCache()`：清除缓存，用于热加载
- `registerLoadedSentinels()`：将已加载的哨兵动态import并注册到全局Registry
- dependsOn校验：检查引用的nodeType/field在ontology中是否存在

### 4.2 加载路径与优先级

```
系统预置    cycles/builtin/*.cycle.json       <- 出厂默认，全行业通用
  | 覆盖
行业模板    cycles/industry/{industry}/*.cycle.json  <- 行业定制
  | 覆盖
企业自定义  cycles/custom/{enterpriseId}/*.cycle.json <- 单个企业参数覆盖
```

**加载逻辑**：

1. 启动时扫描三个目录，收集所有 `*.cycle.json` 文件
2. 按 `cycleId` 分组 -- 同一 `cycleId` 的配置，高优先级覆盖低优先级
3. 优先级：企业自定义 > 行业模板 > 系统预置。如果 `cycles/custom/wowbaby/store-replication.cycle.json` 存在，则忽略 `cycles/builtin/store-replication.cycle.json` 和 `cycles/industry/retail/store-replication.cycle.json`
4. 根据当前企业的行业属性匹配 `applicableIndustries` -- 仅加载适用行业的配置（`applicableIndustries: []` 匹配所有行业）

### 4.3 CycleLoader TypeScript接口定义

```typescript
// src/cycles/cycle-loader.ts -- 对标 src/sentinel/sentinel-loader.ts

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('cycles/loader');

// --- 类型定义 ---

export interface ValveEdge {
  edgeId: string;           // 42边ID，如 "E-05"
  actionEffectLag: string;  // "immediate" | "1_month" | "1-3_months" | ...
}

export interface OverflowParam {
  name: string;
  source: 'compute' | '42edge' | 'manual';
  sourceId: string;
  isEstimated: boolean;
  confidence: 'high' | 'medium' | 'low';
  estimatedBy?: string;    // 仅 source='manual' 时使用
}

export interface MaturityStage {
  window: string;
  usesIndustryBaseline?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  displayLabel: string;
}

export interface DataMaturity {
  minimumDataWindow: string;
  maturityStages: {
    learning: MaturityStage;
    active: MaturityStage;
    mature: MaturityStage;
  };
}

export interface CrossCyclePropagation {
  from: string;
  to: string;
  via: string;
  estimatedLag: string;
  multiplier?: { min: number; typical: number; max: number };
}

export interface CycleManifest {
  cycleId: string;
  name: string;
  version: string;
  lifecycle: 'active' | 'deprecated' | 'experimental';
  description: string;
  applicableIndustries: string[];
  nodes: {
    input: string[];
    conversion: string[];
    output: string[];
    reflow: string[];
  };
  edges: {
    acquisitionValve: ValveEdge[];
    allocationValve: ValveEdge[];
    conversionValve: ValveEdge[];
    deliveryValve: ValveEdge[];
    recycleValve: ValveEdge[];
  };
  overflowFormula: string;
  overflowParams: OverflowParam[];
  dataMaturity: DataMaturity;
  crossCyclePropagation?: CrossCyclePropagation[];
  computeInterval: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

export interface LoadedCycle {
  manifest: CycleManifest;
  source: 'builtin' | 'industry' | 'custom';
  sourcePath: string;
  enterpriseId?: string;
}

// --- 核心API ---

const CYCLES_ROOT = join(process.cwd(), 'cycles');
let cache: LoadedCycle[] | null = null;
let cacheKey: string | null = null;

/**
 * 扫描 cycles/ 三目录，加载所有适用循环配置。
 * 对标 sentinel-loader 的 loadSentinels()。
 *
 * @param options.enterpriseId - 企业ID，用于custom目录定位
 * @param options.industry - 企业所属行业，用于industry目录匹配和applicableIndustries过滤
 * @returns 循环列表 + 降级标记 + 错误列表
 */
export function loadCycles(options: {
  enterpriseId: string;
  industry: string;
}): { cycles: LoadedCycle[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  const key = `${options.enterpriseId}:${options.industry}`;

  if (cache && cacheKey === key) {
    return { cycles: cache, degraded: false, errors: [] };
  }

  const cycleMap = new Map<string, LoadedCycle>();

  // 扫描顺序：builtin -> industry -> custom（后者覆盖前者）
  const scanDirs: Array<{ dir: string; source: 'builtin' | 'industry' | 'custom' }> = [
    { dir: join(CYCLES_ROOT, 'builtin'), source: 'builtin' },
  ];

  if (options.industry) {
    scanDirs.push({
      dir: join(CYCLES_ROOT, 'industry', options.industry),
      source: 'industry',
    });
  }

  if (options.enterpriseId) {
    scanDirs.push({
      dir: join(CYCLES_ROOT, 'custom', options.enterpriseId),
      source: 'custom',
      // enterpriseId不加到LoadedCycle -- 从调用方options可知
    });
  }

  for (const { dir, source } of scanDirs) {
    try {
      if (!existsSync(dir)) continue;

      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.cycle.json')) continue;

        const filePath = join(dir, entry.name);
        try {
          const raw = readFileSync(filePath, 'utf-8');
          const manifest = JSON.parse(raw) as CycleManifest;

          // 行业匹配过滤
          if (
            manifest.applicableIndustries.length > 0 &&
            !manifest.applicableIndustries.includes(options.industry)
          ) {
            continue; // 当前企业行业不适用此循环
          }

          const loaded: LoadedCycle = {
            manifest,
            source,
            sourcePath: filePath,
          };

          // 优先级覆盖：custom > industry > builtin
          const existing = cycleMap.get(manifest.cycleId);
          if (!existing || priority(source) > priority(existing.source)) {
            cycleMap.set(manifest.cycleId, loaded);
          }
        } catch (err: any) {
          errors.push(`解析循环配置失败 ${filePath}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`扫描目录失败 ${dir}: ${err.message}`);
    }
  }

  const cycles = Array.from(cycleMap.values());
  log.info({ count: cycles.length, errors: errors.length }, '循环加载完成');

  cache = cycles;
  cacheKey = key;
  return { cycles, degraded: errors.length > 0, errors };
}

function priority(source: string): number {
  switch (source) {
    case 'custom': return 3;
    case 'industry': return 2;
    case 'builtin': return 1;
    default: return 0;
  }
}

/**
 * 清除缓存 -- 用于热加载（文件变更检测触发）。
 * 对标 sentinel-loader 的 clearSentinelCache()。
 */
export function clearCycleCache(): void {
  cache = null;
  cacheKey = null;
  log.info('循环缓存已清除');
}

/**
 * 将已加载循环注册到全局 CycleRegistry。
 * 对标 sentinel-loader 的 registerLoadedSentinels()。
 */
export async function registerLoadedCycles(
  enterpriseId: string,
  industry: string
): Promise<{ registered: number; errors: string[] }> {
  const { cycles, errors: loadErrors } = loadCycles({ enterpriseId, industry });
  const errors = [...loadErrors];
  let registered = 0;

  for (const { manifest } of cycles) {
    try {
      // 触发校验
      const validation = validateEdgeReferences(manifest);
      if (!validation.valid) {
        errors.push(...validation.errors);
        log.warn({ cycleId: manifest.cycleId, errors: validation.errors },
          '循环edge校验失败 -- degraded');
      }

      // 动态导入 registry 避免循环依赖
      const { getCycleRegistry } = await import('./cycle-registry');
      const registry = getCycleRegistry();
      registry.register(manifest);
      registered++;
    } catch (err: any) {
      errors.push(`循环 ${manifest.cycleId} 注册失败: ${err.message}`);
    }
  }

  if (registered > 0) {
    log.info({ registered, errors: errors.length }, '循环已注册');
  }
  return { registered, errors };
}
```

### 4.4 依赖校验

循环配置引用的 `edgeId` 必须在42边体系中存在。Loader 加载时执行校验：

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  degraded: boolean;
}

function validateEdgeReferences(manifest: CycleManifest): ValidationResult {
  const errors: string[] = [];
  const allEdges: ValveEdge[] = [
    ...manifest.edges.acquisitionValve,
    ...manifest.edges.allocationValve,
    ...manifest.edges.conversionValve,
    ...manifest.edges.deliveryValve,
    ...manifest.edges.recycleValve,
  ];

  for (const edge of allEdges) {
    // 检查1：edgeId是否在42边注册表中存在
    const exists = EDGE_REGISTRY.has(edge.edgeId);
    if (!exists) {
      errors.push(
        `循环 ${manifest.cycleId} 引用了不存在的边: ${edge.edgeId}`
      );
      continue;
    }

    // 检查2：如果42边中已定义 action_effect_lag，交叉校验
    const officialLag = EDGE_REGISTRY.getActionEffectLag(edge.edgeId);
    if (officialLag && officialLag !== edge.actionEffectLag) {
      errors.push(
        `循环 ${manifest.cycleId} 的边 ${edge.edgeId} 的 actionEffectLag ` +
        `(${edge.actionEffectLag}) 与42边权威定义 (${officialLag}) 不一致`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    degraded: errors.length > 0,
  };
}
```

**overflowParams的来源校验**（独立于edge校验）：

```typescript
function validateOverflowParams(manifest: CycleManifest): ValidationResult {
  const errors: string[] = [];

  for (const param of manifest.overflowParams) {
    switch (param.source) {
      case 'compute':
        if (!COMPUTE_REGISTRY.has(param.sourceId)) {
          errors.push(
            `循环 ${manifest.cycleId} 的 overflowParam ${param.name} ` +
            `引用了不存在的compute: ${param.sourceId}`
          );
        }
        break;
      case '42edge':
        if (!EDGE_REGISTRY.hasParam(param.sourceId)) {
          errors.push(
            `循环 ${manifest.cycleId} 的 overflowParam ${param.name} ` +
            `引用了不存在的42边参数: ${param.sourceId}`
          );
        }
        break;
      case 'manual':
        if (!param.estimatedBy) {
          errors.push(
            `循环 ${manifest.cycleId} 的 overflowParam ${param.name} ` +
            `来源为manual但缺少 estimatedBy 字段`
          );
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    degraded: errors.length > 0,
  };
}
```

校验失败 -> 循环标记为 `degraded` -> 写入L4事件流 -> **不阻塞系统启动**。

### 4.5 缓存与热加载

- **首次加载**：`loadCycles()` 填充内存缓存，后续调用直接返回缓存
- **缓存key**：`{enterpriseId}:{industry}` -- 不同企业和行业组合的缓存独立
- **热加载**：启动文件监控（`fs.watch` 监听 `cycles/` 目录变化） -> 检测到 `*.cycle.json` 文件变更 -> `clearCycleCache()` -> 下次 `loadCycles()` 调用自动重建
- **热加载控制字段**：`lifecycle` 字段为 `deprecated` 时不参与热加载（仍可被 `loadCycles()` 读取，但在监控中跳过变更检测）

---

## 五、出厂商内置循环模板

### 5.1 基础模板（全行业通用，4个）

#### 现金流循环 `cash-flow`

```json
{
  "$schema": "https://synova.dev/schemas/cycle-manifest-v1.json",
  "cycleId": "cash-flow",
  "name": "现金流循环",
  "version": "1.0.0",
  "lifecycle": "active",
  "description": "资本获取->投入运营->产生收入->利润再投资。核心问题：现金流跑道是否支持增长投入？",
  "applicableIndustries": [],
  "nodes": {
    "input": ["cash-pool", "credit-line"],
    "conversion": ["operations", "investment-portfolio"],
    "output": ["revenue", "accounts-receivable"],
    "reflow": ["retained-earnings", "debt-repayment"]
  },
  "edges": {
    "acquisitionValve": [
      { "edgeId": "E-05", "actionEffectLag": "immediate" },
      { "edgeId": "E-06", "actionEffectLag": "immediate" }
    ],
    "allocationValve": [
      { "edgeId": "E-13", "actionEffectLag": "1_month" }
    ],
    "conversionValve": [
      { "edgeId": "E-23", "actionEffectLag": "3-6_months" }
    ],
    "deliveryValve": [
      { "edgeId": "E-30", "actionEffectLag": "1-3_months" }
    ],
    "recycleValve": [
      { "edgeId": "E-37", "actionEffectLag": "6-12_months" }
    ]
  },
  "overflowFormula": "revenue - total_cost - debt_service",
  "overflowParams": [
    { "name": "revenue", "source": "42edge", "sourceId": "E-30.value_delivered", "isEstimated": false, "confidence": "high" },
    { "name": "total_cost", "source": "42edge", "sourceId": "E-23.efficiency_rate", "isEstimated": false, "confidence": "high" },
    { "name": "debt_service", "source": "42edge", "sourceId": "E-06.debt_raised", "isEstimated": false, "confidence": "high" }
  ],
  "dataMaturity": {
    "minimumDataWindow": "3_months",
    "maturityStages": {
      "learning": { "window": "0-3_months", "usesIndustryBaseline": true, "displayLabel": "学习期（使用行业参考值）" },
      "active": { "window": "3-12_months", "confidence": "medium", "displayLabel": "活跃期（中等可靠性）" },
      "mature": { "window": ">12_months", "confidence": "high", "displayLabel": "成熟期（高可靠性）" }
    }
  },
  "computeInterval": "weekly"
}
```

#### 客户循环 `customer`

```json
{
  "$schema": "https://synova.dev/schemas/cycle-manifest-v1.json",
  "cycleId": "customer",
  "name": "客户循环",
  "version": "1.0.0",
  "lifecycle": "active",
  "description": "获客->留存->增购->口碑推荐。核心问题：客户获取成本（CAC）是否被客户生命周期价值（LTV）覆盖？",
  "applicableIndustries": [],
  "nodes": {
    "input": ["market-awareness", "lead-pool"],
    "conversion": ["sales-process", "onboarding"],
    "output": ["active-customers", "recurring-revenue"],
    "reflow": ["referrals", "testimonials", "churn-feedback"]
  },
  "edges": {
    "acquisitionValve": [
      { "edgeId": "E-01", "actionEffectLag": "1-3_months" },
      { "edgeId": "E-25", "actionEffectLag": "3-6_months" }
    ],
    "allocationValve": [
      { "edgeId": "E-13", "actionEffectLag": "1_month" }
    ],
    "conversionValve": [
      { "edgeId": "E-31", "actionEffectLag": "1-3_months" }
    ],
    "deliveryValve": [
      { "edgeId": "E-30", "actionEffectLag": "1_month" }
    ],
    "recycleValve": [
      { "edgeId": "E-40", "actionEffectLag": "3-6_months" }
    ]
  },
  "overflowFormula": "ltv - cac - retention_cost",
  "overflowParams": [
    { "name": "ltv", "source": "compute", "sourceId": "COMPUTE-LTV-V1", "isEstimated": false, "confidence": "high" },
    { "name": "cac", "source": "compute", "sourceId": "COMPUTE-CAC-V1", "isEstimated": false, "confidence": "high" },
    { "name": "retention_cost", "source": "manual", "sourceId": "GA_INPUT", "isEstimated": true, "confidence": "medium", "estimatedBy": "GA" }
  ],
  "dataMaturity": {
    "minimumDataWindow": "6_months",
    "maturityStages": {
      "learning": { "window": "0-6_months", "usesIndustryBaseline": true, "displayLabel": "学习期（使用行业参考值）" },
      "active": { "window": "6-12_months", "confidence": "medium", "displayLabel": "活跃期（中等可靠性）" },
      "mature": { "window": ">12_months", "confidence": "high", "displayLabel": "成熟期（高可靠性）" }
    }
  },
  "crossCyclePropagation": [
    { "from": "recurring-revenue", "to": "cash-pool", "via": "E-37", "estimatedLag": "1-3_months" }
  ],
  "computeInterval": "monthly"
}
```

#### 人才循环 `talent`

```json
{
  "$schema": "https://synova.dev/schemas/cycle-manifest-v1.json",
  "cycleId": "talent",
  "name": "人才循环",
  "version": "1.0.0",
  "lifecycle": "active",
  "description": "招聘->部署->成长->留存。核心问题：关键人才流失率是否低于行业基准？人均产出是否持续提升？",
  "applicableIndustries": [],
  "nodes": {
    "input": ["talent-pool", "employer-brand"],
    "conversion": ["deployment", "training", "mentoring"],
    "output": ["productivity", "innovation-output"],
    "reflow": ["knowledge-retention", "internal-referral"]
  },
  "edges": {
    "acquisitionValve": [
      { "edgeId": "E-07", "actionEffectLag": "1-3_months" }
    ],
    "allocationValve": [
      { "edgeId": "E-15", "actionEffectLag": "1-3_months" }
    ],
    "conversionValve": [
      { "edgeId": "E-17", "actionEffectLag": "1_month" },
      { "edgeId": "E-19", "actionEffectLag": "6-12_months" }
    ],
    "deliveryValve": [
      { "edgeId": "E-23", "actionEffectLag": "3-6_months" }
    ],
    "recycleValve": [
      { "edgeId": "E-38", "actionEffectLag": "3-6_months" }
    ]
  },
  "overflowFormula": "productivity_gain - talent_acquisition_cost - turnover_loss",
  "overflowParams": [
    { "name": "productivity_gain", "source": "42edge", "sourceId": "E-23.efficiency_rate", "isEstimated": false, "confidence": "high" },
    { "name": "talent_acquisition_cost", "source": "42edge", "sourceId": "E-07.hiring_efficiency", "isEstimated": true, "confidence": "medium", "estimatedBy": "GA" },
    { "name": "turnover_loss", "source": "42edge", "sourceId": "E-38.retention_rate", "isEstimated": true, "confidence": "medium", "estimatedBy": "GA" }
  ],
  "dataMaturity": {
    "minimumDataWindow": "6_months",
    "maturityStages": {
      "learning": { "window": "0-6_months", "usesIndustryBaseline": true, "displayLabel": "学习期（使用行业参考值）" },
      "active": { "window": "6-12_months", "confidence": "medium", "displayLabel": "活跃期（中等可靠性）" },
      "mature": { "window": ">12_months", "confidence": "high", "displayLabel": "成熟期（高可靠性）" }
    }
  },
  "computeInterval": "monthly"
}
```

#### 产品循环 `product`

```json
{
  "$schema": "https://synova.dev/schemas/cycle-manifest-v1.json",
  "cycleId": "product",
  "name": "产品循环",
  "version": "1.0.0",
  "lifecycle": "active",
  "description": "需求感知->研发->交付->市场反馈。核心问题：功能采纳率是否匹配研发投入增速？NPS是否持续改善？",
  "applicableIndustries": [],
  "nodes": {
    "input": ["market-signals", "tech-capability"],
    "conversion": ["r-and-d", "qa", "release-pipeline"],
    "output": ["product-quality", "feature-adoption"],
    "reflow": ["user-feedback", "bug-reports"]
  },
  "edges": {
    "acquisitionValve": [
      { "edgeId": "E-01", "actionEffectLag": "1-3_months" },
      { "edgeId": "E-04", "actionEffectLag": "3-6_months" }
    ],
    "allocationValve": [
      { "edgeId": "E-13", "actionEffectLag": "1_month" }
    ],
    "conversionValve": [
      { "edgeId": "E-20", "actionEffectLag": "6-12_months" },
      { "edgeId": "E-22", "actionEffectLag": "3-6_months" }
    ],
    "deliveryValve": [
      { "edgeId": "E-30", "actionEffectLag": "1_month" }
    ],
    "recycleValve": [
      { "edgeId": "E-35", "actionEffectLag": "1-3_months" }
    ]
  },
  "overflowFormula": "adoption_rate * user_base - r_and_d_cost - maintenance_cost",
  "overflowParams": [
    { "name": "adoption_rate", "source": "compute", "sourceId": "COMPUTE-FEATURE-ADOPTION-V1", "isEstimated": false, "confidence": "high" },
    { "name": "user_base", "source": "42edge", "sourceId": "E-31.active_customers", "isEstimated": false, "confidence": "high" },
    { "name": "r_and_d_cost", "source": "42edge", "sourceId": "E-13.budget_i", "isEstimated": false, "confidence": "high" },
    { "name": "maintenance_cost", "source": "manual", "sourceId": "GA_INPUT", "isEstimated": true, "confidence": "medium", "estimatedBy": "GA" }
  ],
  "dataMaturity": {
    "minimumDataWindow": "6_months",
    "maturityStages": {
      "learning": { "window": "0-6_months", "usesIndustryBaseline": true, "displayLabel": "学习期（使用行业参考值）" },
      "active": { "window": "6-12_months", "confidence": "medium", "displayLabel": "活跃期（中等可靠性）" },
      "mature": { "window": ">12_months", "confidence": "high", "displayLabel": "成熟期（高可靠性）" }
    }
  },
  "computeInterval": "monthly"
}
```

### 5.2 行业专用模板（2个）

#### 门店复制循环（餐饮/零售/连锁服务）`store-replication`

```json
{
  "$schema": "https://synova.dev/schemas/cycle-manifest-v1.json",
  "cycleId": "store-replication",
  "name": "门店复制循环",
  "version": "1.0.0",
  "lifecycle": "active",
  "description": "单店盈利模型 -> 标准化运营 -> 选址复制新店 -> 规模效应降本。核心问题：新店投资回报周期是否短于行业基准？单店模型是否可标准化复制？",
  "applicableIndustries": ["餐饮", "零售", "连锁服务", "教育培训"],
  "nodes": {
    "input": ["cash-pool", "talent-pool", "site-pipeline"],
    "conversion": ["store-operations", "site-selection", "training-system", "supply-chain"],
    "output": ["store-profit", "customer-base", "brand-presence"],
    "reflow": ["profit-reinvestment", "brand-equity", "talent-referral"]
  },
  "edges": {
    "acquisitionValve": [
      { "edgeId": "E-05", "actionEffectLag": "immediate" },
      { "edgeId": "E-07", "actionEffectLag": "1-3_months" },
      { "edgeId": "E-08", "actionEffectLag": "1-3_months" }
    ],
    "allocationValve": [
      { "edgeId": "E-13", "actionEffectLag": "1_month" }
    ],
    "conversionValve": [
      { "edgeId": "E-23", "actionEffectLag": "3-6_months" },
      { "edgeId": "E-34", "actionEffectLag": "1-3_months" }
    ],
    "deliveryValve": [
      { "edgeId": "E-30", "actionEffectLag": "1-3_months" },
      { "edgeId": "E-31", "actionEffectLag": "1_month" }
    ],
    "recycleValve": [
      { "edgeId": "E-37", "actionEffectLag": "6-12_months" }
    ]
  },
  "overflowFormula": "store_profit - new_store_investment - operating_cost",
  "overflowParams": [
    { "name": "store_profit", "source": "compute", "sourceId": "COMPUTE-STORE-PROFIT-V1", "isEstimated": false, "confidence": "high" },
    { "name": "new_store_investment", "source": "42edge", "sourceId": "E-13.capital_allocation", "isEstimated": false, "confidence": "high" },
    { "name": "operating_cost", "source": "manual", "sourceId": "GA_INPUT", "isEstimated": true, "confidence": "medium", "estimatedBy": "GA" }
  ],
  "dataMaturity": {
    "minimumDataWindow": "6_months",
    "maturityStages": {
      "learning": { "window": "0-6_months", "usesIndustryBaseline": true, "displayLabel": "学习期（使用行业参考值）" },
      "active": { "window": "6-12_months", "confidence": "medium", "displayLabel": "活跃期（中等可靠性）" },
      "mature": { "window": ">12_months", "confidence": "high", "displayLabel": "成熟期（高可靠性）" }
    }
  },
  "crossCyclePropagation": [
    { "from": "store-profit", "to": "profit-reinvestment", "via": "E-37", "estimatedLag": "3-6_months" }
  ],
  "computeInterval": "monthly"
}
```

#### ARR增长循环（SaaS）`arr-growth`

```json
{
  "$schema": "https://synova.dev/schemas/cycle-manifest-v1.json",
  "cycleId": "arr-growth",
  "name": "ARR增长循环",
  "version": "1.0.0",
  "lifecycle": "active",
  "description": "产品价值交付->续费->扩展(增购/交叉销售)->新增ARR。核心问题：净收入留存率（NRR）是否超过100%？新ARR增速是否被流失率侵蚀？",
  "applicableIndustries": ["SaaS", "软件", "订阅服务"],
  "nodes": {
    "input": ["product-value", "sales-capacity"],
    "conversion": ["onboarding", "customer-success", "expansion-sales"],
    "output": ["recurring-revenue", "nrr"],
    "reflow": ["upgrades", "cross-sells", "advocacy"]
  },
  "edges": {
    "acquisitionValve": [
      { "edgeId": "E-25", "actionEffectLag": "3-6_months" },
      { "edgeId": "E-01", "actionEffectLag": "1-3_months" }
    ],
    "allocationValve": [
      { "edgeId": "E-13", "actionEffectLag": "1_month" }
    ],
    "conversionValve": [
      { "edgeId": "E-31", "actionEffectLag": "1-3_months" },
      { "edgeId": "E-23", "actionEffectLag": "3-6_months" }
    ],
    "deliveryValve": [
      { "edgeId": "E-30", "actionEffectLag": "1_month" },
      { "edgeId": "E-35", "actionEffectLag": "1-3_months" }
    ],
    "recycleValve": [
      { "edgeId": "E-40", "actionEffectLag": "3-6_months" },
      { "edgeId": "E-37", "actionEffectLag": "6-12_months" }
    ]
  },
  "overflowFormula": "new_arr + expansion_arr - churned_arr - sales_marketing_cost",
  "overflowParams": [
    { "name": "new_arr", "source": "compute", "sourceId": "COMPUTE-ARR-V1", "isEstimated": false, "confidence": "high" },
    { "name": "expansion_arr", "source": "compute", "sourceId": "COMPUTE-EXPANSION-ARR-V1", "isEstimated": false, "confidence": "high" },
    { "name": "churned_arr", "source": "compute", "sourceId": "COMPUTE-CHURN-V1", "isEstimated": false, "confidence": "high" },
    { "name": "sales_marketing_cost", "source": "42edge", "sourceId": "E-13.budget_i", "isEstimated": false, "confidence": "high" }
  ],
  "dataMaturity": {
    "minimumDataWindow": "6_months",
    "maturityStages": {
      "learning": { "window": "0-6_months", "usesIndustryBaseline": true, "displayLabel": "学习期（使用行业参考值）" },
      "active": { "window": "6-12_months", "confidence": "medium", "displayLabel": "活跃期（中等可靠性）" },
      "mature": { "window": ">12_months", "confidence": "high", "displayLabel": "成熟期（高可靠性）" }
    }
  },
  "crossCyclePropagation": [
    { "from": "recurring-revenue", "to": "cash-pool", "via": "E-37", "estimatedLag": "1-2_months" },
    { "from": "advocacy", "to": "market-awareness", "via": "E-40", "estimatedLag": "1-3_months" }
  ],
  "computeInterval": "monthly"
}
```

### 5.3 模板覆盖矩阵

| 循环ID | 适用行业 | 核心边 | computeInterval | 最小数据窗口 |
|--------|---------|--------|----------------|------------|
| `cash-flow` | 全行业 | E-05, E-06, E-13, E-23, E-30, E-37 | weekly | 3_months |
| `customer` | 全行业 | E-01, E-13, E-25, E-30, E-31, E-40 | monthly | 6_months |
| `talent` | 全行业 | E-07, E-15, E-17, E-19, E-23, E-38 | monthly | 6_months |
| `product` | 全行业 | E-01, E-04, E-13, E-20, E-22, E-30, E-35 | monthly | 6_months |
| `store-replication` | 餐饮/零售/连锁/教育 | E-05, E-07, E-08, E-13, E-23, E-30, E-31, E-34, E-37 | monthly | 6_months |
| `arr-growth` | SaaS/软件/订阅 | E-01, E-13, E-23, E-25, E-30, E-31, E-35, E-37, E-40 | monthly | 6_months |

---

## 六、三层配置分工

### 第一层：系统预置（15-20个行业模板，覆盖80%客户）

系统出厂时预置覆盖最常见行业的循环配置，确保80%客户无需任何配置即可看到符合其行业的循环拓扑。

**预置行业模板清单（建议首批）**：

| # | 行业 | 预置循环 |
|---|------|---------|
| 1 | 全行业通用 | cash-flow, customer, talent, product |
| 2 | 餐饮 | cash-flow, customer, talent, product, store-replication |
| 3 | 零售 | cash-flow, customer, talent, product, store-replication |
| 4 | SaaS | cash-flow, customer, talent, product, arr-growth |
| 5 | 制造 | cash-flow, customer, talent, product, production-efficiency |
| 6 | 建筑/工程 | cash-flow, customer, talent, product, project-delivery |
| 7 | 物流/供应链 | cash-flow, customer, talent, product, logistics-throughput |
| 8 | 医疗服务 | cash-flow, customer, talent, product, patient-flow |
| 9 | 教育培训 | cash-flow, customer, talent, product, student-lifecycle |
| 10 | 专业服务 | cash-flow, customer, talent, product, engagement-profitability |
| 11 | 房地产 | cash-flow, customer, talent, product, asset-turnover |
| 12 | 金融科技 | cash-flow, customer, talent, product, transaction-volume |
| 13 | 电商平台 | cash-flow, customer, talent, product, gmv-growth |
| 14 | 内容/媒体 | cash-flow, customer, talent, product, audience-growth |
| 15 | 能源/公用事业 | cash-flow, customer, talent, product, capacity-utilization |

### 第二层：GA配置工作台（无代码）

GA通过可视化界面完成循环配置，无需编写JSON或代码：

**配置流程**：

1. **选择模板**：从行业预置模板中选择当前企业的循环拓扑。系统根据企业注册的行业属性自动推荐匹配模板。
2. **调整参数**：在企业参数覆盖表中修改阈值（如 `newStoreInvestment: 300000`），调整权重（如 `customerSatisfaction: 0.8`）。
3. **预览溢出公式**：系统展示溢出公式 + 每个参数的当前数据来源状态（有数据/估值/缺失），GA确认无误后保存。
4. **保存为企业实例**：保存到 `cycles/custom/{enterpriseId}/`，自动覆盖行业模板中的同名参数。
5. **生效**：保存后，CycleLoader 在下一次 `loadCycles()` 调用中自动加载企业覆盖配置。

**不支持的操作（需要第三层）**：
- 新增不在42边体系中的边引用
- 新增不在ComputeRegistry中的测量器引用
- 修改溢出公式的数学结构（只能调参数值，不能改公式形式 -- 公式结构固化在 `overflowFormula` 中，覆盖表仅覆盖 `overflowParams` 的阈值值和 `weights`）

### 第三层：研发深度定制（需代码）

触发条件（满足任一即需要研发介入）：

1. GA需要的新循环涉及不在42边体系中的新边 -> 需在42边权威定义中新增边
2. GA需要的新参数需要不在ComputeRegistry中的新测量器 -> 需开发新compute函数
3. GA需要修改溢出公式的数学结构 -> 需新建或fork循环模板

**流程**：
1. GA在配置工作台提交"深度定制请求"
2. 研发评估：所需的新边是否在其他行业的循环中也有用？（有用 -> 添加到42边体系；仅此企业 -> 添加为custom边）
3. 研发开发compute函数（遵从铁律47/48：先定义契约，再写实现，测试非空壳）
4. 部署后GA在工作台中使用新能力

---

## 七、企业参数覆盖表格式

### 7.1 覆盖机制

同一循环在不同企业间的差异通过企业参数覆盖表实现。覆盖表存放于 `cycles/custom/{enterpriseId}/` 目录下，文件名格式为 `{cycleId}.override.json`（与 `{cycleId}.cycle.json` 区分）。

**覆盖规则**：
- ContextLoader在 `loadCycles()` 阶段自动合并：企业覆盖 > 行业模板 > 出厂默认
- 覆盖表中存在的字段，完全覆盖对应模板中的同名字段
- 覆盖表中不存在的字段，使用模板默认值
- 不支持部分覆盖嵌套对象 -- 一旦覆盖 `overflowParams[0]`，该对象的全部字段以覆盖表为准

### 7.2 覆盖表JSON格式

```json
{
  "$schema": "https://synova.dev/schemas/cycle-override-v1.json",
  "enterpriseId": "wowbaby",
  "cycleId": "store-replication",
  "version": "1.0.0",
  "lastModified": "2026-07-14T10:30:00+08:00",
  "lastModifiedBy": "GA",

  "parameters": {
    "new_store_investment": 300000,
    "store_profit_target": 80000,
    "reinvestment_ratio": 0.6,
    "breakeven_months": 6
  },
  // 覆盖 overflowParams 中的具体参数值 -> 映射到溢出公式中的变量

  "weights": {
    "customer_satisfaction": 0.8,
    "store_profit": 0.6,
    "brand_equity": 0.3
  }
  // 覆盖各节点的权重 -- 用于多节点聚合时的加权计算
}
```

### 7.3 覆盖 vs 新循环的边界

| 场景 | 使用方式 |
|------|---------|
| 循环拓扑相同，仅参数不同 | 企业参数覆盖表 |
| 循环拓扑不同（不同的边、不同的池节点） | 新建 `{cycleId}.cycle.json` 到 `cycles/custom/{enterpriseId}/` |
| 循环拓扑相同 + 溢出公式结构不同 | 研发介入 -- fork模板 |

---

## 八、与哨兵manifest的命名对齐对照表

为确保循环配置JSON Schema与哨兵 `manifest.json` 保持命名风格一致，以下是对照表：

| 概念 | 哨兵 (manifest.json) | 循环 (.cycle.json) | 说明 |
|------|---------------------|-------------------|------|
| 唯一标识 | `name` (kebab-case) | `cycleId` (kebab-case) | 哨兵用 `name`，循环为避免歧义用 `cycleId` |
| 显示名 | `displayName` | `name` | 哨兵 `displayName` 是中文显示，循环 `name` 即中文 |
| 版本 | `version` (SemVer) | `version` (SemVer) | 一致 |
| 状态/类型 | `type: "sentinel"` | `lifecycle: "active"` | 哨兵用 `type` 标识资源类型，循环用 `lifecycle` 标识生命周期 |
| 描述 | `description` | `description` | 一致 |
| 调度 | `schedule` (cron) | `computeInterval` (枚举) | 哨兵用cron表达式，循环用粗粒度枚举 |
| 专家 | `expert` (单个) | 隐含在edge映射中 | 哨兵显式绑定专家，循环通过42边间接关联 |
| 阈值 | `thresholds` | 隐含在 `overflowParams` 中 | 哨兵用thresholds定义告警阈值，循环的"阈值"是参数值本身 |
| 入口 | `entryPoint` + `exportKey` | Loader统一入口 | 循环无独立执行入口 -- 溢出计算统一由overflow-engine负责 |
| 优先级 | `priority` (P0/P1/P2) | 无 | 循环无优先级概念 -- 所有已注册循环平等计算 |
| 数据源 | `context.requiredDataSources` | `overflowParams[].source` | 哨兵声明必需数据源，循环逐参数标注来源 |
| 依赖 | `dependsOn` | `edges.*[].edgeId` 隐式依赖 | 哨兵显式声明nodeType/field依赖，循环通过edge引用隐式声明 |

---

## 九、未来扩展预留

### 9.1 复合循环（Cycle Composition）

当前设计中每个循环是独立的拓扑结构。未来可能需要支持"复合循环" -- 一个循环的输出直接作为另一个循环的输入，组合成一个更大的循环。

**预留字段**：`crossCyclePropagation` 已包含传导关系。未来可扩展为 `compositeCycles` 字段：

```jsonc
{
  "compositeCycles": {
    "composedOf": ["cash-flow", "customer", "product"],
    "compositionRule": "sum",
    // sum | weighted_sum | max_overflow
    "compositionWeights": { "cash-flow": 0.4, "customer": 0.3, "product": 0.3 }
  }
}
```

### 9.2 动态循环生成

当前循环配置由人工定义（GA或研发）。未来可能需要支持"动态循环生成" -- 系统根据42边因果链自动发现候选循环拓扑。

**触发条件**：当系统检测到一组42边形成一个闭合环路（有明确的输入->转化->输出->回流结构），且该环路满足三条正交性检验时，自动生成候选循环配置草案，提交GA审核。

### 9.3 循环进化（Cycle Evolution）

当一个已注册循环的边组结构发生变化时（例如行业标准变化），需要追踪循环的版本演化。

**预留字段**：`version` + `lifecycle`。过时的循环标记为 `deprecated` 而非删除，`deprecated` 循环在仪表盘上显示"已废弃"标记，但不参与溢出计算。

---

## 十、验收标准（第一章自检清单）

- [x] 子循环判定框架：三条正交性检验（输入独立性/转化独特性/溢出不可约简性），附综合判定表
- [x] 循环配置JSON Schema：14个字段，逐字段定义类型/必填/说明
- [x] 五阀映射：acquisitionValve / allocationValve / conversionValve / deliveryValve / recycleValve，每条边标注 actionEffectLag
- [x] 参数溯源：overflowParams 中每个参数显式标注 source / sourceId / isEstimated / confidence
- [x] 数据成熟度：learning / active / mature 三阶段，每阶段标注 displayLabel
- [x] 循环加载器：TypeScript接口定义，对标 sentinel-loader 的 load/cache/register 模式，三目录优先级覆盖
- [x] 依赖校验：edgeId存在性校验 + actionEffectLag交叉校验 + overflowParams来源校验
- [x] 出厂商内置模板：4个基础（cash-flow / customer / talent / product）+ 2个行业专用（store-replication / arr-growth），每个完整JSON
- [x] 企业参数覆盖表格式：override.json 格式，参数/权重分离，覆盖 vs 新循环边界表
- [x] 三层配置分工：系统预置15行业 / GA工作台无代码流程 / 研发深度定制触发条件
- [x] 哨兵命名对齐：11项对照表，覆盖 name/version/type/description/schedule 等
- [x] 未来扩展预留：复合循环 / 动态循环生成 / 循环进化

---

## 附录A：42边ID速查（五阀常用边）

| 边ID | 中文名 | 所属断裂点 | 硬度 | 典型 actionEffectLag |
|------|--------|-----------|------|---------------------|
| E-01 | 主动扫描 | 获取 | soft | 1-3_months |
| E-04 | 感知学习 | 获取 | heuristic | 3-6_months |
| E-05 | 资本获取 | 获取 | hard | immediate |
| E-06 | 融资结构 | 获取 | hard | immediate |
| E-07 | 人才获取 | 获取 | soft | 1-3_months |
| E-08 | 资源获取 | 获取 | soft | 1-3_months |
| E-09 | 数据获取 | 获取 | hard | immediate |
| E-13 | 资本配置效率 | 配置 | hard | 1_month |
| E-15 | 人力部署 | 配置 | soft | 1-3_months |
| E-17 | 激励对齐 | 配置 | soft | 1_month |
| E-19 | 组织学习 | 配置 | soft | 6-12_months |
| E-20 | 技术创新 | 转化 | soft | 6-12_months |
| E-22 | 知识管理 | 转化 | soft | 3-6_months |
| E-23 | 运营执行 | 转化 | hard | 3-6_months |
| E-25 | 品牌建设 | 转化 | soft | 3-6_months |
| E-28 | 跨职能协同 | 转化 | soft | 3-6_months |
| E-30 | 价值交付 | 交付 | hard | 1-3_months |
| E-31 | 客户成功 | 交付 | soft | 1_month |
| E-33 | 市场竞争 | 交付 | soft | 1-3_months |
| E-34 | 采购议价 | 交付 | soft | 1-3_months |
| E-35 | 数据反馈 | 回收 | soft | 1-3_months |
| E-37 | 利润再投资 | 回收 | hard | 6-12_months |
| E-38 | 人才留存 | 回收 | soft | 3-6_months |
| E-40 | 声誉放大 | 回收 | soft | 3-6_months |
| E-42 | 跨域溢出 | 回收 | soft | 6-12_months |

> 注：`actionEffectLag` 为预期值。当42边权威定义中正式写入该字段后，以正式定义为准。
