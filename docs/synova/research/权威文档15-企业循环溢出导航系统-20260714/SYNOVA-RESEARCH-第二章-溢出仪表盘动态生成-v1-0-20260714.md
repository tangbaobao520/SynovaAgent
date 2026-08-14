<!--
  Synova 权威文档15 | 第二章：溢出仪表盘动态生成
  版本: v1.0 | 日期: 2026-07-14 | 作者: Synova 研究组
  定位: 施工文档——溢出仪表盘不是固定页面，是基于循环配置动态生成的视图
  依赖: 研究方案 v2.0 第二/四章、权威01 42边定义、权威14 MVS清单
-->

# 第二章：溢出仪表盘动态生成

> 核心问题：当子循环是运行时动态注册的（不是固定枚举），仪表盘怎么跟上？溢出的"正/负"怎么可视化？老板看到的是一个固定报表，还是一个活的、会随着他的企业数据一起成长的仪表盘？
> 本章产出：动态仪表盘生成算法 + 溢出热力图数据模型（TypeScript interface） + 跨子循环传导时间线可视化规范 + 数据成熟度前端标注规范

---

## 2.0 设计原则：不是固定页面，是视图引擎

**溢出仪表盘 = `f(loadedCycles, computeOutputs, dataMaturity)`。** 系统启动时扫描 `cycles/` 目录，加载匹配当前企业行业的子循环配置。每个注册的子循环在仪表盘上自动生成一行。子循环增加或减少，仪表盘自动调整——不修改任何前端代码。

这个设计的工程基础来自研究方案 v2.0 的循环配置加载机制（§2.4）：
- 系统启动时扫描 `cycles/` 目录下所有 `*.cycle.json` 文件
- 根据 `applicableIndustries` 匹配当前企业行业 → 仅加载匹配的配置
- 多级优先级：企业自定义 > 行业模板 > 系统预置

仪表盘本身是这一加载机制的**消费方**——它读取 `CycleRegistry` 中当前激活的子循环列表，为每个子循环渲染一行。

### 2.0.1 仪表盘行自动生成规则

每个注册的子循环 = 仪表盘一行。行内包含 5 个必选列：

| 列 | 数据来源 | 显示格式 |
|----|---------|---------|
| 子循环名 | `cycle.name` | 文本（如"客户循环"、"门店复制循环"） |
| 当前溢出值 | `overflowFormula` 计算结果 | 数值 + 正/负标识（绿色/红色） |
| 趋势箭头 | 最近3个周期的溢出变化方向 | ▲（改善）/ ▼（恶化）/ →（持平） |
| 数据成熟度标签 | `dataMaturity.maturityStages` 匹配当前数据窗口 | 见 §2.4 |
| 更新周期 | `cycle.dataMaturity` 或业务周期绑定 | 文本（如"每周"、"月度"、"季度"） |

**排序规则**：按溢出值从低到高排列——溢出为负的子循环排在最前面，引起老板注意。管理员可通过 GA 工作台覆盖排序规则。

---

## 2.1 溢出热力图数据模型

### 2.1.1 TypeScript Interface

```typescript
/**
 * OverflowHeatmap — 子循环 x 时间轴矩阵（月度粒度）。
 *
 * 数据来源：每个子循环的 overflowFormula 在每月计算周期后的输出值。
 * 存储：GraphStore 中每个 Enterprise 节点下的 overflow_snapshots 属性。
 * 消费方：仪表盘热力图渲染、趋势箭头计算、跨循环传导时间线。
 *
 * @entity OverflowHeatmap
 * @layer L4 (本体层) — GraphBridge 从 compute 输出聚合
 * @persistence graph_nodes.properties.overflow_snapshots (JSON 数组)
 */
export interface OverflowHeatmap {
  /** 企业标识 */
  enterpriseId: string;

  /** 热力图数据矩阵: 子循环 x 月份 */
  matrix: OverflowSnapshot[][];

  /** 矩阵元数据 */
  meta: {
    /** 列（月份）标签，格式 YYYY-MM */
    monthColumns: string[];
    /** 行（子循环）标签 */
    cycleRows: string[];
    /** 数据生成时间 */
    generatedAt: string;
    /** 热力图覆盖的时间范围 */
    timeRange: {
      start: string;  // ISO-8601, 最早月份的第一天
      end: string;    // ISO-8601, 最晚月份的最后一天
    };
  };
}

/**
 * OverflowSnapshot — 单个子循环在单个月份的溢出快照。
 */
export interface OverflowSnapshot {
  /** 子循环 ID，对应 cycle.json 的 cycleId */
  cycleId: string;

  /** 月份，格式 YYYY-MM */
  month: string;

  /** 溢出值（overflowFormula 计算结果） */
  overflowValue: number;

  /** 溢出值的单位（如"万元"、"%"、"NPS点数"） */
  unit: string;

  /** 趋势方向（与上月对比） */
  trend: 'improving' | 'declining' | 'stable';

  /** 趋势变化量（本月 - 上月，保留趋势信号） */
  trendDelta: number;

  /** 数据成熟度 */
  maturity: DataMaturityLevel;

  /** 是否为行业基准值（学习期使用） */
  isIndustryBaseline: boolean;

  /** 置信度区间（95% CI） */
  confidenceInterval?: {
    low: number;
    high: number;
  };

  /** 该快照的降级标记 */
  degraded: boolean;

  /** 降级原因（如果有） */
  degradationReason?: string;
}

/**
 * DataMaturityLevel — 数据成熟度三级枚举。
 */
export type DataMaturityLevel = 'learning' | 'active' | 'mature';
```

### 2.1.2 热力图生成管线

```
每月 Cron 触发（各子循环按各自业务周期分别触发，非统一14天）
       │
       v
CycleRegistry.getActiveCycles(enterpriseId)
       │
       v
for each cycle:
  1. 读取 cycle.overflowFormula
  2. 解析 formula 中的参数 → 追溯数据来源（42边/compute/manual）
  3. 获取各参数当前值 + 置信度
  4. 计算 overflowValue
  5. 对比上月的 overflowValue → 计算 trend + trendDelta
  6. 根据数据窗口 → 判定 maturity
  7. 写入 graph_nodes.properties.overflow_snapshots
       │
       v
OverflowHeatmap.matrix 更新 → 仪表盘下次渲染时自动拉取
```

### 2.1.3 热力图颜色编码规范

溢出值到颜色的映射（用于前端热力图渲染）：

| 溢出值范围 | 颜色 | 含义 |
|-----------|------|------|
| `overflowValue > 0.15` | `#1a7f37`（深绿） | 强正向溢出 |
| `0.05 < overflowValue <= 0.15` | `#4caf50`（浅绿） | 正向溢出 |
| `-0.05 <= overflowValue <= 0.05` | `#f5f5dc`（米白） | 近零（需关注） |
| `-0.15 <= overflowValue < -0.05` | `#ff9800`（橙） | 负向泄漏 |
| `overflowValue < -0.15` | `#d32f2f`（红） | 强负向泄漏 |

学习期（`isIndustryBaseline: true`）的单元格叠加灰色斜线纹理，区分"行业参考值"和"你的企业的值"。

---

## 2.2 跨子循环传导时间线可视化

### 2.2.1 设计动机

研究方案 §4.1 确定了核心需求："如果系统只说'会改善'，不说'大概要6个月'，老板会在第3个月时认为系统判断失误。"

传导时间线解决的是**信心管理**问题——不是更精确的预测，而是诚实地标注每条传导路径的累计滞后时间，让老板建立合理预期。

### 2.2.2 传导路径滞后时间累积模型

每条因果边在 42 边体系中有 `action_effect_lag` 字段（研究方案 §4.1 提出，需在权威01中补充）。当一条传导路径涉及多条边时，累计滞后 = 各边滞后之和：

```
传导路径: E-38(TALENT_RETENTION) → E-15(HUMAN_DEPLOYMENT) → E-23(OPERATIONAL_EXECUTION)
累计滞后: 3-6个月(E-38) + 1-3个月(E-15) + 实时(E-23) = 4-9个月
```

### 2.2.3 TypeScript Interface — 传导时间线

```typescript
/**
 * PropagationTimeline — 一条跨子循环的传导路径，标注累计滞后时间。
 *
 * 消费方：仪表盘"传导时间线"面板。
 * 数据来源：CycleRegistry 中的 crossCyclePropagation 配置 + 42边 action_effect_lag。
 */
export interface PropagationTimeline {
  /** 唯一标识 */
  id: string;

  /** 传导来源子循环 */
  sourceCycleId: string;

  /** 传导目标子循环 */
  targetCycleId: string;

  /** 传导路径（有序的边序列） */
  edgeSequence: PropagationStep[];

  /** 累计滞后时间范围 */
  cumulativeLag: {
    minMonths: number;
    maxMonths: number;
  };

  /** 传导强度估计（elasticity） */
  propagationStrength: number; // 0-1, 1 = 完全传导

  /** 置信度 */
  confidence: number; // 0-1

  /** 预计效应方向 */
  direction: 'positive' | 'negative' | 'uncertain';
}

export interface PropagationStep {
  /** 42边 ID */
  edgeId: string;

  /** 边名称 */
  edgeName: string;

  /** 该边的滞后时间范围（月） */
  lagMonths: {
    min: number;
    max: number;
  };

  /** 该边在传导中的弹性系数 */
  elasticity: number;

  /** 传导机制说明 */
  mechanism: string;
}
```

### 2.2.4 仪表盘渲染规范

跨子循环传导时间线在仪表盘上以"时间线面板"形式展示——当用户点击某个子循环行时展开：

```
┌──────────────────────────────────────────────────────────┐
│  人才循环 → 客户循环 传导时间线                             │
│                                                          │
│  当前: 人才循环溢出 ▼ -0.08 (持续恶化中)                    │
│                                                          │
│  ┌─ E-38 人才留存 ────── 3~6月 ──────┐                   │
│  │  核心工程师离职 ↓                  │                   │
│  │  知识断层风险 ↑                    │                   │
│  └───────────────────────────────────┘                   │
│              │                                            │
│              ▼                                            │
│  ┌─ E-15 人力配置 ────── 1~3月 ──────┐                   │
│  │  人岗匹配度 ↓                      │                   │
│  │  产品开发周期拉长 ↑                │                   │
│  └───────────────────────────────────┘                   │
│              │                                            │
│              ▼                                            │
│  ┌─ E-23 运营执行 ──── 实时 ─────────┐                   │
│  │  新产品上市延迟 ↑                  │                   │
│  │  客户满意度 ↓                      │                   │
│  └───────────────────────────────────┘                   │
│                                                          │
│  ⚠ 预计 4~9 个月后对客户循环溢出产生负面影响               │
│  ✅ 传导尚未到达终点 — 仍有 2~5 个月干预窗口               │
└──────────────────────────────────────────────────────────┘
```

**关键渲染规则**：
1. 每个 `PropagationStep` 渲染为一个节点，标注边名和滞后时间
2. 节点之间的箭头表示传导方向
3. 底部汇总标注："预计 X~Y 个月后对{目标子循环}溢出产生{正向/负向}影响"
4. 如果传导尚未到达终点（时间 < cumulativeLag.min），显示"干预窗口"提示

---

## 2.3 仪表盘动态生成算法

### 2.3.1 伪代码

```typescript
/**
 * generateDashboard — 基于 CycleRegistry 动态生成仪表盘视图模型。
 *
 * 调用时机：
 *   1. 前端首次加载仪表盘页面（GET /api/dashboard/overflow）
 *   2. 任一子循环的计算周期到期、新快照写入后（WebSocket 推送更新）
 *   3. GA 通过工作台新增/删除/修改子循环配置后（热重载）
 *
 * @param enterpriseId - 企业标识
 * @returns DashboardViewModel — 可直接渲染的仪表盘视图模型
 */
async function generateDashboard(
  enterpriseId: string
): Promise<DashboardViewModel> {
  // 1. 获取当前激活的子循环列表
  const cycles = CycleRegistry.getActiveCycles(enterpriseId);

  // 2. 获取热力图数据（最近12个月）
  const heatmap = await GraphBridge.getOverflowHeatmap(
    enterpriseId,
    { months: 12 }
  );

  // 3. 为每个子循环生成仪表盘行
  const rows: DashboardRow[] = cycles.map(cycle => {
    const snapshots = heatmap.matrix.find(
      row => row[0]?.cycleId === cycle.cycleId
    ) ?? [];

    const current = snapshots[snapshots.length - 1];
    const previous = snapshots[snapshots.length - 2];

    return {
      cycleId: cycle.cycleId,
      cycleName: cycle.name,
      currentOverflow: current?.overflowValue ?? null,
      trend: computeTrend(current, previous),
      maturity: current?.maturity ?? inferMaturity(cycle.dataMaturity),
      updateFrequency: cycle.dataMaturity?.minimumDataWindow ?? 'monthly',
      propagationTimelines: cycle.crossCyclePropagation
        ? buildPropagationTimelines(cycle)
        : [],
    };
  });

  // 4. 按溢出值排序（最低的先显示）
  rows.sort((a, b) => (a.currentOverflow ?? 0) - (b.currentOverflow ?? 0));

  // 5. 构建热力图矩阵（用于热力图面板）
  const heatmapMatrix = buildHeatmapMatrix(heatmap);

  return {
    enterpriseId,
    generatedAt: new Date().toISOString(),
    rows,
    heatmap: heatmapMatrix,
    summary: generateSummary(rows),
  };
}
```

### 2.3.2 DashboardViewModel TypeScript 接口

```typescript
export interface DashboardViewModel {
  enterpriseId: string;
  generatedAt: string;
  rows: DashboardRow[];
  heatmap: HeatmapCell[][];
  summary: DashboardSummary;
}

export interface DashboardRow {
  cycleId: string;
  cycleName: string;
  currentOverflow: number | null;
  trend: 'improving' | 'declining' | 'stable' | 'unknown';
  maturity: DataMaturityLevel;
  updateFrequency: string;  // 如 "weekly", "monthly", "quarterly"
  propagationTimelines: PropagationTimeline[];
}

export interface HeatmapCell {
  cycleId: string;
  month: string;
  overflowValue: number;
  isIndustryBaseline: boolean;
  maturity: DataMaturityLevel;
}

export interface DashboardSummary {
  totalCycles: number;
  positiveCount: number;
  negativeCount: number;
  nearZeroCount: number;
  worstCycle: { cycleId: string; cycleName: string; overflowValue: number } | null;
  bestCycle: { cycleId: string; cycleName: string; overflowValue: number } | null;
  overallHealthScore: number;  // 0-100, 基于溢出加权平均
}
```

---

## 2.4 数据成熟度前端标注规范

### 2.4.1 三级成熟度状态

研究方案 §3.2 定义了三级数据成熟度。本节给出前端 UI 渲染的精确规范。

**学习期（Learning）**：
- **条件**：数据窗口 < `cycle.dataMaturity.minimumDataWindow`（如 < 6 个月）
- **图标**：灰色实验瓶图标（lucide `flask-conical`）
- **标签文本**：`"行业参考值"`
- **Tooltip**：`"你的企业数据不足，当前显示的是{行业}行业的参考基准值。你的企业的数据将在 X 个月后可用。"`（X = `minimumDataWindow` 减去已积累月数）
- **替代数据**：使用 `cycle.overflowFormula` 中 `industryBaseline` 参数的值
- **颜色标记**：所在行的溢出值单元格叠加灰色斜线纹理，与真实数据行区分

**活跃期（Active）**：
- **条件**：数据窗口在 `learning` 和 `mature` 阈值之间（如 6-12 个月）
- **图标**：黄色中等图标（lucide `activity`）
- **标签文本**：`"中等可靠性"`
- **Tooltip**：`"数据量已达到基本统计显著性。当前置信区间为 [{low}, {high}]。随着更多数据积累，精度会继续提升。"`
- **数据**：使用企业自身数据，叠加置信区间标注

**成熟期（Mature）**：
- **条件**：数据窗口 > `cycle.dataMaturity.maturityStages.mature.window`（如 > 12 个月）
- **图标**：绿色盾牌对勾图标（lucide `shield-check`）
- **标签文本**：`"高可靠性"`
- **Tooltip**：`"数据量充足，统计显著。溢出指标可直接用于决策参考。"`
- **数据**：企业自身数据，无行业基准替代

### 2.4.2 成熟度状态转换触发条件

数据成熟度不是手动切换的——它是数据窗口长度超过阈值时自动升级的：

```typescript
function computeMaturity(
  cycle: CycleConfig,
  dataWindowMonths: number
): DataMaturityLevel {
  const stages = cycle.dataMaturity.maturityStages;

  // 成熟期窗口可能配置为具体月数（如 ">12_months" 解析为 12）
  const matureThreshold = parseMonthWindow(stages.mature.window);  // e.g., 12

  if (dataWindowMonths >= matureThreshold) {
    return 'mature';
  }

  // 学习期窗口
  const learningThreshold = parseMonthWindow(stages.learning.window);  // e.g., 6

  if (dataWindowMonths < learningThreshold) {
    return 'learning';
  }

  return 'active';
}
```

### 2.4.3 仪表盘列对齐 — 成熟度在不同视图中的表现

| 视图 | 学习期显示 | 活跃期显示 | 成熟期显示 |
|------|----------|----------|----------|
| 仪表盘行（列表视图） | 灰色标签"行业参考值" | 黄色标签"中等可靠性" | 绿色标签"高可靠性" |
| 热力图单元格 | 灰色斜线纹理 + 行业基准数值 | 企业数据 + 置信区间 Tooltip | 企业数据（无纹理） |
| 传导时间线 | 不显示传导预测（数据不足） | 显示传导方向 + 宽区间 | 显示传导方向 + 窄区间 |
| 投入建议引擎 | 禁用（"数据不足，无法模拟"） | 启用 + 低置信度标注 | 启用 + 正常置信度 |

---

## 2.5 仪表盘 API 端点

### 2.5.1 GET /api/dashboard/overflow

获取完整的溢出仪表盘视图模型。

**Query Parameters**:
- `enterpriseId` (required): 企业标识
- `months` (optional, default=12): 热力图覆盖的月数

**Response** (200): `DashboardViewModel`（见 §2.3.2）

**Response** (503): `{ error: 'ENTERPRISE_NOT_CONFIGURED', message: '...' }` — 系统处于"待配置"状态（权威14 §4.2）

### 2.5.2 GET /api/dashboard/overflow/propagation

获取全部跨子循环传导时间线。

**Query Parameters**:
- `enterpriseId` (required)
- `sourceCycleId` (optional): 筛选来源子循环
- `targetCycleId` (optional): 筛选目标子循环

**Response** (200): `PropagationTimeline[]`

### 2.5.3 WebSocket: overflow:update

当任一子循环的新计算周期到期、新快照写入后，通过 WebSocket 推送增量更新：

```json
{
  "event": "overflow:update",
  "payload": {
    "cycleId": "customer-cycle",
    "newSnapshot": { "month": "2026-07", "overflowValue": 0.12 },
    "affectedTimelines": ["prop-timeline-customer-to-profit"]
  }
}
```

前端收到此事件后，仅更新受影响的行和热力图单元格，不需要全量刷新。

---


## 2.7 同比、环比与趋势计算规范

### 2.7.1 设计动机

溢出仪表盘不是孤立的月度快照集合。老板需要回答三个问题：
- 环比（MoM/QoQ）：和上个月比，是好转还是恶化？
- 同比（YoY）：和去年同期比呢？（排除季节性波动）
- 趋势：连续三个月的方向是往上走还是往下走？

没有同比环比，溢出数字就是孤立的——老板无法判断"这个月溢出+8万"是好事（上月是+2万）还是坏事（上月是+15万）。

### 2.7.2 OverflowSnapshot 扩展字段

在 `OverflowSnapshot` 接口中增加以下字段：

```
momChange: number;              // 环比变化量（本期-上期）
momChangePercent: number;       // 环比变化率（(本期-上期)/|上期| x 100%）
yoyChange: number | null;       // 同比变化量（null=数据不足12个月）
yoyChangePercent: number | null; // 同比变化率
trendDirection: 'rising' | 'stable' | 'declining';  // 近N周期移动趋势
trendStrength: number;           // 0-1，趋势统计显著性
consecutiveDirection: number;    // 连续同方向周期数
```

### 2.7.3 计算规范

**环比（MoM）：**
momChange = 本期溢出 - 上期溢出
momChangePercent = (本期 - 上期) / |上期| x 100%
适用周期：月度数据。与上一周期对比。

**同比（YoY）：**
yoyChange = 本期溢出 - 去年同月溢出
yoyChangePercent = (本期 - 去年同月) / |去年同月| x 100%
适用周期：月度数据。与12个月前同月对比。数据不足12个月时返回null，仪表盘标注"同比数据将在X个月后可用"。

**趋势方向：**
使用Mann-Kendall趋势检验（非参数检验，不假设数据分布）。
N = 3个周期（默认，可配置为3/6/12）。
p < 0.05 且 Kendall's tau > 0 → rising
p < 0.05 且 Kendall's tau < 0 → declining
p >= 0.05 → stable
trendStrength = |Kendall's tau|（0-1）
consecutiveDirection = 连续同方向周期数

### 2.7.4 仪表盘呈现规范

- 溢出值旁标注环比箭头：正增长=绿色向上箭头+百分比，负增长=红色向下箭头+百分比，持平=灰色横箭头
- 同比标注在环比下方：字体略小，色调更淡。"同比 +5% (去年同月)"
- 连续3周期同方向：箭头加粗 + 趋势标签。"连续3月改善" / "连续3月恶化"
- 数据不足：同比标注"数据积累中（第5/12个月）"。趋势方向标注"趋势分析需至少3个周期（当前第2周期）"

### 2.7.5 季节性调整（可选，需≥24个月数据）

当数据积累≥24个月时启用：
- 使用STL分解（趋势T + 季节S + 残差R）
- 仪表盘显示"经季节性调整的溢出趋势"（T分量）
- 季节分量S对老板的参考价值："您的客户溢出在Q4天然+15%（行业季节性），这不是战略改善——是季节效应"


## 2.6 与 42 边体系的衔接

溢出仪表盘的每一个 `overflowValue` 都可以向下钻取到 42 边参数。当用户点击某个子循环的溢出值时，展开"溢出分解"面板：

```
客户循环溢出 = +0.12
  ├── E-31 客户留存 → retention_rate = 0.85 (+0.05 vs 上月)
  ├── E-30 定价 → margin_rate = 0.22 (+0.02 vs 上月)
  ├── E-25 品牌 → brand_strength = 0.65 (持平)
  └── E-33 市场竞争 → competitor_aggressiveness = 0.45 (↑ 0.03, 负向)
```

每个参数标注：
- 数据来源（42边 ID / compute contractId / manual）
- 是否为估计值（`isEstimated`）
- 置信度

这个"溢出分解"面板对接权威01 第二章的 42 边 transfer_function 定义——每个参数的计算公式和正常范围已在权威01中完整定义。

---

> **版本历史**：v1.0 — 2026-07-14 — 初始版本。动态仪表盘生成算法 + 溢出热力图数据模型 + 传导时间线 + 数据成熟度前端标注。