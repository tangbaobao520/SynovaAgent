---
version: "1.0.0"
updated: "2026-06-20"
scope: "expert:action"
source: "theory/MATH_OVERVIEW.md"
status: "stable"
inputs: ["theory/MATH_OVERVIEW.md"]
exports: ["action公式索引"]
type: "documentation"
---

# action 公式索引

## 已工程化
| 公式 | 用途 | 实现 |
|------|------|------|
| 优先级 = 紧急性 × 重要性 × (1/努力程度) × 依赖 | 行动项优先级排序 | `expert/action/RULES.md` |
| Bottleneck = argmin(战略质量, 组织能力, 混合成熟度, 战略组织咬合度) | 约束识别 | `skills/action/constraint-id.md` |

## 定性框架
- 90天行动框架：W1-2快赢 → W3-6核心行动 → W7-12系统建设
- Plan A/B双轨：如果Plan A 90天未转移约束 → 启动Plan B

## 哨兵关联
- 无独立哨兵——消费所有专家输出后进行约束识别和行动生成
