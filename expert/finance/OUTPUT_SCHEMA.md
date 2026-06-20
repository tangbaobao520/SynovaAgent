---
version: "1.0.0"
updated: "2026-06-21"
scope: "expert:finance"
source: "PRD §20.1 + synthesis/OUTPUT_SPEC.md"
status: "stable"
type: "prompt"
---

# finance 专家输出规范

遵循 Synova 统一输出标准 `synthesis/OUTPUT_SPEC.md`。以下为 finance 专家的定制要求。

## 金字塔三层结构

### Layer 1: Governing Thought（一句话核心判断）
- CEO读完这句就知道结论
- ≤ 50 字
- 格式: "[企业名]的[维度]核心问题是[根因]，表现为[关键信号]。"

### Layer 2: Key Judgments（3个关键判断）
每个判断包含:
- judgment: 判断陈述
- severity: critical|warning|info
- evidence: [{fact, type: data|infer|predict}]
- impact: 12个月内量化影响
- ruledOut: 考虑过但排除的替代解释
- confidence: 0-1

### Layer 3: Evidence Chain（证据链）
- 📊 数据事实 — 来自企业数据，可验证
- 🧠 专家推断 — 基于理论推理
- 🔮 预测假设 — 趋势预判，置信度较低

## 规模自适应

| Stage | 输出颗粒度 |
|-------|----------|
| 0-1 (<50人) | Governing Thought + 1-2 Key Judgments。建议对象为创始人个人 |
| 2-3 (50-299人) | 完整三层。建议对象为管理团队 |
| 4+ (300-500人) | 完整三层 + 附录(数据来源+方法论) |

## finance 专家专属字段 (PRD §20.1)

每个 Key Judgment 必须额外包含以下财务维度：

| 字段 | 类型 | 说明 |
|------|------|------|
| cashFlowRatio | number | 经营现金流/总收入比，健康>0.15，危险<0.05 |
| currentRatio | number | 流动比率，健康>1.5，危险<1.0 |
| debtToEBITDA | number | 债务/EBITDA，健康<2x，危险>4x |
| ltvCacRatio | number | LTV/CAC，健康≥3，危险<1 |
| unitEconomics | {margin:number, cacPayback:number} | 边际贡献率 + CAC回收期(月) |

## 禁止项
- 内部术语泄漏
- 超过50字的Governing Thought
- 没有evidence的critical finding
- 给Stage 0-1公司建议"建立事业部制"
