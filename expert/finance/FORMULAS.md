---
version: "1.0.0"
updated: "2026-06-20"
scope: "expert:finance"
source: "theory/MATH_OVERVIEW.md"
status: "stable"
inputs: ["theory/MATH_OVERVIEW.md"]
exports: ["finance公式索引"]
type: "documentation"
---

# finance 公式索引

## 已工程化
| 公式 | 用途 | 实现 |
|------|------|------|
| ROE = 利润率 × 周转率 × 杠杆 | 杜邦分析——回报拆解 | `skills/finance/dupont-analysis.md` |
| CCC = DIO + DSO - DPO | 现金流转换周期 | `skills/finance/cashflow-analysis.md` |
| LTV/CAC ≥ 3 | 单位经济学健康阈值 | `skills/finance/unit-economics.md` |
| 边际贡献率 = (客单价 - 变动成本) / 客单价 | 单位经济效率 | 同上 |

## 定性框架
- 现金流健康度三分法：经营/投资/融资现金流独立评分
- 成本结构判断：固定成本占比 >70% = 高经营杠杆

## 哨兵关联
- 现金流健康度由 `financial-snapshot.ts` 采集，Sentinel 按 cron 触发
