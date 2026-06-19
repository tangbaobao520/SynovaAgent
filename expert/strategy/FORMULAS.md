---
version: "1.0.0"
updated: "2026-06-20"
scope: "expert:strategy"
source: "theory/MATH_OVERVIEW.md"
status: "stable"
inputs: ["theory/MATH_OVERVIEW.md"]
exports: ["strategy公式索引"]
type: "documentation"
---

# strategy 公式索引

## 已工程化
| 公式 | 用途 | 实现 |
|------|------|------|
| 7 Powers 综合护城河强度 | 竞争壁垒量化 | `packages/engine-core/.../seven-powers.ts` |
| MoatStrength = Σ(S_i × W_i) / Σ(W_i) | 加权综合评分 | 见 `skills/strategy/seven-powers.md` |

## 定性框架（待工程化）
- 市场引力评分：波特五力量化 + 利润池地图 → 目前为专家定性推理
- S曲线定位：引入期/增长期/成熟期/衰退期 → 基于7 Powers得分推断

## 哨兵关联
- `sentinel-seven-powers`: 月首 cron 触发，消费 `computeSevenPowers()`
