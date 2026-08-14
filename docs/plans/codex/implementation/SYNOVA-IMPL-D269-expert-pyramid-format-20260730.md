<!--
  SYNOVA-IMPL-D269: Expert金字塔格式统一 — 5 cycle-level experts + _template
  状态: dev doc | 2026-07-30
  权威文档: 权威05 Module 6 + 预期状态模型 v3.1 G7
  依赖: 无（独立任务）
  并行: D268, D270 — 零共享文件
-->

# D269: Expert 金字塔格式统一 — 5 Cycle-Level Experts

## 1. 权威文档引用

**来源**: 权威05 Module 6 + 预期状态模型 v3.1

> G7: 5 old experts missing pyramid format — D236 restructured 7 experts, old dirs not cleaned

> 金字塔三层结构: Layer 1 Governing Thought (≤50字) → Layer 2 Key Judgments (3-5条) → Layer 3 Evidence Chain (📊/🧠/🔮)

## 2. 代码审计——现状

### 2.1 全部 15 个专家 RULES.md 审计结果

| 专家 | 金字塔格式 | 认识论标注 | 规模自适应 | 状态 |
|------|:---:|:---:|:---:|:---:|
| strategy | Yes | Yes | Yes (Stage 0-4) | OK |
| finance | Yes | Yes | Yes | OK |
| org | Yes | Yes | Yes | OK |
| marketing | Yes | Yes | Yes | OK |
| action | Yes | Yes | Yes | OK |
| tech | Yes | Yes | Yes | OK |
| business_model | Yes | Yes | Yes | OK |
| knowledge | Yes | Yes | Yes | OK |
| host | N/A | N/A | N/A | OK |
| **capital-cycle** | **NO** | **NO** | **NO** | **GAP** |
| **customer-cycle** | **NO** | **NO** | **NO** | **GAP** |
| **talent-cycle** | **NO** | **NO** | **NO** | **GAP** |
| **finance-structure** | **NO** | **NO** | **NO** | **GAP** |
| **competitive-strategy** | **NO** | **NO** | **NO** | **GAP** |
| _template | **NO** | **NO** | **NO** | **GAP** |

### 2.2 5个GAP专家的当前内容

**capital-cycle/RULES.md** (4行): 诊断规则: 现金流→利润, 融资效率, 再投资比率, 收入集中度
**customer-cycle/RULES.md** (4行): 诊断规则: HHI, LTV/CAC, 市场份额, 价格弹性
**talent-cycle/RULES.md** (4行): 诊断规则: 信任摩擦, 知识复用率, 关键人集中度, 学习速率
**finance-structure/RULES.md** (3行): 诊断规则: 利息覆盖率, 短期债务占比, 备用流动性
**competitive-strategy/RULES.md** (3行): 诊断规则: 五力评分, 对手增速, 市场集中度+新进入者

**共同问题**: 仅有3-4条诊断规则，无格式规范节，无认识论标注，无规模自适应逻辑。

### 2.3 参考模板

**strategy/RULES.md** 是最完整的参考，包含:
- "不可做的事" 节 (5条)
- 诊断评分规则
- "数据充分度→建议力度控制" (🔵/🟡/🟢)
- "输出格式规范" — 金字塔三层 (Governing Thought/Key Judgments/Evidence Chain)
- "规模自适应规则" (Stage 0-4)

## 3. 实现方案

### 3.1 写集（6个文件）

| 文件 | 当前行数 | 追加内容 |
|------|:---:|------|
| expert/capital-cycle/RULES.md | 5 | +60行: 数据充分度 + 金字塔 + 规模自适应 |
| expert/customer-cycle/RULES.md | 5 | +60行: 同上 |
| expert/talent-cycle/RULES.md | 5 | +60行: 同上 |
| expert/finance-structure/RULES.md | 4 | +60行: 同上 |
| expert/competitive-strategy/RULES.md | 4 | +60行: 同上 |
| expert/_template/RULES.md | 10 | 重写: 完整模板含金字塔三层 |

### 3.2 追加标准模块

**Module A: 数据充分度 → 建议力度**
- 🔵 方向性判断: ≤2维high-confidence → 2-3方向+需验证假设
- 🟡 分析+假设: 3-5维 → 结论+置信度+假设清单
- 🟢 完整方案: ≥6维 → 行动+时间线+风险预案

**Module B: 金字塔三层**
- Layer 1: Governing Thought ≤50字
- Layer 2: Key Judgments (3条, severity+evidence+impact+ruledOut+confidence)
- Layer 3: Evidence Chain (📊/🧠/🔮)

**Module C: 规模自适应**
- Stage 0-1 (<50人): GT + 1-2 KJ
- Stage 2-3 (50-299人): 完整三层
- Stage 4+ (300-500人): 完整三层 + 附录

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | 内容验证 grep | 1 | grep "Governing Thought" 6个文件全部命中 |

无TypeScript代码，tsc不涉及。

## 5. 接线要求

无新export——纯RULES.md内容追加。验证: grep确认6文件含金字塔三层。

## 6. 完成标准

1. 6个RULES.md文件全部含"Governing Thought"节
2. 6个文件全部含"Key Judgments"节
3. 6个文件全部含📊/🧠/🔮认识论标注
4. 6个文件全部含"规模自适应"节
5. 格式与strategy/RULES.md一致
6. 保留原有诊断规则，追加非替换

## 7. 自检清单

- [x] 已读权威文档原文(strategy/RULES.md全量 + business_model/knowledge验证)
- [x] 已验证: 9位原始专家已有金字塔格式（逐文件审计确认）
- [x] 不是凭记忆（实际grep确认5个cycle-level专家缺失）
- [x] 已验证所有文件路径在代码库中存在
- [x] 不用 --no-verify
