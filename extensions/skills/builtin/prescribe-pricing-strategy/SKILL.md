---
name: prescribe-pricing-strategy
version: 1.0.0
description: "定价策略建议"
category: prescription
tier: L4
expert: marketing
complexity: expert
---

# 定价策略建议

## 概述
基于需求弹性、边际成本和竞争格局生成最优定价策略，覆盖单一定价、二部定价、价格歧视、捆绑和峰时定价。

## 何时使用
- S-L4-001 — 定价策略建议
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取市场和成本数据
沿 E-4.1(价值→价格)、E-4.4(竞争→份额)、E-3.1(运营→MC) 获取数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算弹性与成本
调用 COMPUTE-PRICE-ELASTICITY 和 COMPUTE-MARGINAL-COST
  - 工具: T-COMPUTE-PRICE-ELASTICITY, T-COMPUTE-MARGINAL-COST

### Step 3: 多方案定价计算
依次计算最优价格、二部定价、价格歧视、捆绑定价和峰时定价
  - 工具: T-COMPUTE-OPTIMAL-PRICE, T-COMPUTE-TWO-PART-TARIFF, T-COMPUTE-PRICE-DISCRIMINATION, T-COMPUTE-BUNDLING-OPTIMAL, T-COMPUTE-PEAK-LOAD-PRICING

### Step 4: 竞品参照
调用 COMPUTE-COMPETITIVE-POSITIONING 评估竞品定价空间
  - 工具: T-COMPUTE-COMPETITIVE-POSITIONING

## 输出格式
```
pricingStrategy, optimalPrice, expectedRevenueImpact, demandElasticityConsideration, implementationSteps[], riskAssessment
```
