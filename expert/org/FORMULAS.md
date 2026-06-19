---
version: "1.0.0"
updated: "2026-06-20"
scope: "expert:org"
source: "theory/MATH_OVERVIEW.md"
status: "stable"
inputs: ["theory/MATH_OVERVIEW.md"]
exports: ["org公式索引"]
type: "documentation"
---

# org 公式索引

## 已工程化
| 公式 | 用途 | 实现 |
|------|------|------|
| R_person = w1·(1/busFactor) + w2·roleScarcity + w3·(dependencyCount/N) + w4·criticalKnowledgeRatio | 关键人才风险评分 | `packages/engine-core/.../key-person-risk.ts` |
| 恢复时间 = busFactor × roleScarcity × dependencyCount × 30天 | 离职影响估计 | 同上 |
| HTM_score = α·trustCurve + β·(1-autoAcceptRate) + γ·errorPropagation + δ·decayPenalty | 混合信任模型 | `packages/engine-core/.../htm.ts` |
| Agent就绪度 = Σ(4维度评分) ≥10可替代 | 任务Agent化可行性 | `expert/org/RULES.md` |

## 定性框架（研究阶段）
- 组织熵增：缝隙动力学 `computeDynamics()` → overallChangeRate + stickyDimensions
- D5 认知多样性：1 − HomogenizationRate（阈值待标定）
- D6 进化适应性：R_org / max(R_agent, ε)

## 哨兵关联
- sentinel-bus-factor / sentinel-htm / sentinel-hacd / sentinel-self-awareness
