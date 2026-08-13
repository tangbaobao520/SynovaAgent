---
name: analyze-cost-structure
version: 1.0.0
description: "成本结构诊断"
category: analysis
tier: L2
expert: finance
complexity: composite
---

# 成本结构诊断

## 概述
分析企业成本结构，计算固定成本比率、变动成本比率、边际成本和固定成本刚性。

## 何时使用
- S-L2-006 — 成本结构诊断
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取成本数据
沿 E-2.1(资金分配) 和 E-3.1(运营) 获取成本结构数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算固定成本刚性
调用 COMPUTE-FIXED-COST-RIGIDITY 计算固定成本刚性指标
  - 工具: T-COMPUTE-FIXED-COST-RIGIDITY

### Step 3: 计算边际成本
调用 COMPUTE-MARGINAL-COST 计算边际成本
  - 工具: T-COMPUTE-MARGINAL-COST

### Step 4: 趋势评估
综合评估成本结构健康度和变化趋势

## 输出格式
```
fixedCostRatio, variableCostRatio, marginalCost, fixedCostRigidity, costStructureHealth, trend
```
