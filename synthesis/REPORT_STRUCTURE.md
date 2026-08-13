---
version: "1.0.0"
updated: "2026-06-19"
scope: "global"
source: "SYNOVA-THEORY-v2-20260618.html §3"
status: "stable"
inputs: []
exports: ["金字塔结构", "SCQA叙事", "PlanAB双轨", "技术可行性红绿灯"]
type: "documentation"
---

# 诊断表达方法论

## 麦肯锡金字塔原理

诊断输出的标准结构：

```
Governing Thought（一句话核心判断）
  ├─ Key Judgment 1（支持判断）
  │   ├─ 证据链
  │   └─ Impact if ignored（量化影响）
  ├─ Key Judgment 2
  │   ├─ 证据链
  │   └─ Impact if ignored
  └─ Key Judgment 3
      ├─ 证据链
      └─ Impact if ignored
```

每个 finding 必须附带 quantified_impact——"如果不解决，12个月内会损失X收入/Y客户/Z人才"。

## SCQA 叙事框架

- **S**ituation: 企业当前所处的情境
- **C**omplication: 存在的冲突或矛盾——"为什么现状不能持续"
- **Q**uestion: 核心问题——"所以真正需要回答的问题是什么"
- **A**nswer: Governing Thought 就是答案

## Plan A / Plan B 双轨

| | Plan A：解决当前约束 | Plan B：备用方案 |
|---|---|---|
| **目标** | 提升得分最低的乘数因子 | 如果 Plan A 失败，转向提升另一个乘数 |
| **触发** | 当前诊断置信度 ≥ 70% | Plan A 执行 90 天后约束未转移 |
| **设计** | "我们判断 X 是瓶颈" | "如果 X 不是真的瓶颈，Y 可能是" |

Plan B 不是备胎——它是诊断逻辑的压力测试。如果 Plan A 和 Plan B 指向完全不同方向 → 置信度不足以选出一个最优约束。

## 技术可行性红绿灯

每当 strategy 或 biz_model 提出需要"速度"或"AI驱动"的建议时，tech 专家必须给出：

- 🟢 绿灯: 当前技术栈可支撑，6个月内可落地 → 建议可进入 90 天计划
- 🟡 黄灯: 需先解决前置技术债务 → 前置任务进入 Week 1-2 快赢
- 🔴 红灯: 差距 > 12个月 → 降级为"远期方向"
