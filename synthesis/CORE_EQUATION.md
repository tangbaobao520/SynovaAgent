---
version: "1.0.0"
updated: "2026-06-19"
scope: "global"
source: "SYNOVA-THEORY-v2-20260618.html §1"
status: "stable"
inputs: ["theory/CORE.md"]
exports: ["合成算法描述"]
type: "documentation"
---

# 核心方程合成逻辑

> **重要**: 此文件是给专家和合成引擎开发者的人类可读说明。计算逻辑在 `src/synthesis/` 下的 .ts 文件中实现。此文件不驱动计算。

## 合成算法

1. 等待所有已唤醒专家完成诊断
2. 从 strategy 和 biz_model 提取战略质量得分
3. 从 org（杨三角）提取组织能力得分
4. 从 org（六维 D1-D6）提取混合成熟度得分
5. 从 strategy × org 交叉计算战略组织咬合度
6. 计算健康度 H = Sq × Oc × Mm × SOfit
7. 识别约束 Bottleneck = argmin(Sq, Oc, Mm, SOfit)
8. 将约束传递给 action 专家生成 90 天行动方案

## 乘数得分提取

| 乘数 | 数据源 | 提取方式 |
|------|--------|---------|
| 战略质量 | strategy.conclusion.score + biz_model.conclusion.score | 加权平均 |
| 组织能力 | org.findings 中杨三角相关 finding 的综合评分 | 三因子乘积 |
| 混合成熟度 | org.findings 中 D1-D6 相关 finding 的综合评分 | 六因子乘积 |
| 战略组织咬合度 | strategy 输出的组织能力需求 vs org 输出的组织实际能力 | 差距公式 |

## 约束传递

```
Bottleneck = argmin(四个乘数)
  → 传递给 action 专家
  → action 生成 Plan A（解决瓶颈）+ Plan B（备用方案）
```
