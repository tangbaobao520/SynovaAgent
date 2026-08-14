<!--
  Synova 权威文档15 | 第三章：投入建议引擎
  版本: v1.0 | 日期: 2026-07-14 | 作者: Synova 研究组
  定位: 施工文档——传导方向模拟，不是精确预测。承诺清单必须在每次输出顶部展示。
  依赖: 研究方案 v2.0 第三章/第五章、权威01 42边 transfer_function、权威13 Proposal三选一
-->

# 第三章：投入建议引擎

> 核心问题：老板看到溢出仪表盘上的红色数字后，自然要问——"我往这里投钱，有没有用？多久见效？"系统怎么回答，既诚实又有用？
> 本章产出：投入建议引擎的承诺清单（置于输出顶部）+ 引擎完整输入/输出规范 + 执行约束因子模型 + 滞后时间标注机制

---

## 3.0 承诺清单（引擎每次输出的顶部）

> **此承诺清单是引擎输出的第一部分——在每次结果显示之前必须展示。不是脚注，不是 FAQ，是用户看到的第一屏。**

```
═══════════════════════════════════════════════════════
         Synova 投入建议引擎 — 能力与边界
═══════════════════════════════════════════════════════

✅ 能做的：
  • 传导方向模拟 — 回答"往这里投钱，溢出是正向还是负向趋势"
  • 传导路径展示 — 展示投入如何通过因果链影响到终点子循环
  • 相对效果排序 — 在给定的 N 个子循环中，哪个的投入边际溢出最高
  • 执行约束检测 — 检查每个建议的"能不能执行"前提条件
  • 滞后时间标注 — 每条传导路径的累计滞后时间

❌ 不能做的（需要至少12个月历史干预数据后才可以启用）：
  • 精确财务预测 — 不能回答"投入100万，3个月后回报150万"
  • 最优投入量 — 不能回答"最优投入是73.5万"——只能给出方向+量级区间

⚠ 以下模拟基于当前因果边参数计算，仅指示传导方向，不构成精确财务预测。
  实际效果受外部环境、执行质量、市场变化等因素影响。建议结合 GA 经验判断。
═══════════════════════════════════════════════════════
```

### 3.0.1 承诺清单的设计理由

1. **诚实管理预期**：如果系统不主动说"我不能做什么"，用户会天然假设 AI 能做精确预测。当预测不准时，用户失去信任——不是对这一个功能，是对整个系统。
2. **法律合规边界**：精确的财务预测（"投入100万，回报150万"）在某些司法管辖区可能构成金融建议或投资建议——小型 SaaS 产品不需要承担这种法律风险。
3. **数据门槛透明化**：明确标注"12个月历史干预数据后才启用"，让用户理解这不是技术能力限制，是数据积累的自然等待期。
4. **与研究方案一致**：研究方案 §3.3 定义了能做什么/不能做什么。承诺清单是把那段叙述转化为每次输出的物理存在。

---

## 3.1 引擎定位与工作原理

### 3.1.1 不是精确预测，是传导方向模拟

投入建议引擎的核心机制是**因果边弹性传播模拟**：

1. 用户在某个子循环的参数上施加一个变化量（Δinput）——例如"在人才循环的招聘投入上增加50万"
2. 引擎沿该子循环映射的 42 边传播这个变化量——每条边有一个弹性系数（elasticity），表示输入变化多大比例传导到输出
3. 传播到终点子循环——如"客户循环溢出"——输出变化方向和量级区间

整个过程**不预测未来**。它基于当前 42 边的 transfer_function 参数和弹性系数进行"如果参数变化了 X，传导结果大概在哪个区间"的计算。这本质上是一种**灵敏度分析（sensitivity analysis）**，不是时间序列预测。

### 3.1.2 引擎在系统架构中的位置

```
溢出仪表盘（第二章）
       │
       │  用户选中某个子循环 → "投入模拟"
       ▼
投入建议引擎（本章）
       │
       │  读取 cycle.edges → 查询 42 边 elasticities
       │  沿因果链传导 Δinput → 输出方向 + 量级区间
       ▼
   ┌──────────────────────────────┐
   │  如果用户确认投入方向        │
   │  → 生成 Proposal（权威13）  │
   │  → 三选一 → Goal            │
   └──────────────────────────────┘
```

引擎输出 `recommendation` 后，如果用户确认投入方向，则自动触发权威13的 Proposal 生成流程——引擎不替代 Proposal，是 Proposal 的上游输入。

---


### 3.1.3 趋势数据作为引擎输入

投入建议引擎不仅消费"当前溢出值"——更消费"趋势"作为关键输入。引擎区分以下场景：

- **溢出为正 + 趋势上升**：引擎不需要介入。系统保持静默。仅在投入建议被主动请求时返回"当前循环健康，溢出趋势向上，无需额外投入"。
- **溢出为正 + 趋势下降**：引擎触发预警模式。计算"如果趋势继续以当前斜率下降，预计何时溢出转负"。基于此生成预防性投入建议。
- **溢出转负 + 首次出现**：引擎触发紧急模式。基于因果链反向传播，定位最先偏离基线的上游阀——这是根因候选。投入建议聚焦于"首先修复上游阀"。
- **溢出转负 + 连续3周期加速恶化**：引擎触发危机模式。自动触发全量诊断循环（不经过轻量级再诊断的累积升级协议——跳过，直接触发）。投入建议附带"最坏情况"预测。

引擎输入中增加 `trendContext` 字段：
```
trendContext: {
  trendDirection: 'rising' | 'stable' | 'declining',
  trendStrength: number,
  consecutiveDirection: number,
  momChangePercent: number,
  projectedOvershootDate: string | null  // 如当前趋势继续，预计溢出转负的日期
}
```


## 3.2 引擎输入规范

### 3.2.1 输入 TypeScript Interface

```typescript
/**
 * InvestmentSimulationInput — 投入建议引擎的输入。
 *
 * 消费方: POST /api/investment/simulate
 * 来源: 溢出仪表盘 → 用户选择子循环 → 填写投入参数
 */
export interface InvestmentSimulationInput {
  /** 投入目标子循环 ID（cycle.json 的 cycleId） */
  targetCycleId: string;

  /** 投入量级区间 */
  investmentAmount: {
    /** 最小投入量 */
    min: number;
    /** 最大投入量 */
    max: number;
    /** 金额单位（万元、%、人数等） */
    unit: string;
  };

  /** 投入类型 */
  investmentType: InvestmentType;

  /** 可选：指定在哪个参数上施加变化（如果没有指定，引擎自动选择最敏感的边参数） */
  targetParameter?: {
    edgeId: string;      // 如 "E-13"
    paramName: string;   // 如 "budget_i"
    deltaValue: number;  // 变化量
  };

  /** 可选：指定关注的终点子循环（默认是所有受影响的子循环） */
  focusCycles?: string[];
}

export type InvestmentType = 'capital' | 'human' | 'technology';

export type InvestmentTypeLabel = {
  [K in InvestmentType]: string;
};
// 'capital' → '资本投入（资金/设备/资产）'
// 'human' → '人力投入（招聘/培训/薪酬）'
// 'technology' → '技术投入（系统/工具/数字化）'
```

### 3.2.2 投入量级区间输入说明

引擎接受**区间**而不是精确值，原因：

- 用户通常知道"大概投 50-100 万"而不是"精确投 73.5 万"
- 区间可以用于灵敏度测试——同一个传导路径在 min 和 max 下的效果差异反映系统的非线性特征
- 当 min 和 max 对应的效果方向相反（例如 min 为正、max 为过投入导致边际递减为负），引擎标注"存在最优投入区间，建议细化"

---

## 3.3 引擎输出规范

### 3.3.1 输出 JSON Schema

```typescript
/**
 * InvestmentSimulationOutput — 投入建议引擎的输出。
 *
 * 契约优先 (铁律 47): 所有字段在实现前定义。
 * 消费者: 溢出仪表盘"投入模拟"面板 + Proposal 生成器（权威13 第二章）
 */
export interface InvestmentSimulationOutput {
  /** 承诺清单文本（每次输出的第一段——前端渲染为卡片顶部横幅） */
  commitmentStatement: {
    capabilities: string[];    // "能做的" 列表
    limitations: string[];     // "不能做的" 列表
    disclaimer: string;        // 免责声明
  };

  /** 投入建议列表（按预计效果排序） */
  recommendations: InvestmentRecommendation[];

  /** 模拟元数据 */
  meta: {
    /** 输入摘要（回显） */
    input: {
      targetCycleId: string;
      investmentAmount: { min: number; max: number; unit: string };
      investmentType: InvestmentType;
    };
    /** 模拟时间戳 */
    simulatedAt: string;
    /** 使用的 42 边版本（从权威01 元数据读取） */
    edgeDefinitionsVersion: string;
    /** 模拟耗时（ms） */
    computationTimeMs: number;
    /** 降级标记 */
    degraded: boolean;
    /** 降级原因 */
    degradationReason?: string;
  };
}

/**
 * InvestmentRecommendation — 单条投入建议。
 */
export interface InvestmentRecommendation {
  /** 建议标题（人话） */
  recommendation: string;

  /** 传导方向 */
  direction: 'positive' | 'negative' | 'uncertain';

  /** 预计效果 */
  estimatedEffect: {
    /** 效果量级区间 */
    range: [number, number];
    /** 效果单位 */
    unit: string;
    /** 效果显现的时间范围 */
    timeHorizon: string;  // 如 "6-9_months", "3-6_months"
  };

  /** 综合置信度（0-1） */
  confidence: number;

  /** 详细的传导路径 */
  propagationPath: PropagationStep[];

  /** 累计滞后时间 */
  cumulativeLag: {
    minMonths: number;
    maxMonths: number;
  };

  /** 执行前提条件 */
  executionPrerequisites: ExecutionPrerequisite[];

  /** 执行风险 */
  executionRisks: ExecutionRisk[];

  /** 替代方案（如果存在） */
  alternatives?: InvestmentRecommendation[];
}

/**
 * ExecutionPrerequisite — 执行前提条件。
 */
export interface ExecutionPrerequisite {
  /** 前提条件类型 */
  type: 'talent_market' | 'team_capacity' | 'external_constraint' | 'regulatory' | 'data_readiness';

  /** 前提条件描述 */
  check: string;

  /** 当前验证状态 */
  status: 'verified' | 'unverified' | 'failed';

  /** 验证来源 */
  verifiedBy?: string;  // 如 "E-07 TALENT_ACQUISITION.market_talent_supply"

  /** 如果未验证，估计多久可以验证 */
  verificationEta?: string;
}

/**
 * ExecutionRisk — 执行风险。
 */
export interface ExecutionRisk {
  /** 风险描述 */
  description: string;

  /** 风险等级 */
  severity: 'low' | 'medium' | 'high';

  /** 如果此风险发生，建议是否仍然成立 */
  mitigationNote?: string;
}

/**
 * PropagationStep — 单步传导（与第二章 PropagationTimeline.edgeSequence 复用同一类型）。
 */
export interface PropagationStep {
  edgeId: string;
  edgeName: string;
  lagMonths: { min: number; max: number };
  elasticity: number;
  mechanism: string;
}
```

### 3.3.2 输出示例

```json
{
  "commitmentStatement": {
    "capabilities": [
      "传导方向模拟 — 回答投入是正向还是负向趋势",
      "传导路径展示 — 展示投入如何通过因果链影响到终点子循环",
      "相对效果排序 — 在给定的 N 个子循环中，哪个的投入边际溢出最高",
      "执行约束检测 — 检查每个建议的能不能执行前提条件",
      "滞后时间标注 — 每条传导路径的累计滞后时间"
    ],
    "limitations": [
      "精确财务预测 — 不能回答投入100万，3个月后回报150万",
      "最优投入量 — 不能回答最优投入是73.5万——只能给出方向+量级区间"
    ],
    "disclaimer": "以下模拟基于当前因果边参数计算，仅指示传导方向，不构成精确财务预测。"
  },
  "recommendations": [
    {
      "recommendation": "增加人才循环投入，招聘3名核心开发",
      "direction": "positive",
      "estimatedEffect": {
        "range": [0.05, 0.15],
        "unit": "客户循环溢出改善比例",
        "timeHorizon": "6-9_months"
      },
      "confidence": 0.65,
      "propagationPath": [
        {
          "edgeId": "E-07",
          "edgeName": "TALENT_ACQUISITION",
          "lagMonths": { "min": 1, "max": 2 },
          "elasticity": 0.8,
          "mechanism": "新增招聘 → 人才流入速率增加 → hiring_efficiency 上升"
        },
        {
          "edgeId": "E-15",
          "edgeName": "HUMAN_DEPLOYMENT",
          "lagMonths": { "min": 1, "max": 3 },
          "elasticity": 0.6,
          "mechanism": "人岗匹配 → deployment_score 上升 → 产品开发效率改善"
        },
        {
          "edgeId": "E-23",
          "edgeName": "OPERATIONAL_EXECUTION",
          "lagMonths": { "min": 0, "max": 0 },
          "elasticity": 0.5,
          "mechanism": "执行效率 → 产品上市周期缩短 → 客户满意度改善"
        }
      ],
      "cumulativeLag": { "minMonths": 2, "maxMonths": 5 },
      "executionPrerequisites": [
        {
          "type": "talent_market",
          "check": "目标技能人才市场供给充足",
          "status": "verified",
          "verifiedBy": "E-07.market_talent_supply = 0.65 (正常范围)"
        },
        {
          "type": "team_capacity",
          "check": "现有团队有 onboarding 带宽",
          "status": "unverified",
          "verificationEta": "需 GA 确认 Team 节点 open_positions 字段"
        }
      ],
      "executionRisks": [
        {
          "description": "如果3个月内无法招到目标技能人才，建议的预计效果不成立",
          "severity": "medium",
          "mitigationNote": "建议提前确认招聘渠道。如招聘延迟，传导时间线按比例后移。"
        }
      ]
    }
  ],
  "meta": {
    "input": {
      "targetCycleId": "talent-cycle",
      "investmentAmount": { "min": 30, "max": 50, "unit": "万元" },
      "investmentType": "human"
    },
    "simulatedAt": "2026-07-14T10:00:00Z",
    "edgeDefinitionsVersion": "权威01-v1.0-20260714",
    "computationTimeMs": 320,
    "degraded": false
  }
}
```

---

## 3.4 执行约束因子模型

### 3.4.1 设计动机

研究方案 §5.1 明确了："不只是'投多少钱'——还要标注'能不能执行'。"

引擎的每个投入建议附带 `executionPrerequisites` 数组。这不是"建议的一部分"——是建议的**前置条件**。如果前提条件不满足，建议自动降级置信度，并标注哪些条件未通过。

### 3.4.2 五类执行约束因子

| 类型 | 检查逻辑 | 数据来源 | 不通过时的行为 |
|------|---------|---------|--------------|
| `talent_market` | 人才市场供给是否充足 | E-07 `market_talent_supply` 参数 | 置信度降级 + 标注"人才市场供给紧张" |
| `team_capacity` | 团队是否有 onboarding 带宽 | Team 节点 `open_positions` / `capacity_utilization` | 置信度降级 + 建议"分阶段执行" |
| `external_constraint` | 外部环境约束（政策/供应链/竞品） | E-03 `env_rent` + E-33 `competitor_aggressiveness` + E-34 `supplier_reliability` | 置信度大幅降级 + 标注"外部条件不支持" |
| `regulatory` | 监管/合规约束 | Compliance 节点 | 阻断 + 建议"需合规审查" |
| `data_readiness` | 所需的数据源是否就绪 | E-09 `D_quality` + 数据成熟度 | 禁用引擎 + 提示"数据不足，无法模拟" |

### 3.4.3 约束因子的验证链路

每个 `ExecutionPrerequisite` 的 `verifiedBy` 字段标注了数据来源的精确路径——不是模糊的"市场数据"，而是精确到 42 边 ID + 参数名：

```
talent_market → E-07.market_talent_supply
team_capacity → Team.capacity_utilization (GraphStore)
external_constraint → E-03.env_rent + E-33.competitor_aggressiveness
regulatory → Compliance 节点
data_readiness → E-09.completeness + 子循环 dataMaturity
```

这样当 GA 问"系统说人才市场供给充足，你这个判断怎么来的？"——可以精确回答："来自 E-07 TALENT_ACQUISITION 的 market_talent_supply 参数，当前值为 0.65，在 0.3-0.8 的正常范围内。这个参数基于 ExternalBaseline 节点的行业人才供给指数。"

---

## 3.5 滞后时间标注

### 3.5.1 滞后时间的数据来源

每条传导路径的累计滞后时间 = 路径上各边的 `action_effect_lag` 之和。`action_effect_lag` 定义在 42 边体系中（权威01 第二章），每条边有 `minMonths` 和 `maxMonths` 两个值。

当前已定义的滞后时间（来自研究方案 §4.1，待补全到权威01）：

| 边 ID | 边名称 | minMonths | maxMonths | 依据 |
|-------|--------|-----------|-----------|------|
| E-07 | TALENT_ACQUISITION | 1 | 3 | 招聘周期：发布→入职→上手 |
| E-15 | HUMAN_DEPLOYMENT | 1 | 3 | 人岗匹配：入职→培训→独立产出 |
| E-17 | INCENTIVE_ALIGNMENT | 0.5 | 1 | 激励效果：KPI调整→行为变化 |
| E-23 | OPERATIONAL_EXECUTION | 0 | 0.5 | 运营调整：决策→执行变化（实时） |
| E-38 | TALENT_RETENTION | 3 | 6 | 人才留存→知识保护→组织能力 |
| E-25 | BRAND_CONSTRUCTION | 6 | 12 | 品牌建设：投入→市场认知变化 |
| E-24 | INNOVATION | 6 | 18 | 创新：研发投入→产品上市 |
| E-37 | PROFIT_REINVEST | 3 | 9 | 利润再投资→效果显现 |

> **注意**：`action_effect_lag` 字段当前在权威01 第二章中尚未显式定义。本文档定义的是该字段的使用规范。字段本身应在权威01 的下一版本中补充到各边的属性块中（作为 `action_effect_lag: { minMonths: number, maxMonths: number }`）。

### 3.5.2 累计滞后时间的计算

```typescript
function computeCumulativeLag(
  edgeSequence: PropagationStep[]
): { minMonths: number; maxMonths: number } {
  let minSum = 0;
  let maxSum = 0;

  for (const step of edgeSequence) {
    minSum += step.lagMonths.min;
    maxSum += step.lagMonths.max;
  }

  // 并行边（同一时间窗口内可并发的步骤）取最大值，非简单相加
  // 当前版本简化为线性累加。并行优化版本需标注边的并发组。
  return { minMonths: minSum, maxMonths: maxSum };
}
```

### 3.5.3 滞后时间在引擎输出中的呈现

引擎在 `recommendation.cumulativeLag` 和每个 `recommendation.estimatedEffect.timeHorizon` 中都标注了滞后时间：

- `cumulativeLag`: 传导路径的物理滞后——"参数改变后，效应沿因果边传播需要 4-9 个月到达终点"
- `timeHorizon`: 用户可感知的效果显现时间——"从你开始执行到看到仪表盘上的溢出指标变化，预计 6-9 个月"

两者可能不同：`timeHorizon` >= `cumulativeLag.max`，因为除了物理传导延迟，还有数据采集延迟（下一个计算周期才能反映到仪表盘上）。

---

## 3.6 引擎 API 端点

### 3.6.1 POST /api/investment/simulate

执行投入模拟。

**Request Body**: `InvestmentSimulationInput`（见 §3.2.1）

**Response** (200): `InvestmentSimulationOutput`（见 §3.3.1）

**Response** (400): `{ error: 'INVALID_INPUT', message: '...' }` — 目标子循环不存在或投入量级超出合理范围

**Response** (503): `{ error: 'INSUFFICIENT_DATA', message: '...', dataWindowMonths: N, thresholdMonths: M }` — 数据成熟度不足（学习期），引擎禁用

### 3.6.2 GET /api/investment/prerequisites/{cycleId}

查询指定子循环的所有执行前提条件及其当前验证状态。用于在模拟前让用户了解"哪些条件还不满足"。

**Response** (200): `ExecutionPrerequisite[]`

---

## 3.7 与权威13 Proposal 的衔接

投入建议引擎的输出 `InvestmentRecommendation` 不是终点——它是 Proposal 的输入。

当用户在仪表盘上看到建议并点击"确认投入方向"时：

```
InvestmentRecommendation
       │
       ▼
权威13 Proposal 生成器
  ├── recommendation → Proposal.paths[0].label（推荐路径）
  ├── direction + estimatedEffect → Proposal.paths[0].expectedImpact
  ├── executionRisks → Proposal.paths[0].tradeoffs
  ├── confidence → ProposalContext.confidence
  └── propagationPath → ProposalContext.keyEvidenceRefs
       │
       ▼
Proposal 进入三选一确认流程（权威13 第二章）
  → 中层选择 → Goal 生成 → 方案哨兵追踪
```

**关键设计决策**：引擎不替代 Proposal。引擎输出"应该"往哪个方向投——Proposal 负责"怎么投"的多路径选择。两个层级的分工：引擎是方向层，Proposal 是方案层。

---

## 3.8 降级与错误处理

| 场景 | 引擎行为 | 用户体验 |
|------|---------|---------|
| 目标子循环处于学习期（数据 < 6个月） | 返回 503，不执行模拟 | "你的企业在{子循环名}上的数据不足6个月，投入模拟功能将在数据积累后自动启用" |
| 传导路径中某条边的 `action_effect_lag` 未定义 | 使用默认值（min=3, max=6）+ 标注 `degraded: true` | 置信度标注为"低"，提示"部分滞后时间使用默认值" |
| 执行前提条件中 `talent_market` 不可验证 | `status: 'unverified'` | 建议上标注"⚠ 人才市场供给未验证——建议在确认前核实" |
| 投入量级区间上下界差距过大（>10x） | 输出警告 `"量级区间过大，模拟精度降低，建议缩小区间"` | 显示警告横幅 |
| 42 边参数覆盖率不足（<50%） | 置信度标注为 `confidence < 0.4` + `degraded: true` | 显示"当前数据不足以支撑可靠模拟。建议先弥补数据缺口。" |

---

> **版本历史**：v1.0 — 2026-07-14 — 初始版本。承诺清单 + 引擎输入/输出规范 + 执行约束因子 + 滞后时间标注 + API 端点。