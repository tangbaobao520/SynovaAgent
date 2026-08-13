---
name: analyze-capital-allocation
version: 1.0.0
description: "资本配置效率"
category: analysis
tier: L2
expert: finance
complexity: composite
---

# 资本配置效率

## 概述
评估企业资本配置效率，计算资本周转率、NPV状态和利润再投资率。

## 何时使用
- S-L2-008 — 资本配置效率
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取资本数据
沿 E-1.1(获取资本) 和 E-2.1(资金分配) 获取资本配置数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算配置效率
调用 COMPUTE-CAPITAL-ALLOCATION 计算配置效率和资本周转率
  - 工具: T-COMPUTE-CAPITAL-ALLOCATION

### Step 3: 计算NPV和再投资
调用 COMPUTE-NPV 和 COMPUTE-PROFIT-REINVESTMENT
  - 工具: T-COMPUTE-NPV, T-COMPUTE-PROFIT-REINVESTMENT

## 输出格式
```
allocationEfficiency, capitalTurnover, npvStatus, profitReinvestmentRate, assumptionTriggeredReallocation
```
