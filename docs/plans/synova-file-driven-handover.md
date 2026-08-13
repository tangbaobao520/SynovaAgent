# Synova 文件驱动化 — 给另一个 Claude 的说明

## 一、你我的分工

| | 我（引擎迁移） | 你（文件驱动） |
|------|------|------|
| 改了哪 | `src/l3/` `src/routes/` `src/agent/` | `extensions/` `expert/` `sentinel/` |
| 状态 | 已完成，已推送 | 进行中 |
| 重叠 | **零文件冲突** ||

---

## 二、三条红线（绝对不要碰）

### ❌ 红线 1：禁止 import engine-core

```
❌ import { X } from '../../packages/engine-core/...'
❌ import { X } from '@synova/diagnosis-engine'
✅ import { X } from '../l3/synova-diagnosis-engine'（我定义的接口）
```

pre-commit 铁律 46 会物理阻断任何新增的 engine-core 引用。**commit 都过不去。**

### ❌ 红线 2：不要动这 3 个引擎文件

```
src/l3/synova-diagnosis-engine.ts        ← 接口定义
src/l3/synova-diagnosis-engine-impl.ts   ← 引擎实现
src/routes/diagnosis.ts                  ← 引擎调用（含 feature flag）
```

你需要引擎的任何信息，**通过接口调用，不直接改引擎内部**。

### ❌ 红线 3：`as any` 零容忍

pre-commit 硬阻断。替代方案：`as unknown as TargetType`。

---

## 三、已有基础设施（别重复造）

### 1. ExtensionRegistry — 写好了，零接线

```
packages/extension-registry/
```

已实现 `discover()` + `hotload()` + `manifest.json` 发现 + 动态 `import()` + 生命周期管理。**你的统一扩展加载器可以直接从这个开始。**

### 2. 专家 + 哨兵 — 已经是文件驱动

```
expert/strategy/IDENTITY.md    ← 你的模板
expert/strategy/RULES.md
sentinel/adapters/*.ts         ← 每个哨兵独立文件
```

这 2 个维度已经是文件驱动的。你的 16 个新维度参照这两个的模式。

### 3. 新引擎接口 — discriminated union 事件类型

```typescript
// src/l3/synova-diagnosis-engine.ts
export type DiagnosisEvent =
  | { type: 'phase_started'; phase: number; ... }
  | { type: 'hypothesis_generated'; expert: string; confidence: number; ... }
  | ... // 17 种事件

// 编译器验证 switch 全覆盖
switch (event.type) {
  case 'phase_started': ...
  // 漏一个 → tsc 报错
}
```

你加新事件类型时，编译器会提醒你更新所有调用方。

---

## 四、已知崩溃 Bug（你可能会碰到）

| 文件 | 问题 | 影响 |
|------|------|------|
| `agent-tool-registry.ts:386` | `listModules()` 未定义，模块加载即抛 ReferenceError | 工具注册 |
| `diagnosis-assembler.ts:449,464` | `import('./auto-interpreter')` 目标文件已物理删除 | 诊断组装 |
| `fde-toolset.ts` | 2 个空壳工具仍在注册数组 | 工具集 |

**这些都是 engine-core 遗留问题。做文件驱动时如果遇到这几个文件，绕开而非修复。**

---

## 五、架构纠正（你做文件驱动时可以顺便修）

### `src/sentinel/compute/` 目录取消

当前 11 个 compute 函数是空的桥接文件。实际逻辑在 engine-core 里，而且直接访问 L5 数据库（L3→L5 违规）。

**正确做法**：每个哨兵自己包含计算逻辑，不依赖外部 compute 模块。

```
之前: 哨兵适配器 → import compute 函数 → compute 内部查 SQLite
之后: 哨兵适配器 → 通过 L4 GraphStore 接口拿数据 → 本地纯计算
```

### 五层架构速查

```
L1 交互    → 不能直接调 L3/L4/L5
L2 编排    → 不能直接调 L4/L5
L3 洞察    → 不能直接调 L5（别查 SQLite！通过 L4 接口）
L4 本体    → 封装"数据在哪"，提供语义查询
L5 存储    → SQLite，只在 L4 内部访问
```

### 数据流（Palantir 模式）

```
L5 数据层 → L4 本体层 → L3 哨兵 → L3 专家 → L2 编排 → L1 交互
               ↑                        ↑
          原始数据                   诊断引擎按需
        变成语义对象               调哨兵获取证据
```

**四跳，不是五跳。** 计算不是独立的一跳——它在哨兵内部。

### 计算模块和哨兵的关系（已决策 — 2026-06-22 更新）

**哨兵 = 1 个子领域 + N 个计算指标。不是 1:1，也不是 1:∞。**

#### 三层粒度

```
专家 — 领域（解读 N 个哨兵的 Finding）
  ├── 哨兵 — 子领域（综合 M 个指标，判断"这个子领域出问题没有"）
  │     ├── 计算 — 指标（纯数学，盯一个数）
  │     └── 计算 — 指标
  └── 哨兵 — 子领域
        ├── 计算
        └── 计算
```

#### 以财务专家为例

```
财务专家
  ├── 成本哨兵 → Finding: "成本结构恶化，固定成本占比上升"
  │     ├── 毛利率变化率
  │     ├── 固定/变动成本比
  │     └── 人均成本趋势
  ├── 收入哨兵 → Finding: "收入增长放缓，客户集中度危险"
  │     ├── 收入增长率
  │     ├── 客户集中度
  │     └── 客单价趋势
  ├── 现金流哨兵 → Finding: "现金流紧张，跑道 3 个月"
  │     ├── 现金跑道
  │     ├── 应收逾期率
  │     └── 经营现金流 vs 净利润
  └── 利润哨兵
        ├── 利润率变化
        └── 毛利率 vs 行业基准
```

#### 哨兵的正确粒度

| 太粗 ❌ | 正确 ✅ | 太细 ❌ |
|------|------|------|
| 一个哨兵盯整个财务 | 成本哨兵、收入哨兵、现金流哨兵各自独立 | 一个哨兵只算毛利率 |
| 输出："财务有点问题" | 输出："成本结构恶化，具体是 X/Y/Z" | 输出："毛利率跌了 2%"(本身不值得告警) |

**边界规则**：哨兵 = "可以独立说'这里出问题了'的最小子领域"。不是整个领域（太粗），不是一个指标（太细）。

#### 哨兵文件结构

```
extensions/sentinels/
├── cost-health/              ← 成本哨兵
│   ├── manifest.json         ← schedule, thresholds, expert: "finance"
│   ├── computes/             ← N 个计算指标
│   │   ├── gross-margin.ts
│   │   ├── fixed-variable-ratio.ts
│   │   └── cost-per-head.ts
│   └── aggregate.ts          ← 如何从 N 个指标合成 1 条 Finding
├── revenue-health/           ← 收入哨兵
│   └── ...
├── cash-runway/              ← 现金流哨兵
│   └── ...
└── shared/                   ← 工具库，不是层
    ├── baseline.ts
    ├── threshold.ts
    └── stats.ts
```

manifest.json 示例：
```json
{
  "name": "成本健康",
  "schedule": "0 */6 * * *",
  "expert": "finance",
  "computes": ["gross-margin", "fixed-variable-ratio", "cost-per-head"],
  "thresholds": {
    "gross_margin": { "warning": -0.05, "critical": -0.15 },
    "fixed_ratio": { "warning": 0.6, "critical": 0.75 }
  },
  "aggregation": "worst_first"
}
```

#### 和当前代码的关系

当前 12 个哨兵都是 1:1（一个哨兵 → 一个 compute 函数）。这不是设计意图——是 engine-core 遗留的粗糙实现。重构时应该：

1. 按子领域合并哨兵（如合并多个财务相关指标 → 4 个财务哨兵）
2. 旧哨兵中没价值的砍掉
3. 先做哨兵结构，再逐步填充 compute 文件（不需要一次填满）

### 诊断引擎如何使用哨兵

引擎不调 compute 函数，调整个哨兵：

```typescript
// Phase 2: 收集证据
const findings = await registry.listForTeam(teamId).map(s => s.check(teamId, context));
// Finding[] → 注入 LLM prompt 作为证据
```

---

## 六、18 维度状态表

| # | 维度 | 当前 | 你做什么 |
|------|------|:--:|------|
| 1 | 专家 | ✅ 文件 | 已完成，不动 |
| 2 | 哨兵 | ✅ 文件 | 已完成注册表文件化。⚠️ compute 函数合并进哨兵（每哨兵含 compute.ts），取消 src/sentinel/compute/ 目录 |
| 3 | 本体节点/边 | ❌ enum | JSON Schema → extensions/ontology/ |
| 4 | LLM 提供商 | ❌ switch | manifest + adapter → extensions/llm-providers/ |
| 5 | IM 连接器 | ❌ | manifest + connector → extensions/connectors/ |
| 6 | L5 数据源 | ❌ | manifest → extensions/data-sources/ |
| 7 | 行业本体模板 | ❌ | 参照 engine-core ontology-templates/ 结构，重写到 extensions/industries/ |
| 8 | 诊断规则 | ❌ | YAML/JSON → extensions/rules/ |
| 9 | 合规框架库 | ❌ | 85 个从 TS 拆到 JSON → extensions/frameworks/ |
| 10 | 诊断流水线阶段 | ❌ | JSON → extensions/engine/（和我的引擎对接） |
| 11 | 报告格式 | ❌ | HTML/CSS 独立文件 → extensions/reports/ |
| 12 | 信号聚合规则 | ❌ | JSON → extensions/rules/signals.json |
| 13 | 通知渠道 | ❌ | manifest + adapter → extensions/notification/ |
| 14 | 业务模型类型 | ❌ | JSON schema → extensions/business-models/ |
| 15 | 数据访问策略 | ❌ | YAML → extensions/policies/ |
| 16 | 国际化 | ❌ | locale 文件 → extensions/locales/ |
| 17 | 专家工具 | ⚠️ 部分 | 注册表是 YAML，实现还是硬编码 TS |
| 18 | 外部工具/MCP | ⚠️ | ExtensionRegistry 已实现但零接线 |

---

## 七、引擎对接点

我的引擎已经预留了两个给你用的口子：

**口子 1 — 引擎配置外部化**

```typescript
// 现在是硬编码：
createSynovaDiagnosisEngine(llm, tools, {
  maxToolRounds: 4, gateDataCompleteness: 0.3, gateMinHypothesisConfidence: 0.5,
});

// 你的文件驱动后：
const config = loadJSON('extensions/engine/diagnosis.json');
createSynovaDiagnosisEngine(llm, tools, config);
```

你在 `extensions/engine/diagnosis.json` 里定义阶段配置，引擎启动时读。

**口子 2 — 哨兵结果注入诊断**

```typescript
// 引擎接口支持 onEvent 回调
engine.runConsultation(teamId, initiator, scope, (event) => {
  // 你的哨兵结果可以通过自定义事件注入
  if (event.type === 'phase_started' && event.phase === 2) {
    // Phase 2 开始前，跑哨兵，注入证据
    const findings = await runSentinelCheck(teamId);
    onEvent({ type: 'evidence_added', ...findings });
  }
});
```

---

## 八、建议的执行顺序

```
第一批（不依赖任何人，今天就能做）:
  - 国际化（纯字符串提取，无代码依赖）
  - 报告模板（HTML/CSS 文件化，不改逻辑）
  - 合规框架库（85 个 TS → JSON，机械转换）
  - 通知渠道（独立 manifest + adapter）

第二批（哨兵重构 — 和架构决策对齐）:
  - 哨兵子领域拆分：按财务/组织/技术等专家，识别子领域
    财务: 成本哨兵 / 收入哨兵 / 现金流哨兵 / 利润哨兵
    组织: 关键人哨兵 / 协作健康哨兵 / 自知偏差哨兵
    技术: 路径依赖哨兵 / 竞争壁垒哨兵
    每个哨兵 = 1 manifest + N computes + aggregate
  - 从 engine-core 提取计算逻辑重写为纯函数
    不能用 engine-core 版本（含 CJS require + L3→L5 违规）
    通过 L4 GraphStore 接口拿数据，哨兵内做纯计算
  - 取消 src/sentinel/compute/ 目录（合并进哨兵）

第三批（和哨兵对接）:
  - 诊断规则文件化（按行业拆分阈值）
  - 信号聚合规则文件化
  - 数据访问策略文件化

第四批（对外扩展）:
  - 行业本体模板（参照 engine-core ontology-templates/ 结构）
  - 本体节点/边 JSON Schema
  - 业务模型类型

第五批（引擎对接）:
  - 引擎配置外部化（extensions/engine/diagnosis.json）
  - LLM 提供商文件化
  - IM 连接器 / 数据源文件化
```

---

> **如果遇到 engine-core 的 import 路径 — 绕开。如果遇到架构违规 — 修。如果拿不准 — 先问。**
